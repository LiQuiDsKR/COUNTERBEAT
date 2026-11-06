'use strict';
// WebAudio 합성 phonk 키트. 음원 파일 없음 → 저작권 걱정 없고 싱크 완벽.
const Sound = (() => {
  let ac = null, comp, sfxOut, noiseBuf, hard, soft, bus = null, lastGraze = 0;
  let songBytes = null, songPromise = null, songBuf = null, songSrc = null, songGain = null, songLP = null;

  // ---- 곡(mp3) ----
  function preloadSong(url) { songBytes = fetch(url).then(r => r.arrayBuffer()); }
  function loadSong() {
    if (!songPromise) songPromise = songBytes.then(ab => ac.decodeAudioData(ab)).then(b => (songBuf = b));
    return songPromise;
  }
  function stopSong() { if (songSrc) { try { songSrc.stop(); } catch (_) {} songSrc = null; } }
  // when: ctx 시간, offset: 파일 내 위치(초)
  // 곡 → 로우패스(DJ 필터) → 게인 → 버스
  const DODGE_LP = 1800, DODGE_GAIN = 0.85;
  const CATCH_LP = 520, CATCH_GAIN = 0.6;    // 캐치 박에 빨아들이는 정도 (이전 140Hz / 0.12 → 너무 사라짐)
  function playSong(when, offset, phase) {
    stopSong();
    songGain = ac.createGain(); songGain.connect(bus);
    songLP = ac.createBiquadFilter(); songLP.type = 'lowpass'; songLP.Q.value = 0.9;
    songLP.connect(songGain);
    const open = phase === 'strike';
    songLP.frequency.value = open ? 20000 : DODGE_LP;
    songGain.gain.value = open ? 1 : DODGE_GAIN;
    songSrc = ac.createBufferSource(); songSrc.buffer = songBuf;
    songSrc.connect(songLP); songSrc.start(when, Math.max(0, offset));
  }
  // 회피: 먹먹하게 (부드럽게 닫힘)
  function songDodge(t) {
    if (!songLP) return;
    songLP.frequency.cancelScheduledValues(t); songGain.gain.cancelScheduledValues(t);
    songLP.frequency.setTargetAtTime(DODGE_LP, t, 0.12);
    songGain.gain.setTargetAtTime(DODGE_GAIN, t, 0.12);
  }
  // 캐치: 1박 동안 필터를 확 닫으며 빨아들임
  function songCatch(t, dur) {
    if (!songLP) return;
    const f = songLP.frequency, g = songGain.gain;
    f.cancelScheduledValues(t); g.cancelScheduledValues(t);
    f.setValueAtTime(DODGE_LP, t); f.exponentialRampToValueAtTime(CATCH_LP, t + dur * 0.85);
    g.setValueAtTime(DODGE_GAIN, t); g.linearRampToValueAtTime(CATCH_GAIN, t + dur * 0.85);
  }
  // 필터 효과 끄기: 즉시 원음
  function songOpen(t) {
    if (!songLP) return;
    songLP.frequency.cancelScheduledValues(t); songGain.gain.cancelScheduledValues(t);
    songLP.frequency.setValueAtTime(20000, t); songGain.gain.setValueAtTime(1, t);
  }
  // 반격: 드롭 박에 필터 활짝
  function songStrike(t) {
    if (!songLP) return;
    const f = songLP.frequency, g = songGain.gain;
    f.cancelScheduledValues(t - 0.01); g.cancelScheduledValues(t - 0.01);
    f.setValueAtTime(CATCH_LP, t - 0.01); f.exponentialRampToValueAtTime(20000, t + 0.015);
    g.setValueAtTime(CATCH_GAIN, t - 0.01); g.linearRampToValueAtTime(1, t + 0.01);
  }

  const makeCurve = k => {
    const n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
    return c;
  };

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    ac = new AC({ latencyHint: 'interactive' });
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 6; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.12;
    const master = ac.createGain(); master.gain.value = 0.9;
    comp.connect(master); master.connect(ac.destination);
    sfxOut = ac.createGain(); sfxOut.gain.value = 0.7; sfxOut.connect(comp);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    hard = makeCurve(7); soft = makeCurve(2.2);
    if (ac.state === 'suspended') ac.resume();
    if (songBytes) loadSong();
  }

  // 판마다 새 버스. 재시작 시 이전 판 예약음 즉시 컷.
  function newBus() {
    if (bus) {
      const old = bus, t = ac.currentTime;
      old.gain.cancelScheduledValues(t); old.gain.setValueAtTime(old.gain.value, t);
      old.gain.linearRampToValueAtTime(0, t + 0.05);
      setTimeout(() => { try { old.disconnect(); } catch (_) {} }, 400);
    }
    bus = ac.createGain(); bus.gain.value = 1; bus.connect(comp);
  }
  function fadeOut(sec) {
    if (!bus) return;
    const t = ac.currentTime, g = bus.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.0001, t + sec);
  }

  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  function noiseSrc(t, dur) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    s.start(t, Math.random()); s.stop(t + dur); return s;
  }
  function osc(type, f, t, dur) {
    const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    o.start(t); o.stop(t + dur); return o;
  }

  function kick(t, big = false, out = bus) {
    const o = osc('sine', big ? 200 : 165, t, 0.8), g = ac.createGain();
    o.frequency.exponentialRampToValueAtTime(43, t + (big ? 0.16 : 0.11));
    env(g, t, 0.002, big ? 1.15 : 0.95, big ? 0.55 : 0.33);
    o.connect(g).connect(out);
    const c = noiseSrc(t, 0.02), cg = ac.createGain(), hp = ac.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 3000; env(cg, t, 0.0005, 0.25, 0.012);
    c.connect(hp).connect(cg).connect(out);
  }
  // 찢어지는 808
  function bass(t, f, dur, vol = 0.8, out = bus) {
    const o = osc('sine', f * 2.2, t, dur + 0.2), pre = ac.createGain(), sh = ac.createWaveShaper(),
      lp = ac.createBiquadFilter(), g = ac.createGain();
    o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    pre.gain.value = 1.4; sh.curve = hard; lp.type = 'lowpass'; lp.frequency.value = 900;
    env(g, t, 0.003, vol, dur);
    o.connect(pre).connect(sh).connect(lp).connect(g).connect(out);
  }
  function clap(t, vol = 0.45, out = bus) {
    const s = noiseSrc(t, 0.35), bp = ac.createBiquadFilter(), g = ac.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.9;
    g.gain.setValueAtTime(0.0001, t);
    for (const o of [0, 0.011, 0.022]) {
      g.gain.setValueAtTime(vol, t + o);
      g.gain.exponentialRampToValueAtTime(vol * 0.25, t + o + 0.009);
    }
    g.gain.setValueAtTime(vol * 0.8, t + 0.033);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    s.connect(bp).connect(g).connect(out);
  }
  function hat(t, vol = 0.1, len = 0.035, out = bus) {
    const s = noiseSrc(t, len + 0.05), hp = ac.createBiquadFilter(), g = ac.createGain();
    hp.type = 'highpass'; hp.frequency.value = 7800; env(g, t, 0.001, vol, len);
    s.connect(hp).connect(g).connect(out);
  }
  // 808 카우벨 (두 사각파 비율 1.48)
  function bell(t, f, vol = 0.22, out = bus) {
    const bp = ac.createBiquadFilter(), sh = ac.createWaveShaper(), g = ac.createGain();
    bp.type = 'bandpass'; bp.frequency.value = f * 1.25; bp.Q.value = 1.4; sh.curve = soft;
    for (const m of [1, 1.48]) osc('square', f * m, t, 0.5).connect(bp);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(vol * 0.3, t + 0.035);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    bp.connect(sh).connect(g).connect(out);
  }
  function crash(t, vol = 0.3, out = bus) {
    const s = noiseSrc(t, 2), hp = ac.createBiquadFilter(), g = ac.createGain();
    hp.type = 'highpass'; hp.frequency.value = 4000; env(g, t, 0.002, vol, 1.6);
    s.connect(hp).connect(g).connect(out);
  }
  function riser(t, dur, out = bus) {
    const s = noiseSrc(t, dur), bp = ac.createBiquadFilter(), g = ac.createGain();
    bp.type = 'bandpass'; bp.Q.value = 3;
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(8000, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + dur - 0.005);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(bp).connect(g).connect(out);
  }
  function roar(t, out = bus) {
    const o = osc('sawtooth', 150, t, 0.6), o2 = osc('sawtooth', 153, t, 0.6),
      sh = ac.createWaveShaper(), lp = ac.createBiquadFilter(), g = ac.createGain();
    o.frequency.exponentialRampToValueAtTime(38, t + 0.45);
    o2.frequency.exponentialRampToValueAtTime(37, t + 0.45);
    sh.curve = hard; lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2500, t); lp.frequency.exponentialRampToValueAtTime(180, t + 0.45);
    env(g, t, 0.01, 0.4, 0.42);
    o.connect(sh); o2.connect(sh); sh.connect(lp).connect(g).connect(out);
  }

  // ---- 즉발 효과음 ----
  // 베기: 콤보마다 음이 올라가며 멜로디 형성
  function sfxSlash(j, f, fin) {
    const t = ac.currentTime;
    const s = noiseSrc(t, 0.2), hp = ac.createBiquadFilter(), g = ac.createGain();
    hp.type = 'highpass'; hp.frequency.setValueAtTime(5000, t); hp.frequency.exponentialRampToValueAtTime(1200, t + 0.08);
    env(g, t, 0.001, fin ? 0.6 : 0.35, fin ? 0.25 : 0.09);
    s.connect(hp).connect(g).connect(sfxOut);
    const o = osc('triangle', f, t, 0.3), og = ac.createGain();
    env(og, t, 0.002, j === 'perfect' ? 0.35 : 0.22, 0.2); o.connect(og).connect(sfxOut);
    if (j === 'perfect') {
      const o2 = osc('sine', f * 2, t, 0.3), g2 = ac.createGain();
      env(g2, t, 0.002, 0.15, 0.25); o2.connect(g2).connect(sfxOut);
    }
  }
  // ---- 장애물 사운드 후보 (lab.html에서 골라서 저장) ----
  // 모두 고정 음높이: 레이저에 멜로디 없음
  function outP(p = 0) { const n = ac.createStereoPanner(); n.pan.value = Math.max(-0.7, Math.min(0.7, p)); n.connect(bus); return n; }
  function nz(t, dur, type, freq, q, peak, dec, o) {
    const s = noiseSrc(t, dur), f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    env(g, t, 0.001, peak, dec); s.connect(f).connect(g).connect(o); return f;
  }
  const LASERS = [
    { name: 'Heavy Beam', desc: '찢어지는 저음 톱니 빔, 필터가 닫히며 끝남', play(t, p) {
      const o = outP(p), sh = ac.createWaveShaper(), lp = ac.createBiquadFilter(), g = ac.createGain();
      sh.curve = hard; lp.type = 'lowpass'; lp.Q.value = 4;
      lp.frequency.setValueAtTime(3500, t); lp.frequency.exponentialRampToValueAtTime(250, t + 0.24);
      env(g, t, 0.003, 0.3, 0.26);
      for (const f of [55, 55.8, 110.5]) osc('sawtooth', f, t, 0.35).connect(sh);
      sh.connect(lp).connect(g).connect(o);
      nz(t, 0.15, 'highpass', 2200, 0, 0.18, 0.08, o);
    } },
    { name: 'Railgun', desc: '날카로운 크랙 + 서브 드롭 (사용 중)', play(t, p) {
      const o = outP(p);
      nz(t, 0.08, 'bandpass', 3500, 0.8, 0.55, 0.035, o);
      const s = osc('sine', 150, t, 0.4), g = ac.createGain();
      s.frequency.exponentialRampToValueAtTime(32, t + 0.25); env(g, t, 0.001, 0.75, 0.3); s.connect(g).connect(o);
      const tail = nz(t, 0.45, 'lowpass', 1400, 0, 0.16, 0.35, o);
      tail.frequency.exponentialRampToValueAtTime(200, t + 0.35);
    } },
    { name: 'Plasma Zap', desc: '짧고 굵은 디스토션 잽', play(t, p) {
      const o = outP(p), q = osc('square', 420, t, 0.25), sh = ac.createWaveShaper(), lp = ac.createBiquadFilter(), g = ac.createGain();
      q.frequency.exponentialRampToValueAtTime(70, t + 0.06);
      sh.curve = hard; lp.type = 'lowpass'; lp.frequency.value = 2200; env(g, t, 0.002, 0.22, 0.18);
      q.connect(sh).connect(lp).connect(g).connect(o);
      nz(t, 0.06, 'highpass', 4000, 0, 0.12, 0.03, o);
    } },
    { name: 'Reese Blast', desc: '두꺼운 리스 베이스 + 쿵', play(t, p) {
      const o = outP(p), sh = ac.createWaveShaper(), lp = ac.createBiquadFilter(), g = ac.createGain();
      sh.curve = hard; lp.type = 'lowpass'; lp.Q.value = 6;
      lp.frequency.setValueAtTime(1800, t); lp.frequency.exponentialRampToValueAtTime(450, t + 0.3);
      env(g, t, 0.004, 0.32, 0.32);
      for (const f of [41.2, 42.5, 82.4]) osc('sawtooth', f, t, 0.4).connect(sh);
      sh.connect(lp).connect(g).connect(o);
      const k = osc('sine', 95, t, 0.3), kg = ac.createGain();
      k.frequency.exponentialRampToValueAtTime(40, t + 0.1); env(kg, t, 0.001, 0.6, 0.18); k.connect(kg).connect(o);
    } },
  ];
  const SLAMS = [
    { name: 'Original', desc: '빅 킥 + 808 + 크래시 (처음 버전)', play(t, p) {
      const o = outP(p); kick(t, true, o); bass(t, 55, 0.9, 1.0, o); crash(t, 0.18, o);
    } },
    { name: 'Impact Boom', desc: '깊은 저음 붐 + 먹먹한 노이즈', play(t, p) {
      const o = outP(p), s = osc('sine', 110, t, 0.7), g = ac.createGain();
      s.frequency.exponentialRampToValueAtTime(30, t + 0.4); env(g, t, 0.002, 1.0, 0.5); s.connect(g).connect(o);
      const f = nz(t, 0.7, 'lowpass', 2500, 0, 0.55, 0.45, o); f.frequency.exponentialRampToValueAtTime(180, t + 0.45);
    } },
    { name: 'Metal Slam', desc: '킥 + 쇠 문짝 쾅', play(t, p) {
      const o = outP(p); kick(t, true, o);
      const bp = ac.createBiquadFilter(), g = ac.createGain(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 2.5;
      for (const f of [233, 347, 512, 789, 1121]) osc('square', f, t, 0.8).connect(bp);
      env(g, t, 0.001, 0.16, 0.55); bp.connect(g).connect(o);
      crash(t, 0.22, o);
    } },
    { name: 'Sub Drop', desc: '킥 + 길게 떨어지는 서브', play(t, p) {
      const o = outP(p); kick(t, true, o);
      const s = osc('sine', 95, t, 1.3), sh = ac.createWaveShaper(), g = ac.createGain();
      s.frequency.exponentialRampToValueAtTime(28, t + 1.0); sh.curve = soft;
      env(g, t, 0.003, 0.9, 1.1); s.connect(sh).connect(g).connect(o);
    } },
    { name: 'Glitch Crush', desc: '끊기는 디지털 파쇄음 (사용 중)', play(t, p) {
      const o = outP(p); kick(t, true, o);
      for (let i = 0; i < 4; i++) {
        const tt = t + i * 0.045, sh = ac.createWaveShaper(), g = ac.createGain(); sh.curve = hard;
        const q = osc('square', 60 + i * 7, tt, 0.05); const n = noiseSrc(tt, 0.05);
        q.connect(sh); n.connect(sh); env(g, tt, 0.001, 0.22 * (1 - i * 0.18), 0.035); sh.connect(g).connect(o);
      }
    } },
    { name: 'Thunder', desc: '킥 + 길게 울리는 천둥', play(t, p) {
      const o = outP(p); kick(t, true, o);
      const f = nz(t, 1.6, 'lowpass', 900, 0.7, 0.65, 1.3, o); f.frequency.exponentialRampToValueAtTime(110, t + 1.2);
      crash(t, 0.12, o);
    } },
  ];

  // 체력 회복: 짧게 올라가는 차임
  function sfxHeal() {
    const t = ac.currentTime;
    [[587.33, 0], [880, 0.07], [1174.66, 0.14]].forEach(([f, d]) => {
      const o = osc('sine', f, t + d, 0.4), g = ac.createGain();
      env(g, t + d, 0.003, 0.14, 0.3); o.connect(g).connect(sfxOut);
    });
  }
  function sfxGraze() {
    const t = ac.currentTime; if (t - lastGraze < 0.03) return; lastGraze = t;
    const o = osc('sine', 2600 + Math.random() * 400, t, 0.06), g = ac.createGain();
    env(g, t, 0.001, 0.05, 0.035); o.connect(g).connect(sfxOut);
  }
  function sfxHit() {
    const t = ac.currentTime;
    const s = noiseSrc(t, 0.4), lp = ac.createBiquadFilter(), g = ac.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 1200; env(g, t, 0.002, 0.6, 0.3);
    s.connect(lp).connect(g).connect(sfxOut);
    const o = osc('square', 90, t, 0.35), og = ac.createGain();
    o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    env(og, t, 0.002, 0.3, 0.3); o.connect(og).connect(sfxOut);
  }
  // 결과창 행 등장 틱
  function sfxTick(mul = 1) {
    const t = ac.currentTime;
    hat(t, 0.12, 0.03, sfxOut);
    const o = osc('triangle', 587.33 * mul, t, 0.12), g = ac.createGain();
    env(g, t, 0.001, 0.12, 0.08); o.connect(g).connect(sfxOut);
  }
  // 도장 쾅
  function sfxStamp(big) {
    const t = ac.currentTime;
    kick(t, true, sfxOut); clap(t, big ? 0.6 : 0.4, sfxOut);
    if (big) crash(t, 0.3, sfxOut);
  }
  function sfxBoom() { const t = ac.currentTime; kick(t, true, sfxOut); crash(t, 0.4, sfxOut); roar(t, sfxOut); }

  return {
    init, newBus, fadeOut, kick, bass, clap, hat, bell, crash, riser, roar,
    sfxSlash, sfxGraze, sfxHeal, sfxHit, sfxBoom, sfxTick, sfxStamp,
    preloadSong, loadSong, playSong, stopSong, songDodge, songCatch, songStrike, songOpen,
    LASERS, SLAMS,
    get ctx() { return ac; },
    get songBuf() { return songBuf; },
  };
})();
