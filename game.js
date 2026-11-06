'use strict';
// ================= 상수 =================
const W = 540, H = 960;
const BPM = 150, BEAT = 60 / BPM, STEP = BEAT / 4, BAR = BEAT * 4;
const INTRO_BARS = 2;
const BOSS_X = W / 2, BOSS_Y = 230;
const SENS = 1.3;                       // 드래그 감도
const HIT_R = 4, PLAYER_R = 10, GRAZE_R = 30;
const BOSS_HP = 1000;
const D5 = 587.33, D2 = 73.42;
const semi = n => Math.pow(2, n / 12);
// 카우벨 리프 (16분음표 step → 반음)
const RIFF_A = { 0: 0, 2: 0, 4: -2, 6: 0, 9: -5, 12: -4, 14: -5 };
const RIFF_B = { 0: 0, 2: 0, 4: -2, 6: 0, 9: 3, 12: 2, 14: -2 };
const BASS_ROOT = [0, 0, -4, -2];
const SLASH_SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];

const PAL = {
  dodge:  { bg: '#07070c', fg: '#ffffff', acc: '#00e5ff', warn: '0,229,255', grid: '255,255,255', shade: 'rgba(7,7,12,0.72)' },
  strike: { bg: '#f1efe9', fg: '#0c0c12', acc: '#ff1e56', warn: '255,30,86', grid: '0,0,0',       shade: 'rgba(241,239,233,0.78)' },
};

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

// ================= 캔버스 =================
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let scale = 1, dpr = 1;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  scale = Math.min(innerWidth / W, innerHeight / H);
  canvas.style.width = (W * scale) + 'px';
  canvas.style.height = (H * scale) + 'px';
  canvas.width = Math.round(W * scale * dpr);
  canvas.height = Math.round(H * scale * dpr);
}
addEventListener('resize', resize); resize();

// ================= 상태 =================
const opts = { god: false, hitbox: false, offset: +(localStorage.getItem('cb_offset') || 0) };
const startBar = Math.max(0, parseInt(new URLSearchParams(location.search).get('bar') || '0', 10) || 0);

function freshState() {
  return {
    mode: 'title', paused: false, t0: 0, audioStep: 0, gameStep: 0, evStep: -1,
    player: { x: W / 2, y: H * 0.78 }, prevX: W / 2, prevY: H * 0.78, trail: [],
    lives: 3, invulnUntil: -1, bossHp: BOSS_HP, bossShown: BOSS_HP, bossFlash: 0,
    hazards: [], nodes: [], parts: [], texts: [],
    gauge: 0, combo: 0, maxCombo: 0, cycleDmg: 0, lastNode: null, slashN: 0,
    stats: { perfect: 0, great: 0, good: 0, miss: 0, graze: 0, hits: 0 },
    vphase: 'dodge', catchT: null, pulse: 0, shake: 0, flash: 0, flashCol: '#fff',
    hitstopUntil: 0, displayT: 0, endT: 0, endReal: 0,
    score: 0, newBest: false, fired: {},
  };
}
let S = freshState();
window.__cb = () => S; // 디버그용

// ================= 곡 구조 =================
function barInfo(bar) {
  if (bar < INTRO_BARS) return { type: 'intro', d: bar, cycle: -1, tier: 0 };
  const b = bar - INTRO_BARS, cycle = Math.floor(b / 8), w = b % 8, tier = Math.min(cycle, 3);
  return w < 4 ? { type: 'dodge', d: w, cycle, tier } : { type: 'strike', d: w - 4, cycle, tier };
}

// 회피 마디 패턴: 악기 = 탄막. kick→링, bell→레이저, slam(808)→반화면 슬램, spray(하이햇)→조준탄
const dodgeCache = {};
function dodgeBar(d, tier) {
  const key = d + '_' + tier;
  if (dodgeCache[key]) return dodgeCache[key];
  const p = { kick: [], bell: [], slam: -1, spray: [], clap: [12], riser: false };
  if (d === 0) {
    p.kick = [0, 8];
    if (tier >= 1) p.bell = [[4, 7], [12, 3]];
    if (tier >= 2) p.kick = [0, 6, 8];
  } else if (d === 1) {
    p.kick = [0, 8];
    p.bell = [[0, 0], [6, -5], [10, -2]];
    if (tier >= 1) p.bell.push([14, 5]);
    if (tier >= 3) p.kick = [0, 8, 10];
  } else if (d === 2) {
    p.kick = tier >= 2 ? [0, 4] : [0];
    p.slam = 8;
    p.bell = tier >= 1 ? [[2, -7], [12, 3]] : [[12, 3]];
  } else {
    p.kick = [0, 4, 8];
    p.spray = tier >= 2 ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : [0, 2, 4, 6, 8, 10];
    p.riser = true; p.clap = [];
    if (tier >= 1) p.bell = [[2, 0], [10, 5]];
  }
  return (dodgeCache[key] = p);
}
function kicksOf(info) {
  if (info.type === 'intro') return [0, 8];
  if (info.type === 'dodge') return dodgeBar(info.d, info.tier).kick;
  return info.d < 3 ? [0, 7, 10] : [0, 8];
}

