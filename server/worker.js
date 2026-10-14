// ============================================================
//  Neon Runner 3D 온라인 랭킹 서버 — Cloudflare Workers + KV 예제
// ============================================================
//  배포 (약 3분):
//    1. npm i -g wrangler && wrangler login
//    2. wrangler kv namespace create BOARD      → 출력된 id를 아래 wrangler.toml에 붙여넣기
//    3. 이 폴더에 wrangler.toml 작성:
//         name = "neon-runner-board"
//         main = "worker.js"
//         compatibility_date = "2024-01-01"
//         [[kv_namespaces]]
//         binding = "BOARD"
//         id = "<2번에서 받은 id>"
//    4. wrangler deploy  → https://neon-runner-board.<계정>.workers.dev
//    5. js/config.js 의 ONLINE_LEADERBOARD_URL 에 그 주소를 넣으면 랭킹 탭에 "온라인"이 생김
//
//  규격 (js/net.js 와 동일):
//    POST {URL}          body: { board: "classic"|"daily", date: "YYYY-MM-DD", name, score, dist, zone }
//    GET  {URL}?board=classic|daily&date=YYYY-MM-DD   →  [{ name, score, dist, zone, date }, ...] 점수 내림차순 최대 50
//
//  저장 키: classic 은 전체 기간 누적("classic"), daily 는 날짜별("daily:2026-10-13")
//  주의: 클라이언트 값은 조작 가능하므로 여기서 상한·길이 검증을 함. 더 강한 보호가 필요하면 리플레이 검증이나 서명 토큰을 추가.

const MAX_ROWS = 50, MAX_SCORE = 5_000_000, MAX_DIST = 100_000, MAX_ZONE = 99, NAME_LEN = 12;
const CORS = {
  'Access-Control-Allow-Origin': '*',          // 운영 시 게임을 호스팅하는 도메인으로 제한 권장
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s);
const keyOf = (board, date) => board === 'daily' ? `daily:${date}` : 'classic';

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);

    if (req.method === 'GET') {
      const board = url.searchParams.get('board'), date = url.searchParams.get('date') || '';
      if (board !== 'classic' && board !== 'daily') return json({ error: 'board' }, 400);
      if (board === 'daily' && !isDate(date)) return json({ error: 'date' }, 400);
      const rows = JSON.parse(await env.BOARD.get(keyOf(board, date)) || '[]');
      return json(rows);
    }

    if (req.method === 'POST') {
      let b; try { b = await req.json(); } catch { return json({ error: 'json' }, 400); }
      const board = b.board, date = String(b.date || '');
      if (board !== 'classic' && board !== 'daily') return json({ error: 'board' }, 400);
      if (!isDate(date)) return json({ error: 'date' }, 400);
      const name = String(b.name || '').replace(/[^\p{L}\p{N} _\-.!?]/gu, '').trim().slice(0, NAME_LEN) || 'PLAYER';
      const score = Math.floor(Number(b.score)), dist = Math.floor(Number(b.dist)), zone = Math.floor(Number(b.zone));
      if (!(score >= 0 && score <= MAX_SCORE) || !(dist >= 0 && dist <= MAX_DIST) || !(zone >= 1 && zone <= MAX_ZONE)) return json({ error: 'range' }, 400);
      if (score > dist * 100 + 100) return json({ error: 'ratio' }, 400);  // 거리 대비 말이 안 되는 점수 거부 (대략적 상한. 점수 2배 × 더블 코인 × 콤보 ×5 여유)

      const key = keyOf(board, date);
      const rows = JSON.parse(await env.BOARD.get(key) || '[]');
      rows.push({ name, score, dist, zone, date });
      rows.sort((x, y) => y.score - x.score);
      rows.length = Math.min(rows.length, MAX_ROWS);
      // daily 키는 40일 뒤 자동 삭제. (KV는 트랜잭션이 없어 동시 제출 시 드물게 한 건이 밀릴 수 있음 — 소규모 랭킹엔 충분)
      await env.BOARD.put(key, JSON.stringify(rows), board === 'daily' ? { expirationTtl: 60 * 60 * 24 * 40 } : {});
      const rank = rows.findIndex(r => r.name === name && r.score === score) + 1;
      return json({ ok: true, rank });
    }

    return json({ error: 'method' }, 405);
  },
};
