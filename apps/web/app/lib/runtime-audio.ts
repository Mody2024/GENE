/**
 * Applies Audio Studio's saved manifest to the existing GENE Runtime Kit.
 * This bridge intentionally owns no AudioContext and creates no second settings panel.
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
      music: finite(audio.volumes?.music, 0.5),
      sfx: finite(audio.volumes?.sfx, 0.8)
    },
    events: audio.events && typeof audio.events === "object" ? audio.events : {}
  };
  const serialized = JSON.stringify(config).replace(/</g, "\\u003c");
  return `<script>
(function(root){
  "use strict";
  var cfg=${serialized};
  function apply(){
    var ga=root.GeneAudio;
    if(!ga||!ga.__ready||ga.__geneManifestApplied!==false&&ga.__geneManifestApplied===true)return false;
    try{
      if(typeof ga.setVolume==="function"){
        ga.setVolume("master",cfg.volumes.master);
        ga.setVolume("music",cfg.volumes.music);
        ga.setVolume("sfx",cfg.volumes.sfx);
      }
      if(cfg.enabled===false&&typeof ga.setMuted==="function")ga.setMuted(true);
      ga.__geneManifestApplied=true;
      root.GENE_AUDIO=ga;
      return true;
    }catch(e){return false;}
  }
  function wire(){
    var ga=root.GeneAudio;
    if(!ga||!ga.__ready)return false;
    apply();
    var doc=root.document;
    if(!doc)return true;
    doc.querySelectorAll("[data-gene-audio-volume]").forEach(function(el){
      if(el.dataset.geneAudioBridgeBound)return;
      var bus=el.getAttribute("data-gene-audio-volume");
      if(["master","music","sfx"].indexOf(bus)<0)return;
      el.dataset.geneAudioBridgeBound="1";
      el.value=String(cfg.volumes[bus]);
      el.addEventListener("input",function(){if(typeof ga.setVolume==="function")ga.setVolume(bus,el.value);});
    });
    doc.querySelectorAll("[data-gene-audio-mute]").forEach(function(el){
      if(el.dataset.geneAudioBridgeBound)return;
      el.dataset.geneAudioBridgeBound="1";
      el.addEventListener("click",function(){
        var state=typeof ga.getSettings==="function"?ga.getSettings():{muted:false};
        if(typeof ga.setMuted==="function")ga.setMuted(!state.muted);
        var next=typeof ga.getSettings==="function"?ga.getSettings():{muted:false};
        el.setAttribute("aria-pressed",String(!!next.muted));
      });
    });
    doc.querySelectorAll("[data-gene-audio-event]").forEach(function(el){
      if(el.dataset.geneAudioBridgeBound)return;
      el.dataset.geneAudioBridgeBound="1";
      el.addEventListener("click",function(){
        var name=el.getAttribute("data-gene-audio-event")||"ui";
        var mapped=cfg.events[name];
        if(mapped&&mapped!=="playSfx")name=mapped;
        if(typeof ga.playSfx==="function")ga.playSfx(name);
      });
    });
    return true;
  }
  if(!wire()){
    var attempts=0,timer=root.setInterval(function(){attempts++;if(wire()||attempts>=20)root.clearInterval(timer);},25);
  }
})(window);
</script>`;
}