// ================= 오디오 스케줄 =================
function scheduleAudio(g, t) {
  const bar = g >> 4, s = g & 15, info = barInfo(bar), kicks = kicksOf(info);
  if (info.type === 'intro') {
    if (kicks.includes(s)) Sound.kick(t);
    if (s % 2 === 0) Sound.hat(t, s % 4 === 2 ? 0.1 : 0.06);
    if (info.d === 1) {
      if (s === 4 || s === 12) Sound.clap(t, 0.35);
      if (RIFF_A[s] !== undefined) Sound.bell(t, D5 * semi(RIFF_A[s]), 0.12);
    }
    return;
  }
  if (info.type === 'dodge') {
    if (info.d === 3 && s >= 12) return; // 캐치 포인트: 무음
    const p = dodgeBar(info.d, info.tier);
    if (kicks.includes(s)) Sound.kick(t);
    if (s === 0) Sound.bass(t, D2 * semi(BASS_ROOT[info.d]), 0.5, 0.4);
    if (p.slam === s) { Sound.kick(t, true); Sound.bass(t, D2 * semi(-5), 0.9, 1.0); Sound.crash(t, 0.18); }
    if (p.clap.includes(s)) Sound.clap(t, 0.32);
    for (const [st, pi] of p.bell) if (st === s) Sound.bell(t, D5 * semi(pi), 0.26);
    if (info.d === 3) { Sound.hat(t, 0.04 + s * 0.008, 0.025); if (s === 0) Sound.riser(t, STEP * 12); }
    else if (s % 2 === 0) Sound.hat(t, s % 4 === 2 ? 0.11 : 0.06);
    return;
  }
  // strike: 풀 phonk
  const d = info.d, riff = d % 2 ? RIFF_B : RIFF_A;
  const big = (d === 0 && s === 0) || (d === 3 && s === 8);
  if (kicks.includes(s)) {
    Sound.kick(t, big);
    Sound.bass(t, D2 * semi(BASS_ROOT[d]), big ? 0.9 : (s === 10 ? 0.25 : 0.42), 0.85);
  }
  if (big) Sound.crash(t, 0.3);
  if (d < 3 ? (s === 4 || s === 12) : s === 4) Sound.clap(t, 0.5);
  if (d < 3 || s < 8) {
    Sound.hat(t, s % 2 === 0 ? 0.1 : 0.05, 0.03);
    if (riff[s] !== undefined) Sound.bell(t, D5 * semi(riff[s]), 0.24);
  }
  if (d === 3 && s === 12) Sound.roar(t);
}

// ================= 스폰 (1마디 앞서 생성, 시간 기반) =================
function spawnStep(g) {
  const bar = g >> 4, s = g & 15, info = barInfo(bar), t = g * STEP;
  if (info.type === 'dodge') {
    if (info.d === 3 && s >= 12) return;
    const p = dodgeBar(info.d, info.tier);
    if (p.kick.includes(s)) spawnRing(t, info.tier, bar * 0.37 + s * 0.19);
    p.bell.forEach(([st, pi], i) => { if (st === s) spawnLaser(t, pi, (i + bar) % 2 ? 'v' : 'h'); });
    if (p.slam === s) spawnSlam(t, info.cycle);
    if (p.spray.includes(s)) spawnAimed(t, info.tier);
  } else if (info.type === 'strike') {
    if (info.d === 0 && s === 0) S.lastNode = { x: W / 2, y: 640 };
    if (info.d < 3 && s % 4 === 0) spawnNode(t, false, false);
    else if (info.d === 3 && s < 8 && s % 2 === 0) spawnNode(t, false, true);
    else if (info.d === 3 && s === 8) spawnNode(t, true, false);
  }
}
function spawnRing(t, tier, off) {
  const n = 12 + tier * 3, sp = 150 + tier * 22;
  for (let i = 0; i < n; i++) {
    const a = off + i / n * Math.PI * 2;
    S.hazards.push({ k: 'b', t0: t, x0: BOSS_X, y0: BOSS_Y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 8 });
  }
}
function spawnAimed(t, tier) {
  S.hazards.push({ k: 'b', t0: t, x0: BOSS_X, y0: BOSS_Y, vx: 0, vy: 0, r: 6, aim: true, aimed: false,
    sp: 290 + tier * 30, spread: (Math.random() - 0.5) * 0.24 });
}
function spawnLaser(t, pi, o) {
  const u = clamp((pi + 7) / 14, 0, 1);
  const pos = o === 'h' ? 400 + (1 - u) * 480 : 60 + u * 420;
  S.hazards.push({ k: 'l', o, pos, tw: t - BEAT, tf: t, te: t + 0.14, w: 34 });
}
function spawnSlam(t, cycle) {
  S.hazards.push({ k: 's', side: cycle % 2 === 0 ? 'L' : 'R', tw: t - BEAT * 2, tf: t, te: t + 0.25 });
}
function spawnNode(t, fin, near) {
  let x = BOSS_X, y = BOSS_Y;
  if (!fin) {
    const L = S.lastNode || { x: W / 2, y: 640 };
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * Math.PI * 2, dd = near ? 110 + Math.random() * 60 : 170 + Math.random() * 110;
      x = L.x + Math.cos(a) * dd; y = L.y + Math.sin(a) * dd;
      if (x > 70 && x < W - 70 && y > 380 && y < H - 150) break;
    }
    x = clamp(x, 70, W - 70); y = clamp(y, 380, H - 150);
  }
  S.lastNode = { x, y };
  S.nodes.push({ x, y, t, fin, r: fin ? 78 : 40, lead: fin ? BEAT * 2 : BEAT, state: 0 });
}

// ================= 비트 이벤트 (실시간 커서) =================
function onStep(g) {
  const bar = g >> 4, s = g & 15, info = barInfo(bar), t = g * STEP;
  if (kicksOf(info).includes(s) && !(info.type === 'dodge' && info.d === 3 && s >= 12)) S.pulse = 1;
  if (info.type === 'intro' && s === 0) {
    popText(bar === 0 ? 'READY' : 'DRAG TO DODGE', W / 2, H * 0.45, { size: bar === 0 ? 56 : 34, dur: BAR * 900, chroma: true });
  }
  if (info.type === 'dodge') {
    if (info.d === 0 && s === 0) {
      if (S.vphase !== 'dodge') { S.vphase = 'dodge'; S.flash = 0.7; S.flashCol = '#000000'; S.nodes = []; }
      popText('DODGE', W / 2, H * 0.45, { size: 48, dur: 600, chroma: true });
    }
    if (info.d === 3 && s === 12) { // 캐치 포인트
      S.catchT = t; S.shake = 0.3;
      popText('COUNTER', W / 2, H * 0.45, { size: 78, dur: BEAT * 1000, chroma: true, rise: 0, pop: 1.8 });
    }
  }
  if (info.type === 'strike') {
    if (info.d === 0 && s === 0) drop();
    if (info.d === 3 && s === 12) {
      S.shake = 0.7; S.gauge = 0;
      popText(`${S.cycleDmg} DMG`, W / 2, H * 0.5, { size: 52, col: 'acc', dur: 900, chroma: true });
    }
  }
}
function drop() {
  const T = S.catchT ?? S.displayT;
  for (const h of S.hazards) {
    if (h.k === 'b' && T >= h.t0 && !(h.aim && !h.aimed)) {
      burst(h.x0 + h.vx * (T - h.t0), h.y0 + h.vy * (T - h.t0), 3, 'fg', 260, 3, 0.5);
    }
  }
  S.hazards = []; S.catchT = null; S.vphase = 'strike';
  S.flash = 1; S.flashCol = '#ffffff'; S.shake = 1.2; S.slashN = 0; S.cycleDmg = 0;
  popText('STRIKE!', W / 2, H * 0.45, { size: 72, col: 'acc', dur: 700, chroma: true });
  if (navigator.vibrate) navigator.vibrate(30);
}

