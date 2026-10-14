// 게임 허브: 상태 머신 · 루프 · 입력 · 시스템 연결
import * as THREE from 'three';
import { LANES, PHYS, THEMES, SKINS, UPGRADES, MISSIONS, DAILY_MODS, OBSTACLE_HINTS, TUTORIAL, BOSS, VERSION } from './config.js';
import { profile, save, todayKey, ensureDaily, addScore, seededRng, hashStr, secondsToMidnight, resetProfile } from './save.js';
import { G, resetRun, rolling, speedFrac, score } from './state.js';
import * as world from './world.js';
import * as fx from './fx.js';
import * as P from './player.js';
import * as O from './obstacles.js';
import * as ui from './ui.js';
import * as audio from './audio.js';
import * as ghost from './ghost.js';
import * as vfx from './vfx.js';
import * as boss from './boss.js';
import { activeMissions, missionGoal, checkMissions, checkAchievements, advanceTier, upgradeLevel, upgradeValue, upgradeRows, buyUpgrade } from './meta.js';
import { onlineEnabled, submitScore, fetchOnline } from './net.js';

const center = new THREE.Vector3(), gpos = new THREE.Vector3(), fxPos = new THREE.Vector3();   // fxPos: 이펙트 전용 (center는 코인 판정에 쓰이므로 덮어쓰지 않음)
const clock = new THREE.Clock();
const TOUCH = matchMedia('(pointer:coarse)').matches;
// 자동 품질: 전에 내려간 단계를 기억. 처음이면 터치 기기는 medium부터 (매번 3~6초 렉 뒤 하향되는 것 방지)
let autoTier = profile.autoTier || (TOUCH ? 'medium' : 'high');
let fpsAcc = 0, fpsN = 0, missionTick = 0, bossCam = 0, camFollow = 0;   // bossCam: 보스전 카메라 블렌드 0~1 · camFollow: 카메라가 따라가는 x
let runMissions = [], runAch = [], lastEntry = null, lastSummary = null, deferredInstall = null, pendingSubmit = null, shopTab = 'skins';
const reviveCost = () => upgradeValue('revive');          // 컨티뉴 비용 (업그레이드 할인 반영)
const boostMul = () => (G.boostT > 0 ? 2 : 1);             // ✨ 점수 2배 (코인·보너스 점수에만, 거리 점수 제외)

// ---------- 설정 ----------
function applySettings() {
  const s = profile.settings;
  world.setBrightness(s.brightness);
  world.setQuality(s.quality === 'auto' ? autoTier : s.quality);
  audio.setAudio(s);
  P.applySkin(profile.skin);
  O.setPalette(s.highContrast);
}
// 진동 (설정 on + 지원 기기 + 사용자 입력이 한 번이라도 있었을 때). 패턴: ms 또는 [on, off, on, ...]
let gestured = false;
function buzz(p) { if (gestured && profile.settings.vibration && navigator.vibrate) try { navigator.vibrate(p); } catch {} }
const dailyMod = () => DAILY_MODS[hashStr('mod-' + todayKey()) % DAILY_MODS.length];
const atMainMenu = () => G.state === 'menu' && ui.panelOpen('menu');

// ---------- 화면 ----------
function openMenu() {
  G.state = 'menu'; ensureDaily();
  P.resetPlayerPose();   // 사망 시 숨긴 캐릭터·남은 버프 링을 메뉴에서 복구
  ghost.stop(); boss.reset(); ui.hud.boss(null);
  ui.hud.show(false);
  ui.renderMenu(profile, {
    daily: `${dailyMod().name} · 오늘 최고 ${profile.daily.best.toLocaleString()}`,
    missions: `${activeMissions().length}개 진행 중 · Tier ${profile.missionTier}`,
    shop: `${profile.skins.length}/${SKINS.length} 스킨 · 업그레이드 ${UPGRADES.reduce((s, u) => s + upgradeLevel(u.id), 0)}/${UPGRADES.reduce((s, u) => s + u.max, 0)}`,
  });
  ui.showPanel('menu');
  audio.setMusicIntensity(0);
}
const todayGhost = () => (profile.daily.ghost && profile.daily.ghost.v === VERSION ? profile.daily.ghost : null);
function openDaily() { ensureDaily(); ui.renderDaily({ mod: dailyMod(), date: todayKey(), best: profile.daily.best, left: secondsToMidnight(), ghost: todayGhost() }); ui.showPanel('daily'); }
function openShop() { ui.renderShop(profile, shopTab, upgradeRows()); ui.showPanel('shop'); }
function openMissions() {
  ui.renderMissions(profile, activeMissions().map(m => ({ reward: m.reward, text: m.text(missionGoal(m)) })), MISSIONS.length);
  ui.showPanel('missions');
}
async function openRanking(tab = 'classic') {
  ui.showPanel('ranking');
  if (tab.startsWith('online')) {
    ui.renderRanking(tab, null, profile.name, true);
    try { ui.renderRanking(tab, await fetchOnline(tab === 'onlineDaily' ? 'daily' : 'classic'), profile.name, true); } catch { ui.renderRanking(tab, false, profile.name, true); }
    return;
  }
  ensureDaily();
  ui.renderRanking(tab, tab === 'daily' ? profile.daily.board : profile.board, profile.name, onlineEnabled());
}
function openSettings() { ui.renderSettings(profile, VERSION); ui.showPanel('settings'); }

