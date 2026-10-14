// DOM 전담: 패널 전환, HUD 갱신(변경된 값만), 메뉴/샵/미션/랭킹/설정/결과 렌더링
import { SKINS, ACHIEVEMENTS, BOSS } from './config.js';

export const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = n => '#' + n.toString(16).padStart(6, '0');

export function showPanel(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('hidden', p.id !== id));
}
export const panelOpen = id => !$(id).classList.contains('hidden');

// ---------- 토스트 / 배너 ----------
// 슬롯 3개: toast(큰 이벤트: 콤보·대시·아이템) · toast2(잦은 소형 이벤트: CLOSE CALL·SMASH) · hintToast(초보자 힌트)
// 서로 다른 요소라 겹쳐도 덮어쓰지 않음
const toastTimers = {};
function showIn(id, text, color, ms) {
  const el = $(id); el.textContent = text; el.style.color = color;
  // 네온 글로우 + 어두운 그림자: 밝은 배경(태양·네온 아치) 위에서도 읽힘. 힌트는 박스가 있으니 그림자만
  el.style.textShadow = id === 'hintToast' ? '0 1px 2px #000' : `0 0 12px ${color}, 0 2px 4px rgba(0,0,0,.95), 0 0 3px rgba(0,0,0,.9)`;
  el.classList.add('show'); clearTimeout(toastTimers[id]); toastTimers[id] = setTimeout(() => el.classList.remove('show'), ms);
}
export function toast(text, color = '#fff', ms = 1100) { showIn('toast', text, color, ms); }
export function toast2(text, color = '#fff', ms = 700) { showIn('toast2', text, color, ms); }
export function hint(text, ms = 1800) { showIn('hintToast', text, '#ffffff', ms); }
const achQueue = []; let achBusy = false;
export function achToast(name) { achQueue.push(name); if (!achBusy) nextAch(); }
function nextAch() {
  const n = achQueue.shift(); if (!n) { achBusy = false; return; }
  achBusy = true; $('achName').textContent = n; $('achToast').classList.add('show');
  setTimeout(() => { $('achToast').classList.remove('show'); setTimeout(nextAch, 450); }, 2600);
}
export function zoneBanner(idx, theme) {
  $('zoneNum').textContent = `ZONE ${idx + 1}`; $('zoneName').textContent = theme.name; $('zoneName').style.color = hex(theme.b);
  const b = $('zoneBanner'); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
// 보스 등장 경고 (존 배너 자리를 빌려 씀)
export function bossBanner(name, color) {
  $('zoneNum').textContent = '⚠ WARNING ⚠'; $('zoneName').textContent = name; $('zoneName').style.color = hex(color);
  const b = $('zoneBanner'); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
// 충돌 섬광 (가장자리 색 번짐 → 0.6초 페이드)
export function hitFlash(color, op) {
  const f = $('hitFlash'); f.style.setProperty('--hf', color); f.style.transition = 'none'; f.style.opacity = op;
  requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transition = 'opacity .6s ease-out'; f.style.opacity = 0; }));
}
export function flash(op) {
  const f = $('flash'); f.style.transition = 'none'; f.style.opacity = op;
  requestAnimationFrame(() => { f.style.transition = 'opacity .8s'; f.style.opacity = 0; });
}