// ================= 런 관리 =================
function songTime() {
  const ac = Sound.ctx;
  return ac.currentTime - S.t0 - (ac.outputLatency || 0) + opts.offset;
}
function startRun() {
  Sound.init();
  Sound.newBus();
  const keepX = S.player.x, keepY = S.player.y;
  S = freshState();
  S.mode = 'play';
  const off = startBar * BAR;
  S.t0 = Sound.ctx.currentTime + 0.3 - off;
  S.audioStep = S.gameStep = startBar * 16;
  S.evStep = startBar * 16 - 1;
  if (startBar > 0) { S.player.x = keepX; S.player.y = keepY; }
}
function pump() {
  if (S.mode !== 'play' || !Sound.ctx) return;
  const now = Sound.ctx.currentTime;
  while (S.t0 + S.audioStep * STEP < now + 0.15) {
    const t = S.t0 + S.audioStep * STEP;
    if (t > now - 0.03) scheduleAudio(S.audioStep, t);
    S.audioStep++;
  }
  const T = songTime();
  while (S.gameStep * STEP < T + BAR) { spawnStep(S.gameStep); S.gameStep++; }
}
setInterval(pump, 20);

// ================= 업데이트 =================
function update(T, dt) {
  while ((S.evStep + 1) * STEP <= T) { S.evStep++; onStep(S.evStep); }
  if (T < 0) return;
  const px = S.player.x, py = S.player.y;
  const inCatch = S.catchT !== null && T >= S.catchT;
  const canHit = !opts.god && T >= S.invulnUntil && !inCatch;

  if (!inCatch) {
    for (const h of S.hazards) {
      if (h.k === 'b') {
        if (T < h.t0) continue;
        if (h.aim && !h.aimed) {
          h.aimed = true;
          const a = Math.atan2(py - BOSS_Y, px - BOSS_X) + h.spread;
          h.vx = Math.cos(a) * h.sp; h.vy = Math.sin(a) * h.sp;
        }
        const x = h.x0 + h.vx * (T - h.t0), y = h.y0 + h.vy * (T - h.t0);
        if (x < -40 || x > W + 40 || y < -40 || y > H + 40) { h.dead = true; continue; }
        const d = Math.hypot(x - px, y - py);
        if (d < h.r + HIT_R) { if (canHit) { h.dead = true; playerHit(T); } }
        else if (!h.grazed && d < h.r + GRAZE_R && T >= S.invulnUntil) { h.grazed = true; graze(x, y, 3); }
      } else if (h.k === 'l') {
        if (T > h.te + 0.3) { h.dead = true; continue; }
        if (T >= h.tf && !h.fx) { h.fx = true; S.shake = Math.max(S.shake, 0.25); }
        if (T >= h.tf && T <= h.te) {
          const d = h.o === 'h' ? Math.abs(py - h.pos) : Math.abs(px - h.pos);
          if (d < h.w / 2 + HIT_R) { if (canHit) playerHit(T); }
          else if (!h.grazed && d < h.w / 2 + GRAZE_R + 6 && T >= S.invulnUntil) {
            h.grazed = true; graze(h.o === 'h' ? px : h.pos, h.o === 'h' ? h.pos : py, 5);
          }
        }
      } else if (h.k === 's') {
        if (T > h.te + 0.4) { h.dead = true; continue; }
        if (T >= h.tf && !h.fx) {
          h.fx = true; S.shake = Math.max(S.shake, 0.9);
          const x0 = h.side === 'L' ? 0 : W / 2;
          for (let i = 0; i < 24; i++) burst(x0 + Math.random() * W / 2, Math.random() * H, 1, 'fg', 300, 4, 0.5);
        }
        if (T >= h.tf && T <= h.te && (h.side === 'L' ? px < W / 2 : px >= W / 2) && canHit) playerHit(T);
      }
      if (S.mode !== 'play') return;
    }
    S.hazards = S.hazards.filter(h => !h.dead);
  }

  // 슬래시 판정: 지난 프레임 → 이번 프레임 이동 선분이 노드를 관통 + 일정 속도 이상
  const sx = S.prevX, sy = S.prevY;
  const speed = Math.hypot(px - sx, py - sy) / Math.max(dt, 1e-3);
  for (const n of S.nodes) {
    if (n.state) continue;
    if (T > n.t + 0.2) {
      n.state = 2; S.stats.miss++; S.combo = 0;
      popText('MISS', n.x, n.y - 40, { size: 20, dur: 500 });
      continue;
    }
    if (T >= n.t - 0.22 && speed > 140 && segDist(n.x, n.y, sx, sy, px, py) <= n.r + PLAYER_R) {
      nodeHit(n, T);
      if (S.mode !== 'play') return;
    }
  }
  S.nodes = S.nodes.filter(n => n.state === 0);
}