// ---------- 러닝 시작 / 종료 ----------
function startRun(mode = 'classic') {
  ensureDaily();
  const mod = mode === 'daily' ? dailyMod() : null;
  const tutorial = mode === 'classic' && profile.runs === 0 && profile.settings.hints;   // 첫 판은 연습 구간부터
  resetRun(mode, mod, mode === 'daily' ? seededRng('neon-' + todayKey()) : Math.random, tutorial);
  // 영구 업그레이드 적용 (판 단위 캐시)
  G.dashMax = upgradeValue('dash'); G.magnetMax = upgradeValue('magnet'); G.energyMul = upgradeValue('energy');
  if (upgradeValue('shield')) G.shieldOn = true;
  // 데일리 고스트: 이번 주행 기록 시작 + 오늘 최고 기록 재생
  let ghostOn = false;
  if (mode === 'daily') { ghost.beginRecord(); ghostOn = profile.settings.ghost ? ghost.start(profile.daily.ghost) : (ghost.stop(), false); } else ghost.stop();
  O.resetObstacles(); fx.clearFx(); vfx.clear(); P.resetPlayerPose(); world.setTheme(0); boss.reset(); ui.hud.boss(null);
  runMissions = []; runAch = []; lastEntry = null; missionTick = 0;
  if (tutorial) ui.hint('연습 구간 · 장애물이 하나씩 천천히 옵니다. 조작을 익혀보세요!', 3000);
  G.state = 'playing';
  ui.showPanel(null); ui.hud.show(true);
  const modeHud = mode === 'daily' ? `DAILY · ${mod.name}${ghostOn ? ` · 👻 ${profile.daily.ghost.dist.toLocaleString()}m` : ''}` : 'CLASSIC';
  ui.hud.set({ best: (mode === 'daily' ? profile.daily.best : profile.best).toLocaleString(), modeHud, score: '0', coins: '0' });
  ui.hud.combo(0, 1); updateMissionTracker();
  ui.zoneBanner(0, THEMES[0]);
  audio.beep(440, 0.12, 'triangle', 0.1, 440); audio.setMusicIntensity(0.4);
  if (mode === 'daily' && !profile.daily.played) { profile.daily.played = true; save(); }
}

// 충돌 사망: 로봇이 몸 색 파편으로 산산조각 + 장애물 색 불꽃 + 삼중 충격파 + 화면 가장자리 붉은 섬광
// color: 장애물이 아닌 것(보스 공격)에 맞았을 때의 색
function die(o, color) {
  G.state = 'dying'; G.shake = 0.6; G.combo = 0; G.mult = 1;
  P.player.visible = false; ghost.stop(); ui.hud.slow(false); fx.setScroll(0);
  const hit = color ?? (o ? O.OBS_COLOR[o.userData.type] : 0xff3050), [bodyCol, limbCol, lightCol] = P.skinColors();
  P.bodyCenter(center);
  fx.impact(center, hit, { sparks: 50, rings: [5.5, 3.2], flash: 3.2, light: 18, power: 1.5 });
  fx.impact(center, bodyCol, { shards: 34, color2: limbCol, sparks: 26, power: 1.35 });
  fx.burst(center, lightCol, 40, 12); fx.burst(center, 0xffffff, 20, 10);
  punch(0, 7, 1.6);
  ui.hitFlash('#' + new THREE.Color(hit).getHexString(), 0.9);
  audio.crash(); audio.setMusicIntensity(0); buzz([60, 40, 90]);
  setTimeout(() => {
    if (G.state !== 'dying') return;
    if (!G.revived && profile.bank >= reviveCost()) { G.state = 'continue'; ui.showContinue(reviveCost(), profile.bank, finishRun); }
    else finishRun();
  }, 900);
}
function revive() {
  if (G.state !== 'continue' || profile.bank < reviveCost()) return;
  profile.bank -= reviveCost(); save();
  G.revived = true; G.stats.revives++;
  O.clearAhead(-45); boss.clearAttacks();
  Object.assign(G, { invulnT: 2, jumpY: 0, vy: 0, rollT: 0, dashT: 0, jumpsUsed: 0 });
  P.resetPlayerPose(); P.player.position.x = LANES[G.lane];
  G.state = 'playing'; ui.showPanel(null);
  ui.toast('REVIVED!', '#7dffb0'); audio.arpeggio([523, 659, 784, 1047]); audio.setMusicIntensity(0.4 + speedFrac() * 0.6);
}
function finishRun() {
  if (G.state === 'results') return;
  G.state = 'results'; ui.stopCountdown(); boss.reset(); ui.hud.boss(null);
  const st = G.stats, s = score(); st.score = s; st.zone = Math.max(st.zone, G.zone);
  const bankGain = G.coins * (G.mod?.coinMult || 1);
  profile.bank += bankGain; profile.runs++; profile.totalDist += st.dist; profile.totalCoins += bankGain;
  const isBest = G.mode === 'classic' && s > profile.best; if (isBest) profile.best = s;
  const dailyBest = G.mode === 'daily' && s > profile.daily.best; if (dailyBest) profile.daily.best = s;
  if (dailyBest) profile.daily.ghost = { v: VERSION, score: s, dist: st.dist, data: ghost.endRecord() };   // 오늘 최고 기록 주행 → 고스트
  ghost.stop();
  const entry = { name: profile.name, score: s, dist: st.dist, zone: G.zone + 1, date: todayKey() };
  const rank = addScore(G.mode === 'daily' ? profile.daily.board : profile.board, entry);
  lastEntry = rank ? entry : null;
  const missionsDone = [...runMissions, ...checkMissions(st)];
  const tierUp = advanceTier();
  const ach = [...runAch, ...checkAchievements(st)];
  save();
  pendingSubmit = { board: G.mode, entry };   // 온라인 전송은 이름 입력이 끝난 뒤(결과 화면을 떠날 때)
  ui.hud.show(false);
  lastSummary = { mode: G.mode, score: s, dist: st.dist, coins: G.coins, coinScore: G.coinScore, bonus: G.bonus, comboMax: st.comboMax, maxMult: st.maxMult,
    nearMiss: st.nearMiss, smash: st.smash, bossKills: st.bossKills, zone: G.zone + 1, rank, isBest, dailyBest, bankGain, bank: profile.bank, missionsDone, achievements: ach, revived: G.revived, name: profile.name, tierUp,
    ghostBeaten: !!st.ghostBeaten, ghostSaved: dailyBest };
  ui.renderResults(lastSummary, rank > 0);
}
function commitName() {
  if (!ui.panelOpen('results') || $('nameEntry').classList.contains('hidden')) return;
  const n = $('nameInput').value.trim().slice(0, 12);
  if (n && n !== profile.name) { profile.name = n; if (lastEntry) lastEntry.name = n; save(); }
}
function flushSubmit() {
  if (!pendingSubmit) return;
  const { board, entry } = pendingSubmit; pendingSubmit = null;
  submitScore(board, entry).catch(() => {});
}
// 결과 화면을 떠날 때 공통 처리: 이름 확정 → 온라인 전송
function leaveResults() { commitName(); flushSubmit(); }
const $ = ui.$;
async function share() {
  if (!lastSummary) return;
  const text = `Neon Runner 3D에서 ${lastSummary.score.toLocaleString()}점 기록! (${lastSummary.dist}m · ZONE ${lastSummary.zone}${lastSummary.mode === 'daily' ? ' · 데일리' : ''}) 당신도 도전해보세요!`;
  const url = location.origin + location.pathname;
  try {
    if (navigator.share) await navigator.share({ title: 'Neon Runner 3D', text, url });
    else { await navigator.clipboard.writeText(`${text} ${url}`); ui.toast('클립보드에 복사됨!', '#7dffb0'); }
  } catch {}
}
function togglePause() {
  if (G.state === 'playing') { G.state = 'paused'; ui.showPanel('pause'); audio.setMusicIntensity(0); }
  else if (G.state === 'paused') { G.state = 'playing'; ui.showPanel(null); audio.setMusicIntensity(0.4 + speedFrac() * 0.6); clock.getDelta(); }
}
function enterZone(z) {
  G.zone = z; G.stats.zone = Math.max(G.stats.zone, z);
  world.setTheme(z); ui.zoneBanner(z, THEMES[z % THEMES.length]); ui.flash(0.3);
  world.bloom.strength = 1.1;
  audio.arpeggio([523, 659, 784, 1047], 'triangle', 90);
}

