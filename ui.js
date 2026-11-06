'use strict';
// ================= 메뉴 UI: 로비 / 스테이지 선택 / 설정 + 버튼 시스템 =================
// 버튼은 그리는 순간 터치 영역(ui.hits)을 등록 → 손을 뗄 때 tapAt 으로 실행 (즉시 모드 UI).
// 새 화면(상점 등)을 추가할 땐: ui.screen 값 추가 → drawMenu 에서 그리기 → button() 으로 버튼 등록.

const ui = {
  screen: 'lobby',        // 'lobby' | 'select' (게임 중엔 S.mode 가 'play'/'dead'/'win')
  settings: false,        // 설정 오버레이
  hits: [],               // 이번 프레임에 그린 버튼들 {x, y, w, h, fn}
  idx: 0, pos: 0,         // 스테이지 선택: 고른 카드 / 화면상 위치(애니메이션)
  drag: null,
  toast: null,
  lastNow: performance.now(),
};

// ---------- 버튼 ----------
// (cx, cy) 중심, o: { primary, disabled, pulse(0~1), size, color }
function button(cx, cy, w, h, label, pal, o, fn) {
  const x = cx - w / 2, y = cy - h / 2;
  const col = o.color || pal.acc;
  const a = (o.disabled ? 0.35 : 1) * (o.pulse !== undefined ? 1 - o.pulse * 0.45 : 1);
  ctx.globalAlpha = a;
  if (o.primary) { ctx.fillStyle = col; ctx.globalAlpha = a * 0.14; ctx.fillRect(x, y, w, h); ctx.globalAlpha = a; }
  ctx.strokeStyle = o.primary ? col : `rgba(${pal.grid},0.45)`; ctx.lineWidth = o.primary ? 3 : 2;
  ctx.strokeRect(x, y, w, h);
  ctx.globalAlpha = 1;
  text(label, cx, cy + 1, o.size || 24, o.primary ? col : pal.fg, { alpha: a });
  if (fn && !o.disabled) ui.hits.push({ x, y, w, h, fn });
}
function hitAt(x, y) {
  for (let i = ui.hits.length - 1; i >= 0; i--) {
    const h = ui.hits[i];
    if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
  }
  return null;
}
function tapAt(x, y) {
  const h = hitAt(x, y);
  if (!h) return false;
  if (Sound.ctx) { Sound.ensureBus(); Sound.sfxTick(1.5); }
  h.fn();
  return true;
}
function toast(msg) { ui.toast = { msg, until: performance.now() + 1200 }; }

// ---------- 아이콘 ----------
function iconGear(x, y, r, col) {
  ctx.strokeStyle = col; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55);
    ctx.lineTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8); ctx.stroke();
  }
}
function iconBag(x, y, r, col) {
  ctx.strokeStyle = col; ctx.lineWidth = 4;
  ctx.strokeRect(x - r * 0.6, y - r * 0.3, r * 1.2, r * 0.95);
  ctx.beginPath(); ctx.arc(x, y - r * 0.3, r * 0.32, Math.PI, 0); ctx.stroke();
}
function iconLock(x, y, r, col) {
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = r * 0.16;
  ctx.beginPath(); ctx.arc(x, y - r * 0.15, r * 0.42, Math.PI, 0); ctx.stroke();
  ctx.fillRect(x - r * 0.62, y - r * 0.15, r * 1.24, r * 0.95);
}
function iconBack(x, y, col) {
  ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x + 8, y - 14); ctx.lineTo(x - 6, y); ctx.lineTo(x + 8, y + 14); ctx.stroke();
  ctx.lineCap = 'butt';
}
function chevron(x, y, dir, col) {
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(x + dir * 10, y); ctx.lineTo(x - dir * 8, y - 12); ctx.lineTo(x - dir * 8, y + 12); ctx.closePath(); ctx.fill();
}

// ---------- 메뉴 그리기 (S.mode === 'title') ----------
function drawMenu(pal, now) {
  const dt = Math.min(0.05, (now - ui.lastNow) / 1000); ui.lastNow = now;
  const t = now / 1000;
  S.pulse = Math.max(0, 1 - ((t % BEAT) / BEAT) * 3);
  drawGrid(pal, t);
  if (ui.screen === 'select') drawSelect(pal, now, dt);
  else drawLobby(pal, now);
  if (ui.settings) { ui.hits = []; drawSettings(pal); }
  if (ui.toast && now < ui.toast.until) text(ui.toast.msg, W / 2, H * 0.78, 22, pal.acc, { alpha: Math.min(1, (ui.toast.until - now) / 300) });
}

