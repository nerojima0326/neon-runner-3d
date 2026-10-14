// ============================================================
//  게임 설정 · 밸런스 · 콘텐츠 정의 (코드 수정 없이 여기만 바꿔도 됨)
// ============================================================
export const VERSION = '2.7.0';   // 바꾸면 서비스워커 캐시도 함께 갱신됨 (sw.js?v=VERSION)

// 온라인 랭킹 서버 주소. 비워두면 로컬 랭킹만 사용. (README 참고)
export const ONLINE_LEADERBOARD_URL = '';

export const LANES = [-2.5, 0, 2.5];

export const PHYS = {
  START_SPEED: 20, MAX_SPEED: 60,
  // 가속도는 현재 속도에 비례 (기본 속도에서 ACCEL, 속도 40이면 2배): 체감 가속이 처음부터 끝까지 일정 (초당 약 +0.75%).
  // 20 → 60 약 2분 27초 (예전 선형 0.6: 67초). 더 빠르게 0.18 · 더 느리게 0.12
  ACCEL: 0.15,
  CATCHUP_ACCEL: 2.4,        // 첫 판 연습 구간(속도 14) 뒤 기본 속도로 복귀하는 가속 (약 2.5초)
  // 장애물 줄 간격을 '초'로 정의 (속도 × 초 = 거리). 시작 1.5초 → 최고 속도 0.8초 (예전 1.13초 → 0.23초)
  ROW_SEC_START: 1.5, ROW_SEC_MAX: 0.8,
  GRAVITY: 32, JUMP_V: 12, SPAWN_Z: -140, ZONE_LENGTH: 500,
  ROLL_TIME: 0.65, FLIP_TIME: 0.5, DASH_TIME: 4, MAGNET_TIME: 10,
  SLOW_TIME: 5, SLOW_FACTOR: 0.55,   // ⏱ 슬로우모: 실시간 5초 동안 게임 속도 0.55배
  BOOST_TIME: 10,                    // ✨ 점수 2배 지속(게임 시간)
  REVIVE_COST: 100,          // 컨티뉴 비용 (코인, 업그레이드로 할인)
  COMBO_WINDOW: 5,           // 콤보 유지 시간(초). 장애물 줄이 드물어진 만큼 4 → 5 (코인이 줄을 따라 나오므로)
  COMBO_STEP: 10,            // 콤보 N개마다 배율 +1
  MAX_MULT: 5,
};

// 첫 판 연습 구간: 느린 속도 · 넓은 간격 · 정해진 순서(점프→구르기→피하기)로 장애물 1개씩
export const TUTORIAL = { SPEED: 14, DIST: 120, GAP_MULT: 1.7, ROWS: ['low', 'bar', 'wall'] };

// 존 테마: 색상 + 장애물 출현 비중
export const THEMES = [
  { name: 'SYNTHWAVE', a: 0x00f0ff, b: 0xff2bd6, sky: 0x060014, fog: 0x200038, sunTop: 0xffe14d, sunBot: 0xff2bd6,
    weights: { low: 36, bar: 30, wall: 34 }, orb: 0.12 },
  { name: 'INFERNO',   a: 0xff7a00, b: 0xff0040, sky: 0x0a0000, fog: 0x2c0600, sunTop: 0xfff3a0, sunBot: 0xff2a00,
    weights: { low: 45, bar: 20, wall: 35 }, orb: 0.22 },
  { name: 'TOXIC',     a: 0x39ff14, b: 0x00ffc8, sky: 0x000a04, fog: 0x002414, sunTop: 0xf0ff40, sunBot: 0x00ff88,
    weights: { low: 25, bar: 50, wall: 25 }, orb: 0.12 },
  { name: 'AURORA',    a: 0x8a6bff, b: 0x00e5ff, sky: 0x01000f, fog: 0x090830, sunTop: 0xffffff, sunBot: 0x8a6bff,
    weights: { low: 30, bar: 25, wall: 45 }, orb: 0.18 },
];