// ---------- 능력 ----------
function jump() {
  if (G.state !== 'playing') return;
  if (G.jumpY === 0 && G.vy <= 0) { G.vy = PHYS.JUMP_V; G.jumpsUsed = 1; G.rollT = 0; vfx.jump(P.player.position.x); audio.beep(300, .18, 'square', .06, 400); }
  else if (G.jumpsUsed < 2) {
    G.vy = PHYS.JUMP_V * 0.8; G.jumpsUsed = 2; G.flipT = PHYS.FLIP_TIME; G.rollT = 0; G.stats.doubleJumps++;
    vfx.doubleJump(P.player.position.x, G.jumpY); audio.beep(500, .2, 'square', .06, 600);
  }
}
function roll() {
  if (G.state !== 'playing' || rolling()) return;
  if (G.jumpY > 0) G.vy = -24;     // 공중이면 급강하
  else vfx.rollStart(P.player.position.x);
  G.rollT = PHYS.ROLL_TIME; G.flipT = 0; audio.beep(180, .2, 'triangle', .07, -80);
}
function dash() {
  if (G.state !== 'playing' || G.dashT > 0 || G.energy < 100) return;
  G.dashT = G.dashMax; G.energy = 0; G.rollT = 0; G.stats.dashes++;
  if (profile.settings.shake) G.shake = 0.25;
  world.bloom.strength = 1.0; ui.toast('HYPER DASH!', '#ffe14d'); buzz(30);
  P.bodyCenter(fxPos); vfx.dashStart(fxPos);
  audio.arpeggio([392, 523, 659, 784, 1047], 'sawtooth', 50);
}
// 레인 이동은 화면 기준: 보스전 카메라가 앞에서 플레이어를 볼 땐 화면 왼쪽이 월드 +x라 방향을 뒤집음
function moveLane(d) {
  if (G.state !== 'playing') return;
  const l = G.lane + (bossCam > 0.5 ? -d : d);
  if (l >= 0 && l <= 2) { G.lane = l; audio.beep(600, .05, 'triangle', .05); }
}
const moveLeft = () => moveLane(-1), moveRight = () => moveLane(1);
function toggleMute() {
  const s = profile.settings, on = !(s.sfx || s.music); s.sfx = on; s.music = on; save(); audio.setAudio(s);
  ui.toast(on ? '🔊 소리 켬' : '🔇 음소거', '#fff', 800);
}

