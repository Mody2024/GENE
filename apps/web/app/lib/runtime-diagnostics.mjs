/**
 * Runtime truth for generated games.
 * PROBE_INIT_SCRIPT is injected before any game script runs and records what the game actually DID in a real
 * browser: which draw calls reached a canvas/WebGL context, whether frames advance, which input handlers exist,
 * whether audio started, and every error. classifyRuntime() turns those observations plus pixel measurements
 * into a verdict. Audio never counts as evidence that a game is visible or playable.
 */
export const PROBE_INIT_SCRIPT = String.raw`(function () {
  if (window.__geneProbe) return;
  var P = window.__geneProbe = { draw2d: 0, drawGL: 0, glClears: 0, raf: 0, audioStarts: 0, mediaPlays: 0, imageWhole: [], slices: {}, listeners: {}, errors: [], shaderErrors: [] };
  function wrap(proto, name, fn) { try { var orig = proto && proto[name]; if (typeof orig !== "function") return; proto[name] = function () { try { fn.apply(this, arguments); } catch (e) {} return orig.apply(this, arguments); }; } catch (e) {} }
  var C2 = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
  ["fillRect", "strokeRect", "fill", "stroke", "fillText", "strokeText", "putImageData"].forEach(function (n) { wrap(C2, n, function () { P.draw2d++; }); });
  wrap(C2, "drawImage", function (img, a, b, c, d, e, f, g, h) {
    P.draw2d++;
    var w = (img && (img.naturalWidth || img.width)) || 0, ht = (img && (img.naturalHeight || img.height)) || 0;
    var src = String((img && (img.currentSrc || img.src)) || "canvas").slice(0, 80);
    if (arguments.length >= 9) { var key = src + "|" + [a, b, c, d].map(Math.round).join(","); P.slices[key] = (P.slices[key] || 0) + 1; }
    else if (P.imageWhole.length < 60) P.imageWhole.push({ src: src, w: w, h: ht, dw: arguments.length >= 5 ? c : w, dh: arguments.length >= 5 ? d : ht });
  });
  [window.WebGLRenderingContext, window.WebGL2RenderingContext].forEach(function (GL) {
    var p = GL && GL.prototype; if (!p) return;
    ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"].forEach(function (n) { wrap(p, n, function () { P.drawGL++; }); });
    wrap(p, "clear", function () { P.glClears++; });
    var cs = p.compileShader; if (cs) p.compileShader = function (s) { cs.call(this, s); try { if (!this.getShaderParameter(s, this.COMPILE_STATUS)) P.shaderErrors.push("shader: " + String(this.getShaderInfoLog(s) || "compile failed").slice(0, 200)); } catch (e) {} };
    var lp = p.linkProgram; if (lp) p.linkProgram = function (g) { lp.call(this, g); try { if (!this.getProgramParameter(g, this.LINK_STATUS)) P.shaderErrors.push("program: " + String(this.getProgramInfoLog(g) || "link failed").slice(0, 200)); } catch (e) {} };
  });
  var raf = window.requestAnimationFrame; window.requestAnimationFrame = function (cb) { P.raf++; return raf.call(window, cb); };
  wrap(window.AudioScheduledSourceNode && AudioScheduledSourceNode.prototype, "start", function () { P.audioStarts++; });
  wrap(window.HTMLMediaElement && HTMLMediaElement.prototype, "play", function () { P.mediaPlays++; });
  var add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type) { try { P.listeners[type] = (P.listeners[type] || 0) + 1; } catch (e) {} return add.apply(this, arguments); };
  window.addEventListener("error", function (e) { P.errors.push(String(e.message || "script error") + (e.filename ? " @ " + String(e.filename).split("/").pop() + ":" + e.lineno : "")); });
  window.addEventListener("unhandledrejection", function (e) { P.errors.push("Unhandled rejection: " + String((e.reason && e.reason.message) || e.reason || "unknown")); });
  var ce = console.error; console.error = function () { try { P.errors.push("console.error: " + Array.prototype.slice.call(arguments).join(" ").slice(0, 200)); } catch (e) {} return ce.apply(console, arguments); };
})();`;

