// 효과음 + 절차 생성 신스웨이브 BGM (외부 파일 없음, 전부 WebAudio로 합성)
let ac = null, master, sfxGain, musicGain;
let sfxOn = true, musicOn = true, intensity = 0;

export function initAudio() {
  if (ac) return;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
    sfxGain = ac.createGain(); sfxGain.connect(master);
    musicGain = ac.createGain(); musicGain.gain.value = 0; musicGain.connect(master);
    applyGains();
    startMusic();
  } catch {}
}
export function resumeAudio() { if (ac && ac.state === 'suspended') ac.resume(); }
// 탭이 가려지면 정지. (백그라운드에서는 setInterval이 1초로 쓰로틀되어 BGM이 끊김)
export function suspendAudio() { if (ac && ac.state === 'running') ac.suspend(); }
export function setAudio({ sfx, music }) { sfxOn = sfx; musicOn = music; applyGains(); }
function applyGains() {
  if (!ac) return;
  sfxGain.gain.value = sfxOn ? 1 : 0;
  musicGain.gain.setTargetAtTime(musicOn ? 0.42 : 0, ac.currentTime, 0.15);
}

// ---------- 효과음 ----------
export function beep(freq, dur, type = 'square', vol = 0.08, slide = 0) {
  if (!ac || !sfxOn) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfxGain); o.start(t); o.stop(t + dur);
}
export function arpeggio(notes, type = 'triangle', gap = 70, vol = 0.07) {
  notes.forEach((n, i) => setTimeout(() => beep(n, 0.14, type, vol), i * gap));
}
export function crash(vol = 0.18) { if (!ac || !sfxOn) return; noise(ac.currentTime, 0.35, vol, 300, sfxGain); beep(120, 0.3, 'sawtooth', 0.1, -70); }

// ---------- BGM 시퀀서 ----------
const BPM = 126, STEP = 60 / BPM / 4;
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
const BASS = [0, 0, 12, 0, 0, 12, 0, 0, 0, 0, 12, 0, 12, 0, 0, 12];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
let nextT = 0, step = 0, timer = null, noiseBuf = null;

export function startMusic() { if (!ac || timer) return; nextT = ac.currentTime + 0.05; step = 0; timer = setInterval(schedule, 30); }
export function setMusicIntensity(x) { intensity = Math.max(0, Math.min(1, x)); }

function schedule() {
  if (ac.state !== 'running') { nextT = ac.currentTime + 0.05; return; }
  while (nextT < ac.currentTime + 0.12) { playStep(step, nextT); step = (step + 1) % 64; nextT += STEP; }
}
function playStep(s, t) {
  const bar = Math.floor(s / 16) % 4, i = s % 16, chord = CHORDS[bar];
  osc('sawtooth', mtof(chord[0] - 24 + BASS[i]), t, STEP * 0.9, 0.17, 500 + intensity * 900);   // 베이스
  if (i % 4 === 0) kick(t);
  if (i % 8 === 4) noise(t, 0.16, 0.22, 1500, musicGain);                                       // 스네어
  if (i % 2 === 1) noise(t, 0.04, 0.025 + intensity * 0.03, 7000, musicGain);                   // 하이햇
  const lead = chord[(i * 5) % 3] + 12 * (1 + Math.floor((i % 8) / 4));
  osc('square', mtof(lead), t, STEP * 0.55, 0.02 + intensity * 0.03, 1800 + intensity * 2000);   // 아르페지오
  if (i === 0) for (const n of chord) osc('triangle', mtof(n), t, STEP * 16, 0.028, 1200, 0.4);  // 패드
}
function osc(type, freq, t, dur, vol, lp = 20000, attack = 0.005) {
  const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = lp; o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.setTargetAtTime(0, t + dur - 0.05, 0.04);
  o.connect(f).connect(g).connect(musicGain); o.start(t); o.stop(t + dur + 0.1);
}
function kick(t) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  o.connect(g).connect(musicGain); o.start(t); o.stop(t + 0.3);
}
function noise(t, dur, vol, hp, dest) {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(dest); s.start(t); s.stop(t + dur + 0.05);
}
