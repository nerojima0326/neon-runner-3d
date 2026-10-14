// 한 판(run) 동안의 실시간 상태. 모든 모듈이 공유.
import { PHYS, TUTORIAL } from './config.js';

export const G = {
  state: 'menu',        // menu | playing | paused | dying | continue | results
  mode: 'classic',      // classic | daily
  mod: null,            // 데일리 변형 규칙
  rng: Math.random,     // 데일리는 시드 난수
  tutorial: false, tutorialRows: 0,   // 첫 판 연습 구간
  speed: PHYS.START_SPEED, startSpeed: PHYS.START_SPEED, gravity: PHYS.GRAVITY,
  distance: 0, coins: 0, coinScore: 0, bonus: 0,
  lane: 1, jumpY: 0, vy: 0, jumpsUsed: 0, spawnAcc: 0, shake: 0, zone: 0,
  energy: 0, dashT: 0, rollT: 0, flipT: 0, magnetT: 0, invulnT: 0, shieldOn: false,
  slowT: 0, boostT: 0,  // ⏱ 슬로우모(실시간 초) · ✨ 점수 2배(게임 시간 초)
  simT: 0,              // 슬로우모가 반영된 시뮬레이션 시간 (시간 기반 애니메이션용)
  hitStop: 0,           // 타격 순간 짧은 멈춤(실시간 초)
  dashMax: PHYS.DASH_TIME, magnetMax: PHYS.MAGNET_TIME, energyMul: 1,   // 업그레이드 적용값 (판 시작 시 캐시)
  combo: 0, comboT: 0, mult: 1, revived: false,
  stats: null,
};

export function newStats() {
  return { dist: 0, coins: 0, score: 0, smash: 0, gates: 0, jumps: 0, nearMiss: 0, zone: 0,
    comboMax: 0, maxMult: 1, items: 0, dashes: 0, revives: 0, doubleJumps: 0, orbsPassed: 0, ghostBeaten: 0, bossKills: 0 };
}

export function resetRun(mode = 'classic', mod = null, rng = Math.random, tutorial = false) {
  Object.assign(G, {
    mode, mod, rng, tutorial, tutorialRows: 0, startSpeed: tutorial ? TUTORIAL.SPEED : PHYS.START_SPEED, gravity: PHYS.GRAVITY,
    distance: 0, coins: 0, coinScore: 0, bonus: 0, lane: 1, jumpY: 0, vy: 0, jumpsUsed: 0,
    spawnAcc: 0, shake: 0, zone: 0, energy: 0, dashT: 0, rollT: 0, flipT: 0, magnetT: 0, invulnT: 0,
    shieldOn: false, slowT: 0, boostT: 0, simT: 0, hitStop: 0, dashMax: PHYS.DASH_TIME, magnetMax: PHYS.MAGNET_TIME, energyMul: 1,
    combo: 0, comboT: 0, mult: 1, revived: false, stats: newStats(),
  });
  if (mod?.apply) mod.apply(G);
  G.speed = G.startSpeed;
}

export const rolling = () => G.rollT > 0 || G.dashT > 0;
export const speedFrac = () => Math.max(0, Math.min(1, (G.speed - PHYS.START_SPEED) / (PHYS.MAX_SPEED - PHYS.START_SPEED)));
export const score = () => Math.floor(G.distance) + G.coinScore + G.bonus;
