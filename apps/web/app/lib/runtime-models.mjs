/**
 * GENE Models kit — injected next to GeneAudio into every game runtime.
 *
 * Gives generated games a shared, tested library of good-looking, animated models so every
 * Subway-style runner, Mario-style platformer and arcade game starts from the same quality bar
 * instead of inventing stick figures from scratch:
 *
 *   2D (Canvas):  GeneModels.drawCharacter / drawEnemy / drawCoin / drawBlock / drawTrainCar / drawBackdrop
 *   3D (WebGL):   GeneModels.rig3D.character(style) + GeneModels.bake(rig, state, t, rootMatrix)
 *                 GeneModels.props3D.train / coin / barrier / crate / tree
 *                 GeneModels.mesh (box, cylinder, sphere, merge, transform) and GeneModels.mat4
 *
 * Meshes are plain typed arrays {positions, normals, colors, indices} so any hand-written WebGL
 * pipeline can upload them. Nothing here touches the DOM or WebGL; every call is safe and never throws.
 * The source contains no template literals and no closing script tags so it can be inlined.
 */

export const GENE_MODELS_SOURCE = String.raw`(function (root) {
  'use strict';
  if (root.GeneModels && root.GeneModels.__ready) return;
  var M = {};
  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rgbOf(hex) {
    var s = String(hex || '#888888').replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s, 16);
    if (!isFinite(n)) n = 0x888888;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function shade(hex, f) {
    var c = rgbOf(hex);
    return 'rgb(' + Math.round(clamp(c[0] * f, 0, 1) * 255) + ',' + Math.round(clamp(c[1] * f, 0, 1) * 255) + ',' + Math.round(clamp(c[2] * f, 0, 1) * 255) + ')';
  }
  M.palettes = {
    hero:   { skin: '#f1c27d', shirt: '#e03c3c', pants: '#2f5fd0', hat: '#e03c3c', shoe: '#4a2c17', accent: '#ffd23f' },
    runner: { skin: '#e8b98a', shirt: '#22c1a5', pants: '#30343f', hat: '#ffb703', shoe: '#f4f4f4', accent: '#fb5607' },
    ninja:  { skin: '#e8b98a', shirt: '#25252d', pants: '#25252d', hat: '#7b2cbf', shoe: '#111116', accent: '#e63946' },
    knight: { skin: '#e8b98a', shirt: '#9aa5b1', pants: '#5c6672', hat: '#c0c8d0', shoe: '#3b3f46', accent: '#e9c46a' }
  };
  function styleOf(style) {
    var base = M.palettes.hero, out = {}, k;
    var chosen = typeof style === 'string' ? (M.palettes[style] || base) : (style && typeof style === 'object' ? style : base);
    for (k in base) out[k] = chosen[k] || base[k];
    return out;
  }

  /* ---------- 2D canvas models ---------- */
  function limb(ctx, x, y, len, angle, width, color, endColor) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.lineCap = 'round'; ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, len); ctx.stroke();
    ctx.fillStyle = endColor; ctx.beginPath(); ctx.ellipse(0, len, width * 0.7, width * 0.55, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  M.drawCharacter = function (ctx, x, y, size, opts) {
    try {
      opts = opts || {};
      var st = styleOf(opts.style), t = Number(opts.t) || 0, state = opts.state || 'idle';
      var facing = opts.facing < 0 ? -1 : 1, s = (Number(size) || 48) / 48;
      var cycle = state === 'run' ? t * 12 : state === 'walk' ? t * 7 : 0;
      var swing = Math.sin(cycle) * (state === 'run' ? 0.95 : 0.6);
      var bob = state === 'run' ? Math.abs(Math.sin(cycle)) * 3 : state === 'idle' ? Math.sin(t * 2.5) * 1.2 : 0;
      var sx = 1, sy = 1;
      if (state === 'jump') { sx = 0.94; sy = 1.08; swing = 0.55; }
      if (state === 'fall') { sx = 1.06; sy = 0.94; swing = -0.45; }
      if (state === 'slide') { sy = 0.6; sx = 1.15; }
      ctx.save(); ctx.translate(x, y); ctx.scale(facing * s * sx, s * sy);
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(0, 0, 13, 3.2, 0, 0, TAU); ctx.fill();
      limb(ctx, -4.5, -18 - bob, 17, -swing, 7, st.pants, st.shoe);
      limb(ctx, 4.5, -18 - bob, 17, swing, 7, st.pants, st.shoe);
      ctx.fillStyle = st.shirt; ctx.beginPath(); ctx.ellipse(0, -27 - bob, 9.5, 11, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = st.pants; ctx.beginPath(); ctx.ellipse(0, -21 - bob, 9.5, 6.5, 0, 0, Math.PI); ctx.fill();
      ctx.fillStyle = st.accent; ctx.beginPath(); ctx.arc(-4, -26 - bob, 1.6, 0, TAU); ctx.arc(4, -26 - bob, 1.6, 0, TAU); ctx.fill();
      limb(ctx, -9, -33 - bob, 12, swing * 0.9 - (state === 'jump' ? 2.2 : 0), 5.5, st.shirt, st.skin);
      limb(ctx, 9, -33 - bob, 12, -swing * 0.9 + (state === 'jump' ? 2.2 : 0), 5.5, st.shirt, st.skin);
      ctx.fillStyle = st.skin; ctx.beginPath(); ctx.arc(0, -43 - bob, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = st.hat; ctx.beginPath(); ctx.arc(0, -44 - bob, 9.4, Math.PI, TAU); ctx.fill();
      ctx.fillRect(1, -45 - bob, 12, 3.4);
      ctx.fillStyle = '#1b1b22'; ctx.beginPath(); ctx.arc(4, -42 - bob, 1.5, 0, TAU); ctx.fill();
      ctx.restore();
      return true;
    } catch (e) { return false; }
  };
  M.drawCoin = function (ctx, x, y, r, t) {
    try {
      r = r || 10; var w = Math.max(0.12, Math.abs(Math.cos((Number(t) || 0) * 4)));
      ctx.save(); ctx.translate(x, y + Math.sin((Number(t) || 0) * 3) * 2);
      ctx.fillStyle = '#c98a00'; ctx.beginPath(); ctx.ellipse(0, 0, r * w, r, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.ellipse(0, 0, r * w * 0.82, r * 0.82, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(-r * w * 0.3, -r * 0.3, r * w * 0.18, r * 0.3, 0, 0, TAU); ctx.fill();
      ctx.restore(); return true;
    } catch (e) { return false; }
  };
  M.drawEnemy = function (ctx, x, y, size, t, opts) {
    try {
      opts = opts || {}; var kind = opts.kind || 'walker', s = (Number(size) || 40) / 40, tt = Number(t) || 0;
      var body = opts.color || (kind === 'slime' ? '#4cc9a0' : kind === 'flyer' ? '#8e6bd8' : '#a8672f');
      ctx.save(); ctx.translate(x, y); ctx.scale((opts.facing < 0 ? -1 : 1) * s, s);
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(0, 0, 14, 3, 0, 0, TAU); ctx.fill();
      if (kind === 'slime') {
        var sq = 1 + Math.sin(tt * 5) * 0.08;
        ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, -11 * sq, 15 / sq, 12 * sq, 0, Math.PI, TAU); ctx.lineTo(15 / sq, 0); ctx.lineTo(-15 / sq, 0); ctx.fill();
      } else if (kind === 'flyer') {
        var flap = Math.sin(tt * 14) * 9;
        ctx.fillStyle = shade(body, 1.25);
        ctx.beginPath(); ctx.ellipse(-11, -22 - flap, 10, 5, -0.5, 0, TAU); ctx.ellipse(11, -22 - flap, 10, 5, 0.5, 0, TAU); ctx.fill();
        ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, -18, 11, 11, 0, 0, TAU); ctx.fill();
      } else {
        var step = Math.sin(tt * 9) * 3;
        ctx.fillStyle = '#3a2412'; ctx.beginPath(); ctx.ellipse(-7 + step, -2, 7, 3.5, 0, 0, TAU); ctx.ellipse(7 - step, -2, 7, 3.5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#f0d9b5'; ctx.fillRect(-7, -14, 14, 10);
        ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, -20, 17, 14, 0, Math.PI, TAU); ctx.lineTo(17, -17); ctx.lineTo(-17, -17); ctx.fill();
      }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-5, -16, 3.4, 0, TAU); ctx.arc(5, -16, 3.4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#16161b'; ctx.beginPath(); ctx.arc(-4, -15.5, 1.6, 0, TAU); ctx.arc(6, -15.5, 1.6, 0, TAU); ctx.fill();
      ctx.restore(); return true;
    } catch (e) { return false; }
  };
  M.drawBlock = function (ctx, x, y, s, kind, t) {
    try {
      s = s || 32; kind = kind || 'brick';
      var base = kind === 'question' ? '#f4b41a' : kind === 'ground' ? '#8a5a2b' : '#c1572d';
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = shade(base, 1.25); ctx.fillRect(0, 0, s, 3); ctx.fillRect(0, 0, 3, s);
      ctx.fillStyle = shade(base, 0.7); ctx.fillRect(0, s - 3, s, 3); ctx.fillRect(s - 3, 0, 3, s);
      if (kind === 'brick') { ctx.fillStyle = shade(base, 0.7); ctx.fillRect(0, s / 2 - 1, s, 2); ctx.fillRect(s / 2 - 1, 0, 2, s / 2); ctx.fillRect(s / 4 - 1, s / 2, 2, s / 2); }
      if (kind === 'question') { ctx.fillStyle = 'rgba(255,255,255,' + (0.7 + Math.sin((Number(t) || 0) * 4) * 0.25) + ')'; ctx.font = 'bold ' + Math.round(s * 0.62) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', s / 2, s / 2 + 1); }
      ctx.restore(); return true;
    } catch (e) { return false; }
  };
  M.drawTrainCar = function (ctx, x, y, w, h, t, color) {
    try {
      color = color || '#2e86de'; w = w || 120; h = h || 70;
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(4, h - 2, w - 8, 5);
      ctx.fillStyle = color; ctx.fillRect(0, 0, w, h - 10);
      ctx.fillStyle = shade(color, 1.3); ctx.fillRect(0, 0, w, 6);
      ctx.fillStyle = shade(color, 0.7); ctx.fillRect(0, h - 22, w, 12);
      ctx.fillStyle = '#10151c'; ctx.fillRect(w * 0.08, 14, w * 0.2, h * 0.32); ctx.fillRect(w * 0.4, 14, w * 0.2, h * 0.32); ctx.fillRect(w * 0.72, 14, w * 0.2, h * 0.32);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(w * 0.08, 14, w * 0.2, 5);
      var blink = 0.6 + Math.sin((Number(t) || 0) * 6) * 0.4;
      ctx.fillStyle = 'rgba(255,240,170,' + blink + ')'; ctx.fillRect(w - 6, h * 0.35, 6, 10);
      ctx.fillStyle = '#222'; ctx.fillRect(w * 0.12, h - 10, w * 0.14, 10); ctx.fillRect(w * 0.74, h - 10, w * 0.14, 10);
      ctx.restore(); return true;
    } catch (e) { return false; }
  };
  M.drawBackdrop = function (ctx, w, h, t, theme) {
    try {
      var themes = {
        day: ['#78c8ff', '#d8f1ff', '#4aa86a', '#2f7d4b'], dusk: ['#ff9a5a', '#ffd9a1', '#5b4a8a', '#3a2f63'],
        night: ['#0d1b3d', '#27407a', '#26324f', '#161e33'], city: ['#ffb36b', '#ffe3b8', '#4b5568', '#2d3646']
      };
      var c = themes[theme] || themes.day, tt = Number(t) || 0;
      var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, c[0]); g.addColorStop(1, c[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      function layer(speed, base, amp, color) {
        ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, h);
        for (var px = 0; px <= w; px += 12) ctx.lineTo(px, base + Math.sin((px + tt * speed) * 0.012) * amp + Math.sin((px + tt * speed) * 0.031) * amp * 0.4);
        ctx.lineTo(w, h); ctx.fill();
      }
      layer(14, h * 0.62, h * 0.07, c[2]); layer(34, h * 0.74, h * 0.05, c[3]);
      ctx.fillStyle = theme === 'night' ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.8)';
      for (var i = 0; i < 4; i++) { var cx = ((i * w) / 3.4 - tt * (8 + i * 3)) % (w + 160); if (cx < -80) cx += w + 160; ctx.beginPath(); ctx.ellipse(cx, h * (0.14 + i * 0.05), 46, 14, 0, 0, TAU); ctx.ellipse(cx + 26, h * (0.14 + i * 0.05) - 8, 30, 12, 0, 0, TAU); ctx.fill(); }
      return true;
    } catch (e) { return false; }
  };

  /* ---------- 3D math + meshes ---------- */
  var mat4 = M.mat4 = {
    identity: function () { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
    multiply: function (a, b) {
      var o = new Float32Array(16);
      for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      return o;
    },
    translate: function (x, y, z) { var m = mat4.identity(); m[12] = x; m[13] = y; m[14] = z; return m; },
    scale: function (x, y, z) { var m = mat4.identity(); m[0] = x; m[5] = y === undefined ? x : y; m[10] = z === undefined ? x : z; return m; },
    rotateX: function (a) { var m = mat4.identity(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; },
    rotateY: function (a) { var m = mat4.identity(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; },
    rotateZ: function (a) { var m = mat4.identity(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }
  };
  function makeMesh(pos, nor, col, idx) {
    return { positions: new Float32Array(pos), normals: new Float32Array(nor), colors: new Float32Array(col), indices: new Uint16Array(idx) };
  }
  function boxMesh(w, h, d, color) {
    var x = w / 2, y = h / 2, z = d / 2, c = rgbOf(color), P = [], N = [], C = [], I = [];
    var faces = [
      [[x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z], [1, 0, 0], 0.86], [[-x, -y, z], [-x, y, z], [-x, y, -z], [-x, -y, -z], [-1, 0, 0], 0.7],
      [[-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z], [0, 1, 0], 1.12], [[-x, -y, z], [-x, -y, -z], [x, -y, -z], [x, -y, z], [0, -1, 0], 0.5],
      [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], [0, 0, 1], 0.95], [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z], [0, 0, -1], 0.78]
    ];
    for (var f = 0; f < 6; f++) {
      var face = faces[f], base = P.length / 3;
      for (var v = 0; v < 4; v++) { P.push(face[v][0], face[v][1], face[v][2]); N.push(face[4][0], face[4][1], face[4][2]); C.push(clamp(c[0] * face[5], 0, 1), clamp(c[1] * face[5], 0, 1), clamp(c[2] * face[5], 0, 1)); }
      I.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return makeMesh(P, N, C, I);
  }
  function cylinderMesh(rb, rt, h, seg, color) {
    seg = Math.max(3, Math.min(32, seg | 0 || 12)); var c = rgbOf(color), P = [], N = [], C = [], I = [], i, a0, a1;
    var slope = (rb - rt) / (h || 1);
    for (i = 0; i < seg; i++) {
      a0 = (i / seg) * TAU; a1 = ((i + 1) / seg) * TAU;
      var base = P.length / 3, shadeF = 0.65 + 0.35 * Math.max(0, Math.cos((a0 + a1) / 2 - 0.8));
      var nx = Math.cos((a0 + a1) / 2), nz = Math.sin((a0 + a1) / 2), nl = Math.sqrt(1 + slope * slope);
      var ring = [[Math.cos(a0) * rb, -h / 2, Math.sin(a0) * rb], [Math.cos(a1) * rb, -h / 2, Math.sin(a1) * rb], [Math.cos(a1) * rt, h / 2, Math.sin(a1) * rt], [Math.cos(a0) * rt, h / 2, Math.sin(a0) * rt]];
      for (var v = 0; v < 4; v++) { P.push(ring[v][0], ring[v][1], ring[v][2]); N.push(nx / nl, slope / nl, nz / nl); C.push(c[0] * shadeF, c[1] * shadeF, c[2] * shadeF); }
      I.push(base, base + 2, base + 1, base, base + 3, base + 2);
      var cap = P.length / 3;
      P.push(0, h / 2, 0, Math.cos(a0) * rt, h / 2, Math.sin(a0) * rt, Math.cos(a1) * rt, h / 2, Math.sin(a1) * rt);
      for (v = 0; v < 3; v++) { N.push(0, 1, 0); C.push(clamp(c[0] * 1.1, 0, 1), clamp(c[1] * 1.1, 0, 1), clamp(c[2] * 1.1, 0, 1)); }
      I.push(cap, cap + 2, cap + 1);
    }
    return makeMesh(P, N, C, I);
  }
  function sphereMesh(r, seg, color) {
    seg = Math.max(4, Math.min(20, seg | 0 || 8)); var c = rgbOf(color), P = [], N = [], C = [], I = [], i, j, rings = Math.max(3, seg >> 1);
    for (j = 0; j <= rings; j++) for (i = 0; i <= seg; i++) {
      var th = (j / rings) * Math.PI, ph = (i / seg) * TAU, nx = Math.sin(th) * Math.cos(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.sin(ph), f = 0.7 + 0.3 * ny;
      P.push(nx * r, ny * r, nz * r); N.push(nx, ny, nz); C.push(clamp(c[0] * f, 0, 1), clamp(c[1] * f, 0, 1), clamp(c[2] * f, 0, 1));
    }
    for (j = 0; j < rings; j++) for (i = 0; i < seg; i++) { var a = j * (seg + 1) + i, b = a + seg + 1; I.push(a, a + 1, b, a + 1, b + 1, b); }
    return makeMesh(P, N, C, I);
  }
  function transformMesh(mesh, m) {
    var n = mesh.positions.length / 3, P = new Float32Array(n * 3), N = new Float32Array(n * 3), i;
    for (i = 0; i < n; i++) {
      var x = mesh.positions[i * 3], y = mesh.positions[i * 3 + 1], z = mesh.positions[i * 3 + 2];
      P[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12]; P[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; P[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      var nx = mesh.normals[i * 3], ny = mesh.normals[i * 3 + 1], nz = mesh.normals[i * 3 + 2];
      var tx = m[0] * nx + m[4] * ny + m[8] * nz, ty = m[1] * nx + m[5] * ny + m[9] * nz, tz = m[2] * nx + m[6] * ny + m[10] * nz, l = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
      N[i * 3] = tx / l; N[i * 3 + 1] = ty / l; N[i * 3 + 2] = tz / l;
    }
    return { positions: P, normals: N, colors: mesh.colors, indices: mesh.indices };
  }
  function mergeMeshes(list) {
    var vc = 0, ic = 0, i;
    for (i = 0; i < list.length; i++) { vc += list[i].positions.length / 3; ic += list[i].indices.length; }
    var P = new Float32Array(vc * 3), N = new Float32Array(vc * 3), C = new Float32Array(vc * 3), I = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic), vo = 0, io = 0;
    for (i = 0; i < list.length; i++) {
      var m = list[i], n = m.positions.length / 3, k;
      P.set(m.positions, vo * 3); N.set(m.normals, vo * 3); C.set(m.colors, vo * 3);
      for (k = 0; k < m.indices.length; k++) I[io + k] = m.indices[k] + vo;
      vo += n; io += m.indices.length;
    }
    return { positions: P, normals: N, colors: C, indices: I };
  }
  M.mesh = { box: boxMesh, cylinder: cylinderMesh, sphere: sphereMesh, transform: transformMesh, merge: mergeMeshes };

  /* ---------- 3D rigged character ---------- */
  M.rig3D = {
    character: function (style) {
      var st = styleOf(style);
      function part(name, group, size, color, pivot, center) { return { name: name, group: group, mesh: boxMesh(size[0], size[1], size[2], color), pivot: pivot, center: center }; }
      var parts = [
        part('torso', 'upper', [0.62, 0.74, 0.34], st.shirt, [0, 0.92, 0], [0, 0.37, 0]),
        part('belt', 'upper', [0.64, 0.14, 0.36], st.pants, [0, 0.92, 0], [0, 0.07, 0]),
        part('head', 'upper', [0.42, 0.42, 0.42], st.skin, [0, 1.66, 0], [0, 0.21, 0]),
        part('hat', 'upper', [0.46, 0.16, 0.5], st.hat, [0, 1.66, 0], [0, 0.46, 0.03]),
        part('armL', 'armL', [0.2, 0.62, 0.2], st.shirt, [-0.42, 1.58, 0], [0, -0.28, 0]),
        part('armR', 'armR', [0.2, 0.62, 0.2], st.shirt, [0.42, 1.58, 0], [0, -0.28, 0]),
        part('legL', 'legL', [0.26, 0.92, 0.28], st.pants, [-0.16, 0.92, 0], [0, -0.46, 0]),
        part('legR', 'legR', [0.26, 0.92, 0.28], st.pants, [0.16, 0.92, 0], [0, -0.46, 0]),
        part('shoeL', 'legL', [0.28, 0.14, 0.4], st.shoe, [-0.16, 0.92, 0], [0, -0.92, -0.05]),
        part('shoeR', 'legR', [0.28, 0.14, 0.4], st.shoe, [0.16, 0.92, 0], [0, -0.92, -0.05])
      ];
      return { style: st, parts: parts, height: 2.0 };
    },
    pose: function (state, t) {
      t = Number(t) || 0; state = state || 'idle';
      var p = { lean: 0, bob: 0, drop: 0, armL: 0, armR: 0, legL: 0, legR: 0, spin: 0 };
      if (state === 'run') { var c = t * 12; p.legL = Math.sin(c) * 0.95; p.legR = -p.legL; p.armL = -p.legL * 0.9; p.armR = p.legL * 0.9; p.bob = Math.abs(Math.sin(c)) * 0.08; p.lean = -0.14; }
      else if (state === 'walk') { var w = t * 7; p.legL = Math.sin(w) * 0.6; p.legR = -p.legL; p.armL = -p.legL * 0.8; p.armR = p.legL * 0.8; p.bob = Math.abs(Math.sin(w)) * 0.04; }
      else if (state === 'jump') { p.legL = -0.7; p.legR = 0.5; p.armL = 2.5; p.armR = 2.5; p.lean = -0.1; }
      else if (state === 'fall') { p.legL = 0.4; p.legR = -0.4; p.armL = 1.4; p.armR = 1.4; }
      else if (state === 'slide') { p.lean = -1.15; p.drop = 0.45; p.legL = -1.1; p.legR = -1.1; p.armL = 1.2; p.armR = 1.2; }
      else if (state === 'hit') { p.lean = 0.35; p.armL = 1; p.armR = -1; p.spin = Math.sin(t * 30) * 0.15; }
      else { p.bob = Math.sin(t * 2.5) * 0.015; p.armL = Math.sin(t * 2.5) * 0.06; p.armR = -p.armL; }
      return p;
    }
  };
  /** Bake a posed rig into ONE world-space mesh (single draw call). rootMatrix places the feet at its origin; forward is -Z. */
  M.bake = function (rig, state, t, rootMatrix) {
    try {
      var pose = M.rig3D.pose(state, t), root = rootMatrix || mat4.identity(), out = [], i;
      var base = mat4.multiply(root, mat4.translate(0, pose.bob - pose.drop, 0));
      var hip = [0, 0.92, 0];
      var upper = mat4.multiply(base, mat4.multiply(mat4.translate(hip[0], hip[1], hip[2]), mat4.multiply(mat4.rotateX(pose.lean), mat4.multiply(mat4.rotateZ(pose.spin), mat4.translate(-hip[0], -hip[1], -hip[2])))));
      for (i = 0; i < rig.parts.length; i++) {
        var pt = rig.parts[i], angle = pt.group === 'armL' ? pose.armL : pt.group === 'armR' ? pose.armR : pt.group === 'legL' ? pose.legL : pt.group === 'legR' ? pose.legR : 0;
        var frame = (pt.group === 'upper' || pt.group === 'armL' || pt.group === 'armR') ? upper : base;
        var m = mat4.multiply(frame, mat4.multiply(mat4.translate(pt.pivot[0], pt.pivot[1], pt.pivot[2]), mat4.multiply(mat4.rotateX(angle), mat4.translate(pt.center[0], pt.center[1], pt.center[2]))));
        out.push(transformMesh(pt.mesh, m));
      }
      return mergeMeshes(out);
    } catch (e) { return mergeMeshes([boxMesh(0.5, 1.8, 0.5, '#e03c3c')]); }
  };

  /* ---------- 3D props ---------- */
  function compose(items) {
    var out = [], i;
    for (i = 0; i < items.length; i++) out.push(transformMesh(items[i][0], items[i][1]));
    return mergeMeshes(out);
  }
  M.props3D = {
    train: function (color) {
      color = color || '#2e86de'; var T = mat4.translate;
      return compose([
        [boxMesh(2.2, 2.4, 8, color), T(0, 1.5, 0)], [boxMesh(2.3, 0.18, 8.1, shade2(color, 1.3)), T(0, 2.78, 0)],
        [boxMesh(2.25, 0.5, 8.05, shade2(color, 0.65)), T(0, 0.55, 0)], [boxMesh(1.9, 0.5, 0.1, '#10151c'), T(0, 1.9, -4.02)],
        [boxMesh(0.35, 0.3, 0.12, '#fff2b0'), T(-0.7, 1.1, -4.05)], [boxMesh(0.35, 0.3, 0.12, '#fff2b0'), T(0.7, 1.1, -4.05)],
        [boxMesh(0.08, 0.6, 1.4, '#10151c'), T(1.12, 1.9, -2.2)], [boxMesh(0.08, 0.6, 1.4, '#10151c'), T(1.12, 1.9, 0.4)], [boxMesh(0.08, 0.6, 1.4, '#10151c'), T(1.12, 1.9, 2.6)],
        [boxMesh(0.08, 0.6, 1.4, '#10151c'), T(-1.12, 1.9, -2.2)], [boxMesh(0.08, 0.6, 1.4, '#10151c'), T(-1.12, 1.9, 0.4)], [boxMesh(0.08, 0.6, 1.4, '#10151c'), T(-1.12, 1.9, 2.6)]
      ]);
    },
    coin: function (color) {
      return transformMesh(cylinderMesh(0.32, 0.32, 0.08, 14, color || '#ffd23f'), mat4.multiply(mat4.translate(0, 0.9, 0), mat4.rotateX(Math.PI / 2)));
    },
    barrier: function () {
      var T = mat4.translate;
      return compose([[boxMesh(0.14, 1.1, 0.14, '#555b66'), T(-0.9, 0.55, 0)], [boxMesh(0.14, 1.1, 0.14, '#555b66'), T(0.9, 0.55, 0)],
        [boxMesh(1.9, 0.28, 0.12, '#ffd23f'), T(0, 0.95, 0)], [boxMesh(0.36, 0.28, 0.14, '#222'), T(-0.6, 0.95, 0)], [boxMesh(0.36, 0.28, 0.14, '#222'), T(0.2, 0.95, 0)], [boxMesh(0.36, 0.28, 0.14, '#222'), T(0.8, 0.95, 0)]]);
    },
    crate: function (color) { return transformMesh(boxMesh(1, 1, 1, color || '#b9782f'), mat4.translate(0, 0.5, 0)); },
    tree: function () {
      var T = mat4.translate;
      return compose([[cylinderMesh(0.22, 0.28, 1.4, 8, '#7b4a25'), T(0, 0.7, 0)], [cylinderMesh(1.2, 0.05, 1.8, 9, '#2f9d57'), T(0, 2.1, 0)], [cylinderMesh(0.9, 0.05, 1.5, 9, '#3dbb6a'), T(0, 3.0, 0)]]);
    }
  };
  function shade2(hex, f) { var c = rgbOf(hex); function ch(v) { return ('0' + Math.round(clamp(v * f, 0, 1) * 255).toString(16)).slice(-2); } return '#' + ch(c[0]) + ch(c[1]) + ch(c[2]); }

  M.version = '1.0'; M.__ready = true;
  root.GeneModels = M;
})(typeof window !== 'undefined' ? window : this);`;