// ---------- 로비 ----------
// 하단 탭바: 메뉴를 늘릴 땐 여기에 항목만 추가 (soon: 준비 중 표시)
const LOBBY_TABS = [
  { label: 'SHOP', icon: iconBag, soon: true },
  { label: 'SETTINGS', icon: iconGear, onTap: () => { ui.settings = true; } },
];
function drawLobby(pal, now) {
  const t = now / 1000, bp = (t % BEAT) / BEAT;
  drawBoss(pal, t);
  chromaText('COUNTERBEAT', W / 2, 450, 52, pal);
  button(W / 2, 640, 300, 88, 'PLAY', pal, { primary: true, pulse: bp, size: 38 }, () => { ui.screen = 'select'; ui.pos = ui.idx; });
  // 탭바
  const top = H - 128, n = LOBBY_TABS.length, tw = W / n;
  ctx.fillStyle = `rgba(${pal.grid},0.04)`; ctx.fillRect(0, top, W, H - top);
  ctx.fillStyle = `rgba(${pal.grid},0.15)`; ctx.fillRect(0, top, W, 1);
  LOBBY_TABS.forEach((tab, i) => {
    const cx = tw * (i + 0.5), a = tab.soon ? 0.35 : 0.85;
    ctx.globalAlpha = a; tab.icon(cx, top + 50, 30, pal.fg); ctx.globalAlpha = 1;
    text(tab.label, cx, top + 96, 14, pal.fg, { alpha: a });
    if (tab.soon) text('SOON', cx + 34, top + 24, 11, pal.acc, { alpha: 0.9 });
    ui.hits.push({ x: tw * i, y: top, w: tw, h: H - top, fn: tab.soon ? () => toast('COMING SOON') : tab.onTap });
  });
}

// ---------- 스테이지 선택 (좌우로 넘기는 카드) ----------
const CARD_W = 360, CARD_H = 540, CARD_GAP = 380, CARD_Y = 440;
function drawSelect(pal, now, dt) {
  if (!ui.drag) ui.pos += (ui.idx - ui.pos) * Math.min(1, dt * 12);
  // 위쪽 바
  iconBack(44, 62, pal.fg);
  ui.hits.push({ x: 0, y: 20, w: 100, h: 84, fn: () => { ui.screen = 'lobby'; } });
  text('STAGE SELECT', W / 2, 62, 22, pal.fg);
  // 카드: 가운데에서 멀수록 작고 흐리게
  STAGES.forEach((st, i) => {
    const off = i - ui.pos;
    if (Math.abs(off) > 1.6) return;
    const k = Math.min(1, Math.abs(off));
    drawStageCard(st, W / 2 + off * CARD_GAP, CARD_Y, 1 - k * 0.12, 1 - k * 0.5, pal, now);
    if (i !== ui.idx) {   // 옆 카드 탭 = 그 카드로 이동
      const cx = W / 2 + off * CARD_GAP;
      ui.hits.push({ x: cx - CARD_W * 0.44, y: CARD_Y - CARD_H * 0.44, w: CARD_W * 0.88, h: CARD_H * 0.88, fn: () => { ui.idx = i; } });
    }
  });
  // 좌우 화살표
  if (ui.idx > 0) { chevron(26, CARD_Y, -1, pal.acc); ui.hits.push({ x: 0, y: CARD_Y - 60, w: 56, h: 120, fn: () => { ui.idx--; } }); }
  if (ui.idx < STAGES.length - 1) { chevron(W - 26, CARD_Y, 1, pal.acc); ui.hits.push({ x: W - 56, y: CARD_Y - 60, w: 56, h: 120, fn: () => { ui.idx++; } }); }
  // 점
  STAGES.forEach((st, i) => {
    ctx.fillStyle = i === ui.idx ? (st.color || pal.acc) : `rgba(${pal.grid},0.25)`;
    ctx.beginPath(); ctx.arc(W / 2 + (i - (STAGES.length - 1) / 2) * 22, CARD_Y + CARD_H / 2 + 34, i === ui.idx ? 6 : 4, 0, Math.PI * 2); ctx.fill();
  });
  // 시작 버튼
  const st = STAGES[ui.idx], bp = (now / 1000 % BEAT) / BEAT;
  const label = st.locked ? 'LOCKED' : pendingStart ? 'LOADING' : 'START';
  button(W / 2, 870, 300, 80, label, pal, { primary: !st.locked, disabled: st.locked || pendingStart, pulse: st.locked ? undefined : bp, size: 32, color: st.color },
    () => { if (STAGE !== st) setStage(st); startRun(); });
}
function drawStageCard(st, cx, cy, sc, alpha, pal, now) {
  const col = st.color || pal.acc;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.globalAlpha = alpha;
  ctx.fillStyle = `rgba(${pal.grid},0.04)`; ctx.fillRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H);
  ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.globalAlpha = alpha * (st.locked ? 0.35 : 0.9);
  ctx.strokeRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H);
  ctx.globalAlpha = alpha;
  const num = String(st.id).padStart(2, '0');
  text('STAGE', 0, -CARD_H / 2 + 48, 15, pal.fg, { alpha: alpha * 0.6 });
  if (st.locked) {
    text(num, 0, -120, 110, pal.fg, { alpha: alpha * 0.2 });
    ctx.globalAlpha = alpha * 0.5; iconLock(0, 40, 56, pal.fg); ctx.globalAlpha = alpha;
    text('COMING SOON', 0, 150, 20, pal.fg, { alpha: alpha * 0.5 });
  } else {
    const song = SONGS[st.song];
    chromaText(num, 0, -120, 110, pal, alpha, col);
    text(st.name, 0, -20, 30, pal.fg, { alpha });
    text(`${song ? song.bpm : BPM} BPM`, 0, 16, 15, pal.fg, { alpha: alpha * 0.6 });
    // 난이도 별
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < (st.diff || 1) ? col : `rgba(${pal.grid},0.2)`;
      ctx.globalAlpha = alpha; ctx.save(); ctx.translate((i - 2) * 30, 62); ctx.rotate(Math.PI / 4); ctx.fillRect(-8, -8, 16, 16); ctx.restore();
    }
    ctx.fillStyle = `rgba(${pal.grid},0.12)`; ctx.fillRect(-CARD_W / 2 + 30, 104, CARD_W - 60, 1);
    const best = stageBest(st), rk = stageRank(st);
    text('BEST', -70, 140, 13, pal.fg, { alpha: alpha * 0.55 });
    text(best ? best.toLocaleString() : '-', -70, 176, 28, pal.fg, { alpha });
    text('RANK', 90, 140, 13, pal.fg, { alpha: alpha * 0.55 });
    text(rk || '-', 90, 178, 36, rk === 'L' ? '#ffd23f' : rk ? col : pal.fg, { alpha });
  }
  ctx.restore(); ctx.globalAlpha = 1;
}