function graze(x, y, amt) {
  S.gauge = Math.min(100, S.gauge + amt); S.stats.graze++; S.score += 5;
  Sound.sfxGraze();
  const mx = (x + S.player.x) / 2, my = (y + S.player.y) / 2;
  burst(mx, my, 4, 'acc', 180, 2.5, 0.3);
}
function playerHit(T) {
  S.lives--; S.stats.hits++; S.combo = 0; S.invulnUntil = T + 1.2;
  S.shake = 1; S.flash = 0.5; S.flashCol = '#ff1e56'; S.hitstopUntil = performance.now() + 120;
  burst(S.player.x, S.player.y, 26, '#ff1e56', 420, 4, 0.6);
  Sound.sfxHit();
  if (navigator.vibrate) navigator.vibrate(60);
  if (S.lives <= 0) die(T);
}
function die(T) {
  S.mode = 'dead'; S.endT = T; finishRun();
  Sound.fadeOut(0.25);
  burst(S.player.x, S.player.y, 60, '#ff1e56', 600, 5, 1.0);
}
function nodeHit(n, T) {
  const dt = Math.abs(T - n.t);
  let j, jm, label;
  if (dt <= 0.07) { j = 'perfect'; jm = 1; label = 'PERFECT'; }
  else if (dt <= 0.13) { j = 'great'; jm = 0.7; label = 'GREAT'; }
  else { j = 'good'; jm = 0.4; label = 'GOOD'; }
  S.stats[j]++; S.combo++; S.maxCombo = Math.max(S.maxCombo, S.combo);
  const mult = 1 + S.gauge / 50;
  const dmg = Math.round((n.fin ? 40 : 10) * jm * mult * (1 + Math.min(S.combo, 20) * 0.02));
  S.bossHp = Math.max(0, S.bossHp - dmg); S.cycleDmg += dmg; S.score += dmg * 10; S.bossFlash = 0.15;
  n.state = 1;
  const ang = Math.atan2(S.player.y - S.prevY, S.player.x - S.prevX);
  slashFx(n, ang);
  S.hitstopUntil = performance.now() + (n.fin ? 140 : j === 'perfect' ? 60 : 35);
  S.shake = Math.max(S.shake, n.fin ? 1.3 : 0.35);
  if (n.fin) { S.flash = 0.6; S.flashCol = '#ff1e56'; }
  popText(label, n.x, n.y - 50, { size: n.fin ? 44 : 26, col: j === 'perfect' ? 'acc' : 'fg', dur: 500 });
  popText(String(dmg), n.x + 34, n.y - 8, { size: 18, dur: 600, rise: 60 });
  Sound.sfxSlash(j, D5 * semi(SLASH_SCALE[Math.min(S.slashN++, SLASH_SCALE.length - 1)] - 12), n.fin);
  if (navigator.vibrate) navigator.vibrate(n.fin ? 40 : 15);
  if (S.bossHp <= 0) win(T);
}
function win(T) {
  for (const h of S.hazards) {
    if (h.k === 'b' && T >= h.t0 && !(h.aim && !h.aimed))
      burst(h.x0 + h.vx * (T - h.t0), h.y0 + h.vy * (T - h.t0), 3, 'fg', 260, 3, 0.6);
  }
  S.hazards = []; S.nodes = []; S.catchT = null;
  S.mode = 'win'; S.endT = T; S.score += S.lives * 1000; finishRun();
  Sound.fadeOut(2.5); Sound.sfxBoom();
  S.flash = 1; S.flashCol = '#ffffff'; S.shake = 2;
  for (let i = 0; i < 5; i++) burst(BOSS_X, BOSS_Y, 30, i % 2 ? 'acc' : 'fg', 300 + i * 200, 6, 1.4);
  S.parts.push({ k: 'ring', x: BOSS_X, y: BOSS_Y, r0: 40, r1: 700, life: 0.8, max: 0.8, col: 'acc' });
  S.bossDead = true;
}
function finishRun() {
  S.endReal = performance.now();
  const best = +(localStorage.getItem('cb_best') || 0);
  S.best = Math.max(best, S.score);
  if (S.score > best) { S.newBest = true; localStorage.setItem('cb_best', S.score); }
}

// ================= 이펙트 =================
function popText(text, x, y, o = {}) {
  S.texts.push({ text, x, y, born: performance.now(), dur: o.dur || 700, size: o.size || 28,
    col: o.col || 'fg', rise: o.rise ?? 40, pop: o.pop ?? 1.4, chroma: !!o.chroma });
}
function burst(x, y, n, col, spd, size, life) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = spd * (0.25 + Math.random() * 0.75);
    S.parts.push({ k: 'sq', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, col,
      size: size * (0.6 + Math.random() * 0.8) });
  }
}
function slashFx(n, ang) {
  const big = n.fin;
  S.parts.push({ k: 'cut', x: n.x, y: n.y, ang, len: big ? 620 : 280, col: 'fg', w: big ? 14 : 8, life: 0.22, max: 0.22 });
  S.parts.push({ k: 'cut', x: n.x, y: n.y, ang, len: big ? 560 : 240, col: 'acc', w: big ? 8 : 4, life: 0.35, max: 0.35 });
  for (let i = 0; i < (big ? 44 : 14); i++) {
    const a = ang + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1) + (Math.random() - 0.5) * 0.9;
    const v = 200 + Math.random() * (big ? 750 : 380);
    S.parts.push({ k: 'sq', x: n.x, y: n.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, max: 0.5,
      col: Math.random() < 0.5 ? 'acc' : 'fg', size: 3 + Math.random() * 5 });
  }
  S.parts.push({ k: 'ring', x: n.x, y: n.y, r0: n.r, r1: n.r * (big ? 4 : 2.4), life: 0.3, max: 0.3, col: 'acc' });
}
function updateFx(dt) {
  const drag = Math.pow(0.04, dt);
  for (const p of S.parts) {
    p.life -= dt;
    if (p.k === 'sq') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= drag; p.vy *= drag; }
  }
  S.parts = S.parts.filter(p => p.life > 0);
}

// ================= 그리기 =================
const FONT_EN = '"Arial Black", Impact, "Segoe UI", sans-serif';
const FONT_KO = '"Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
const colOf = (c, pal) => c === 'fg' ? pal.fg : c === 'acc' ? pal.acc : c;

function text(str, x, y, size, col, o = {}) {
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.font = `${o.weight || 900} ${size}px ${o.font || FONT_EN}`;
  ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = col; ctx.fillText(str, x, y);
  ctx.globalAlpha = 1;
}
function chromaText(str, x, y, size, pal, alpha = 1, col) {
  const o = Math.max(2, size * 0.05);
  text(str, x - o, y, size, 'rgba(255,30,86,0.85)', { alpha });
  text(str, x + o, y, size, 'rgba(0,229,255,0.85)', { alpha });
  text(str, x, y, size, col || pal.fg, { alpha });
}
function poly(x, y, r, n, rot) {
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = rot + i / n * Math.PI * 2;
    i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
}

function drawGrid(pal, T) {
  const a = 0.05 + S.pulse * 0.08;
  const speed = S.vphase === 'strike' ? 90 : 40;
  const off = ((T * speed) % 60 + 60) % 60;
  ctx.strokeStyle = `rgba(${pal.grid},${a})`; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 60) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
  for (let y = off - 60; y <= H; y += 60) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
  ctx.stroke();
}