// 캐릭터 3D 모델 (glTF). url을 비우면 절차 생성 구체 캐릭터만 사용. 로딩 실패(오프라인 첫 실행 등) 시에도 구체로 폴백.
// RobotExpressive: Tomás Laulhé 제작, Don McCurdy 수정, CC0 1.0 (three.js 예제 동봉, 464KB). 서비스워커가 CDN 응답을 캐시해 두 번째 실행부터 오프라인 가능
export const CHARACTER = {
  url: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/RobotExpressive/RobotExpressive.glb',
  scale: 0.36,        // 원본 높이 4.44 → 약 1.6 (노란 게이트 1.05~1.65에 머리가 걸려 구르기가 필요한 높이)
  pivotY: 0.8,        // 공중제비 회전 중심 높이 (몸 중앙)
  jumpStart: 0.12,    // 점프 클립 시작 오프셋(초): 앞부분 웅크림 생략
  clips: { run: 'Running', jump: 'Jump', idle: 'Idle', wave: 'Wave', roll: 'Sitting' },
  // 구르기·대시: 로봇이 'Sitting' 끝 자세(무릎을 끌어안은 웅크림)로 몸을 말고 앞으로 구름 + 에너지 껍질.
  // 웅크린 자세의 중심(모델 기준, scale 적용 후) y 0.71 · z 0.18, 높이 1.44 → ×0.62 = 0.89 (노란 게이트 1.05 아래)
  roll: { scale: 0.62, centerY: 0.71, centerZ: 0.18, tuckSpeed: 2.5 },
};

// 캐릭터 움직임 부드러움. 레인 이동은 임계 감쇠 스프링(가속→감속 곡선, 오버슈트 없음).
// 충돌 판정은 이동을 시작하는 즉시 목표 레인으로 처리되므로(obstacles.js logicalX) 스무딩해도 조작 반응은 그대로
export const MOTION = {
  LANE_TIME: 0.045, LANE_TIME_FAST: 0.035,   // 레인 이동 스무딩 시간(초): 시작 속도 / 최고 속도
  LEAN: 0.007, YAW: 0.01,                    // 좌우 이동 속도 → 몸 옆 기울기 · 진행 방향 회전 (rad per unit/s)
  TILT_RATE: 16,                             // 기울기가 따라가는 속도
  SCALE_RATE: 18,                            // 점프 늘어남 · 착지 찌그러짐 보간 속도
  POP_TIME: 0.14,                            // 로봇 ↔ 공 변신 팝 애니메이션 길이(초)
};

// 캐릭터 스킨 (샵에서 코인으로 구매). 로봇 모델은 body→Main(몸) · limb→Grey(부품) 머티리얼에 입혀짐
export const SKINS = [
  { id: 'classic', name: '클래식', price: 0,    body: 0x3fc8ff, emissive: 0x0a3060, limb: 0x1b7fc0, band: 0x7fd8f0, light: 0x3fc8ff },
  { id: 'magma',   name: '마그마', price: 300,  body: 0xff5a1f, emissive: 0x601000, limb: 0xa02810, band: 0xffc070, light: 0xff7a30 },
  { id: 'toxic',   name: '톡식',   price: 300,  body: 0x4cff3a, emissive: 0x0c4010, limb: 0x158a2a, band: 0xc8ffb0, light: 0x60ff50 },
  { id: 'gold',    name: '골드',   price: 800,  body: 0xffd13f, emissive: 0x604000, limb: 0xb08010, band: 0xfff0a0, light: 0xffe060, metal: true },
  { id: 'ghost',   name: '고스트', price: 1200, body: 0xc0f0ff, emissive: 0x204060, limb: 0x80c0e0, band: 0xffffff, light: 0xa0e0ff, wire: true },
  { id: 'prism',   name: '프리즘', price: 2000, body: 0xff60ff, emissive: 0x402060, limb: 0xa040c0, band: 0xffffff, light: 0xff80ff, rainbow: true },
];

