// 온라인 랭킹 (선택). config.js의 ONLINE_LEADERBOARD_URL이 비어 있으면 아무것도 하지 않음.
//  POST  {board:'classic'|'daily', date:'YYYY-MM-DD', name, score, dist, zone}
//  GET   ?board=classic|daily&date=YYYY-MM-DD  →  [{name, score, dist, zone, date}, ...] (점수 내림차순, 최대 50)
import { ONLINE_LEADERBOARD_URL } from './config.js';
import { todayKey } from './save.js';

export const onlineEnabled = () => !!ONLINE_LEADERBOARD_URL;

export async function submitScore(board, entry) {
  if (!onlineEnabled()) return;
  // keepalive: 결과 화면에서 탭을 바로 닫아도 전송이 완료됨
  await fetch(ONLINE_LEADERBOARD_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
    body: JSON.stringify({ board, date: todayKey(), ...entry }),
  });
}

export async function fetchOnline(board) {
  if (!onlineEnabled()) return [];
  const r = await fetch(`${ONLINE_LEADERBOARD_URL}?board=${board}&date=${todayKey()}`);
  if (!r.ok) throw new Error('leaderboard ' + r.status);
  const rows = await r.json();
  return Array.isArray(rows) ? rows.slice(0, 50) : [];
}