// ---------- 장애물 이벤트 ----------
// 장애물 중심 (오브는 공중, 나머지는 허리 높이)
const obsCenter = o => fxPos.set(o.position.x, o.userData.type === 'orb' ? 0.65 : o.userData.type === 'wall' ? 1.4 : 0.9, o.position.z);
// 타격감: 아주 짧은 멈춤(히트스톱) + 카메라 FOV 펀치 + 블룸 순간 강화
function punch(stop, fov, bloom) {
  G.hitStop = Math.max(G.hitStop, stop);
  if (profile.settings.shake) { world.camera.fov += fov; world.camera.updateProjectionMatrix(); }
  world.bloom.strength = Math.max(world.bloom.strength, bloom);
}
// 하이퍼 대시로 파괴: 장애물 색 파편이 사방으로 튀고 바닥에 튕김 + 불꽃 + 충격파
function smashFx(o, color) {
  obsCenter(o);
  fx.impact(fxPos, color, { shards: 18, sparks: 28, rings: [2.8], flash: 1.6, light: 9, power: 1.1 });
  fx.burst(fxPos, 0xffffff, 10, 8);
  if (profile.settings.shake) G.shake = Math.max(G.shake, 0.22);
  punch(0.045, 3, 1.05); ui.flash(0.12); audio.crash(0.12);
}
// 방어막 파괴: 하늘색 방어막 조각이 깨져 흩어짐 + 이중 충격파. o가 없으면(보스 공격) 몸 위치에 color 불꽃
function shieldFx(o, color) {
  P.bodyCenter(fxPos);
  fx.impact(fxPos, 0x60e8ff, { shards: 24, sparks: 34, rings: [3.4, 2], flash: 2, light: 11, power: 1.2, color2: 0xffffff });
  if (o) obsCenter(o);
  fx.impact(fxPos, color ?? O.OBS_COLOR[o.userData.type], { shards: 10, sparks: 12, power: 0.9 });
  if (profile.settings.shake) G.shake = Math.max(G.shake, 0.3);
  punch(0.08, 4, 1.15); ui.hitFlash('#60e8ff', 0.55); audio.crash(0.14);
}
function onHit(o) {
  const type = o.userData.type;
  if (G.dashT > 0) { smashFx(o, O.OBS_COLOR[type]); const pts = 100 * G.mult * boostMul(); G.bonus += pts; G.stats.smash++; ui.toast2(`+${pts} SMASH`, '#ffe14d'); buzz(20); return 'smash'; }
  if (G.invulnT > 0) return 'ignore';
  if (G.shieldOn) { G.shieldOn = false; G.invulnT = 1.2; shieldFx(o); ui.toast('🛡 방어막 파괴!', '#60e8ff'); buzz(45); return 'shield'; }
  die(o); return 'dead';
}
function onPass(o, ud) {
  if (ud.wasHit) return;
  const type = ud.type, st = G.stats;
  if (ud.crossDx < 1.4) { if (type === 'low') st.jumps++; if (type === 'bar' && ud.crossRoll) st.gates++; }
  if (type === 'orb') st.orbsPassed++;
  let near = false;
  if (ud.crossDx < 1.4) { if (type === 'low') near = ud.crossJump < 1.5; else if (type === 'wall') near = ud.crossJump < 3.5; else if (type === 'orb') near = ud.crossJump < 1.8; }
  // 마지막 순간 레인 변경: 판정 레인은 이미 안전하지만 몸은 아직 장애물 쪽에 걸쳐 있음 (crossDx는 스냅 값이라 여기선 실제 위치를 봄)
  else if (ud.crossDx < 2.1 || ud.crossRealDx < 2.3) near = true;
  if (near) {
    st.nearMiss++; const pts = 25 * G.mult * boostMul(); G.bonus += pts; G.energy = Math.min(100, G.energy + 4 * G.energyMul);
    ui.toast2(`CLOSE CALL +${pts}`, '#7dffb0'); audio.beep(1200, .06, 'sine', .05); buzz(15);
    // 아슬아슬하게 스친 장애물 가장자리에서 초록 불꽃이 튐
    obsCenter(o); fxPos.x += Math.sign(P.player.position.x - o.position.x || 1) * 0.9;
    fx.spawnSparks(fxPos, 0x7dffb0, 14, 10);
  }
}
function onHint(type) { if (profile.settings.hints && profile.runs < 5) ui.hint(OBSTACLE_HINTS[profile.settings.highContrast ? 'hc' : 'normal'][type]); }
function onCoin(c) {
  const cm = G.mod?.coinMult || 1, st = G.stats;
  G.coins++; st.coins = G.coins; G.combo++; G.comboT = PHYS.COMBO_WINDOW;
  const m = Math.min(PHYS.MAX_MULT, 1 + Math.floor(G.combo / PHYS.COMBO_STEP));
  if (m > G.mult) { G.mult = m; P.bodyCenter(fxPos); vfx.combo(fxPos, m); ui.toast(`COMBO ×${m}!`, '#ff2bd6'); audio.arpeggio([880, 1100, 1320], 'square', 40); buzz(20); }
  st.maxMult = Math.max(st.maxMult, G.mult); st.comboMax = Math.max(st.comboMax, G.combo);
  G.coinScore += 50 * G.mult * cm * boostMul();
  if (G.dashT === 0) G.energy = Math.min(100, G.energy + 6 * G.energyMul);
  vfx.coin(c.position, G.mult);
  audio.beep(988 + G.mult * 60, .08); setTimeout(() => audio.beep(1318 + G.mult * 60, .12), 60);
  ui.hud.combo(G.combo, G.mult);
}
function onPowerup(p) {
  G.stats.items++;
  const type = p.userData.type;
  if (type === 'shield') { G.shieldOn = true; P.bodyCenter(fxPos); vfx.shieldUp(fxPos); ui.toast('🛡 방어막!', '#60e8ff'); }
  else if (type === 'magnet') { G.magnetT = G.magnetMax; ui.toast('🧲 자석!', '#ff6080'); }
  else if (type === 'slow') { G.slowT = PHYS.SLOW_TIME; ui.toast('⏱ 슬로우모!', '#60ffe0'); }
  else { G.boostT = PHYS.BOOST_TIME; ui.toast('✨ 점수 2배!', '#ffe14d'); }
  fx.burst(p.position, O.ITEM_COLOR[type], 20, 6);
  fx.impact(p.position, O.ITEM_COLOR[type], { sparks: 18, rings: [2.2], flash: 1.1, light: 6, power: 0.7 });
  audio.arpeggio([660, 880, 1320]);
}
// ---------- 보스전 이벤트 ----------
const hexStr = c => '#' + new THREE.Color(c).getHexString();
function bossStart(b) {
  // 진입 순간 트랙 위 장애물 전부 제거 (각자 자기 색 불꽃으로 터지며 사라짐)
  for (const o of O.obstacles) { obsCenter(o); if (fxPos.z > -80) fx.burst(fxPos, O.OBS_COLOR[o.userData.type], 10, 6); }
  O.clearAhead(-Infinity);
  ui.bossBanner(b.name, b.color); ui.hitFlash(hexStr(b.color), 0.5);
  ui.hint('👾 보스가 뒤에서 쫓아옵니다! 뒤에서 다가오는 🔵 파란 오브를 먹으면 유도탄 발사', 3600);
  if (profile.settings.shake) G.shake = Math.max(G.shake, 0.4);
  buzz([40, 60, 40]);
}
// 보스 공격에 맞음: 대시 중엔 폭탄을 부수고 레이저는 통과 · 무적이면 무시 · 방어막이 있으면 대신 깨짐
function bossHurt(kind, pos, color) {
  if (G.dashT > 0) {
    if (kind !== 'bomb') return 'ignore';
    fxPos.copy(pos); fx.impact(fxPos, color, { shards: 14, sparks: 24, rings: [2.6], flash: 1.4, light: 8, power: 1 });
    const pts = 150 * G.mult * boostMul(); G.bonus += pts; G.stats.smash++;
    ui.toast2(`+${pts} SMASH`, '#ffe14d'); punch(0.045, 3, 1.05); audio.crash(0.12); buzz(20);
    return 'smash';
  }
  if (G.invulnT > 0) return 'ignore';
  if (G.shieldOn) { G.shieldOn = false; G.invulnT = 1.2; shieldFx(null, color); ui.toast('🛡 방어막 파괴!', '#60e8ff'); buzz(45); return 'shield'; }
  die(null, color); return 'dead';
}
const bossEvents = {
  hurt: bossHurt,
  onOrb() { ui.toast2('🔵 유도탄 발사!', '#80d0ff'); buzz(20); },
  onHit(hp, maxHp) {
    const pts = 200 * boostMul(); G.bonus += pts;
    // 명중 순간: 짧은 히트스톱 + FOV 펀치 + 강한 블룸 + 화면 가장자리 하늘색 섬광 + 흔들림 (화면 전체 흰 섬광은 보스가 가려져서 뺌)
    ui.toast(`BOSS HIT! ${hp}/${maxHp}`, '#80d0ff', 900); ui.toast2('💫 그로기! 잠깐 공격이 멈춰요', '#ffe14d', 1600);
    punch(0.08, 5, 0.8); ui.hitFlash('#60c0ff', 0.6);   // 블룸을 세게 올리면 명중 이펙트가 하얀 덩어리로 뭉개짐
    if (profile.settings.shake) G.shake = Math.max(G.shake, 0.4);
    buzz([30, 30, 50]);
  },
  onDefeat(level) {
    const pts = BOSS.REWARD_SCORE * level * boostMul(), coins = BOSS.REWARD_COINS * level;
    G.bonus += pts; G.coins += coins; G.stats.coins = G.coins; G.stats.bossKills++;
    G.invulnT = Math.max(G.invulnT, 1);
    ui.toast(`BOSS DEFEATED! +${pts.toLocaleString()}`, '#ffe14d', 2200); ui.toast2(`+${coins} 💰`, '#ffe14d', 1600);
    ui.flash(0.5); punch(0.12, 6, 1.4); if (profile.settings.shake) G.shake = Math.max(G.shake, 0.6);
    audio.arpeggio([523, 659, 784, 1047, 1319, 1568], 'square', 70); buzz([50, 40, 50, 40, 120]);
  },
  onFlee() { ui.toast('보스가 도망쳤다…', '#c0c0d0', 1600); audio.arpeggio([784, 659, 523, 392], 'triangle', 90); },
};