// ---------- 설정 오버레이 ----------
// 언어: 현재는 설정 화면 문구에만 적용 (한·영·일·중)
const LANGS = ['ko', 'en', 'ja', 'zh'];
const LANG_NAME = { ko: '한국어', en: 'English', ja: '日本語', zh: '中文' };
const I18N = {
  lang:   { ko: '언어', en: 'Language', ja: '言語', zh: '语言' },
  vol:    { ko: '전체 볼륨', en: 'Master Volume', ja: '全体音量', zh: '总音量' },
  mvol:   { ko: '음악 볼륨', en: 'Music Volume', ja: '音楽音量', zh: '音乐音量' },
  sens:   { ko: '이동 감도', en: 'Sensitivity', ja: '移動感度', zh: '移动灵敏度' },
  accel:  { ko: '가속', en: 'Acceleration', ja: '加速', zh: '加速' },
  laser:  { ko: '레이저 소리', en: 'Laser Sound', ja: 'レーザー音', zh: '激光音效' },
  slam:   { ko: '블라스트 소리', en: 'Blast Sound', ja: 'ブラスト音', zh: '爆破音效' },
  filter: { ko: 'DJ 필터', en: 'DJ Filter', ja: 'DJフィルター', zh: 'DJ滤波' },
  sync:   { ko: '싱크 보정', en: 'Sync Offset', ja: '同期補正', zh: '同步校准' },
};
const ACCEL_NAME = { ko: ['OFF', '약', '중', '강'], en: ['OFF', 'Low', 'Mid', 'High'], ja: ['OFF', '弱', '中', '強'], zh: ['OFF', '弱', '中', '强'] };
const tr = key => I18N[key][opts.lang] || I18N[key].en;

