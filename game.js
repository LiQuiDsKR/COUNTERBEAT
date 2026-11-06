'use strict';
// ================= 상수 =================
const W = 540, H = 960;
const BPM = 150, BEAT = 60 / BPM, STEP = BEAT / 4, BAR = BEAT * 4;
const INTRO_BARS = 2;
const BOSS_X = W / 2, BOSS_Y = 230;
// 드래그 감도 (설정에서 조절): 손가락 이동량 × 배율. 가속을 켜면 빠르게 휘두를수록 배율이 올라감(최대 기본 × 1.75)
const SENS_LEVELS = [1.2, 1.4, 1.6, 1.9, 2.2];             // 이동 감도 1~5
const ACCEL_LEVELS = [0, 0.5, 0.9, 1.4];   // 가속 OFF/약/중/강: 손가락 속도(css px/ms)당 추가 배율
const HIT_R = 4, PLAYER_R = 10, GRAZE_R = 30;
const NODE_LEAD = BEAT * 1.5, FIN_LEAD = BEAT * 2.5;   // 공격 노드 예고 (1박/2박 ↔ 2박/3박 중간)
const NODE_R = 46, FIN_R = 80;
const GAP_BEAT = NODE_R * 2 * 1.0;   // 정박 노드 사이 최소 여백: 지름 1개
const GAP_RUN = NODE_R * 2 * 0.5;    // 마지막 마디 4연타 사이 여백: 지름 0.5개
const GAP_BOSS = NODE_R * 2;         // 보스(FINISH 자리)와의 여백
const FIELD = { x0: 52, x1: W - 52, y0: 320, y1: H - 130 };   // 노드가 놓이는 영역 (보스 주변은 여백 규칙으로 제외)
const NODE_EARLY = 0.25, NODE_LATE = 0.25;        // 벨 수 있는 창 (원래 -0.22 / +0.2)
const JUDGE_PERFECT = 0.11, JUDGE_GREAT = 0.18;    // 정박 ±초 (0.07/0.13 → 0.08/0.15 → 지금)
const MAX_LIVES = 5;                    // 체력 칸. 반격 풀콤보 시 1칸 회복
const BULLET_HIT = 0.6;                 // 탄 실제 판정 = 보이는 반지름 × 0.6 (탄막 관례)
let BOSS_HP = 1000;
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
// 설정값 (설정 화면 / localStorage). 기본: 감도 3, 가속 중, Railgun, Glitch Crush, DJ 필터 ON
// 기기 언어로 기본값 (한·영·일·중 외엔 영어)
function defaultLang() {
  const l = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return ['ko', 'en', 'ja', 'zh'].includes(l) ? l : 'en';
}
const ls = (k, d) => { const v = localStorage.getItem('cb_' + k); return v === null ? d : +v; };
const opts = { god: false, hitbox: false,
  offset: ls('offset', 0),
  filter: localStorage.getItem('cb_filter') !== '0',
  lang: localStorage.getItem('cb_lang') || defaultLang(),   // 설정 화면 언어: ko / en / ja / zh
  sens: ls('sens', 2), accel: ls('accel', 2), laser: ls('laser', 1), slam: ls('slam', 4),
  vol: ls('vol', 7), mvol: ls('mvol', 10) };   // 볼륨 0~10
const applyVolume = () => Sound.setVolume(opts.vol / 10, opts.mvol / 10);
applyVolume();
function saveOpts() {
  for (const k of ['offset', 'sens', 'accel', 'laser', 'slam', 'vol', 'mvol']) localStorage.setItem('cb_' + k, opts[k]);
  localStorage.setItem('cb_filter', opts.filter ? '1' : '0');
  localStorage.setItem('cb_lang', opts.lang);
}
// ===== 스테이지 =====
// setStage: 곡·보스 HP·구간 테이블을 그 스테이지 것으로 바꿈 (곡이 없으면 내장 합성 비트)
let STAGE = null, SONG = null, SONG_BARS = null;
function setStage(stage) {
  STAGE = stage;
  SONG = SONGS[stage.song] || null;
  SONG_BARS = null; BOSS_HP = 1000;
  Sound.preloadSong(SONG ? SONG.file : null);
  if (!SONG) return;
  if (SONG.bpm !== BPM) console.warn('곡 BPM이 게임 BPM과 다름', SONG.bpm, BPM);
  BOSS_HP = SONG.bossHp;
  SONG_BARS = [];
  const secs = SONG.sections;
  let strikeN = 0, secN = 0;
  for (let i = 0; i < secs.length - 1; i++) {
    const [st, type, pattern] = secs[i], en = secs[i + 1][0], len = en - st;
    if (type === 'strike') strikeN++;
    secN++;
    for (let b = st; b < en; b++) {
      const k = b - st, last = k === len - 1;
      const tier = Math.min(SONG.maxTier ?? 3, Math.floor(b / (SONG.tierBars ?? 28)));
      let d = k;
      if (type === 'dodge') d = last ? 3 : k % 3;          // 마지막 마디 = 빌드업+캐치
      SONG_BARS[b] = { type, d, k, len, last, pattern, cycle: type === 'strike' ? strikeN - 1 : secN, tier };
    }
  }
  SONG_BARS.endBar = secs[secs.length - 1][0];
}
// 스테이지별 기록: cb_best_<id>, cb_rank_<id> (예전 cb_best 는 1스테이지로 옮김)
if (localStorage.getItem('cb_best') !== null && localStorage.getItem('cb_best_1') === null) {
  localStorage.setItem('cb_best_1', localStorage.getItem('cb_best')); localStorage.removeItem('cb_best');
}
const stageBest = st => +(localStorage.getItem('cb_best_' + st.id) || 0);
const stageRank = st => localStorage.getItem('cb_rank_' + st.id) || '';
setStage(STAGES[0]);

function freshState() {
  return {
    mode: 'title', paused: false, t0: 0, audioStep: 0, gameStep: 0, evStep: -1,
    player: { x: W / 2, y: H * 0.78 }, prevX: W / 2, prevY: H * 0.78, trail: [],
    lives: MAX_LIVES, healPulse: 0, strikeMissN: 0, strikeHits: 0, strikeFin: false, strikeImperfect: 0, invulnUntil: -1, bossHp: BOSS_HP, bossShown: BOSS_HP, bossFlash: 0,
    hazards: [], nodes: [], parts: [], texts: [],
    gauge: 0, combo: 0, maxCombo: 0, cycleDmg: 0, lastNode: null, slashN: 0,
    stats: { perfect: 0, great: 0, good: 0, miss: 0, graze: 0, hits: 0 }, timingSum: 0, timingN: 0,
    vphase: 'dodge', catchT: null, pulse: 0, shake: 0, flash: 0, flashCol: '#fff',
    hitstopUntil: 0, displayT: 0, endT: 0, endReal: 0,
    score: 0, newBest: false, fired: {},
  };
}
let S = freshState();
window.__cb = () => S; // 디버그용