function updateMissionTracker() {
  ui.hud.missions(activeMissions().map(m => { const goal = missionGoal(m); return { text: m.text(goal), cur: Math.min(G.stats[m.stat] || 0, goal), goal }; }));
}

// ---------- 루프 ----------
// rdt = 실제 경과 시간. ⏱ 슬로우모 중엔 시뮬레이션 dt만 줄임 → 점프 궤적·장애물 간격은 그대로, 반응할 실시간만 늘어남
function playing(rdt, t) {
  let dt = rdt;
  if (G.slowT > 0) { G.slowT = Math.max(0, G.slowT - rdt); dt *= PHYS.SLOW_FACTOR; }
  if (G.hitStop > 0) { G.hitStop = Math.max(0, G.hitStop - rdt); dt *= 0.05; }   // 히트스톱: 파괴·방어막 순간 아주 잠깐 멈칫 (파편은 실시간으로 튐)
  G.simT += dt; ui.hud.slow(G.slowT > 0);
  const st = G.stats;
  if (G.tutorial && G.distance >= TUTORIAL.DIST) { G.tutorial = false; ui.toast('GO!', '#7dffb0', 900); audio.arpeggio([523, 659, 784]); }
  // 가속도 ∝ 현재 속도 (체감 가속 일정). 연습 구간 뒤엔 CATCHUP_ACCEL로 빠르게 기본 속도 복귀
  if (!G.tutorial) G.speed = Math.min(PHYS.MAX_SPEED, G.speed + dt * (G.speed < PHYS.START_SPEED ? PHYS.CATCHUP_ACCEL : PHYS.ACCEL * G.speed / PHYS.START_SPEED));
  const sf = speedFrac(), dz = (G.dashT > 0 ? G.speed * 1.7 : G.speed) * dt;
  G.distance += dz * 0.5; st.dist = Math.floor(G.distance);
  const z = Math.floor(G.distance / PHYS.ZONE_LENGTH); if (z !== G.zone) enterZone(z);
  // 데일리 고스트: 이번 주행 기록 + 오늘 최고 기록 재생. 최고 기록이 끝난 거리를 지나면 연출
  if (G.mode === 'daily') {
    ghost.record(G.distance, G.lane, G.jumpY, (rolling() ? ghost.F_ROLL : 0) | (G.dashT > 0 ? ghost.F_DASH : 0) | (G.flipT > 0 ? ghost.F_FLIP : 0));
    if (ghost.update(G.distance, dt, t)) {
      gpos.copy(ghost.ghostPos()); gpos.y += 0.75; fx.burst(gpos, 0xc0f0ff, 30, 8);
      ui.toast('👻 최고 기록 돌파!', '#c0f0ff'); audio.arpeggio([659, 784, 988, 1319]); st.ghostBeaten = 1; buzz(30);
    }
  }

  G.rollT = Math.max(0, G.rollT - dt); G.flipT = Math.max(0, G.flipT - dt); G.magnetT = Math.max(0, G.magnetT - dt); G.invulnT = Math.max(0, G.invulnT - dt);
  G.boostT = Math.max(0, G.boostT - dt);
  if (G.dashT > 0) { G.dashT = Math.max(0, G.dashT - dt); if (G.dashT === 0) G.invulnT = 0.6; } else G.energy = Math.min(100, G.energy + dt * 1.5 * G.energyMul);
  if (G.combo > 0) { G.comboT -= dt; if (G.comboT <= 0) { G.combo = 0; G.mult = 1; ui.hud.combo(0, 1); } }

  world.scrollWorld(dz, t);
  // 레인 이동: 일정 속도로 즉각 이동 (속도가 붙을수록 더 빠르게). 느린 감속 lerp 대신 고정 시간(~0.1초)에 도착
  {
    P.steer(LANES[G.lane], dt, sf);   // 임계 감쇠 스프링으로 부드럽게 출발·정지 (판정은 logicalX로 즉시)
  }
  if (G.jumpY > 0 || G.vy > 0) {
    G.vy -= G.gravity * dt; G.jumpY = Math.max(0, G.jumpY + G.vy * dt);
    if (G.jumpY === 0) { const lv = -G.vy; G.vy = 0; G.jumpsUsed = 0; P.landed(); vfx.land(P.player.position.x, Math.min(2, lv / 12)); }
  }
  P.player.position.y = G.jumpY;
  // 시간 기반 애니메이션(오브 좌우 이동·회전·흔들림)은 슬로우모가 반영된 simT 사용. 깜빡임·배경은 실시간
  const ts = G.simT;
  P.animatePlayer(dt, ts, 'run'); P.setBuffVisuals(G.shieldOn, G.magnetT > 0, ts, G.boostT > 0); P.setFlicker(G.invulnT > 0, t);
  P.bodyCenter(center);
  if (G.dashT > 0 && Math.floor(ts * 30) !== Math.floor((ts - dt) * 30)) fx.spawnGhost(center);
  fx.updateGhosts(dt, dz); fx.setScroll(dz); vfx.setScroll(dz);
  // 지속 오라 (자석·점수 2배·슬로우모·방어막) + 구르기 바닥 불꽃 자국
  vfx.auras(dt, { x: P.player.position.x, cy: center.y, t: ts, shield: G.shieldOn, magnet: G.magnetT > 0, boost: G.boostT > 0, slow: G.slowT > 0 });
  if (rolling() && G.jumpY === 0) vfx.skid(P.player.position.x, dt, G.dashT > 0);   // 충돌 파편도 월드와 함께 흘러감

  G.spawnAcc += dz;
  // 장애물 줄 간격 = 속도 × 초 (시작 ROW_SEC_START초 → 최고 속도 ROW_SEC_MAX초). 데일리 dense ×0.78 · 연습 구간 ×GAP_MULT
  const rowSec = PHYS.ROW_SEC_START - (PHYS.ROW_SEC_START - PHYS.ROW_SEC_MAX) * sf;
  // 보스전 중(카메라가 다시 뒤로 거의 돌아올 때까지)엔 일반 장애물 줄을 만들지 않음 (카메라가 앞에서 뒤를 보므로 앞에서 오는 장애물은 안 보임)
  if (G.spawnAcc > G.speed * rowSec * (G.mod?.gapMult || 1) * (G.tutorial ? TUTORIAL.GAP_MULT : 1)) { G.spawnAcc = 0; if (!boss.active() && bossCam < 0.3) O.spawnRow(sf); }
  O.updateObstacles(dt, ts, dz, { onHit, onPass, onHint });
  if (G.state !== 'playing') return;
  // 보스전: 점수가 닿으면 등장 → 공격·파란 오브·유도탄 처리
  const bs = boss.check(score()); if (bs) bossStart(bs);
  boss.update(dt, { t: ts, center, px: O.logicalX(), ...bossEvents });
  if (G.state !== 'playing') return;
  ui.hud.boss(boss.hudInfo());
  O.updateCoins(dt, ts, dz, center, G.magnetT > 0, onCoin);
  O.updatePowerups(dt, ts, dz, center, onPowerup);
  fx.updateSpeedLines(dt, dz, 0.1 + sf * 0.45 + (G.dashT > 0 ? 0.3 : 0), 1.5 + sf * 8 + (G.dashT > 0 ? 8 : 0));
  audio.setMusicIntensity(G.slowT > 0 ? 0.15 : boss.fighting() ? 1 : 0.4 + sf * 0.6);

  // HUD
  ui.hud.set({ score: score().toLocaleString(), coins: G.coins, zoneHud: `ZONE ${G.zone + 1} · ${THEMES[G.zone % THEMES.length].name}` });
  ui.hud.speed(sf);
  ui.hud.energy(G.dashT > 0 ? G.dashT / G.dashMax * 100 : G.energy, G.energy >= 100 && G.dashT === 0,
    G.dashT > 0 ? 'HYPER DASH 발동 중!' : G.energy >= 100 ? `HYPER DASH 준비 완료${TOUCH ? '' : ' · E / Shift'}` : `HYPER DASH${TOUCH ? '' : ' · E / Shift'}`);
  ui.hud.buffs((G.shieldOn ? '<span style="color:#60e8ff">🛡 방어막</span>' : '') + (G.magnetT > 0 ? `<span style="color:#ff6080">🧲 ${Math.ceil(G.magnetT)}s</span>` : '')
    + (G.slowT > 0 ? `<span style="color:#60ffe0">⏱ ${Math.ceil(G.slowT)}s</span>` : '') + (G.boostT > 0 ? `<span style="color:#ffe14d">✨ ×2 ${Math.ceil(G.boostT)}s</span>` : ''));

  // 미션·업적 실시간 판정 (0.5초마다, 실시간)
  missionTick += rdt;
  if (missionTick > 0.5) {
    missionTick = 0;
    for (const m of checkMissions(st)) { runMissions.push(m); ui.toast(`🎯 미션 완료! +${m.reward}💰`, '#7dffb0', 1500); audio.arpeggio([660, 880, 1100, 1320]); }
    for (const a of checkAchievements(st)) { runAch.push(a); ui.achToast(a.name); }
    updateMissionTracker();
  }
  // 자동 품질: 3초 평균 프레임이 느리면 한 단계 낮춤 (실시간 기준)
  fpsAcc += rdt; fpsN++;
  if (fpsAcc > 3) {
    const avg = fpsAcc / fpsN; fpsAcc = 0; fpsN = 0;
    if (profile.settings.quality === 'auto' && avg > 0.034 && autoTier !== 'low') {
      autoTier = autoTier === 'high' ? 'medium' : 'low'; world.setQuality(autoTier); ui.toast('그래픽 품질 자동 조정', '#fff', 900);
      profile.autoTier = autoTier; save();   // 다음 실행부터는 바로 이 단계로 시작
    }
  }
}
let menuTheme = 0;
function update(dt) {
  const t = clock.elapsedTime;
  world.update(dt, t, G.dashT > 0 ? 0.2 : 0);
  if (G.state === 'playing') playing(dt, t);
  else if (G.state === 'menu') {
    world.scrollWorld(dt * 10, t); P.menuIdle(dt, t);
    const mz = Math.floor(t / 7) % THEMES.length; if (mz !== menuTheme) { menuTheme = mz; world.setTheme(mz); }
  }
  if (G.state !== 'paused') { fx.updateParticles(dt); fx.updateImpacts(dt); vfx.update(dt); }
  if (G.state !== 'playing') { fx.setScroll(0); vfx.setScroll(0); }

  const cam = world.camera, BC = BOSS.CAM;
  // 보스전 카메라: 플레이어 옆을 크게 돌아 앞쪽으로 가서 뒤(보스 쪽)를 바라봄 → 플레이어 얼굴과 뒤에서 쫓아오는 보스가 함께 보임.
  // 보스가 격파·도주하는 연출이 끝날 때까지 유지했다가 다시 뒤로 돌아옴
  bossCam += ((boss.active() ? 1 : 0) - bossCam) * Math.min(1, dt * BC.swing);
  const k = bossCam * bossCam * (3 - 2 * bossCam), th = Math.PI * k;    // th: 0 = 뒤 · π = 앞
  const R = world.CAM_BASE.z + (BC.dist - world.CAM_BASE.z) * k, L = 10 + (BC.lookZ - 10) * k;
  camFollow += (P.player.position.x * 0.5 - camFollow) * Math.min(1, dt * 5);
  cam.position.set(camFollow + R * Math.sin(th), world.CAM_BASE.y + (BC.y - world.CAM_BASE.y) * k + (G.state === 'playing' ? G.jumpY * 0.3 : 0), R * Math.cos(th));
  if (G.shake > 0) { G.shake -= dt; if (profile.settings.shake) { cam.position.x += (Math.random() - .5) * G.shake; cam.position.y += (Math.random() - .5) * G.shake; } }
  cam.lookAt(camFollow * 0.6 - L * Math.sin(th), 1.5 + (BC.lookY - 1.5) * k, -L * Math.cos(th));
  const runFov = G.state === 'playing' ? 65 + speedFrac() * 12 + (G.dashT > 0 ? 12 : 0) : 65;
  const fovTarget = runFov + (BC.fov - runFov) * k;
  if (Math.abs(cam.fov - fovTarget) > 0.01) { cam.fov += (fovTarget - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); }
}
function loop() { pollGamepad(); update(Math.min(clock.getDelta(), 0.05)); world.render(); requestAnimationFrame(loop); }