function drawAreaHazards(pal, ht) {
  for (const h of S.hazards) {
    if (h.k === 's') {
      if (ht < h.tw) continue;
      const x0 = h.side === 'L' ? 0 : W / 2;
      if (ht < h.tf) {
        const p = (ht - h.tw) / (h.tf - h.tw);
        const blink = Math.floor(ht / STEP) % 2 ? 1 : 0.55;
        ctx.fillStyle = `rgba(${pal.warn},${(0.05 + 0.13 * p) * blink})`;
        ctx.fillRect(x0, 0, W / 2, H);
        ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, W / 2, H); ctx.clip();
        ctx.strokeStyle = `rgba(${pal.warn},${0.22 * blink})`; ctx.lineWidth = 8;
        ctx.beginPath();
        const sh = (ht * 120) % 48;
        for (let k = -H; k < W / 2 + 48; k += 48) { ctx.moveTo(x0 + k + sh, 0); ctx.lineTo(x0 + k + sh + H * 0.5, H); }
        ctx.stroke(); ctx.restore();
        const left = Math.ceil((h.tf - ht) / BEAT);
        text(String(left), x0 + W / 4, H * 0.62, 120, `rgba(${pal.warn},${0.5 * blink})`);
      } else {
        const a = 1 - (ht - h.tf) / (h.te + 0.4 - h.tf);
        ctx.fillStyle = pal.fg; ctx.globalAlpha = clamp(a, 0, 1) * 0.92;
        ctx.fillRect(x0, 0, W / 2, H); ctx.globalAlpha = 1;
      }
    } else if (h.k === 'l') {
      if (ht < h.tw) continue;
      const horiz = h.o === 'h';
      if (ht < h.tf) {
        const p = (ht - h.tw) / (h.tf - h.tw);
        const blink = Math.floor(ht / (STEP / 2)) % 2 ? 1 : 0.6;
        ctx.strokeStyle = `rgba(${pal.warn},${(0.25 + 0.6 * p) * blink})`; ctx.lineWidth = 2;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        const half = h.w / 2;
        if (horiz) { ctx.moveTo(0, h.pos - half); ctx.lineTo(W, h.pos - half); ctx.moveTo(0, h.pos + half); ctx.lineTo(W, h.pos + half); }
        else { ctx.moveTo(h.pos - half, 0); ctx.lineTo(h.pos - half, H); ctx.moveTo(h.pos + half, 0); ctx.lineTo(h.pos + half, H); }
        ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = `rgba(${pal.warn},${0.12 * p})`;
        horiz ? ctx.fillRect(0, h.pos - half * p, W, h.w * p) : ctx.fillRect(h.pos - half * p, 0, h.w * p, H);
      } else {
        const k = ht <= h.te ? 1 : clamp(1 - (ht - h.te) / 0.3, 0, 1);
        const w = h.w * k;
        ctx.fillStyle = pal.acc; ctx.globalAlpha = 0.5 * k;
        horiz ? ctx.fillRect(0, h.pos - w / 2 - 6, W, w + 12) : ctx.fillRect(h.pos - w / 2 - 6, 0, w + 12, H);
        ctx.globalAlpha = k; ctx.fillStyle = pal.fg;
        horiz ? ctx.fillRect(0, h.pos - w / 2, W, w) : ctx.fillRect(h.pos - w / 2, 0, w, H);
        ctx.globalAlpha = 1;
      }
    }
  }
}

function drawBullets(pal, ht) {
  ctx.fillStyle = pal.acc; ctx.globalAlpha = 0.3;
  ctx.beginPath();
  const pos = [];
  for (const h of S.hazards) {
    if (h.k !== 'b' || ht < h.t0 || (h.aim && !h.aimed)) continue;
    const x = h.x0 + h.vx * (ht - h.t0), y = h.y0 + h.vy * (ht - h.t0);
    pos.push(x, y, h.r);
    ctx.moveTo(x + h.r + 5, y); ctx.arc(x, y, h.r + 5, 0, Math.PI * 2);
  }
  ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = pal.fg; ctx.beginPath();
  for (let i = 0; i < pos.length; i += 3) { ctx.moveTo(pos[i] + pos[i + 2], pos[i + 1]); ctx.arc(pos[i], pos[i + 1], pos[i + 2], 0, Math.PI * 2); }
  ctx.fill();
}

