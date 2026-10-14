// 프로필 저장/불러오기 (localStorage) + 시드 난수 + 날짜 유틸
import { VERSION } from './config.js';

const KEY = 'neonRunner.profile.v2';

const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const DEFAULT = () => ({
  name: 'PLAYER', bank: 0, best: 0, runs: 0, totalDist: 0, totalCoins: 0,
  skin: 'classic', skins: ['classic'], ach: [],
  upgrades: {},                                           // 영구 업그레이드 레벨 { magnet: 2, ... }
  missionTier: 1, missionsDone: [],
  autoTier: '',                                           // 자동 품질이 내려간 단계 (기기별로 기억)
  board: [],                                              // 클래식 랭킹 top 10
  daily: { date: '', best: 0, board: [], played: false }, // 오늘의 데일리 (+ ghost: 오늘 최고 기록 주행)
  settings: { brightness: 1, quality: 'auto', sfx: true, music: true, shake: !reducedMotion, hints: true, vibration: true, highContrast: false, ghost: true,
    howto: true },                                        // howto: PLAY를 누르면 게임 방법 창부터 보여 줌
  version: VERSION,
});

function merge(base, over) {
  for (const k in over) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k]) merge(base[k], over[k]);
    else base[k] = over[k];
  }
  return base;
}

function load() {
  const p = DEFAULT();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return merge(p, JSON.parse(raw));
    // 구버전(최고 점수만 저장) 마이그레이션
    const old = Number(localStorage.getItem('neonRunnerBest')) || 0;
    if (old) { p.best = old; p.board.push({ name: 'PLAYER', score: old, dist: 0, zone: 1, date: todayKey() }); }
  } catch {}
  return p;
}

export const profile = load();

export function save() { try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch {} }

export function resetProfile() {
  try { localStorage.removeItem(KEY); localStorage.removeItem('neonRunnerBest'); } catch {}
  location.reload();
}

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ensureDaily() {
  const k = todayKey();
  if (profile.daily.date !== k) { profile.daily = { date: k, best: 0, board: [], played: false }; save(); }
}

export function secondsToMidnight() {
  const n = new Date(), m = new Date(n); m.setHours(24, 0, 0, 0);
  return Math.floor((m - n) / 1000);
}

// 랭킹판에 기록 추가 → 순위(1부터). top 10 밖이면 0
export function addScore(board, entry, max = 10) {
  board.push(entry);
  board.sort((a, b) => b.score - a.score);
  if (board.length > max) board.length = max;
  return board.indexOf(entry) + 1;
}

export function hashStr(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return h >>> 0;
}

// mulberry32: 같은 시드 → 같은 코스 (데일리 챌린지)
export function seededRng(seed) {
  let a = hashStr(seed);
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