// ---------- 게임패드 (표준 매핑: 십자키 12~15 · A0 B1 X2 · LB4 RB5 · Start9 · 왼쪽 스틱 axes[0]) ----------
const padPrev = {}, PAD_DEAD = 0.5;
function pollGamepad() {
  if (!navigator.getGamepads) return;
  const pad = [...navigator.getGamepads()].find(p => p && p.connected); if (!pad) return;
  const b = i => !!pad.buttons[i]?.pressed, ax = pad.axes[0] || 0;
  const now = {
    left: b(14) || ax < -PAD_DEAD, right: b(15) || ax > PAD_DEAD, jump: b(0) || b(12), roll: b(1) || b(13),
    dash: b(2) || b(4) || b(5), pause: b(9),
  };
  const pressed = k => now[k] && !padPrev[k];   // 눌리는 순간만
  if (pressed('left')) moveLeft();
  if (pressed('right')) moveRight();
  if (pressed('jump')) { if (atMainMenu()) startRun('classic'); else if (G.state === 'results') { leaveResults(); startRun(G.mode); } else jump(); }
  if (pressed('roll')) roll();
  if (pressed('dash')) dash();
  if (pressed('pause') && (G.state === 'playing' || G.state === 'paused')) togglePause();
  Object.assign(padPrev, now);
}