// 보스전: 점수가 FIRST_SCORE에 닿으면 첫 보스, 이후 끝날 때마다 +EVERY점에서 다음 보스(레벨이 오를수록 HP·공격 빈도 증가).
// 보스는 플레이어 '뒤'에서 쫓아오고, 카메라가 플레이어 앞으로 돌아가 얼굴과 보스를 함께 비춤 (좌우 조작은 화면 기준으로 뒤집힘).
// 진입 순간 일반 장애물은 전부 사라지고 보스전 동안 새로 나오지 않음. 공격(레이저·폭탄·소환 장애물)과 파란 오브는 전부 뒤(보스 쪽)에서 다가옴
export const BOSS = {
  FIRST_SCORE: 5000, EVERY: 12000,
  HP: 5, HP_STEP: 2,                       // 레벨 1 HP 5, 레벨마다 +2
  TIME_LIMIT: 75,                          // 이 시간 안에 못 잡으면 도망감
  ATTACK_CD: 2.4, ATTACK_CD_STEP: 0.25, ATTACK_CD_MIN: 1.3,   // 공격 간격(초). HP가 줄면 최대 30% 빨라짐
  BEAM_WARN: 1.1, BEAM_FIRE: 0.45,         // 레인 레이저 경고 → 발사
  BOMB_FLY: 0.8, BOMB_LAND_Z: 24, BOMB_ROLL: 13,   // 폭탄 비행 시간 · 착지 위치(플레이어 뒤) · 착지 후 플레이어 쪽으로 굴러오는 속도
  CHASE_Z: 28, CHASE_SPEED: 12,            // 소환 장애물: 플레이어 뒤에 생겨 이 속도로 덮쳐옴 (빨강 점프 · 노랑 구르기 · 크리스탈 피하기)
  ORB_CD: 2.2, ORB_Z: 26, ORB_SPEED: 9,    // 파란 오브 재등장 대기 · 등장 위치(플레이어 뒤) · 다가오는 속도
  REWARD_SCORE: 3000, REWARD_COINS: 40,    // 격파 보상 × 레벨
  NAMES: ['NEON SENTINEL', 'CRIMSON OVERLORD', 'VOID MONARCH'],
  COLORS: [0xff2bd6, 0xff4a1c, 0x8a6bff],
  POS_Y: 9, POS_Z: 34, SCALE: 1.7,         // 보스 위치(플레이어 뒤 하늘) · 크기
  STUN_TIME: 2.2,                          // 파란 오브 유도탄에 맞으면 그로기(공격 중단 · 휘청) 시간
  // 보스별 3D 모델 (glTF, NAMES 순서). url을 비우거나 로딩에 실패하면(오프라인 첫 실행 등) 절차 생성 보스(구체 + 눈)로 대체. 로딩 중에 보스가 나와도 도착하는 즉시 교체.
  // 첫 보스 모델은 캐릭터 로딩 뒤 백그라운드로, 다음 보스 모델은 앞 보스가 등장할 때 미리 받음. 서비스워커가 캐시해 두 번째부터 오프라인 가능.
  // 원래 재질은 네온 스타일(어두운 금속 + 보스 색 테두리 발광)로 바꿔 입힘 (.gltf는 노멀맵만 받음).
  // size = 가장 긴 변 길이, rotX/rotY = 방향 보정, cut = 아래쪽에서 잘라낼 높이 비율(받침대 제거).
  // eyes·mouth = 눈 발광 · 레이저/폭탄 발사 위치를 모델 [가로, 세로] 비율(-0.5~0.5, 가운데 0)로. 앞에서 광선을 쏴 얼굴 표면에 자동으로 붙임
  MODELS: [
    // 사자 머리: Tina 제작, CC0 (Poly Haven 'lion_head', 노멀맵 포함 1.8MB · 삼각형 4.7만 개)
    { url: 'https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/lion_head/lion_head_1k.gltf',
      size: 7.5, eyes: [[-0.095, 0.21], [0.095, 0.21]], eyeSize: 1.3, mouth: [0, -0.1] },
    // 황소 머리: Tina 제작, CC0 (Poly Haven 'bull_head', 노멀맵 포함 0.9MB · 삼각형 1.7만 개). 아래 받침대는 잘라냄
    { url: 'https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/bull_head/bull_head_1k.gltf',
      size: 7.5, cut: 0.2, eyes: [[-0.14, 0.06], [0.14, 0.06]], eyeSize: 1.4, mouth: [0, -0.3] },
    // 해골: Vladimir Petkovic 제작, CC0 (Khronos glTF-Sample-Assets 'ScatteringSkull', 9MB · 삼각형 19만 개, 커밋 고정)
    { url: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@4995a638c96dbc94376d3d6164e70fee3ac7f7a2/Models/ScatteringSkull/glTF-Binary/ScatteringSkull.glb',
      size: 7, eyes: [[-0.22, 0.08], [0.22, 0.08]], eyeSize: 2, eyeDepth: 0.3, mouth: [0, -0.2] },
  ],
  // 보스전 카메라: 플레이어 옆을 돌아 앞쪽 dist 거리·높이 y에서 뒤(보스 쪽 lookZ)를 바라봄. swing = 회전 전환 속도
  CAM: { dist: 9, y: 3.2, lookY: 2.8, lookZ: 20, fov: 68, swing: 1.6 },
};

// 아이템 출현 비중 (한 번 스폰될 때 종류 선택)
export const ITEM_WEIGHTS = { shield: 3, magnet: 3, slow: 2, boost: 2 };