// ================= 곡 구조 =================
const HARD_PATTERNS = ['split', 'x2', 'final'];   // 패턴3·4·FINAL (패턴1·2는 풀콤보 회복)   // WARNING 이후 어려운 반격
const isWarn = info => info.pattern === 'split' || info.pattern === 'warning';   // WARNING 띠+경보음 구간
const END_INFO = { type: 'end', d: 0, k: 0, len: 1, last: true, cycle: 0, tier: 0 };
function barInfo(bar) {
  if (SONG_BARS) return SONG_BARS[bar] || END_INFO;
  if (bar < INTRO_BARS) return { type: 'intro', d: bar, k: bar, len: INTRO_BARS, last: bar === INTRO_BARS - 1, cycle: -1, tier: 0 };
  const b = bar - INTRO_BARS, cycle = Math.floor(b / 8), w = b % 8, tier = Math.min(cycle, 3);
  return w < 4 ? { type: 'dodge', d: w, k: w, len: 4, last: w === 3, cycle, tier }
               : { type: 'strike', d: w - 4, k: w - 4, len: 4, last: w === 7, cycle, tier };
}

// 회피 마디 패턴: 악기 = 탄막. kick→링, bell→레이저, slam(808)→반화면 블라스트, spray(하이햇)→조준탄
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
    p.spray = tier >= 3 ? [0, 2, 4, 6, 8, 9, 10] : [0, 2, 4, 6, 8, 10];
    p.riser = true; p.clap = [];
    if (tier >= 1) p.bell = [[2, 0], [10, 5]];
  }
  return (dodgeCache[key] = p);
}
function kicksOf(info) {
  if (info.type === 'intro') return [0, 8];
  if (info.type === 'dodge') return dodgeBar(info.d, info.tier).kick;
  if (info.type === 'strike') return info.last ? [0, 8] : [0, 7, 10];
  return [];
}

// ================= 오디오 스케줄 =================
function scheduleAudio(g, t) {
  const bar = g >> 4, s = g & 15, info = barInfo(bar), kicks = kicksOf(info);
  if (SONG) {
    // 곡이 음악 담당. 게임은 캐치 무음 + 드롭 펀치만 얹음
    if (opts.filter) {
      if (info.type === 'dodge' && info.k === 0 && s === 0) Sound.songDodge(t);
      if (info.type === 'dodge' && info.last && s === 12) Sound.songCatch(t, BEAT);
      if (info.type === 'strike' && info.k === 0 && s === 0) Sound.songStrike(t);
    }
    if (info.type === 'strike' && info.k === 0 && s === 0) Sound.kick(t, true);
    // WARNING 구간 첫 마디: 박마다 경보음
    if (isWarn(info) && info.k === 0 && s % 4 === 0) Sound.alarm(t, s === 0);
    if (info.pattern === 'final' && s === 0) Sound.crash(t, 0.3);
    return;
  }
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
    if (p.clap.includes(s)) Sound.clap(t, 0.32);
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
    if (info.last && s >= 12) return;
    const p = dodgeBar(info.d, info.tier);
    if (p.kick.includes(s)) spawnRing(t, info.tier, bar * 0.37 + s * 0.19);
    p.bell.forEach(([st, pi], i) => { if (st === s) spawnLaser(t, pi, (i + bar) % 2 ? 'v' : 'h'); });
    if (p.slam === s) spawnSlam(t);
    if (p.spray.includes(s)) spawnAimed(t, info.tier);
  } else if (info.type === 'strike') {
    if (info.k === 0 && s === 0) S.lastNode = { x: W / 2, y: 640 };
    if (info.pattern === 'split') {
      // SPLIT (곡이 4마디 단위와 어긋나는 구간): WARNING 후 박을 점점 잘게 쪼갬. 전부 4박 기준.
      //   1마디: 2분음표(1·3박) → 2마디: 4분음표 → 3마디: 8분 4연타 ×2 → 4마디: 8분 4연타 + FINISH
      if (info.k === 0 && s % 8 === 0) spawnNode(t, 'beat');
      else if (info.k === 1 && s % 4 === 0) spawnNode(t, 'beat');
      else if (info.k === 2 && s % 2 === 0) spawnNode(t, 'run', (s / 2) % 4);
      else if (info.last && s < 8 && s % 2 === 0) spawnNode(t, 'run', s / 2);
      else if (info.last && s === 8) spawnNode(t, 'fin');
      return;
    }
    if (info.pattern === 'p2') {
      // 패턴2 "클랩 더블": 1·3박은 한 번, 2·4박은 박+반박 두 번 (쿵 · 딱딱 · 쿵 · 딱딱)
      // 곡의 클랩(2·4박)과 같이 치는 백비트 그루브. 마지막 마디는 패턴1과 같은 4연타 + FINISH
      if (!info.last) {
        if (s === 0 || s === 8) spawnNode(t, 'beat');
        else if (s === 4 || s === 12) spawnNode(t, 'pair', 0);
        else if (s === 6 || s === 14) spawnNode(t, 'pair', 1);
      } else if (s < 8 && s % 2 === 0) spawnNode(t, 'run', s / 2);
      else if (s === 8) spawnNode(t, 'fin');
      return;
    }
    if (info.pattern === 'x2') {
      // 2배 비트 (WARNING 이후): 4분음표 자리를 8분 4연타로. 마지막 마디는 보통과 같음
      if (!info.last && s % 2 === 0) spawnNode(t, 'run', (s / 2) % 4);
      else if (info.last && s < 8 && s % 2 === 0) spawnNode(t, 'run', s / 2);
      else if (info.last && s === 8) spawnNode(t, 'fin');
      return;
    }
    if (!info.last && s % 4 === 0) spawnNode(t, 'beat');
    else if (info.last && s < 8 && s % 2 === 0) spawnNode(t, 'run', s / 2);   // 마지막 마디: 8분 4연타
    else if (info.last && s === 8) spawnNode(t, 'fin');
  }
}
function spawnRing(t, tier, off) {
  const n = 10 + tier * 2, sp = 140 + tier * 18;
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
  S.hazards.push({ k: 'l', o, pos, tw: t - BEAT * 2, tf: t, te: t + 0.14, w: 34 });   // 예고 2박 (원래 1박)
  // 레이저 소리: 고정 음높이 (멜로디 없음). 세로 레이저는 위치 따라 패닝
  const at = ctxAt(t);
  if (at > Sound.ctx.currentTime - 0.02) Sound.LASERS[opts.laser].play(at, o === 'v' ? pos / W * 2 - 1 : 0);
}
// 곡 시간 → 오디오 컨텍스트 시간
function ctxAt(songT) { return S.t0 + songT; }
function spawnSlam(t) {
  // 블라스트(코드명 slam)마다 좌우 번갈아 (예전엔 cycle 홀짝 기준이라 Suno 비트맵에서 항상 왼쪽만 나왔음)
  const side = (S.slamN = (S.slamN || 0) + 1) % 2 ? 'L' : 'R';
  S.hazards.push({ k: 's', side, tw: t - BEAT * 2, tf: t, te: t + 0.25 });
  const at = ctxAt(t);
  if (at > Sound.ctx.currentTime - 0.02) Sound.SLAMS[opts.slam].play(at, side === 'L' ? -0.4 : 0.4);
}
// 후보 위치가 보스(FINISH 자리)·대기 중 노드와 얼마나 떨어졌나. 0 이상이면 여백 조건 만족
// t: 새 노드의 정박 시간. 화면에 같이 보이는 노드만 검사 (새 노드가 뜨기 전에 사라지는 노드는 제외)
function nodeClearance(x, y, gap, t, bossGap = GAP_BOSS) {
  let worst = Math.hypot(x - BOSS_X, y - BOSS_Y) - (NODE_R + FIN_R + bossGap);
  for (const n of S.nodes) {
    if (n.state || n.t + NODE_LATE < t - NODE_LEAD) continue;
    worst = Math.min(worst, Math.hypot(x - n.x, y - n.y) - (NODE_R + n.r + gap));
  }
  return worst;
}
const inField = (x, y) => x >= FIELD.x0 && x <= FIELD.x1 && y >= FIELD.y0 && y <= FIELD.y1;