// ---------- 입력 ----------
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') {
    // 결과 화면 이름 입력에서 Enter → 이름 확정 후 바로 재시작. 설정 이름 입력은 포커스만 해제(change 발생)
    if (e.code === 'Enter') { if (e.target.id === 'nameInput') { leaveResults(); startRun(G.mode); } else e.target.blur(); }
    return;
  }
  if (e.repeat && !['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) return;
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': moveLeft(); break;
    case 'ArrowRight': case 'KeyD': moveRight(); break;
    case 'ArrowUp': case 'KeyW': case 'Space': e.preventDefault(); if (atMainMenu()) startRun('classic'); else jump(); break;
    case 'ArrowDown': case 'KeyS': e.preventDefault(); roll(); break;
    case 'KeyE': case 'ShiftLeft': case 'ShiftRight': dash(); break;
    case 'KeyP': if (G.state === 'playing' || G.state === 'paused') togglePause(); break;
    case 'Escape': if (G.state === 'playing' || G.state === 'paused') togglePause(); else if (G.state === 'menu' && !atMainMenu()) openMenu(); break;
    case 'KeyM': toggleMute(); break;
    case 'Enter': if (atMainMenu()) startRun('classic'); else if (G.state === 'results') { leaveResults(); startRun(G.mode); } break;
  }
});
let ts = null;
addEventListener('touchstart', e => { ts = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
addEventListener('touchend', e => {
  if (!ts || e.target.closest('button, input, .panel')) { ts = null; return; }
  const dx = e.changedTouches[0].clientX - ts.x, dy = e.changedTouches[0].clientY - ts.y; ts = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 25) jump();
  else if (Math.abs(dx) > Math.abs(dy)) (dx < 0 ? moveLeft : moveRight)();
  else (dy < 0 ? jump : roll)();
});
const unlockAudio = () => { gestured = true; audio.initAudio(); audio.resumeAudio(); };
addEventListener('pointerdown', unlockAudio); addEventListener('keydown', unlockAudio);
addEventListener('resize', world.resize);
// 탭이 가려지면: 플레이 일시정지 · 컨티뉴 카운트다운 정지 · 오디오 정지(백그라운드 BGM 끊김 방지). 돌아오면 카운트다운·오디오 재개
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (G.state === 'playing') togglePause();
    if (G.state === 'continue') ui.pauseCountdown();
    audio.suspendAudio();
  } else {
    audio.resumeAudio();
    if (G.state === 'continue') ui.resumeCountdown();
  }
});
// 결과 화면에서 탭을 닫아도 온라인 점수는 전송 (keepalive)
addEventListener('pagehide', () => { commitName(); flushSubmit(); });
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; ui.showInstall(true); });