function drawBoss(pal, T) {
  if (S.bossDead) return;
  const p = S.pulse, sc = 1 + p * 0.12, hpP = S.bossHp / BOSS_HP;
  const rot = T * (0.8 + (1 - hpP) * 1.5);
  ctx.save(); ctx.translate(BOSS_X, BOSS_Y); ctx.scale(sc, sc);
  if (hpP < 0.4) ctx.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
  const col = S.bossFlash > 0 ? pal.acc : pal.fg;
  ctx.strokeStyle = col; ctx.lineWidth = 4; poly(0, 0, 70, 6, rot); ctx.stroke();
  ctx.lineWidth = 2; ctx.globalAlpha = 0.5; poly(0, 0, 84, 6, -rot * 0.5); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.lineWidth = 3; poly(0, 0, 46, 4, -rot * 1.6); ctx.stroke();
  ctx.fillStyle = pal.acc; ctx.beginPath(); ctx.arc(0, 0, 14 + p * 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = pal.bg; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawNodes(pal, T) {
  for (const n of S.nodes) {
    if (n.state || T < n.t - n.lead) continue;
    const p = clamp((n.t - T) / n.lead, 0, 1);       // 1 → 0 (정박)
    const late = T > n.t ? clamp((T - n.t) / 0.2, 0, 1) : 0;
    const a = 1 - late * 0.7;
    // 보스와 연결선
    ctx.strokeStyle = pal.acc; ctx.globalAlpha = 0.25 * a; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
    if (!n.fin) { ctx.beginPath(); ctx.moveTo(BOSS_X, BOSS_Y); ctx.lineTo(n.x, n.y); ctx.stroke(); }
    ctx.setLineDash([]);
    // 접근 링
    ctx.globalAlpha = (1 - p * 0.6) * a; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(n.x, n.y, n.r * (1 + 1.6 * p), 0, Math.PI * 2); ctx.stroke();
    // 본체
    ctx.globalAlpha = 0.18 * a; ctx.fillStyle = pal.acc;
    ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = a; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.stroke();
    if (n.fin) {
      ctx.lineWidth = 6; const r = n.r * 0.6;
      ctx.beginPath(); ctx.moveTo(n.x - r, n.y - r); ctx.lineTo(n.x + r, n.y + r);
      ctx.moveTo(n.x + r, n.y - r); ctx.lineTo(n.x - r, n.y + r); ctx.stroke();
      text('FINISH', n.x, n.y + n.r + 26, 20, pal.acc, { alpha: a });
    } else {
      ctx.fillStyle = pal.acc; ctx.beginPath(); ctx.arc(n.x, n.y, 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function drawTrail(pal, now) {
  const tr = S.trail;
  if (tr.length < 2) return;
  if (S.vphase === 'strike') {
    ctx.strokeStyle = pal.acc; ctx.lineCap = 'round';
    for (let i = 1; i < tr.length; i++) {
      const a = i / tr.length;
      ctx.globalAlpha = a; ctx.lineWidth = 2 + a * 10;
      ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke();
    }
    ctx.lineCap = 'butt';
  } else {
    ctx.fillStyle = pal.acc;
    for (let i = 0; i < tr.length; i += 2) {
      ctx.globalAlpha = (i / tr.length) * 0.3;
      ctx.beginPath(); ctx.arc(tr[i].x, tr[i].y, PLAYER_R * 0.7, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawPlayer(pal, T, now) {
  const { x, y } = S.player;
  const inv = S.mode === 'play' && T < S.invulnUntil;
  if (inv && Math.floor(now / 70) % 2) ctx.globalAlpha = 0.25;
  ctx.fillStyle = pal.acc;
  ctx.beginPath();
  ctx.moveTo(x, y - PLAYER_R * 1.4); ctx.lineTo(x + PLAYER_R, y); ctx.lineTo(x, y + PLAYER_R * 1.4); ctx.lineTo(x - PLAYER_R, y);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x, y, HIT_R, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  if (opts.hitbox) {
    ctx.strokeStyle = pal.acc; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, GRAZE_R, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  }
}

function drawParticles(pal) {
  for (const p of S.parts) {
    const k = p.life / p.max;
    if (p.k === 'sq') {
      ctx.globalAlpha = k; ctx.fillStyle = colOf(p.col, pal);
      const s = p.size * (0.4 + k * 0.6);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    } else if (p.k === 'cut') {
      ctx.globalAlpha = k; ctx.strokeStyle = colOf(p.col, pal); ctx.lineWidth = p.w * k;
      const dx = Math.cos(p.ang) * p.len / 2, dy = Math.sin(p.ang) * p.len / 2;
      ctx.beginPath(); ctx.moveTo(p.x - dx, p.y - dy); ctx.lineTo(p.x + dx, p.y + dy); ctx.stroke();
    } else if (p.k === 'ring') {
      ctx.globalAlpha = k; ctx.strokeStyle = colOf(p.col, pal); ctx.lineWidth = 4 * k + 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r1 + (p.r0 - p.r1) * k, 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawTexts(pal, now) {
  S.texts = S.texts.filter(t => now - t.born < t.dur);
  for (const t of S.texts) {
    const k = (now - t.born) / t.dur;
    const popK = Math.min(1, (now - t.born) / 90);
    const sz = t.size * (t.pop + (1 - t.pop) * popK);
    const a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    const y = t.y - t.rise * k;
    if (t.chroma) chromaText(t.text, t.x, y, sz, pal, a, colOf(t.col, pal));
    else text(t.text, t.x, y, sz, colOf(t.col, pal), { alpha: a });
  }
}

function drawCatch(pal, cp, now) {
  ctx.fillStyle = S.vphase === 'strike' ? 'rgba(255,255,255,1)' : 'rgba(0,0,0,1)';
  ctx.globalAlpha = 0.35 * cp; ctx.fillRect(0, 0, W, H);
  // 스캔라인
  ctx.globalAlpha = 0.18; ctx.fillStyle = pal.fg;
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  // 글리치 바
  for (let i = 0; i < 5; i++) {
    ctx.globalAlpha = 0.35 * Math.random();
    ctx.fillStyle = Math.random() < 0.5 ? '#ff1e56' : '#00e5ff';
    ctx.fillRect(0, Math.random() * H, W, 2 + Math.random() * 14);
  }
  ctx.globalAlpha = 1;
}

function drawHUD(pal, T) {
  const hpP = S.bossHp / BOSS_HP, lagP = S.bossShown / BOSS_HP;
  ctx.fillStyle = `rgba(${pal.grid},0.12)`; ctx.fillRect(30, 30, W - 60, 12);
  ctx.fillStyle = pal.acc; ctx.fillRect(30, 30, (W - 60) * lagP, 12);
  ctx.fillStyle = pal.fg; ctx.fillRect(30, 30, (W - 60) * hpP, 12);
  text('BOSS', 30, 58, 14, pal.fg, { align: 'left' });
  text(S.score.toLocaleString(), W - 30, 58, 14, pal.fg, { align: 'right' });

  if (T >= 0) {
    const info = barInfo(Math.floor(T / BAR));
    const label = info.type === 'strike' ? 'STRIKE' : info.type === 'dodge' ? 'DODGE' : 'READY';
    text(label, W / 2, 58, 16, info.type === 'strike' ? pal.acc : pal.fg);
    if (info.type !== 'intro') {
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i <= info.d ? (info.type === 'strike' ? pal.acc : pal.fg) : `rgba(${pal.grid},0.18)`;
        ctx.fillRect(W / 2 - 39 + i * 20, 74, 16, 5);
      }
    }
    const beat = Math.floor(T / BEAT) % 4, bp = (T % BEAT) / BEAT;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = pal.fg; ctx.globalAlpha = i === beat ? 1 - bp * 0.6 : 0.15;
      ctx.beginPath(); ctx.arc(W / 2 - 24 + i * 16, 92, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  for (let i = 0; i < 3; i++) {
    const x = 36 + i * 26, y = H - 40;
    ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 10); ctx.lineTo(x - 8, y); ctx.closePath();
    if (i < S.lives) { ctx.fillStyle = pal.acc; ctx.fill(); }
    else { ctx.strokeStyle = `rgba(${pal.grid},0.3)`; ctx.lineWidth = 2; ctx.stroke(); }
  }
  const gx = 150, gw = 240, gy = H - 44;
  ctx.fillStyle = `rgba(${pal.grid},0.12)`; ctx.fillRect(gx, gy, gw, 8);
  ctx.fillStyle = pal.acc; ctx.fillRect(gx, gy, gw * S.gauge / 100, 8);
  text('GRAZE', gx, gy - 12, 11, pal.fg, { align: 'left', alpha: 0.6 });
  text(`x${(1 + S.gauge / 50).toFixed(1)}`, gx + gw + 12, gy + 4, 16, pal.acc, { align: 'left' });
  if (S.combo > 1) text(`${S.combo} COMBO`, W - 30, H - 78, 16, pal.fg, { align: 'right' });
  const flags = [opts.god && 'GOD', opts.offset && `SYNC ${Math.round(opts.offset * 1000)}ms`].filter(Boolean).join('  ');
  if (flags) text(flags, 30, 110, 12, pal.acc, { align: 'left' });
}

function drawTitle(pal, now) {
  const t = now / 1000;
  S.pulse = Math.max(0, 1 - ((t % BEAT) / BEAT) * 3);
  drawGrid(pal, t);
  drawBoss(pal, t);
  chromaText('COUNTERBEAT', W / 2, 470, 52, pal);
  const best = +(localStorage.getItem('cb_best') || 0);
  if (best) text(`BEST ${best.toLocaleString()}`, W / 2, 516, 15, pal.fg, { alpha: 0.55 });
  const bp = (t % BEAT) / BEAT;
  text('TAP TO START', W / 2, 760, 24, pal.acc, { alpha: 1 - bp * 0.7 });
}

function rank() {
  const s = S.stats, tot = s.perfect + s.great + s.good + s.miss;
  const acc = tot ? (s.perfect + s.great * 0.7 + s.good * 0.4) / tot : 0;
  if (s.hits === 0 && acc > 0.85) return 'S';
  if (s.hits <= 1 && acc > 0.7) return 'A';
  if (acc > 0.5) return 'B';
  return 'C';
}
// ---------- 결과 / 사망 화면 (시간차 연출) ----------
const ease = x => { x = clamp(x, 0, 1); return 1 - Math.pow(1 - x, 3); };
const revealTime = () => S.mode === 'dead' ? 1.0 : 2.8;
function once(key, fn) { if (!S.fired[key]) { S.fired[key] = true; fn(); } }

function stamp(str, x, y, size, pal, k, col) {
  // k: 0→1, 크게 시작해서 쾅 찍힘
  if (k <= 0) return;
  const sz = size * (1 + (1 - ease(k)) * 1.6);
  chromaText(str, x, y, sz, pal, Math.min(1, k * 2), col);
}
function statCol(label, value, x, y, pal, a, col) {
  text(label, x, y, 12, pal.fg, { alpha: a * 0.55 });
  text(value, x, y + 26, 26, col || pal.fg, { alpha: a });
}

function drawEnd(pal, now) {
  const e = (now - S.endReal) / 1000;
  ctx.globalAlpha = ease((e - 0.15) / 0.5);
  ctx.fillStyle = pal.shade; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  if (S.mode === 'dead') drawDeadScreen(pal, e);
  else drawWinScreen(pal, e);

  if (e >= revealTime()) {
    const bp = (now / 1000 % BEAT) / BEAT;
    const y = H * 0.86, w = 230, h = 54;
    ctx.strokeStyle = pal.acc; ctx.lineWidth = 3; ctx.globalAlpha = 1 - bp * 0.5;
    ctx.strokeRect(W / 2 - w / 2, y - h / 2, w, h);
    ctx.globalAlpha = 1;
    text('RETRY', W / 2, y + 1, 26, pal.acc, { alpha: 1 - bp * 0.5 });
  }
}

function drawDeadScreen(pal, e) {
  if (e >= 0.35) once('down', () => { S.shake = 0.8; Sound.sfxStamp(false); });
  stamp('DOWN', W / 2, H * 0.32, 96, pal, (e - 0.35) / 0.14);
  if (e < 0.7) return;
  const a = ease((e - 0.7) / 0.3);
  const hpP = S.bossHp / BOSS_HP, bx = 70, bw = W - 140, by = H * 0.44;
  text('BOSS', bx, by - 18, 13, pal.fg, { align: 'left', alpha: a * 0.6 });
  text(`${Math.ceil(hpP * 100)}%`, bx + bw, by - 18, 15, pal.acc, { align: 'right', alpha: a });
  ctx.globalAlpha = a;
  ctx.fillStyle = `rgba(${pal.grid},0.15)`; ctx.fillRect(bx, by, bw, 12);
  ctx.fillStyle = pal.acc; ctx.fillRect(bx, by, bw * hpP * a, 12);
  ctx.globalAlpha = 1;
  text('SCORE', W / 2, H * 0.54, 13, pal.fg, { alpha: a * 0.6 });
  text(Math.round(S.score * a).toLocaleString(), W / 2, H * 0.585, 46, pal.fg, { alpha: a });
  if (S.newBest) text('NEW BEST', W / 2, H * 0.64, 16, pal.acc, { alpha: a });
  else text(`BEST ${S.best.toLocaleString()}`, W / 2, H * 0.64, 14, pal.fg, { alpha: a * 0.55 });
}

function drawWinScreen(pal, e) {
  if (e >= 0.6) once('title', () => Sound.sfxTick(1.0));
  stamp('BOSS DOWN', W / 2, H * 0.15, 56, pal, (e - 0.6) / 0.2);

  // 결과 카드
  const cx = 40, cw = W - 80, cy = H * 0.22, ch = H * 0.34;
  const ca = ease((e - 0.9) / 0.3);
  if (ca > 0) {
    ctx.globalAlpha = ca; ctx.strokeStyle = `rgba(${pal.grid},0.18)`; ctx.lineWidth = 2;
    ctx.strokeRect(cx, cy, cw, ch); ctx.globalAlpha = 1;
  }
  // SCORE 카운트업
  if (e >= 1.0) {
    once('r0', () => Sound.sfxTick(1.2));
    const a = ease((e - 1.0) / 0.2), k = ease((e - 1.0) / 0.9);
    text('SCORE', W / 2, cy + 34, 13, pal.fg, { alpha: a * 0.6 });
    text(Math.round(S.score * k).toLocaleString(), W / 2, cy + 82, 54, pal.fg, { alpha: a });
  }
  // 판정 4칸
  const s = S.stats;
  const judges = [['PERFECT', s.perfect, pal.acc], ['GREAT', s.great], ['GOOD', s.good], ['MISS', s.miss]];
  judges.forEach(([l, v, c], i) => {
    const t0 = 1.35 + i * 0.08;
    if (e < t0) return;
    once('j' + i, () => Sound.sfxTick(1.4 + i * 0.1));
    statCol(l, String(v), cx + cw * (i + 0.5) / 4, cy + 140, pal, ease((e - t0) / 0.2), c);
  });
  // 기타 3칸
  const extras = [['GRAZE', String(s.graze)], ['MAX COMBO', String(S.maxCombo)], ['TIME', S.endT.toFixed(1) + 's']];
  extras.forEach(([l, v], i) => {
    const t0 = 1.75 + i * 0.08;
    if (e < t0) return;
    once('x' + i, () => Sound.sfxTick(1.8 + i * 0.1));
    statCol(l, v, cx + cw * (i + 0.5) / 3, cy + 230, pal, ease((e - t0) / 0.2));
  });
  // 랭크 도장
  const rk = (e - 2.25) / 0.13;
  if (rk > 0) {
    once('rank', () => { S.shake = 1.2; S.flash = 0.35; S.flashCol = '#ffffff'; Sound.sfxStamp(true); });
    text('RANK', W / 2, H * 0.62, 13, pal.fg, { alpha: Math.min(1, rk) * 0.6 });
    ctx.save(); ctx.translate(W / 2, H * 0.71); ctx.rotate(-0.12);
    stamp(rank(), 0, 0, 130, pal, rk, pal.acc);
    ctx.restore();
  }
  if (S.newBest && e >= 2.55) {
    const blink = Math.floor(e * 4) % 2 ? 1 : 0.55;
    text('NEW BEST', W / 2, H * 0.79, 18, pal.acc, { alpha: blink });
  }
}

function draw(T, now) {
  const pal = PAL[S.vphase];
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
  if (S.mode === 'title') { drawTitle(pal, now); return; }

  const inCatch = S.catchT !== null && T >= S.catchT;
  const cp = inCatch ? Math.min(1, (T - S.catchT) / BEAT) : 0;
  const ht = inCatch ? S.catchT : T;   // 캐치 중엔 탄막 정지
  const zoom = 1 + S.pulse * 0.012 + cp * 0.07;
  const sh = S.shake * 14;
  ctx.save();
  ctx.translate(W / 2 + (Math.random() * 2 - 1) * sh, H / 2 + (Math.random() * 2 - 1) * sh);
  ctx.scale(zoom, zoom); ctx.translate(-W / 2, -H / 2);
  drawGrid(pal, T);
  drawAreaHazards(pal, ht);
  drawBoss(pal, T);
  drawBullets(pal, ht);
  drawNodes(pal, T);
  drawTrail(pal, now);
  if (S.mode === 'play') drawPlayer(pal, T, now);
  drawParticles(pal);
  ctx.restore();
  if (inCatch) drawCatch(pal, cp, now);
  drawTexts(pal, now);
  drawHUD(pal, T);
  if (S.flash > 0) { ctx.globalAlpha = Math.min(1, S.flash); ctx.fillStyle = S.flashCol; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  if (S.mode === 'dead' || S.mode === 'win') {
    ctx.save(); ctx.translate((Math.random() * 2 - 1) * sh * 0.6, (Math.random() * 2 - 1) * sh * 0.6);
    drawEnd(pal, now);
    ctx.restore();
  }
  if (S.paused) {
    ctx.fillStyle = pal.shade; ctx.fillRect(0, 0, W, H);
    text('PAUSED', W / 2, H * 0.45, 56, pal.fg);
    text('TAP TO RESUME', W / 2, H * 0.52, 20, pal.acc);
  }
}

// ================= 메인 루프 =================
let lastNow = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastNow) / 1000); lastNow = now;
  let T = S.endT;
  if (S.mode === 'play' && !S.paused) {
    pump(); T = songTime(); update(T, dt);
    if (S.mode !== 'play') T = S.endT;
  } else if (S.mode === 'play') T = S.displayT;
  const frozen = now < S.hitstopUntil;
  if (!frozen) { S.displayT = T; updateFx(dt); }
  S.pulse = Math.max(0, S.pulse - dt * 5);
  S.shake = Math.max(0, S.shake - dt * 3);
  S.flash = Math.max(0, S.flash - dt * 3.5);
  S.bossFlash = Math.max(0, S.bossFlash - dt);
  S.bossShown += (S.bossHp - S.bossShown) * Math.min(1, dt * 3);
  if (S.mode === 'play') S.trail.push({ x: S.player.x, y: S.player.y, t: now });
  while (S.trail.length && now - S.trail[0].t > 140) S.trail.shift();
  draw(S.displayT, now);
  S.prevX = S.player.x; S.prevY = S.player.y;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ================= 입력: 상대 드래그 =================
let dragging = false, lx = 0, ly = 0;
function setPaused(v) {
  if (S.mode !== 'play' || !Sound.ctx) return;
  S.paused = v;
  v ? Sound.ctx.suspend() : Sound.ctx.resume();
}
canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  Sound.init();
  const now = performance.now();
  if (S.paused) setPaused(false);
  else if (S.mode === 'title') startRun();
  else if (S.mode === 'dead' || S.mode === 'win') {
    const e = (now - S.endReal) / 1000, rt = revealTime();
    if (e < 0.3) { /* 오입력 방지 */ }
    else if (e < rt) S.endReal = now - rt * 1000;   // 연출 스킵
    else startRun();
  }
  dragging = true; lx = e.clientX; ly = e.clientY;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
});
canvas.addEventListener('pointermove', e => {
  if (!dragging) return;
  const k = SENS / scale;
  if (S.mode === 'play' && !S.paused) {
    const p = S.player;
    p.x = clamp(p.x + (e.clientX - lx) * k, 12, W - 12);
    p.y = clamp(p.y + (e.clientY - ly) * k, 12, H - 12);
  }
  lx = e.clientX; ly = e.clientY;
});
const endDrag = () => { dragging = false; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'g') opts.god = !opts.god;
  if (k === 'h') opts.hitbox = !opts.hitbox;
  if (k === 'p' || k === 'escape') setPaused(!S.paused);
  if (k === 'r') { Sound.init(); startRun(); }
  if (e.key === '[' || e.key === ']') {
    opts.offset = Math.round((opts.offset + (e.key === ']' ? 0.01 : -0.01)) * 100) / 100;
    localStorage.setItem('cb_offset', opts.offset);
  }
});
