// 미션 · 업적 판정 · 영구 업그레이드
import { MISSIONS, ACHIEVEMENTS, UPGRADES } from './config.js';
import { profile, save } from './save.js';

// ---------- 업그레이드 ----------
export const upgradeLevel = id => profile.upgrades[id] || 0;
export const upgradeValue = id => UPGRADES.find(u => u.id === id).value(upgradeLevel(id));
// 샵 표시용 행
export const upgradeRows = () => UPGRADES.map(u => {
  const lv = upgradeLevel(u.id), maxed = lv >= u.max;
  return { id: u.id, icon: u.icon, name: u.name, lv, max: u.max, price: maxed ? 0 : u.price(lv), cur: u.fmt(u.value(lv)), next: maxed ? null : u.fmt(u.value(lv + 1)) };
});
// 구매 성공 시 true (코인 차감 + 저장)
export function buyUpgrade(id) {
  const u = UPGRADES.find(x => x.id === id); if (!u) return false;
  const lv = upgradeLevel(id);
  if (lv >= u.max || profile.bank < u.price(lv)) return false;
  profile.bank -= u.price(lv); profile.upgrades[id] = lv + 1; save();
  return true;
}

export function missionGoal(m, tier = profile.missionTier) {
  if (m.stat === 'zone') return Math.min(3, m.goal + tier - 1);
  if (m.stat === 'maxMult') return Math.min(5, m.goal + tier - 1);
  return Math.round(m.goal * (1 + (tier - 1) * 0.5));
}

export function activeMissions() {
  return MISSIONS.filter(m => !profile.missionsDone.includes(m.id)).slice(0, 3);
}

// 완료된 미션 배열 반환. 보상은 즉시 지급
export function checkMissions(stats) {
  const done = [];
  for (const m of activeMissions()) {
    const goal = missionGoal(m);
    if ((stats[m.stat] || 0) >= goal) {
      profile.missionsDone.push(m.id);
      profile.bank += m.reward;
      done.push({ id: m.id, reward: m.reward, text: m.text(goal) });
    }
  }
  if (done.length) save();
  return done;
}

// 티어 상승은 한 판이 끝난 뒤에만. (플레이 중 올리면 같은 판의 누적 스탯으로 다음 티어 미션이 연쇄 완료됨)
export function advanceTier() {
  if (activeMissions().length) return false;
  profile.missionTier++; profile.missionsDone = []; save();
  return true;
}

export function checkAchievements(stats) {
  const got = [];
  for (const a of ACHIEVEMENTS) {
    if (profile.ach.includes(a.id)) continue;
    let ok = false;
    try { ok = a.check(stats, profile); } catch {}
    if (ok) { profile.ach.push(a.id); got.push(a); }
  }
  if (got.length) save();
  return got;
}