ui.bind({
  play: () => startRun('classic'), daily: openDaily, dailyStart: () => startRun('daily'), missions: openMissions, shop: openShop,
  rank: openRanking, settings: openSettings, back: openMenu,
  resume: togglePause, quit: () => finishRun(), retry: () => { leaveResults(); startRun(G.mode); }, menu: () => { leaveResults(); openMenu(); }, share,
  roll, dash, pause: togglePause,
  install: async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; ui.showInstall(false); },
  contYes: revive, contNo: finishRun,
  buy(id) {
    const s = SKINS.find(x => x.id === id); if (!s || profile.skins.includes(id) || profile.bank < s.price) return;
    profile.bank -= s.price; profile.skins.push(id); profile.skin = id; P.applySkin(id); save();
    for (const a of checkAchievements(G.stats || {})) ui.achToast(a.name);
    audio.arpeggio([660, 880, 1320]); openShop();
  },
  equip(id) { if (!profile.skins.includes(id)) return; profile.skin = id; P.applySkin(id); save(); openShop(); },
  shopTab(t) { shopTab = t; openShop(); },
  upgrade(id) {
    if (!buyUpgrade(id)) return;
    for (const a of checkAchievements(G.stats || {})) ui.achToast(a.name);
    audio.arpeggio([660, 880, 1320]); openShop();
  },
  setName(v) { const n = v.trim().slice(0, 12); if (n) { profile.name = n; save(); } },
  setBright(v) { profile.settings.brightness = v; world.setBrightness(v); save(); },
  setQuality(v) { profile.settings.quality = v; world.setQuality(v === 'auto' ? autoTier : v); save(); },
  toggle(key) {
    const v = profile.settings[key] = !profile.settings[key]; save();
    if (key === 'sfx' || key === 'music') audio.setAudio(profile.settings);
    if (key === 'highContrast') O.setPalette(v);
    if (key === 'vibration' && v) buzz(30);
    return v;
  },
  reset() { if (confirm('모든 기록·코인·스킨·설정이 삭제됩니다. 계속할까요?')) resetProfile(); },
});

// ---------- 시작 ----------
applySettings();
ui.hud.set({ best: profile.best.toLocaleString() });
openMenu();
window.__NR_READY = true;
loop();
// 캐릭터 모델 로드 (최대 3.5초 기다렸다 로딩 화면 해제. 실패·오프라인이면 구체 캐릭터로 계속)
const hideLoading = () => $('loading').classList.add('hidden');
Promise.race([P.loadModel(), new Promise(r => setTimeout(r, 3500))]).then(hideLoading, hideLoading)
  .then(() => boss.loadModel(0));   // 첫 보스 모델은 캐릭터가 준비된 뒤 백그라운드로 (다음 보스 모델은 앞 보스 등장 때). 못 받으면 절차 생성 보스로 싸움
// ?v=VERSION: config.js의 버전만 올리면 SW가 새로 설치되고 캐시 이름도 바뀜
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register(`sw.js?v=${VERSION}`).catch(() => {});
if (location.search.includes('debug')) window.NR = { G, profile, O, P, ghost, startRun, finishRun, die, dash, roll, jump, revive, spawn: (t, l = 1) => O.spawnObstacle(l, t), item: (t, l = 1) => O.spawnPowerup(l, -40, t), energy: () => { G.energy = 100; }, boss: (lv = 0) => { const b = boss.check(0, true, lv); if (b) bossStart(b); return b; }, coins: n => { profile.bank += n; save(); },
  step: (n = 60, dt = 1 / 60) => { for (let i = 0; i < n; i++) update(dt); } };   // 탭이 가려져 rAF가 느릴 때 시뮬레이션을 n프레임 강제 진행
