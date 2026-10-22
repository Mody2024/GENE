/**
 * Runtime bridge for Audio Studio's saved audio manifest.
 * Exposes a small Web Audio API without injecting duplicate settings panels or music loops.
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
  if (window.GENE_AUDIO && window.GENE_AUDIO.__runtimeBridge) return;
  var config=${serialized}, ctx=null, master=null, music=null, sfx=null, muted=!config.enabled, musicTimer=0, musicStep=0;
  var levels={master:config.volumes.master,music:config.volumes.music,sfx:config.volumes.sfx};
  var patterns={
    ui:[[660,.055,"sine",.12,0],[880,.075,"sine",.09,.045]],
    confirm:[[523,.09,"sine",.15,0],[784,.13,"triangle",.12,.07]],
    pickup:[[523,.09,"sine",.14,0],[784,.11,"triangle",.12,.06],[1047,.15,"sine",.1,.12]],
    impact:[[150,.12,"triangle",.17,0],[92,.15,"sawtooth",.08,.025]],
    damage:[[120,.17,"sawtooth",.16,0],[78,.2,"triangle",.1,.04]],
    jump:[[260,.07,"triangle",.11,0],[390,.09,"sine",.08,.045]],
    win:[[523,.16,"triangle",.14,0],[659,.16,"triangle",.14,.12],[784,.24,"sine",.12,.24]],
    lose:[[220,.18,"triangle",.12,0],[165,.24,"sawtooth",.08,.12]]
  };
  function ensure(){
    if(ctx&&ctx.state!=="closed")return ctx;
    var C=window.AudioContext||window.webkitAudioContext;if(!C)return null;
    try{ctx=new C();master=ctx.createGain();music=ctx.createGain();sfx=ctx.createGain();music.connect(master);sfx.connect(master);master.connect(ctx.destination);apply();return ctx;}catch(e){return null;}
  }
  function apply(){if(!ctx||!master)return;var now=ctx.currentTime;master.gain.setTargetAtTime(muted?0:levels.master,now,.025);music.gain.setTargetAtTime(levels.music,now,.025);sfx.gain.setTargetAtTime(levels.sfx,now,.025);}
  function tone(freq,duration,wave,volume,bus,delay){
    var ac=ensure();if(!ac||muted)return;
    if(ac.state==="suspended")ac.resume().catch(function(){});
    var osc=ac.createOscillator(),gain=ac.createGain(),start=ac.currentTime+(delay||0),end=start+duration;
    osc.type=wave;osc.frequency.setValueAtTime(freq,start);gain.gain.setValueAtTime(.0001,start);gain.gain.linearRampToValueAtTime(Math.max(.0001,volume),start+Math.min(.025,duration*.25));gain.gain.exponentialRampToValueAtTime(.0001,end);
    osc.connect(gain);gain.connect(bus==="music"?music:sfx);osc.onended=function(){try{osc.disconnect();gain.disconnect();}catch(e){}};osc.start(start);osc.stop(end+.03);
  }
  function play(name){
    if(muted||!config.enabled)return false;
    var key=String(name||"ui").toLowerCase(), pattern=patterns[key]||patterns[config.events[key]]||patterns.ui;
    pattern.forEach(function(n){tone(n[0],n[1],n[2],n[3],"sfx",n[4]);});return true;
  }
  function stopMusic(){if(musicTimer){clearTimeout(musicTimer);musicTimer=0;}}
  function startMusic(options){
    if(muted||!config.enabled)return false;
    var opts=options||{}, notes=Array.isArray(opts.notes)&&opts.notes.length?opts.notes.slice(0,32).map(function(n){return Math.max(40,Math.min(1600,Number(n)||220));}):[196,246.94,293.66,246.94,174.61,220,261.63,220];
    var interval=Math.max(180,Math.min(1200,Number(opts.interval)||420)),duration=Math.max(.12,Math.min(.8,Number(opts.duration)||.3));
    stopMusic();var step=0;
    function tick(){if(muted||!config.enabled){musicTimer=0;return;}var n=notes[step++%notes.length];tone(n,duration,"triangle",.045,"music",0);if(step%2===0)tone(n/2,duration*1.2,"sine",.025,"music",.02);musicTimer=setTimeout(tick,interval);}
    tick();return true;
  }
  function setVolume(bus,value){if(!(bus in levels))return levels;levels[bus]=Math.max(0,Math.min(1,Number(value)||0));apply();return Object.assign({},levels);}
  function setMuted(value){muted=Boolean(value)||!config.enabled;if(muted)stopMusic();apply();return muted;}
  function wireControls(){
    document.querySelectorAll("[data-gene-audio-volume]").forEach(function(el){if(el.dataset.geneAudioBound)return;var bus=el.getAttribute("data-gene-audio-volume");if(!(bus in levels))return;el.dataset.geneAudioBound="1";el.value=String(levels[bus]);el.addEventListener("input",function(){setVolume(bus,el.value);});});
    document.querySelectorAll("[data-gene-audio-mute]").forEach(function(el){if(el.dataset.geneAudioBound)return;el.dataset.geneAudioBound="1";el.addEventListener("click",function(){setMuted(!muted);el.setAttribute("aria-pressed",String(muted));});});
    document.querySelectorAll("[data-gene-audio-event]").forEach(function(el){if(el.dataset.geneAudioBound)return;el.dataset.geneAudioBound="1";el.addEventListener("click",function(){play(el.getAttribute("data-gene-audio-event")||"ui");});});
  }
  var api={__runtimeBridge:true,config:config,play:play,startMusic:startMusic,stopMusic:stopMusic,setVolume:setVolume,setMuted:setMuted,getMuted:function(){return muted;},getLevels:function(){return Object.assign({},levels);},unlock:function(){var ac=ensure();if(ac&&ac.state==="suspended")return ac.resume().then(function(){return true;}).catch(function(){return false;});return Promise.resolve(Boolean(ac));}};
  window.GENE_AUDIO=api;window.GeneAudio=window.GeneAudio||api;
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",wireControls,{once:true});else wireControls();
  document.addEventListener("visibilitychange",function(){if(document.hidden)stopMusic();});
  window.addEventListener("pagehide",stopMusic,{once:true});
})();
</script>`;
}