// 정박 노드: 이전 노드에서 지름 1개 여백 이상 떨어진 랜덤 위치
function pickBeatPos(L, t) {
  const minD = NODE_R * 2 + GAP_BEAT;
  let best = null, bestC = -Infinity;
  // 1순위: 지름 1개 여백. 자리가 정말 없으면 2순위로 지름 0.5개까지 허용
  for (const gap of [GAP_BEAT, GAP_RUN]) {
    for (let k = 0; k < 150; k++) {
      const a = Math.random() * Math.PI * 2, d = minD + Math.random() * 90;
      const x = L.x + Math.cos(a) * d, y = L.y + Math.sin(a) * d;
      if (!inField(x, y)) continue;
      const c = nodeClearance(x, y, gap, t, gap);
      if (c >= 0) return [x, y];
      if (c > bestC) { bestC = c; best = [x, y]; }
    }
  }
  return best || [FIELD.x0 + Math.random() * (FIELD.x1 - FIELD.x0), FIELD.y0 + Math.random() * (FIELD.y1 - FIELD.y0)];
}
// 4연타: 시작점에서 한 방향으로 완만하게 휘며 이어짐 (지그재그 금지)
function planRun(L, t) {
  const step = NODE_R * 2 + GAP_RUN;
  let best = null, bestC = -Infinity;
  // 1순위: 다른 노드·보스와 지름 1개 여백. 안 되면 지름 0.5개
  for (const gap of [GAP_BEAT, GAP_RUN]) {
    for (let k = 0; k < 1500; k++) {
      const a0 = Math.random() * Math.PI * 2, d0 = NODE_R * 2 + GAP_BEAT + Math.random() * 110;
      const pts = [[L.x + Math.cos(a0) * d0, L.y + Math.sin(a0) * d0]];
      // 꺾이는 각: 관절 내각 150~170° (= 방향 전환 10~30°), 항상 같은 쪽으로.
      // 첫 꺾임을 정하면 다음 꺾임은 그 값에서 ±3° 이내 → 일관된 곡선
      const D = Math.PI / 180, sgn = Math.random() < 0.5 ? -1 : 1;
      const t1 = (10 + Math.random() * 20) * D;
      const t2 = clamp(t1 + (Math.random() * 6 - 3) * D, 10 * D, 30 * D);
      let a = Math.random() * Math.PI * 2;
      for (const turn of [0, t1, t2]) {
        a += sgn * turn;
        const [px, py] = pts[pts.length - 1];
        pts.push([px + Math.cos(a) * step, py + Math.sin(a) * step]);
      }
      if (!pts.every(([x, y]) => inField(x, y))) continue;
      // 4연타끼리 간격은 step으로 보장. 다른 노드·보스와는 gap
      let c = Infinity;
      for (let i = 0; i < 4; i++) c = Math.min(c, nodeClearance(pts[i][0], pts[i][1], gap, t + i * STEP * 2, gap));
      if (c >= 0) return pts;
      if (c > bestC) { bestC = c; best = pts; }
    }
  }
  return best || [[80, 640], [218, 640], [356, 640], [470, 640]];
}
// 패턴2 쌍의 두 번째 노드: 첫 노드에서 이동 방향 그대로(±25°) 짧게 이어짐
function pickPairPos(A, head, t) {
  const step = NODE_R * 2 + GAP_RUN + 2;
  let best = null, bestC = -Infinity;
  for (const spread of [25, 60, 180]) {
    for (let k = 0; k < 250; k++) {
      const a = head + (Math.random() * 2 - 1) * spread * Math.PI / 180, d = step + Math.random() * 30;
      const x = A.x + Math.cos(a) * d, y = A.y + Math.sin(a) * d;
      if (!inField(x, y)) continue;
      const c = nodeClearance(x, y, GAP_RUN, t);
      if (c >= 0) return [x, y];
      if (c > bestC) { bestC = c; best = [x, y]; }
    }
  }
  return best || [clamp(A.x + step, FIELD.x0, FIELD.x1), A.y];
}
function spawnNode(t, kind, idx = 0) {
  let x = BOSS_X, y = BOSS_Y;
  const L = S.lastNode || { x: W / 2, y: 640 };
  if (kind === 'beat') [x, y] = pickBeatPos(L, t);
  else if (kind === 'pair' && idx === 0) { [x, y] = pickBeatPos(L, t); S.pairHead = Math.atan2(y - L.y, x - L.x); }
  else if (kind === 'pair') [x, y] = pickPairPos(L, S.pairHead ?? 0, t);
  else if (kind === 'run') { if (idx === 0 || !S.runPlan) S.runPlan = planRun(L, t); [x, y] = S.runPlan[idx]; }
  S.lastNode = { x, y, kind };
  const fin = kind === 'fin';
  S.nodes.push({ x, y, t, fin, kind, r: fin ? FIN_R : NODE_R, lead: fin ? FIN_LEAD : NODE_LEAD, state: 0 });
}