const INPUT_EVENTS = ["keydown", "keyup", "keypress", "pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "click", "gamepadconnected"];

/** True when the drawn images look like a multi-frame sheet (wide or tall strip / grid) rather than one sprite. */
export function looksLikeSpriteSheet(image) {
  if (!image || !(image.w > 0) || !(image.h > 0)) return false;
  const ratio = image.w / image.h;
  return ratio >= 2.5 || ratio <= 0.4 || (image.w >= 256 && image.h >= 256 && image.w % 2 === 0 && image.h % 2 === 0 && image.w * image.h >= 128 * 128 * 4);
}

/**
 * @param {object} report observations from the probe (see scripts/runtime-probe.mjs)
 * @param {{ kind?: "game"|"app", engine?: string, requiresMotion?: boolean, requiresInput?: boolean, textGame?: boolean, expectsAudio?: boolean, expectsSpriteAnimation?: boolean }} contract
 */
export function classifyRuntime(report, contract = {}) {
  const c = { kind: "game", engine: "canvas2d", requiresMotion: true, requiresInput: true, textGame: false, expectsAudio: false, expectsSpriteAnimation: false, ...contract };
  const checks = [];
  const add = (id, status, detail) => checks.push({ id, status, detail });
  const probe = report.probe || {};
  const dom = report.dom || {};
  const canvas = report.canvas || null;
  const draws = (probe.draw2d || 0) + (probe.drawGL || 0);
  const errors = [...(probe.errors || []), ...(probe.shaderErrors || []), ...(report.pageErrors || [])];
  const usesCanvas = c.engine !== "webapp" && c.engine !== "dom" && !c.textGame;

  add("no-runtime-errors", errors.length ? "fail" : "pass", errors.length ? errors.slice(0, 3).join(" | ") : "No script, shader or console errors were observed.");

  let visible = false;
  if (usesCanvas) {
    if (!canvas) add("renderer-present", "fail", "No visible canvas element was found on the page.");
    else {
      add("renderer-present", "pass", "Canvas " + canvas.width + "×" + canvas.height + " is on the page.");
      add("draw-calls", draws > 0 ? "pass" : "fail", draws > 0 ? draws + " draw operation(s) reached the " + (probe.drawGL ? "WebGL" : "2D") + " context." : "The game loop ran but nothing was ever drawn to the canvas.");
      visible = Boolean(report.visible && report.visible.contentRatio >= 0.01 && report.visible.colors >= 3);
      add("visible-content", visible ? "pass" : "fail", report.visible
        ? Math.round(report.visible.contentRatio * 1000) / 10 + "% of the canvas differs from its background across " + report.visible.colors + " distinct colours."
        : "The canvas could not be captured.");
    }
  } else {
    const hasContent = Boolean(dom.textLength > 0 || dom.controls > 0);
    visible = hasContent;
    add("renderer-present", hasContent ? "pass" : "fail", hasContent ? dom.textLength + " characters of visible text and " + dom.controls + " interactive control(s) are on the page." : "The page has no visible text or controls.");
  }

  const inputTypes = INPUT_EVENTS.filter(type => (probe.listeners || {})[type] > 0);
  if (c.requiresInput) add("input-handlers", inputTypes.length || dom.controls > 0 ? "pass" : "fail", inputTypes.length ? "Listening for: " + inputTypes.join(", ") + "." : dom.controls > 0 ? "Interactive controls are present." : "No input handlers were registered, so a player cannot act.");

  if (usesCanvas && canvas) {
    add("game-loop", (probe.raf || 0) > 2 ? "pass" : report.motion?.idleDelta > 0.0005 ? "pass" : "warn", (probe.raf || 0) > 2 ? "requestAnimationFrame ran " + probe.raf + " times." : "No animation loop was observed; the scene only changes if something else redraws it.");
    if (c.engine === "webgl3d") add("webgl-cleared", (probe.glClears || 0) > 0 ? "pass" : "warn", (probe.glClears || 0) > 0 ? "The frame buffer is cleared each frame." : "The frame buffer is never cleared.");
  }
  if (c.requiresMotion || c.requiresInput) {
    const idle = report.motion?.idleDelta ?? 0, input = report.motion?.inputDelta ?? 0, domChanged = Boolean(report.motion?.domChanged);
    const moving = idle > 0.0005;
    // DOM/text games are judged on the document changing: hover and focus styling also move pixels without any game logic.
    const noise = report.motion?.noise ?? 0;
    const responsive = domChanged || (usesCanvas && input > Math.max(0.002, noise * 2));
    // Frames that differ between two IDENTICAL runs (GPU timing, unseeded randomness) cannot prove or disprove a reaction to input.
    const unreproducible = usesCanvas && !domChanged && noise >= 0.004 && !responsive;
    if (c.requiresInput) add("input-response", responsive ? "pass" : unreproducible ? "warn" : "fail",
      responsive ? "Player input visibly changed the " + (domChanged ? "page content." : "rendered frame compared with an identical run without input.")
        : unreproducible ? "Input response could not be isolated: frames differ between identical runs without input (" + Math.round(noise * 1000) / 10 + "% noise), so this is unverified rather than failed."
        : "Pressing keys and clicking changed nothing on screen compared with an identical run without input.");
    if (c.requiresMotion && !c.textGame) add("scene-alive", moving || responsive ? "pass" : "fail", moving ? "The rendered frame changes over time." : responsive ? "The scene is static until the player acts." : "The scene never changes, with or without input.");
  }

  const wholeSheets = (probe.imageWhole || []).filter(looksLikeSpriteSheet);
  const sliceKeys = Object.keys(probe.slices || {});
  const slicedSources = new Set(sliceKeys.map(key => key.split("|")[0]));
  const unslicedSheets = wholeSheets.filter(image => !slicedSources.has(image.src));
  if (unslicedSheets.length) add("sprite-sheet-sliced", "fail", unslicedSheets.length + " sprite sheet(s) were drawn whole as a static image (first: " + unslicedSheets[0].w + "×" + unslicedSheets[0].h + "). Slice frames and play named clips.");
  if (sliceKeys.length) {
    const bySource = {};
    for (const key of sliceKeys) { const src = key.split("|")[0]; (bySource[src] ||= new Set()).add(key); }
    const best = Math.max(...Object.values(bySource).map(set => set.size));
    add("sprite-animation", best > 1 ? "pass" : (c.expectsSpriteAnimation ? "fail" : "warn"), best > 1 ? best + " different frame regions of a sheet were drawn over time." : "Only one frame region of the sheet was ever drawn, so the character is not animating.");
  } else if (c.expectsSpriteAnimation) add("sprite-animation", "fail", "The project declares sprite animation but no sheet frames were drawn.");

  const audioStarted = (probe.audioStarts || 0) + (probe.mediaPlays || 0) > 0;
  if (audioStarted || c.expectsAudio) add("audio", audioStarted ? "pass" : "warn", audioStarted ? "Audio playback started. This does not count as evidence that the game is visible or playable." : "Audio was expected but never started.");

  const failed = checks.filter(check => check.status === "fail");
  const ghost = audioStarted && !visible && usesCanvas;
  let verdict = failed.length ? "not-playable" : "playable";
  const reasons = failed.map(check => check.detail);
  if (ghost) { verdict = "audio-only-ghost"; reasons.unshift("Audio is playing but nothing visible is rendered: this is an audio-only ghost game, not a playable build."); }
  return {
    verdict,
    checks,
    reasons,
    // What this runtime pass does NOT establish, so a pass is never reported as a full gameplay test.
    unverified: ["The objective can be reached and won.", "Enemies, hazards and collisions behave correctly.", "Menus, pause and restart flows work.", "Performance on the player's device."]
  };
}