// 영구 업그레이드 (샵에서 코인으로). price(lv) = 현재 lv에서 다음 레벨 가격, value(lv) = 효과값
export const UPGRADES = [
  { id: 'magnet', icon: '🧲', name: '자석 지속시간',   max: 5, price: lv => 150 + lv * 250, value: lv => PHYS.MAGNET_TIME + lv * 2,  fmt: v => `${v}초` },
  { id: 'dash',   icon: '⚡', name: '하이퍼 대시 지속', max: 5, price: lv => 200 + lv * 300, value: lv => PHYS.DASH_TIME + lv * 0.6, fmt: v => `${v.toFixed(1)}초` },
  { id: 'energy', icon: '🔋', name: '에너지 충전 속도', max: 5, price: lv => 200 + lv * 300, value: lv => 1 + lv * 0.15,            fmt: v => `×${v.toFixed(2)}` },
  { id: 'revive', icon: '🔥', name: '컨티뉴 할인',     max: 3, price: lv => 400 + lv * 400, value: lv => PHYS.REVIVE_COST - lv * 20, fmt: v => `${v} 💰` },
  { id: 'shield', icon: '🛡', name: '시작 방어막',     max: 1, price: () => 1500,           value: lv => lv >= 1,                   fmt: v => v ? '켜짐' : '꺼짐' },
];

// 미션: 한 판(run) 안에서 달성. 3개씩 활성화, 전부 완료하면 티어 상승(목표치 증가)
export const MISSIONS = [
  { id: 'coins30',  stat: 'coins',       goal: 30,    reward: 150, text: g => `한 판에 코인 ${g}개 모으기` },
  { id: 'dist500',  stat: 'dist',        goal: 500,   reward: 150, text: g => `한 판에 ${g}m 달리기` },
  { id: 'gates5',   stat: 'gates',       goal: 5,     reward: 200, text: g => `노란 게이트 ${g}개 구르기로 통과` },
  { id: 'jumps10',  stat: 'jumps',       goal: 10,    reward: 200, text: g => `빨간 레이저 ${g}개 점프로 넘기` },
  { id: 'smash3',   stat: 'smash',       goal: 3,     reward: 250, text: g => `하이퍼 대시로 장애물 ${g}개 파괴` },
  { id: 'near5',    stat: 'nearMiss',    goal: 5,     reward: 250, text: g => `아슬아슬 회피 ${g}회` },
  { id: 'mult3',    stat: 'maxMult',     goal: 3,     reward: 300, text: g => `콤보 배율 x${g} 달성` },
  { id: 'zone2',    stat: 'zone',        goal: 1,     reward: 300, text: g => `ZONE ${g + 1} 도달` },
  { id: 'items3',   stat: 'items',       goal: 3,     reward: 200, text: g => `아이템 ${g}개 획득` },
  { id: 'dj10',     stat: 'doubleJumps', goal: 10,    reward: 200, text: g => `더블 점프 ${g}회` },
  { id: 'dist1500', stat: 'dist',        goal: 1500,  reward: 400, text: g => `한 판에 ${g}m 달리기` },
  { id: 'coins80',  stat: 'coins',       goal: 80,    reward: 400, text: g => `한 판에 코인 ${g}개 모으기` },
  { id: 'orb5',     stat: 'orbsPassed',  goal: 5,     reward: 300, text: g => `플라즈마 오브 ${g}개 통과` },
  { id: 'zone3',    stat: 'zone',        goal: 2,     reward: 500, text: g => `ZONE ${g + 1} 도달` },
  { id: 'score10k', stat: 'score',       goal: 10000, reward: 600, text: g => `${g.toLocaleString()}점 달성` },
  { id: 'boss1',    stat: 'bossKills',   goal: 1,     reward: 600, text: g => `보스 ${g}마리 격파` },
];