// ================= 비트 이벤트 (실시간 커서) =================
function onStep(g) {
  const bar = g >> 4, s = g & 15, info = barInfo(bar), t = g * STEP;
  if (kicksOf(info).includes(s) && !(info.type === 'dodge' && info.last && s >= 12)) S.pulse = 1;
  if (info.type === 'end' && s === 0) { timeUp(t); return; }
  if (info.type === 'intro' && s === 0 && (bar === 0 || bar === info.len - 2)) {
    popText(bar === 0 ? 'READY' : 'DRAG TO DODGE', W / 2, H * 0.45, { size: bar === 0 ? 56 : 34, dur: BAR * 900, chroma: true });
  }
  if (isWarn(info) && info.k === 0 && s === 0) {
    S.warnUntil = t + BAR;   // WARNING 오버레이 1마디
  }
  if (info.type === 'dodge') {
    if (info.k === 0 && s === 0) {
      if (S.vphase !== 'dodge') { S.vphase = 'dodge'; S.flash = 0.7; S.flashCol = '#000000'; S.nodes = []; }
      popText('DODGE', W / 2, H * 0.45, { size: 48, dur: 600, chroma: true });
    }
    if (info.last && s === 12) { // 캐치 포인트
      S.catchT = t; S.shake = 0.3;
      popText('COUNTER', W / 2, H * 0.45, { size: 78, dur: BEAT * 1000, chroma: true, rise: 0, pop: 1.8 });
    }
  }
  if (info.type === 'strike') {
    if (info.k === 0 && s === 0) drop(info);
    if (info.last && s === 12 && S.killed) { win(t); return; }   // 안전장치: 처치 후 반격 끝
    if (info.last && s === 12) {
      S.shake = 0.7; S.gauge = 0;
      popText(`${S.cycleDmg} DMG`, W / 2, H * 0.58, { size: 52, col: 'acc', dur: 900, chroma: true });
      // 회복 조건 (꽉 찼으면 점수 보너스)
      //   보통 반격: 노드를 하나도 안 놓침(풀콤보)
      //   WARNING(SPLIT) 이후 어려운 반격(split·x2·final): 70% 이상 맞히고 FINISH는 반드시
      const hard = HARD_PATTERNS.includes(info.pattern), total = S.strikeHits + S.strikeMissN;
      const rate = total ? S.strikeHits / total : 0;
      const heal = hard ? rate >= 0.7 && S.strikeFin : S.strikeMissN === 0 && S.strikeHits > 0;
      if (heal) {
        // FULL PERFECT(전부 PERFECT) > FULL COMBO(놓친 것 없음) > CLEAR 비율
        const fp = S.strikeMissN === 0 && S.strikeImperfect === 0;
        popText(fp ? 'FULL PERFECT' : S.strikeMissN === 0 ? 'FULL COMBO' : `CLEAR ${Math.round(rate * 100)}%`, W / 2, H * 0.66,
          { size: fp ? 34 : 30, col: fp ? 'acc' : 'fg', dur: fp ? 1300 : 1000, chroma: true });
        if (S.lives < MAX_LIVES) {
          S.lives++; S.healPulse = 1; Sound.sfxHeal();
          popText('+1 HP', S.player.x, S.player.y - 40, { size: 24, col: 'acc', dur: 900, rise: 50 });
        } else S.score += 500;
      }
      S.strikeMissN = 0; S.strikeHits = 0; S.strikeFin = false; S.strikeImperfect = 0;
      // 다음 반격 준비: 첫 노드는 드롭 박 0.22초 전부터 벨 수 있어서 드롭 시점이 아니라 여기서 초기화
      S.slashN = 0; S.cycleDmg = 0;
    }
  }
}
function drop(info = {}) {
  const T = S.catchT ?? S.displayT;
  for (const h of S.hazards) {
    if (h.k === 'b' && T >= h.t0 && !(h.aim && !h.aimed)) {
      burst(h.x0 + h.vx * (T - h.t0), h.y0 + h.vy * (T - h.t0), 3, 'fg', 260, 3, 0.5);
    }
  }
  S.hazards = []; S.catchT = null; S.vphase = 'strike';
  S.flash = 1; S.flashCol = '#ffffff'; S.shake = 1.2;
  popText(info.pattern === 'final' ? 'FINAL STRIKE!' : 'STRIKE!', W / 2, H * 0.45, { size: info.pattern === 'final' ? 60 : 72, col: 'acc', dur: 700, chroma: true });
  if (navigator.vibrate) navigator.vibrate(30);
}