const SET_Y0 = 196, SET_DY = 72;
const SETTINGS = [
  { key: 'lang', get: () => LANG_NAME[opts.lang],
    step: d => { opts.lang = LANGS[(LANGS.indexOf(opts.lang) + d + LANGS.length) % LANGS.length]; } },
  { key: 'vol', get: () => `${opts.vol * 10}%`,
    step: d => { opts.vol = clamp(opts.vol + d, 0, 10); applyVolume(); preview(Sound.SLAMS[opts.slam]); } },
  { key: 'mvol', get: () => `${opts.mvol * 10}%`, step: d => { opts.mvol = clamp(opts.mvol + d, 0, 10); applyVolume(); } },
  { key: 'sens', get: () => `${opts.sens + 1}`, step: d => { opts.sens = clamp(opts.sens + d, 0, SENS_LEVELS.length - 1); } },
  { key: 'accel', get: () => (ACCEL_NAME[opts.lang] || ACCEL_NAME.en)[opts.accel],
    step: d => { opts.accel = clamp(opts.accel + d, 0, ACCEL_LEVELS.length - 1); } },
  { key: 'laser', get: () => Sound.LASERS[opts.laser].name,
    step: d => { opts.laser = (opts.laser + d + Sound.LASERS.length) % Sound.LASERS.length; preview(Sound.LASERS[opts.laser]); } },
  { key: 'slam', get: () => Sound.SLAMS[opts.slam].name,
    step: d => { opts.slam = (opts.slam + d + Sound.SLAMS.length) % Sound.SLAMS.length; preview(Sound.SLAMS[opts.slam]); } },
  { key: 'filter', get: () => opts.filter ? 'ON' : 'OFF', step: () => { opts.filter = !opts.filter; } },
  { key: 'sync', get: () => `${Math.round(opts.offset * 1000)}ms`,
    step: d => { opts.offset = Math.round((opts.offset + d * 0.01) * 100) / 100; } },
];
function preview(snd) { Sound.init(); Sound.ensureBus(); snd.play(Sound.ctx.currentTime + 0.03, 0); }
function drawSettings(pal) {
  ctx.fillStyle = 'rgba(7,7,12,0.97)'; ctx.fillRect(0, 0, W, H);
  chromaText('SETTINGS', W / 2, 110, 44, pal);
  const cjk = { font: FONT_KO, weight: 700 };
  SETTINGS.forEach((it, i) => {
    const y = SET_Y0 + i * SET_DY, v = it.get();
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(30, y - 28, W - 60, 56);
    text(tr(it.key), 52, y, 19, pal.fg, { ...cjk, align: 'left' });
    chevron(262, y, -1, pal.acc); chevron(498, y, 1, pal.acc);
    text(v, 380, y, v.length > 8 ? 17 : 21, pal.fg, /[^\x00-\x7f]/.test(v) ? cjk : {});
    // 값 영역 왼쪽 절반 = 이전, 오른쪽 절반 = 다음
    ui.hits.push({ x: 230, y: y - 32, w: 150, h: 64, fn: () => { it.step(-1); saveOpts(); } });
    ui.hits.push({ x: 380, y: y - 32, w: 150, h: 64, fn: () => { it.step(1); saveOpts(); } });
  });
  button(W / 2, SET_Y0 + SETTINGS.length * SET_DY + 40, 200, 56, 'BACK', pal, { primary: true }, () => { ui.settings = false; saveOpts(); });
}

// ---------- 게임 중 일시정지 버튼 (왼쪽 위) ----------
function drawPauseButton(pal) {
  const x = 36, y = 58;
  ctx.fillStyle = pal.fg; ctx.globalAlpha = 0.7;
  ctx.fillRect(x - 9, y - 12, 6, 24); ctx.fillRect(x + 3, y - 12, 6, 24);
  ctx.globalAlpha = 1;
  ui.hits.push({ x: x - 30, y: y - 30, w: 60, h: 60, fn: () => setPaused(true) });
}

// ---------- 메뉴 입력 ----------
function uiDown(x, y) {
  if (ui.screen === 'select' && !ui.settings) ui.drag = { x0: x, pos0: ui.pos, lastX: x, lastT: performance.now(), vx: 0 };
}
function uiMove(x, y) {
  const d = ui.drag;
  if (!d) return;
  const now = performance.now();
  d.vx = (x - d.lastX) / Math.max(1, now - d.lastT); d.lastX = x; d.lastT = now;
  ui.pos = clamp(d.pos0 - (x - d.x0) / CARD_GAP, -0.35, STAGES.length - 0.65);
}
function uiUp(x, y, tap) {
  const d = ui.drag;
  ui.drag = null;
  if (tap) { tapAt(x, y); return; }
  if (!d) return;
  // 놓으면 가까운 카드로 스냅. 빠르게 휙 넘기면 한 장 넘어감
  let target = Math.round(ui.pos);
  if (target === ui.idx && Math.abs(d.vx) > 0.4) target = ui.idx - Math.sign(d.vx);
  ui.idx = clamp(target, 0, STAGES.length - 1);
}
function uiBack() {
  if (ui.settings) { ui.settings = false; saveOpts(); }
  else if (ui.screen === 'select') ui.screen = 'lobby';
}