// 업적 (영구). check(runStats, profile)
export const ACHIEVEMENTS = [
  { id: 'first',    name: '첫 발걸음',     desc: '첫 번째 러닝 완료',          check: (s, p) => p.runs >= 1 },
  { id: 'dist1k',   name: '1000m 러너',    desc: '한 판에 1000m 달리기',       check: s => s.dist >= 1000 },
  { id: 'zone4',    name: '오로라의 끝',   desc: 'ZONE 4 도달',                check: s => s.zone >= 3 },
  { id: 'coins100', name: '코인 수집가',   desc: '한 판에 코인 100개',         check: s => s.coins >= 100 },
  { id: 'mult5',    name: '콤보 마스터',   desc: '콤보 배율 x5 달성',          check: s => s.maxMult >= 5 },
  { id: 'smash10',  name: '파괴왕',        desc: '한 판에 대시로 10개 파괴',   check: s => s.smash >= 10 },
  { id: 'near10',   name: '아슬아슬',      desc: '한 판에 아슬아슬 회피 10회', check: s => s.nearMiss >= 10 },
  { id: 'score20k', name: '레전드',        desc: '20,000점 달성',              check: s => s.score >= 20000 },
  { id: 'revive',   name: '불사조',        desc: '컨티뉴로 부활',              check: s => s.revives >= 1 },
  { id: 'daily',    name: '데일리 도전자', desc: '데일리 챌린지 플레이',       check: (s, p) => p.daily.played },
  { id: 'bank5k',   name: '부자',          desc: '코인 5,000개 보유',          check: (s, p) => p.bank >= 5000 },
  { id: 'allskins', name: '패셔니스타',    desc: '모든 스킨 보유',             check: (s, p) => p.skins.length >= SKINS.length },
  { id: 'runs50',   name: '베테랑',        desc: '50회 플레이',                check: (s, p) => p.runs >= 50 },
  { id: 'total10k', name: '마라토너',      desc: '누적 10,000m',               check: (s, p) => p.totalDist >= 10000 },
  { id: 'maxed',    name: '풀 파워',        desc: '업그레이드 하나를 최대 레벨로', check: (s, p) => UPGRADES.some(u => (p.upgrades[u.id] || 0) >= u.max) },
  { id: 'ghost',    name: '그림자를 넘어',  desc: '데일리 고스트 추월',         check: s => s.ghostBeaten >= 1 },
  { id: 'boss',     name: '보스 슬레이어', desc: '보스 격파',                  check: s => s.bossKills >= 1 },
  { id: 'boss3',    name: '정복자',        desc: '한 판에 보스 3마리 격파',    check: s => s.bossKills >= 3 },
];

// 데일리 챌린지 변형 규칙 (날짜 시드로 하나 선택)
export const DAILY_MODS = [
  { id: 'double',  name: '더블 코인',    desc: '코인 점수와 획득량이 2배',      coinMult: 2 },
  { id: 'turbo',   name: '터보 스타트',  desc: '시작 속도가 훨씬 빠름',         apply: g => { g.startSpeed = 32; } },
  { id: 'dense',   name: '장애물 밀집',  desc: '장애물이 더 촘촘하게 등장',     gapMult: 0.78 },
  { id: 'noitems', name: '아이템 금지',  desc: '방어막·자석이 등장하지 않음',   noItems: true },
  { id: 'magnet',  name: '자석 스타트',  desc: '자석 20초로 시작',              apply: g => { g.magnetT = 20; } },
  { id: 'lowg',    name: '저중력',       desc: '점프가 높고 천천히 떨어짐',     apply: g => { g.gravity = 22; } },
  { id: 'slowstart', name: '슬로우 스타트', desc: '슬로우모 8초로 시작',        apply: g => { g.slowT = 8; } },
];

// 장애물 색 팔레트. hc = 고대비(색약 친화) 모드: 파랑 / 노랑 / 흰색 / 주황
export const OBSTACLE_PALETTES = {
  normal: { low: 0xe8203e, bar: 0xffb020, wall: 0x8a40ff, orb: 0xff6a20 },
  hc:     { low: 0x2b7fff, bar: 0xffe600, wall: 0xf4f4ff, orb: 0xff8c00 },
};

// 초보자 힌트 (장애물이 처음 등장할 때). 고대비 모드는 색 이름이 다름
export const OBSTACLE_HINTS = {
  normal: {
    low:  '🔴 빨간 레이저가 와요 → 점프! (Space)',
    bar:  '🟡 노란 게이트 → 구르기! (↓ / S)',
    wall: '💎 크리스탈 → 옆 레인으로 피하세요',
    orb:  '🟠 플라즈마 오브는 좌우로 움직여요',
  },
  hc: {
    low:  '🔵 파란 레이저가 와요 → 점프! (Space)',
    bar:  '🟡 노란 게이트 → 구르기! (↓ / S)',
    wall: '⬜ 흰 크리스탈 → 옆 레인으로 피하세요',
    orb:  '🟠 플라즈마 오브는 좌우로 움직여요',
  },
};