// ================= 런 관리 =================
function songTime() {
  const ac = Sound.ctx;
  return ac.currentTime - S.t0 - (ac.outputLatency || 0) + opts.offset;
}
// 다시하기
function restartRun() { startRun(0); }
// 스테이지 선택 화면으로: 곡 끄고 메뉴 상태로
function goToSelect() {
  if (Sound.ctx) { Sound.stopSong(); Sound.newBus(); if (Sound.ctx.state === 'suspended') Sound.ctx.resume(); }
  S = freshState(); ui.screen = 'select';
}
let pendingStart = false;
function startRun(fromBar = 0) {
  Sound.init();
  if (SONG && !Sound.songBuf) {          // 곡 디코딩 대기
    if (!pendingStart) { pendingStart = true; Sound.loadSong().then(() => { pendingStart = false; startRun(fromBar); }); }
    return;
  }
  Sound.newBus();
  const keepX = S.player.x, keepY = S.player.y;
  S = freshState();
  S.mode = 'play';
  const off = fromBar * BAR, ts = Sound.ctx.currentTime + 0.3;
  S.t0 = ts - off;
  if (SONG) Sound.playSong(ts, off + SONG.offset, opts.filter ? barInfo(fromBar).type : 'strike');
  S.audioStep = S.gameStep = fromBar * 16;
  S.evStep = fromBar * 16 - 1;
  if (fromBar > 0) { S.player.x = keepX; S.player.y = keepY; }
  if (barInfo(fromBar).type === 'strike') S.vphase = 'strike';   // 반격 도중부터 시작한 경우
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
  const run = S;
  while ((S.evStep + 1) * STEP <= T) { S.evStep++; onStep(S.evStep); if (S !== run) return; }   // 연습 되감기로 판이 바뀌면 중단
  if (T < 0) return;
  const px = S.player.x, py = S.player.y;
  const inCatch = S.catchT !== null && T >= S.catchT;
  // 맞을 수 있는지는 매번 다시 확인: 한 프레임에 여러 개가 겹쳐도 첫 피격의 무적이 바로 적용돼 1칸만 깎임
  const canHit = () => !opts.god && T >= S.invulnUntil && !inCatch;

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
        if (d < h.r * BULLET_HIT + HIT_R) { if (canHit()) { h.dead = true; playerHit(T); } }
        else if (!h.grazed && d < h.r + GRAZE_R && T >= S.invulnUntil) { h.grazed = true; graze(x, y, 3); }
      } else if (h.k === 'l') {
        if (T > h.te + 0.3) { h.dead = true; continue; }
        if (T >= h.tf && !h.fx) { h.fx = true; S.shake = Math.max(S.shake, 0.25); }
        if (T >= h.tf && T <= h.te) {
          const d = h.o === 'h' ? Math.abs(py - h.pos) : Math.abs(px - h.pos);
          if (d < h.w * 0.4 + HIT_R) { if (canHit()) playerHit(T); }
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
        if (T >= h.tf && T <= h.te && (h.side === 'L' ? px < W / 2 : px >= W / 2) && canHit()) playerHit(T);
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
    if (T > n.t + NODE_LATE) {
      n.state = 2;
      if (!S.killed) { S.stats.miss++; S.combo = 0; S.strikeMissN++; }   // 처치 후 미스는 기록 안 함
      popText('MISS', n.x, n.y - 40, { size: 20, dur: 500 });
      if (S.killed && n.fin) { win(T); return; }
      continue;
    }
    if (T >= n.t - NODE_EARLY && speed > 100 && segDist(n.x, n.y, sx, sy, px, py) <= n.r + PLAYER_R) {
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
  S.lives--; S.stats.hits++; S.combo = 0; S.invulnUntil = T + 1.5;
  clearAround(T, 130);   // 맞으면 주변 탄 정리 (숨 돌릴 틈)
  S.shake = 1; S.flash = 0.5; S.flashCol = '#ff1e56'; S.hitstopUntil = performance.now() + 120;
  burst(S.player.x, S.player.y, 26, '#ff1e56', 420, 4, 0.6);
  Sound.sfxHit();
  if (navigator.vibrate) navigator.vibrate(60);
  if (S.lives <= 0) die(T);
}
function timeUp(T) {
  S.timeUp = true; S.mode = 'dead'; S.endT = T; finishRun();
  Sound.fadeOut(1.5);
}
function clearAround(T, r) {
  const { x: px, y: py } = S.player;
  for (const h of S.hazards) {
    if (h.k !== 'b' || T < h.t0 || (h.aim && !h.aimed)) continue;
    const x = h.x0 + h.vx * (T - h.t0), y = h.y0 + h.vy * (T - h.t0);
    if (Math.hypot(x - px, y - py) < r) { h.dead = true; burst(x, y, 3, 'fg', 200, 3, 0.4); }
  }
}
function die(T) {
  S.mode = 'dead'; S.endT = T; finishRun();
  Sound.fadeOut(0.25);
  burst(S.player.x, S.player.y, 60, '#ff1e56', 600, 5, 1.0);
}
function nodeHit(n, T) {
  const dt = Math.abs(T - n.t);
  let j, jm, label;
  if (dt <= JUDGE_PERFECT) { j = 'perfect'; jm = 1; label = 'PERFECT'; }
  else if (dt <= JUDGE_GREAT) { j = 'great'; jm = 0.7; label = 'GREAT'; }
  else { j = 'good'; jm = 0.4; label = 'GOOD'; }
  // 보스 처치(S.killed) 이후 노드는 타격감만: 판정·콤보·점수 기록은 처치 시점에서 고정
  const counted = !S.killed;
  if (counted) {
    S.stats[j]++; S.combo++; S.strikeHits++; if (n.fin) S.strikeFin = true; S.timingSum += T - n.t; S.timingN++;
    if (j !== 'perfect') S.strikeImperfect++;
  }
  S.maxCombo = Math.max(S.maxCombo, S.combo);
  const mult = 1 + S.gauge / 50;
  const dmg = Math.round((n.fin ? 40 : 10) * jm * mult * (1 + Math.min(S.combo, 20) * 0.02));
  if (counted) { S.bossHp = Math.max(0, S.bossHp - dmg); S.cycleDmg += dmg; S.score += dmg * 10; }
  S.bossFlash = 0.15;
  n.state = 1;
  const ang = Math.atan2(S.player.y - S.prevY, S.player.x - S.prevX);
  slashFx(n, ang);
  S.hitstopUntil = performance.now() + (n.fin ? 140 : j === 'perfect' ? 60 : 35);
  S.shake = Math.max(S.shake, n.fin ? 1.3 : 0.35);
  if (n.fin) {
    S.flash = 0.6; S.flashCol = '#ff1e56';
  }
  popText(label, n.x, n.y - 50, { size: n.fin ? 44 : 26, col: j === 'perfect' ? 'acc' : 'fg', dur: 500 });
  if (counted) popText(String(dmg), n.x + 34, n.y - 8, { size: 18, dur: 600, rise: 60 });
  const semis = SLASH_SCALE[S.slashN % SLASH_SCALE.length];   // 길면 음계 순환
  S.slashN++;
  Sound.sfxSlash(j, D5 * semi(semis - 12), n.fin);
  if (navigator.vibrate) navigator.vibrate(n.fin ? 40 : 15);
  if (counted && S.bossHp <= 0) bossKilled(T);
  if (S.killed && n.fin) win(T);   // 처치 후엔 FINISH까지 베고 끝
}
// 보스 HP 0: 바로 끝내지 않고 이번 반격의 FINISH까지 계속 (기록은 여기서 고정)
function bossKilled(T) {
  S.killed = true; S.clearT = T;
  S.shake = Math.max(S.shake, 1.2); S.flash = 0.5; S.flashCol = '#ffffff';
  popText('BREAK!', W / 2, H * 0.3, { size: 64, col: 'acc', dur: 900, chroma: true });
  Sound.sfxStamp(true);
}
function win(T) {
  for (const h of S.hazards) {
    if (h.k === 'b' && T >= h.t0 && !(h.aim && !h.aimed))
      burst(h.x0 + h.vx * (T - h.t0), h.y0 + h.vy * (T - h.t0), 3, 'fg', 260, 3, 0.6);
  }
  S.hazards = []; S.nodes = []; S.catchT = null;
  S.mode = 'win'; S.endT = T; S.score += S.lives * 600; finishRun();
  Sound.fadeOut(2.5); Sound.sfxBoom();
  S.flash = 1; S.flashCol = '#ffffff'; S.shake = 2;
  for (let i = 0; i < 5; i++) burst(BOSS_X, BOSS_Y, 30, i % 2 ? 'acc' : 'fg', 300 + i * 200, 6, 1.4);
  S.parts.push({ k: 'ring', x: BOSS_X, y: BOSS_Y, r0: 40, r1: 700, life: 0.8, max: 0.8, col: 'acc' });
  S.bossDead = true;
}
function finishRun() {
  S.endReal = performance.now();
  const best = stageBest(STAGE);
  S.best = Math.max(best, S.score);
  if (S.score > best) { S.newBest = true; localStorage.setItem('cb_best_' + STAGE.id, S.score); }
  if (S.mode === 'win') {
    const order = RANK_ORDER, r = rank(), old = stageRank(STAGE);
    if (!old || order.indexOf(r) > order.indexOf(old)) localStorage.setItem('cb_rank_' + STAGE.id, r);
  }
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
// 한·일·중 글자용 (설정 화면 언어별)
const FONT_KO = '"Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", "Yu Gothic", "Meiryo", "Hiragino Sans", "Microsoft YaHei", "PingFang SC", sans-serif';
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

// 배경 진행 게이지: 구간 진행도를 화면 전체 왼→오 채움으로. 끝선은 박마다 맥동, 마디 구분선.
function drawProgress(pal, T) {
  if (T < 0) return;
  const info = barInfo(Math.floor(T / BAR));
  if (info.type !== 'dodge' && info.type !== 'strike') return;
  const inBar = (T % BAR) / BAR, prog = (info.k + inBar) / info.len;
  const x = info.type === 'strike' ? W * (1 - prog) : W * prog;   // 회피: 왼→오 차오름, 반격: 오→왼 빠짐
  const bp = (T % BEAT) / BEAT, beatK = 1 - bp;           // 박 직후 1 → 0
  const warn = info.type === 'dodge' && info.last;        // 캐치 직전 마디
  ctx.fillStyle = warn ? `rgba(${pal.warn},${0.06 + beatK * 0.05})` : `rgba(${pal.grid},${0.06 + beatK * 0.03})`;
  ctx.fillRect(0, 0, x, H);
  // 마디 구분선
  ctx.fillStyle = `rgba(${pal.grid},0.07)`;
  for (let i = 1; i < info.len; i++) ctx.fillRect(Math.round(W * i / info.len), 0, 1, H);
  // 끝선
  ctx.fillStyle = warn ? `rgba(${pal.warn},${0.35 + beatK * 0.5})` : `rgba(${pal.grid},${0.12 + beatK * 0.3})`;
  ctx.fillRect(x - 1, 0, 2 + beatK * 3, H);
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
  if (S.killed) { ctx.translate((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12); ctx.globalAlpha = Math.random() < 0.3 ? 0.35 : 1; }
  else if (hpP < 0.4) ctx.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
  const col = S.bossFlash > 0 ? pal.acc : pal.fg;
  ctx.strokeStyle = col; ctx.lineWidth = 4; poly(0, 0, 70, 6, rot); ctx.stroke();
  ctx.lineWidth = 2; ctx.globalAlpha = 0.5; poly(0, 0, 84, 6, -rot * 0.5); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.lineWidth = 3; poly(0, 0, 46, 4, -rot * 1.6); ctx.stroke();
  ctx.fillStyle = pal.acc; ctx.beginPath(); ctx.arc(0, 0, 14 + p * 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = pal.bg; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// 순서 가독성: 다음 노드 진하게 + 맥동 테두리, 그다음은 반투명, 그 뒤는 흐리게.
// 다음 → 그다음 노드로 점선 화살표(경로)를 그려 방향을 미리 보여줌.
const NODE_ALPHA = [1, 0.5, 0.2];
function drawNodes(pal, T) {
  const vis = S.nodes.filter(n => !n.state && T >= n.t - n.lead).sort((a, b) => a.t - b.t);
  const beatK = 1 - (T % BEAT) / BEAT;
  // FINISH로 가는 화살표: 굵은 실선 + 박마다 맥동 + 큰 화살촉 (연타 끝에 FINISH 놓치지 않게).
  // 순서상 몇 번째든 FINISH가 보이면 항상 그림
  const fi = vis.findIndex(n => n.fin);
  if (fi >= 1) {
    const a = vis[fi - 1], b = vis[fi];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d > a.r + b.r + 8) {
      const ux = dx / d, uy = dy / d, near = fi === 1;
      const sx = a.x + ux * (a.r + 6), sy = a.y + uy * (a.r + 6), ex = b.x - ux * (b.r + 10), ey = b.y - uy * (b.r + 10);
      ctx.strokeStyle = pal.acc; ctx.fillStyle = pal.acc; ctx.lineCap = 'round';
      ctx.globalAlpha = (near ? 0.75 : 0.35) + beatK * 0.25;
      ctx.lineWidth = near ? 8 + beatK * 4 : 5;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex - ux * 18, ey - uy * 18); ctx.stroke();
      const hs = near ? 30 + beatK * 8 : 22;
      ctx.beginPath(); ctx.moveTo(ex, ey);
      ctx.lineTo(ex - ux * hs - uy * hs * 0.6, ey - uy * hs + ux * hs * 0.6); ctx.lineTo(ex - ux * hs + uy * hs * 0.6, ey - uy * hs - ux * hs * 0.6);
      ctx.closePath(); ctx.fill();
      ctx.lineCap = 'butt'; ctx.globalAlpha = 1;
    }
  }
  // 경로 화살표 (뒤에서부터 그려서 다음 노드 화살표가 위로)
  for (let i = Math.min(vis.length - 1, 2); i >= 1; i--) {
    const a = vis[i - 1], b = vis[i];
    if (b.fin) continue;   // FINISH 화살표는 위에서 따로
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d < a.r + b.r + 8) continue;
    const ux = dx / d, uy = dy / d;
    const sx = a.x + ux * (a.r + 6), sy = a.y + uy * (a.r + 6), ex = b.x - ux * (b.r + 8), ey = b.y - uy * (b.r + 8);
    ctx.strokeStyle = pal.acc; ctx.fillStyle = pal.acc;
    ctx.globalAlpha = i === 1 ? 0.55 : 0.2; ctx.lineWidth = 3; ctx.setLineDash([8, 7]);
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(ex, ey);
    ctx.lineTo(ex - ux * 14 - uy * 8, ey - uy * 14 + ux * 8); ctx.lineTo(ex - ux * 14 + uy * 8, ey - uy * 14 - ux * 8);
    ctx.closePath(); ctx.fill();
  }
  // 뒤 순서부터 그려서 다음 노드가 맨 위
  for (let i = vis.length - 1; i >= 0; i--) {
    const n = vis[i], rank = i;
    const p = clamp((n.t - T) / n.lead, 0, 1);       // 1 → 0 (정박)
    const late = T > n.t ? clamp((T - n.t) / NODE_LATE, 0, 1) : 0;
    const a = (1 - late * 0.7) * NODE_ALPHA[Math.min(rank, 2)];
    ctx.strokeStyle = pal.acc;
    if (rank === 0 && !n.fin) {   // 보스 연결선은 다음 노드만
      ctx.globalAlpha = 0.2 * a; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(BOSS_X, BOSS_Y); ctx.lineTo(n.x, n.y); ctx.stroke(); ctx.setLineDash([]);
    }
    // 접근 링: 다음·그다음만
    if (rank <= 1) {
      ctx.globalAlpha = (1 - p * 0.6) * a; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r * (1 + 1.6 * p), 0, Math.PI * 2); ctx.stroke();
    }
    // 본체
    ctx.globalAlpha = (rank === 0 ? 0.3 : 0.15) * a; ctx.fillStyle = pal.acc;
    ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = a; ctx.lineWidth = rank === 0 ? 6 : 4;
    ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.stroke();
    if (rank === 0) {   // 다음 노드: 박마다 맥동하는 바깥 테두리
      ctx.globalAlpha = 0.35 * beatK * a; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 8 + beatK * 6, 0, Math.PI * 2); ctx.stroke();
    }
    if (n.fin) {
      ctx.globalAlpha = a; ctx.lineWidth = 6; const r = n.r * 0.6;
      ctx.beginPath(); ctx.moveTo(n.x - r, n.y - r); ctx.lineTo(n.x + r, n.y + r);
      ctx.moveTo(n.x + r, n.y - r); ctx.lineTo(n.x - r, n.y + r); ctx.stroke();
      text('FINISH', n.x, n.y + n.r + 26, 20, pal.acc, { alpha: a });
    } else {
      ctx.globalAlpha = a; ctx.fillStyle = pal.acc; ctx.beginPath(); ctx.arc(n.x, n.y, rank === 0 ? 8 : 5, 0, Math.PI * 2); ctx.fill();
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

// WARNING: 배경 전체를 은은하게 — 붉은 기운이 박마다 맥동 + 아주 옅은 사선 줄무늬 + 배경에 큰 글자.
// 월드 레이어 맨 뒤(격자 위, 장애물·노드·플레이어 아래)에 그려서 아무것도 가리지 않음.
function drawWarning(T) {
  if (!S.warnUntil || T >= S.warnUntil || T < S.warnUntil - BAR) return;
  const beatK = 1 - (T % BEAT) / BEAT, fade = Math.min(1, (S.warnUntil - T) / (BEAT * 0.5));
  ctx.save();
  ctx.globalAlpha = (0.05 + beatK * 0.07) * fade;
  ctx.fillStyle = '#ff1e56'; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.05 * fade; ctx.fillStyle = '#ff1e56';
  const off = (T * 60) % 80;
  for (let x = -H; x < W + 80; x += 80) {
    ctx.beginPath(); ctx.moveTo(x + off, 0); ctx.lineTo(x + off + 34, 0); ctx.lineTo(x + off + 34 + H * 0.6, H); ctx.lineTo(x + off + H * 0.6, H); ctx.fill();
  }
  ctx.translate(W / 2, H * 0.5); ctx.rotate(-Math.PI / 2);
  text('WARNING', 0, 0, 150, '#ff1e56', { alpha: (0.06 + beatK * 0.06) * fade });
  ctx.restore();
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
  text('BOSS', 66, 58, 14, pal.fg, { align: 'left' });
  text(S.score.toLocaleString(), W - 30, 58, 14, pal.fg, { align: 'right' });

  if (T >= 0) {
    const info = barInfo(Math.floor(T / BAR));
    const label = info.type === 'strike' ? 'STRIKE' : info.type === 'dodge' ? 'DODGE' : info.type === 'end' ? '' : 'READY';
    text(label, W / 2, 58, 16, info.type === 'strike' ? pal.acc : pal.fg);
    ctx.globalAlpha = 1;
  }

  for (let i = 0; i < MAX_LIVES; i++) {
    const x = 30 + i * 22, y = H - 40;
    const sc = i === S.lives - 1 ? 1 + S.healPulse * 0.8 : 1;
    ctx.beginPath(); ctx.moveTo(x, y - 9 * sc); ctx.lineTo(x + 7 * sc, y); ctx.lineTo(x, y + 9 * sc); ctx.lineTo(x - 7 * sc, y); ctx.closePath();
    if (i < S.lives) { ctx.fillStyle = pal.acc; ctx.fill(); }
    else { ctx.strokeStyle = `rgba(${pal.grid},0.3)`; ctx.lineWidth = 2; ctx.stroke(); }
  }
  const gx = 160, gw = 220, gy = H - 44;
  ctx.fillStyle = `rgba(${pal.grid},0.12)`; ctx.fillRect(gx, gy, gw, 8);
  ctx.fillStyle = pal.acc; ctx.fillRect(gx, gy, gw * S.gauge / 100, 8);
  text('GRAZE', gx, gy - 12, 11, pal.fg, { align: 'left', alpha: 0.6 });
  text(`x${(1 + S.gauge / 50).toFixed(1)}`, gx + gw + 12, gy + 4, 16, pal.acc, { align: 'left' });
  if (S.combo > 1) text(`${S.combo} COMBO`, W - 30, H - 78, 16, pal.fg, { align: 'right' });
}

// 등급 (낮음 → 높음): C B A S M L. 클리어했을 때만.
//   L (Legend) = 곡 전체 FULL PERFECT (방울 전부 PERFECT)
//   M (Master) = 곡 전체 FULL COMBO (방울 MISS 0)
//   S / A / B / C = 정확도·피격 기준
// 보스 처치 이후 방울은 기록에 안 들어가므로 처치 시점까지로 판정
const RANK_ORDER = 'CBASML';
const RANK_NAME = { L: 'LEGEND', M: 'MASTER' };
function rank() {
  const s = S.stats, tot = s.perfect + s.great + s.good + s.miss;
  const acc = tot ? (s.perfect + s.great * 0.7 + s.good * 0.4) / tot : 0;
  if (tot && s.miss === 0 && s.great === 0 && s.good === 0) return 'L';
  if (tot && s.miss === 0) return 'M';
  if (s.hits <= 1 && acc > 0.85) return 'S';
  if (s.hits <= 3 && acc > 0.7) return 'A';
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

// 평균 타이밍 (+ 늦음 / - 빠름). 한쪽으로 쏠려 있으면 설정의 싱크 보정으로 맞추면 됨
function drawTiming(x, y, pal, a) {
  if (!S.timingN) return;
  const ms = Math.round(S.timingSum / S.timingN * 1000);
  const tag = Math.abs(ms) < 15 ? 'ON BEAT' : ms > 0 ? 'LATE' : 'EARLY';
  text(`AVG TIMING ${ms > 0 ? '+' : ''}${ms}ms  ${tag}`, x, y, 13, Math.abs(ms) < 15 ? pal.fg : pal.acc, { alpha: a * 0.8 });
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
    button(W / 2 - 112, H * 0.86, 200, 56, 'RETRY', pal, { primary: true, pulse: bp }, () => restartRun());
    button(W / 2 + 112, H * 0.86, 200, 56, 'STAGES', pal, {}, () => goToSelect());
  }
}

function drawDeadScreen(pal, e) {
  if (e >= 0.35) once('down', () => { S.shake = 0.8; Sound.sfxStamp(false); });
  stamp(S.timeUp ? 'TIME UP' : 'DOWN', W / 2, H * 0.32, S.timeUp ? 76 : 96, pal, (e - 0.35) / 0.14);
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
  else if (S.best > 0) text(`BEST ${S.best.toLocaleString()}`, W / 2, H * 0.64, 14, pal.fg, { alpha: a * 0.55 });
  drawTiming(W / 2, H * 0.69, pal, a);
}

function drawWinScreen(pal, e) {
  if (e >= 0.6) once('title', () => Sound.sfxTick(1.0));
  stamp('STAGE CLEAR', W / 2, H * 0.15, 48, pal, (e - 0.6) / 0.2);

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
  const extras = [['GRAZE', String(s.graze)], ['MAX COMBO', String(S.maxCombo)], ['TIME', (S.clearT ?? S.endT).toFixed(1) + 's']];
  extras.forEach(([l, v], i) => {
    const t0 = 1.75 + i * 0.08;
    if (e < t0) return;
    once('x' + i, () => Sound.sfxTick(1.8 + i * 0.1));
    statCol(l, v, cx + cw * (i + 0.5) / 3, cy + 230, pal, ease((e - t0) / 0.2));
  });
  if (e >= 1.95) drawTiming(W / 2, cy + ch - 20, pal, ease((e - 1.95) / 0.2));
  // 랭크 도장
  const rk = (e - 2.25) / 0.13;
  if (rk > 0) {
    once('rank', () => { S.shake = 1.2; S.flash = 0.35; S.flashCol = '#ffffff'; Sound.sfxStamp(true); });
    const r = rank(), rcol = r === 'L' ? '#ffd23f' : pal.acc;
    // 등급 위 라벨: M/L 이면 이름(MASTER/LEGEND), 아니면 RANK
    if (RANK_NAME[r]) text(RANK_NAME[r], W / 2, H * 0.62, 20, rcol, { alpha: Math.min(1, rk) });
    else text('RANK', W / 2, H * 0.62, 13, pal.fg, { alpha: Math.min(1, rk) * 0.6 });
    ctx.save(); ctx.translate(W / 2, H * 0.71); ctx.rotate(-0.12);
    stamp(r, 0, 0, 130, pal, rk, rcol);
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
  ui.hits = [];   // 버튼 터치 영역은 매 프레임 그리면서 다시 등록
  if (S.mode === 'title') { drawMenu(pal, now); return; }

  const inCatch = S.catchT !== null && T >= S.catchT;
  const cp = inCatch ? Math.min(1, (T - S.catchT) / BEAT) : 0;
  const ht = inCatch ? S.catchT : T;   // 캐치 중엔 탄막 정지
  const zoom = 1 + S.pulse * 0.012 + cp * 0.07;
  const sh = S.shake * 14;
  ctx.save();
  ctx.translate(W / 2 + (Math.random() * 2 - 1) * sh, H / 2 + (Math.random() * 2 - 1) * sh);
  ctx.scale(zoom, zoom); ctx.translate(-W / 2, -H / 2);
  drawGrid(pal, T);
  drawWarning(T);
  drawProgress(pal, T);
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
    ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, W, H);   // 완전히 가림: 멈춰놓고 패턴 보며 예측하는 꼼수 방지
    chromaText('PAUSED', W / 2, H * 0.32, 60, PAL.dodge);
    button(W / 2, H * 0.46, 280, 64, 'RESUME', PAL.dodge, { primary: true }, () => setPaused(false));
    button(W / 2, H * 0.46 + 84, 280, 64, 'RETRY', PAL.dodge, {}, () => { setPaused(false); restartRun(); });
    button(W / 2, H * 0.46 + 168, 280, 64, 'STAGES', PAL.dodge, {}, () => { setPaused(false); goToSelect(); });
  } else if (S.mode === 'play') drawPauseButton(pal);
}

// ================= 메인 루프 =================
let lastNow = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastNow) / 1000); lastNow = now;
  let T = S.endT;
  if (S.mode === 'play' && !S.paused) {
    const run = S;
    pump(); T = songTime(); update(T, dt);
    if (S !== run) T = songTime();   // 연습 되감기로 새 판
    else if (S.mode !== 'play') T = S.endT;
  } else if (S.mode === 'play') T = S.displayT;
  const frozen = now < S.hitstopUntil;
  if (!frozen) { S.displayT = T; updateFx(dt); }
  S.pulse = Math.max(0, S.pulse - dt * 5);
  S.shake = Math.max(0, S.shake - dt * 3);
  S.flash = Math.max(0, S.flash - dt * 3.5);
  S.bossFlash = Math.max(0, S.bossFlash - dt);
  S.healPulse = Math.max(0, S.healPulse - dt * 2);
  S.bossShown += (S.bossHp - S.bossShown) * Math.min(1, dt * 3);
  if (S.mode === 'play') S.trail.push({ x: S.player.x, y: S.player.y, t: now });
  while (S.trail.length && now - S.trail[0].t > 140) S.trail.shift();
  draw(S.displayT, now);
  S.prevX = S.player.x; S.prevY = S.player.y;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ================= 입력: 상대 드래그 =================
let dragging = false, lx = 0, ly = 0, lt = 0;
function setPaused(v) {
  if (S.mode !== 'play' || !Sound.ctx) return;
  S.paused = v;
  v ? Sound.ctx.suspend() : Sound.ctx.resume();
}
// 화면 좌표 → 논리 좌표 (540×960)
function toLogical(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale];
}
let downX = 0, downY = 0, downAt = 0;
canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  Sound.init();
  const now = performance.now();
  const [tx, ty] = toLogical(e);
  downX = tx; downY = ty; downAt = now;
  dragging = true; lx = e.clientX; ly = e.clientY; lt = e.timeStamp;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  if (S.mode === 'title') { uiDown(tx, ty); return; }
  // 게임 중 일시정지 버튼은 누르는 즉시
  if (S.mode === 'play' && !S.paused && hitAt(tx, ty)) { tapAt(tx, ty); dragging = false; return; }
  if (S.mode === 'dead' || S.mode === 'win') {
    const el = (now - S.endReal) / 1000, rt = revealTime();
    if (el >= 0.3 && el < rt) { S.endReal = now - rt * 1000; dragging = false; }   // 연출 스킵
  }
});
// 탭 = 거의 안 움직이고 짧게 누름. 메뉴·일시정지·결과 화면 버튼은 손을 뗄 때 실행
canvas.addEventListener('pointerup', e => {
  if (!dragging) return;
  const [tx, ty] = toLogical(e);
  const tap = Math.hypot(tx - downX, ty - downY) < 18 && performance.now() - downAt < 600;
  if (S.mode === 'title') uiUp(tx, ty, tap);
  else if (tap && (S.paused || S.mode === 'dead' || S.mode === 'win')) tapAt(tx, ty);
});
canvas.addEventListener('pointermove', e => {
  if (!dragging) return;
  const dx = e.clientX - lx, dy = e.clientY - ly, dt = Math.max(1, e.timeStamp - lt);
  const base = SENS_LEVELS[opts.sens], acc = ACCEL_LEVELS[opts.accel];
  const gain = clamp(base + Math.hypot(dx, dy) / dt * acc, base, acc ? base * 1.75 : base);
  const k = gain / scale;
  if (S.mode === 'title') { uiMove(...toLogical(e)); lx = e.clientX; ly = e.clientY; lt = e.timeStamp; return; }
  if (S.mode === 'play' && !S.paused) {
    const p = S.player;
    p.x = clamp(p.x + dx * k, 12, W - 12);
    p.y = clamp(p.y + dy * k, 12, H - 12);
  }
  lx = e.clientX; ly = e.clientY; lt = e.timeStamp;
});
const endDrag = () => { dragging = false; };
canvas.addEventListener('pointerup', endDrag);   // 위의 탭 처리 다음에 실행
canvas.addEventListener('pointercancel', e => { if (S.mode === 'title' && dragging) uiUp(...toLogical(e), false); endDrag(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

// 키보드는 ESC 하나 (PC용): 게임 중 = 일시정지/이어하기, 메뉴 = 뒤로
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (S.mode === 'title') uiBack();
  else setPaused(!S.paused);
});