// ---------- HUD (값이 바뀔 때만 DOM 접근) ----------
const cache = {};
function setText(id, v) { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; } }
export const hud = {
  show(v) { $('hud').classList.toggle('hidden', !v); if (!v) hud.slow(false); },
  slow(on) { if (cache.slow !== on) { cache.slow = on; $('slowmo').classList.toggle('on', on); } },
  set(o) { for (const k in o) setText(k, o[k]); },
  combo(c, m) {
    const txt = c >= 2 ? `${c} COMBO${m > 1 ? ` ×${m}` : ''}` : '';
    if (cache.combo === txt) return; cache.combo = txt;
    const el = $('comboHud'); el.textContent = txt; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  },
  energy(fill, ready, label) {
    const w = Math.round(fill) + '%';
    if (cache.energy !== w) { cache.energy = w; $('energyFill').style.width = w; }
    if (cache.ready !== ready) { cache.ready = ready; $('energyBar').classList.toggle('ready', ready); }
    setText('energyLabel', label);
  },
  buffs(html) { if (cache.buffs !== html) { cache.buffs = html; $('buffs').innerHTML = html; } },
  // 보스 HP 바: b = { name, color, hp, maxHp, time } 또는 null(숨김). HP 칸 구분선은 maxHp에 맞춤
  boss(b) {
    const on = !!b;
    if (cache.bossOn !== on) { cache.bossOn = on; $('bossBar').classList.toggle('hidden', !on); }
    if (!b) return;
    setText('bossName', b.name); setText('bossTime', `${b.stun ? '💫 STUN · ' : ''}⏱ ${b.time}s`);
    const w = (b.hp / b.maxHp * 100).toFixed(1) + '%';
    if (cache.bossHp !== w) { cache.bossHp = w; $('bossHpFill').style.width = w; }
    const key = b.color + '/' + b.maxHp;
    if (cache.bossKey !== key) { cache.bossKey = key; const el = $('bossBar'); el.style.setProperty('--bc', hex(b.color)); el.style.setProperty('--seg', (100 / b.maxHp) + '%'); }
  },
  speed(frac) { const w = Math.round(frac * 100) + '%'; if (cache.speed !== w) { cache.speed = w; $('speedfill').style.width = w; } },
  missions(list) {
    const html = list.map(m => `<div>▸ ${esc(m.text)} <b>${m.cur}/${m.goal}</b></div>`).join('');
    if (cache.missions !== html) { cache.missions = html; $('missionTracker').innerHTML = html; }
  },
};

// ---------- 메뉴 ----------
export function renderMenu(profile, info) {
  $('mBest').textContent = profile.best.toLocaleString(); $('mBank').textContent = profile.bank.toLocaleString(); $('mName').textContent = profile.name;
  $('mRuns').textContent = profile.runs.toLocaleString(); $('mTotalDist').textContent = profile.totalDist.toLocaleString(); $('mTotalCoins').textContent = profile.totalCoins.toLocaleString();
  $('dailyInfo').textContent = info.daily; $('missionInfo').textContent = info.missions; $('shopInfo').textContent = info.shop;
}
export function showInstall(v) { $('installBtn').hidden = !v; }

const fmtLeft = s => `${Math.floor(s / 3600)}시간 ${Math.floor(s % 3600 / 60)}분`;
export function renderDaily(d) {
  $('dailyModName').textContent = d.mod.name; $('dailyModDesc').textContent = d.mod.desc;
  $('dailyDate').textContent = d.date; $('dailyBest').textContent = d.best.toLocaleString(); $('dailyLeft').textContent = fmtLeft(d.left);
  $('dailyGhost').textContent = d.ghost ? `${d.ghost.dist.toLocaleString()}m · ${d.ghost.score.toLocaleString()}점` : '없음';
}

