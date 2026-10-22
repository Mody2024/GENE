/**
 * Applies Audio Studio's saved manifest to GENE Runtime Kit.
 * Reuses GeneAudio's single audio context/settings implementation; never creates a second engine.
 */
export function buildRuntimeAudioBootstrap(files: Record<string, string> | undefined): string {
  let audio: Record<string, any> = {};
  try {
    const spec = JSON.parse((files || {})["game-spec.json"] || "{}") as Record<string, any>;
    audio = spec.audio && typeof spec.audio === "object" ? spec.audio : {};
  } catch {
    audio = {};
  }
  const finite = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : fallback;
  const config = {
    enabled: audio.enabled !== false,
    volumes: {
      master: finite(audio.volumes?.master, 0.8),
      music: finite(audio.volumes?.music, 0.35),
      sfx: finite(audio.volumes?.sfx, 0.8)
    },
    events: audio.events && typeof audio.events === "object" ? audio.events : {}
  };
  const serialized = JSON.stringify(config).replace(/</g, "\\u003c");
  return `<script>
(function(){
  "use strict";
  var ga=window.GeneAudio;
  if(!ga||ga.__manifestConfigured)return;
  ga.__manifestConfigured=true;
  var cfg=${serialized};
  ga.manifest=cfg;
  ga.enabled=cfg.enabled;
  ga.events=cfg.events;
  if(typeof ga.setVolume==="function"){
    ga.setVolume("master",cfg.volumes.master);
    ga.setVolume("music",cfg.volumes.music);
    ga.setVolume("sfx",cfg.volumes.sfx);
  }
  var originalSfx=ga.sfx||ga.playSfx;
  if(typeof originalSfx==="function"){
    var mappedSfx=function(name){
      if(!cfg.enabled)return false;
      var key=String(name||"ui"), mapped=cfg.events[key];
      if(typeof mapped==="string"&&mapped&&mapped.toLowerCase()!=="playsfx")key=mapped;
      return originalSfx.call(ga,key);
    };
    ga.sfx=ga.play=ga.playSfx=ga.playSound=mappedSfx;
  }
  if(ga.music&&typeof ga.music.start==="function"){
    var originalMusicStart=ga.music.start;
    ga.music.start=function(mood){if(!cfg.enabled)return false;return originalMusicStart.call(ga.music,mood);};
    ga.startMusic=ga.playMusic=ga.music.start;
  }
  if(!cfg.enabled&&typeof ga.setMuted==="function")ga.setMuted(true);
  function wire(){
    document.querySelectorAll("[data-gene-audio-volume]").forEach(function(el){
      if(el.dataset.geneAudioBound)return;
      var bus=el.getAttribute("data-gene-audio-volume");
      if(!["master","music","sfx"].includes(bus))return;
      el.dataset.geneAudioBound="1";el.value=String(cfg.volumes[bus]);
      el.addEventListener("input",function(){if(ga.setVolume)ga.setVolume(bus,el.value);});
    });
    document.querySelectorAll("[data-gene-audio-mute]").forEach(function(el){
      if(el.dataset.geneAudioBound)return;
      el.dataset.geneAudioBound="1";el.addEventListener("click",function(){
        if(!cfg.enabled)return;
        if(ga.toggleMute)ga.toggleMute();else if(ga.setMuted)ga.setMuted(el.getAttribute("aria-pressed")!=="true");
        el.setAttribute("aria-pressed",String(!!(ga.getSettings&&ga.getSettings().muted)));
      });
    });
    document.querySelectorAll("[data-gene-audio-event]").forEach(function(el){
      if(el.dataset.geneAudioBound)return;
      el.dataset.geneAudioBound="1";el.addEventListener("click",function(){if(ga.sfx)ga.sfx(el.getAttribute("data-gene-audio-event")||"ui");});
    });
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",wire,{once:true});else wire();
})();
</script>`;
}