// tab: 'skins' | 'upgrades'. upgrades = meta.upgradeRows()
export function renderShop(profile, tab = 'skins', upgrades = []) {
  $('shopBank').textContent = profile.bank.toLocaleString();
  document.querySelectorAll('#shopTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('shopGrid').classList.toggle('hidden', tab !== 'skins'); $('upgradeList').classList.toggle('hidden', tab !== 'upgrades');
  $('upgradeList').innerHTML = upgrades.map(u => {
    const pips = '●'.repeat(u.lv) + '○'.repeat(u.max - u.lv);
    const right = u.next === null ? '<span class="maxed">MAX</span>'
      : `<button data-up="${u.id}" ${profile.bank < u.price ? 'disabled' : ''}>💰 ${u.price.toLocaleString()}</button>`;
    return `<div class="upgrade"><span class="icon">${u.icon}</span><div class="info"><b>${esc(u.name)}</b><small>${esc(u.cur)}${u.next !== null ? ` → ${esc(u.next)}` : ''}</small><div class="pips">${pips}</div></div>${right}</div>`;
  }).join('');
  $('shopGrid').innerHTML = SKINS.map(s => {
    const owned = profile.skins.includes(s.id), eq = profile.skin === s.id, col = hex(s.body);
    const btn = owned
      ? `<button data-equip="${s.id}" ${eq ? 'disabled' : ''}>${eq ? '장착 중' : '장착'}</button>`
      : `<button data-buy="${s.id}" ${profile.bank < s.price ? 'disabled' : ''}>💰 ${s.price.toLocaleString()}</button>`;
    return `<div class="skin ${eq ? 'equipped' : ''}"><div class="swatch ${s.wire ? 'wire' : ''} ${s.rainbow ? 'rainbow' : ''}" style="--sw:${col};background:${col}"></div><div class="name">${s.name}</div>${btn}</div>`;
  }).join('');
}

export function renderMissions(profile, active, total) {
  $('missionTier').textContent = `Tier ${profile.missionTier} · ${profile.missionsDone.length}/${total} 완료`;
  $('missionList').innerHTML = active.length
    ? active.map(m => `<div class="mission"><span>🎯 ${esc(m.text)}</span><span class="reward">+${m.reward} 💰</span></div>`).join('')
    : '<div class="empty">모든 미션 완료! 다음 티어가 열립니다.</div>';
  $('achCount').textContent = `${profile.ach.length}/${ACHIEVEMENTS.length}`;
  $('achGrid').innerHTML = ACHIEVEMENTS.map(a => { const on = profile.ach.includes(a.id);
    return `<div class="ach ${on ? 'on' : ''}"><b>${on ? '🏆' : '🔒'} ${a.name}</b>${a.desc}</div>`; }).join('');
}

export function renderRanking(tab, rows, me, hasOnline) {
  document.querySelectorAll('#rankTabs button').forEach(b => { b.classList.toggle('on', b.dataset.tab === tab); if (b.dataset.tab.startsWith('online')) b.hidden = !hasOnline; });
  const el = $('rankList');
  if (rows === null) { el.innerHTML = '<div class="empty">불러오는 중…</div>'; return; }
  if (rows === false) { el.innerHTML = '<div class="empty">온라인 랭킹을 불러올 수 없습니다.</div>'; return; }
  if (!rows.length) { el.innerHTML = '<div class="empty">아직 기록이 없습니다. 첫 기록을 남겨보세요!</div>'; return; }
  el.innerHTML = '<table><tr><th>#</th><th>이름</th><th class="r">점수</th><th class="r">거리</th><th class="r">존</th><th class="r">날짜</th></tr>'
    + rows.map((r, i) => `<tr class="${r.name === me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td class="r">${(+r.score || 0).toLocaleString()}</td><td class="r">${+r.dist || 0}m</td><td class="r">${+r.zone || 1}</td><td class="r">${esc(String(r.date || '').slice(5))}</td></tr>`).join('')
    + '</table>';
}

// ---------- 게임 방법 (PLAY 전에 뜨는 창) ----------
// tab: 'keys' | 'obs' | 'boss'. o: { touch, colors(장애물 팔레트, 고대비 반영), skip, mode }
const kbd = (...ks) => ks.map(k => `<kbd>${k}</kbd>`).join('');
const row = (left, text, cls = 'k') => `<div class="howto-row"><div class="${cls}">${left}</div><div class="t">${text}</div></div>`;
// 장애물 미니 그림 (게임 속 색 그대로)
const OB_SVG = {
  low:  c => `<path d="M8 32V20M32 32V20" stroke="#889" stroke-width="3"/><path d="M8 22H32M8 26H32M8 30H32" stroke="${c}" stroke-width="2.5"/>`,
  bar:  c => `<path d="M8 34V6M32 34V6" stroke="#889" stroke-width="3"/><path d="M8 9H32M8 13H32M8 17H32" stroke="${c}" stroke-width="2.5"/>`,
  wall: c => `<path d="M20 3L31 20L20 37L9 20Z" fill="${c}55" stroke="${c}" stroke-width="2.5"/>`,
  orb:  c => `<circle cx="20" cy="20" r="8" fill="${c}"/><ellipse cx="20" cy="20" rx="14" ry="5" fill="none" stroke="${c}" stroke-width="2"/><path d="M2 33H11M29 33H38M5 30L2 33L5 36M35 30L38 33L35 36" stroke="#fff" stroke-width="2" fill="none"/>`,
};
const obIcon = (type, col) => `<svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke-linecap="round">${OB_SVG[type](hex(col))}</svg>`;
const icon = e => `<span class="em">${e}</span>`;
export function renderHowto(tab, o) {
  document.querySelectorAll('#howtoTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const c = o.colors;
  let html = '';
  if (tab === 'keys') {
    html = o.touch ? [
      row(icon('👈👉'), '<b>좌우로 밀기</b> — 레인 이동 (3개 레인)'),
      row(icon('👆'), '<b>위로 밀기 · 화면 탭</b> — 점프 · 공중에서 한 번 더 하면 <b>더블 점프</b>'),
      row(icon('👇'), '<b>아래로 밀기 · ROLL 버튼</b> — 구르기 (공중이면 빠르게 착지)'),
      row(icon('⚡'), '<b>DASH 버튼</b> — 하이퍼 대시: 에너지 바가 꽉 차면 몇 초간 무적 + 장애물을 부숨'),
      row(icon('❚❚'), '<b>일시정지 버튼</b> — 오른쪽 위'),
    ].join('') : [
      row(kbd('←', '→') + kbd('A', 'D'), '<b>레인 이동</b> (3개 레인)'),
      row(kbd('Space', '↑', 'W'), '<b>점프</b> · 공중에서 한 번 더 누르면 <b>더블 점프</b>'),
      row(kbd('↓', 'S'), '<b>구르기</b> (공중에서 누르면 빠르게 착지)'),
      row(kbd('E', 'Shift'), '<b>하이퍼 대시</b> — 에너지 바가 꽉 차면 몇 초간 무적 + 장애물을 부숨'),
      row(kbd('P', 'Esc') + kbd('M'), '<b>일시정지</b> · M <b>음소거</b>'),
      row(icon('🎮'), '게임패드: 스틱/십자키 이동 · A 점프 · B 구르기 · X 대시 · Start 일시정지'),
    ].join('');
  } else if (tab === 'obs') {
    html = [
      row(obIcon('low', c.low), '<b>낮은 레이저</b> → <b>점프</b>로 넘기', 'ob'),
      row(obIcon('bar', c.bar), '<b>머리 높이 게이트</b> → <b>구르기</b>로 밑으로 통과', 'ob'),
      row(obIcon('wall', c.wall), '<b>크리스탈 기둥</b> → <b>옆 레인</b>으로 피하기 (더블 점프로 넘을 수도)', 'ob'),
      row(obIcon('orb', c.orb), '<b>플라즈마 오브</b> → 좌우로 움직여요. 바닥의 경로를 보고 피하기', 'ob'),
      row(icon('💰'), '<b>코인</b> — 연달아 먹으면 <b>콤보</b> 배율 상승(최대 ×5) · 대시 에너지 충전'),
      row(icon('🛡🧲⏱✨'), '<b>아이템</b> — 방어막(1번 막아 줌) · 자석(코인 끌어당김) · 슬로우모 · 점수 2배'),
      row(icon('😎'), '장애물을 <b>아슬아슬하게</b> 피하면 CLOSE CALL 보너스 점수'),
    ].join('');
  } else {
    html = [
      row(icon('👾'), `<b>${BOSS.FIRST_SCORE.toLocaleString()}점</b>이 되면 보스가 <b>뒤에서</b> 쫓아와요 (그 뒤 ${BOSS.EVERY.toLocaleString()}점마다 다음 보스). 카메라가 앞으로 돌아가 플레이어 얼굴이 보여요`),
      row(icon('↔️'), '보스전 중 <b>좌우는 화면 기준</b> — 화면 왼쪽으로 가려면 그대로 왼쪽 ' + (o.touch ? '밀기' : '키')),
      row(icon('🟥'), '<b>레인 레이저</b> — 바닥이 깜빡이는 레인에 빔이 떨어져요 → <b>옆 레인</b>으로'),
      row(icon('💣'), '<b>굴러오는 폭탄</b> → <b>점프</b>하거나 옆 레인으로'),
      row(obIcon('low', c.low), '<b>소환 장애물</b> — 뒤에서 덮쳐와요. 평소처럼 점프 · 구르기 · 피하기', 'ob'),
      row(icon('🔵'), `<b>파란 오브</b>를 먹으면 유도탄 발사 → 보스 HP −1 + <b>${BOSS.STUN_TIME}초 그로기</b>(공격 멈춤)`),
      row(icon('⏱'), `<b>${BOSS.TIME_LIMIT}초</b> 안에 HP를 0으로! 못 잡으면 도망가요. 격파하면 점수 + 코인 보상`),
      row(icon('⚡🛡'), `대시 중엔 폭탄을 부수고 레이저를 통과 · 방어막은 공격 1번을 막아 줘요`),
    ].join('');
  }
  $('howtoBody').innerHTML = html;
  $('howtoBody').classList.toggle('narrow', tab !== 'keys' || o.touch);   // 그림·이모지만 있는 탭은 왼쪽 칸을 좁게 통일 (키보드 키 목록만 넓게)
  $('howtoSkip').checked = o.skip;
  $('howtoStart').textContent = o.mode === 'daily' ? '▶ 데일리 도전' : '▶ 시작';
  $('howtoKeysHint').hidden = o.touch;
}

const TOGGLES = [['setSfx', 'sfx'], ['setMusic', 'music'], ['setShake', 'shake'], ['setHints', 'hints'], ['setHowto', 'howto'], ['setVibe', 'vibration'], ['setHC', 'highContrast'], ['setGhost', 'ghost']];
export function renderSettings(profile, version) {
  const s = profile.settings;
  $('setName').value = profile.name;
  $('setBright').value = Math.round(s.brightness * 100); $('brightVal').textContent = Math.round(s.brightness * 100) + '%';
  document.querySelectorAll('#setQuality button').forEach(b => b.classList.toggle('on', b.dataset.v === s.quality));
  for (const [id, key] of TOGGLES) $(id).classList.toggle('on', !!s[key]);
  $('verText').textContent = version;
}

export function renderResults(s, showName) {
  $('resTitle').textContent = s.mode === 'daily' ? 'DAILY RESULT' : 'GAME OVER';
  $('resScore').textContent = s.score.toLocaleString();
  $('resBadge').textContent = s.isBest ? '★ NEW BEST! ★' : s.dailyBest ? '★ 오늘의 신기록! ★' : s.rank ? `🏅 랭킹 ${s.rank}위 진입!` : '';
  $('resBreakdown').innerHTML = [
    ['거리', `${s.dist.toLocaleString()}m`],
    ['코인', `${s.coins}개 (+${s.coinScore.toLocaleString()})`],
    ['보너스 (파괴·회피)', `+${s.bonus.toLocaleString()}`],
    ['최대 콤보', `${s.comboMax} (×${s.maxMult})`],
    ['아슬아슬 회피 / 대시 파괴', `${s.nearMiss}회 / ${s.smash}개`],
    ...(s.bossKills ? [['보스 격파', `${s.bossKills}마리`]] : []),
    ['도달 존', `ZONE ${s.zone}`],
    ['지갑', `+${s.bankGain} 💰 → ${s.bank.toLocaleString()}`],
  ].map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
  const ev = [];
  for (const m of s.missionsDone) ev.push(`<div class="ev">🎯 미션 완료: ${esc(m.text)} <span style="color:var(--yellow)">+${m.reward}💰</span></div>`);
  for (const a of s.achievements) ev.push(`<div class="ev">🏆 업적 달성: <b>${esc(a.name)}</b> — ${esc(a.desc)}</div>`);
  if (s.tierUp) ev.push('<div class="ev">⬆ 미션 전부 완료! 다음 티어가 열렸습니다 (목표치 상승)</div>');
  if (s.ghostBeaten) ev.push('<div class="ev">👻 고스트 추월! 오늘 최고 기록 지점을 넘었습니다</div>');
  if (s.ghostSaved) ev.push('<div class="ev">👻 이 주행이 오늘의 고스트로 저장됨 · 다시 도전하면 2m 앞에서 함께 달립니다</div>');
  if (s.revived) ev.push('<div class="ev">🔥 컨티뉴 사용</div>');
  $('resEvents').innerHTML = ev.join('');
  $('nameEntry').classList.toggle('hidden', !showName);
  if (showName) $('nameInput').value = s.name;
  showPanel('results');
}

// ---------- 컨티뉴 카운트다운 (탭이 가려지면 멈추고, 돌아오면 이어감) ----------
let cdTimer = null, cdLeft = 0, cdDone = null;
export function showContinue(cost, bank, onTimeout) {
  $('contCost').textContent = cost; $('contBank').textContent = bank.toLocaleString();
  cdLeft = 5; cdDone = onTimeout; $('contCount').textContent = cdLeft; showPanel('continue');
  resumeCountdown();
}
export function resumeCountdown() {
  if (cdTimer || !cdDone) return;
  cdTimer = setInterval(() => { cdLeft--; $('contCount').textContent = cdLeft; if (cdLeft <= 0) { const fn = cdDone; stopCountdown(); fn(); } }, 1000);
}
export function pauseCountdown() { clearInterval(cdTimer); cdTimer = null; }
export function stopCountdown() { pauseCountdown(); cdDone = null; }

// ---------- 이벤트 바인딩 ----------
export function bind(h) {
  const on = (id, fn) => $(id).addEventListener('click', fn);
  on('playBtn', h.play); on('dailyBtn', h.daily); on('dailyStartBtn', h.dailyStart); on('missionsBtn', h.missions);
  on('shopBtn', h.shop); on('rankBtn', () => h.rank('classic')); on('settingsBtn', h.settings); on('installBtn', h.install);
  on('howtoBtn', h.howto); on('howtoStart', h.howtoStart);
  $('howtoTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) h.howtoTab(b.dataset.tab); });
  $('howtoSkip').addEventListener('change', e => h.howtoSkip(e.target.checked));
  document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', h.back));
  on('resumeBtn', h.resume); on('quitBtn', h.quit); on('retryBtn', h.retry); on('menuBtn', h.menu); on('shareBtn', h.share);
  // ROLL / DASH는 click(터치가 끝난 뒤)이 아니라 pointerdown(닿는 순간)에 발동 → 반응이 한 박자 빠름
  for (const [id, fn] of [['rollBtn', h.roll], ['dashBtn', h.dash]]) $(id).addEventListener('pointerdown', e => { e.preventDefault(); fn(); });
  on('pauseBtn', h.pause);
  on('contYes', () => { stopCountdown(); h.contYes(); }); on('contNo', () => { stopCountdown(); h.contNo(); });
  $('rankTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) h.rank(b.dataset.tab); });
  $('shopGrid').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.buy) h.buy(b.dataset.buy); else if (b.dataset.equip) h.equip(b.dataset.equip); });
  $('shopTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) h.shopTab(b.dataset.tab); });
  $('upgradeList').addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.dataset.up) h.upgrade(b.dataset.up); });
  $('setName').addEventListener('change', e => h.setName(e.target.value));
  $('setBright').addEventListener('input', e => { $('brightVal').textContent = e.target.value + '%'; h.setBright(+e.target.value / 100); });
  $('setQuality').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { h.setQuality(b.dataset.v); document.querySelectorAll('#setQuality button').forEach(x => x.classList.toggle('on', x === b)); } });
  for (const [id, key] of TOGGLES) on(id, () => { const v = h.toggle(key); $(id).classList.toggle('on', v); });
  on('resetBtn', h.reset);
  // 터치 버튼은 스와이프 입력으로 새지 않게
  document.querySelectorAll('.tbtn, #pauseBtn').forEach(b => b.addEventListener('touchstart', e => e.stopPropagation(), { passive: true }));
}
