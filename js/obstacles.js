// 장애물 · 코인 · 아이템: 생성(오브젝트 풀), 스폰 규칙, 이동, 판정
//  low  빨간 레이저 허들  → 점프
//  bar  노란 레이저 게이트 → 구르기 (또는 높은 점프)
//  wall 크리스탈 모노리스  → 피하기 (더블 점프로 넘기 가능)
//  orb  플라즈마 오브      → 레인을 가로질러 움직임
import * as THREE from 'three';
import { scene } from './world.js';
import { LANES, PHYS, THEMES, TUTORIAL, OBSTACLE_PALETTES, ITEM_WEIGHTS } from './config.js';
import { G, rolling } from './state.js';
import { player } from './player.js';
import * as vfx from './vfx.js';

// 현재 팔레트의 장애물 대표색 (파티클 등). setPalette()가 값을 바꿈
export const OBS_COLOR = { ...OBSTACLE_PALETTES.normal };

const M = {
  pylonGeo: new THREE.BoxGeometry(0.16, 1.1, 0.16), tallPylonGeo: new THREE.BoxGeometry(0.16, 1.9, 0.16),
  pylonMat: new THREE.MeshStandardMaterial({ color: 0x1a1a2a, metalness: 0.8, roughness: 0.3 }),
  tipGeo: new THREE.SphereGeometry(0.1, 10, 8), beamGeo: new THREE.CylinderGeometry(0.035, 0.035, 1.9, 6),
  beamMat: new THREE.MeshBasicMaterial({ color: 0xe8203e, transparent: true }),
  barBeamMat: new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true }),
  fieldGeo: new THREE.PlaneGeometry(1.9, 0.9), barFieldGeo: new THREE.PlaneGeometry(1.9, 0.7),
  fieldMat: new THREE.MeshBasicMaterial({ color: 0xc01838, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }),
  barFieldMat: new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }),
  crystalGeo: new THREE.OctahedronGeometry(1, 0),
  crystalMat: new THREE.MeshStandardMaterial({ color: 0x6a28d8, emissive: 0x30107a, emissiveIntensity: 1, flatShading: true, metalness: 0.4, roughness: 0.2, transparent: true, opacity: 0.92 }),
  crystalEdgeMat: new THREE.LineBasicMaterial({ color: 0xc090f0 }),
  ringGeo: new THREE.TorusGeometry(0.95, 0.05, 6, 40), ringMat: new THREE.MeshBasicMaterial({ color: 0x8048c8 }),
  shardGeo: new THREE.TetrahedronGeometry(0.18, 0),
  orbGeo: new THREE.SphereGeometry(0.6, 24, 16),
  orbMat: new THREE.MeshStandardMaterial({ color: 0xff6a20, emissive: 0xa03000, emissiveIntensity: 1.1, roughness: 0.4 }),
  orbRingGeo: new THREE.TorusGeometry(0.85, 0.04, 6, 36), orbRingMat: new THREE.MeshBasicMaterial({ color: 0xffa060 }),
  coinGeo: new THREE.OctahedronGeometry(0.4, 0),
  coinMat: new THREE.MeshStandardMaterial({ color: 0xffe14d, emissive: 0xc08800, emissiveIntensity: 1, metalness: 0.6 }),
  puRingGeo: new THREE.TorusGeometry(0.6, 0.05, 6, 32),
  shieldRingMat: new THREE.MeshBasicMaterial({ color: 0x40d8ff }), magnetRingMat: new THREE.MeshBasicMaterial({ color: 0xff4060 }),
  shieldGeo: new THREE.IcosahedronGeometry(0.32, 1), shieldMat: new THREE.MeshBasicMaterial({ color: 0x80ecff, wireframe: true }),
  magnetGeo: new THREE.TorusGeometry(0.25, 0.09, 8, 20, Math.PI),
  magnetMat: new THREE.MeshStandardMaterial({ color: 0xff3050, emissive: 0x801020, emissiveIntensity: 1 }),
  tipBoxGeo: new THREE.BoxGeometry(0.18, 0.12, 0.18), whiteMat: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  // ⏱ 슬로우모(시계) · ✨ 점수 2배(별)
  slowRingMat: new THREE.MeshBasicMaterial({ color: 0x60ffe0 }), boostRingMat: new THREE.MeshBasicMaterial({ color: 0xffe14d }),
  clockGeo: new THREE.TorusGeometry(0.24, 0.05, 8, 24), handGeo: new THREE.BoxGeometry(0.05, 0.2, 0.05),
  clockMat: new THREE.MeshStandardMaterial({ color: 0x80ffe8, emissive: 0x106050, emissiveIntensity: 1 }),
  starGeo: new THREE.OctahedronGeometry(0.3, 0),
  starMat: new THREE.MeshStandardMaterial({ color: 0xffe14d, emissive: 0xc08800, emissiveIntensity: 1.2, flatShading: true }),
};
// 장애물 바닥 네온 빛 웅덩이 (방사형 그라데이션, 가산 혼합). 종류별 머티리얼 공유 → setPalette로 색 변경
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const glowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const GLOW = {};
for (const t of ['low', 'bar', 'wall', 'orb']) GLOW[t] = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, color: OBSTACLE_PALETTES.normal[t] });
const GLOW_SIZE = { low: [3.2, 2.2], bar: [3.2, 2.2], wall: [3.4, 3.4], orb: [2.6, 2.6] };
function withGlow(g, type) {
  const d = new THREE.Mesh(glowGeo, GLOW[type]); d.scale.set(GLOW_SIZE[type][0], 1, GLOW_SIZE[type][1]); d.position.y = 0.04; d.renderOrder = -1;
  g.add(d); g.userData.glow = d;
  return g;
}

// 아이템 대표색 (획득 파티클 등)
export const ITEM_COLOR = { shield: 0x60e8ff, magnet: 0xff4060, slow: 0x60ffe0, boost: 0xffe14d };
const RING_MAT = { shield: 'shieldRingMat', magnet: 'magnetRingMat', slow: 'slowRingMat', boost: 'boostRingMat' };
M.crystalEdgeGeo = new THREE.EdgesGeometry(M.crystalGeo);

// 고대비(색약 친화) 모드 ↔ 기본 팔레트. 머티리얼은 공유되므로 색만 바꾸면 모든 장애물에 즉시 반영
const tmpC = new THREE.Color();
export function setPalette(highContrast) {
  const p = OBSTACLE_PALETTES[highContrast ? 'hc' : 'normal'];
  Object.assign(OBS_COLOR, p);
  for (const t in GLOW) GLOW[t].color.setHex(p[t]);
  plasmaU.color.value.setHex(p.orb); M.orbHaloMat.color.setHex(p.orb); M.orbTrailMat.color.setHex(p.orb); M.orbPathMat.color.setHex(p.orb);
  M.beamMat.color.setHex(p.low);    M.fieldMat.color.copy(tmpC.setHex(p.low).multiplyScalar(0.85));
  M.barBeamMat.color.setHex(p.bar); M.barFieldMat.color.copy(tmpC.setHex(p.bar).multiplyScalar(0.9));
  if (highContrast) {
    M.crystalMat.color.setHex(0xd8d8ff); M.crystalMat.emissive.setHex(0x8080a0); M.crystalEdgeMat.color.setHex(0xffffff); M.ringMat.color.setHex(0xffffff);
    M.orbMat.color.setHex(p.orb); M.orbMat.emissive.setHex(0xa04000); M.orbRingMat.color.setHex(0xffc080);
  } else {
    M.crystalMat.color.setHex(0x6a28d8); M.crystalMat.emissive.setHex(0x30107a); M.crystalEdgeMat.color.setHex(0xc090f0); M.ringMat.color.setHex(0x8048c8);
    M.orbMat.color.setHex(p.orb); M.orbMat.emissive.setHex(0xa03000); M.orbRingMat.color.setHex(0xffa060);
  }
}

function makeLaserHurdle() {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(M.pylonGeo, M.pylonMat); p.position.set(s * 0.95, 0.55, 0); p.castShadow = true;
    const tip = new THREE.Mesh(M.tipGeo, M.beamMat); tip.position.set(s * 0.95, 1.15, 0); g.add(p, tip);
  }
  for (const y of [0.3, 0.6, 0.9]) { const b = new THREE.Mesh(M.beamGeo, M.beamMat); b.rotation.z = Math.PI / 2; b.position.y = y; g.add(b); }
  const f = new THREE.Mesh(M.fieldGeo, M.fieldMat); f.position.y = 0.6; g.add(f);
  return g;
}
function makeLaserGate() {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(M.tallPylonGeo, M.pylonMat); p.position.set(s * 0.95, 0.95, 0); p.castShadow = true;
    const tip = new THREE.Mesh(M.tipGeo, M.barBeamMat); tip.position.set(s * 0.95, 1.95, 0); g.add(p, tip);
  }
  for (const y of [1.05, 1.35, 1.65]) { const b = new THREE.Mesh(M.beamGeo, M.barBeamMat); b.rotation.z = Math.PI / 2; b.position.y = y; g.add(b); }
  const f = new THREE.Mesh(M.barFieldGeo, M.barFieldMat); f.position.y = 1.35; g.add(f);
  return g;
}
function makeCrystal() {
  const g = new THREE.Group(), c = new THREE.Group();
  c.add(new THREE.Mesh(M.crystalGeo, M.crystalMat), new THREE.LineSegments(M.crystalEdgeGeo, M.crystalEdgeMat));
  c.scale.set(0.85, 1.6, 0.85); c.position.y = 1.65; c.children[0].castShadow = true;
  const ring = new THREE.Mesh(M.ringGeo, M.ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.05;
  const shards = new THREE.Group(); shards.position.y = 1.6;
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(M.shardGeo, M.crystalMat), a = i / 3 * Math.PI * 2;
    s.position.set(Math.cos(a) * 1.15, (i - 1) * 0.6, Math.sin(a) * 1.15); shards.add(s);
  }
  g.add(c, ring, shards); g.userData.spinA = c; g.userData.spinB = shards;
  return g;
}
// ---------- 플라즈마 오브 ----------
// 핵: 소용돌이치는 플라즈마 셰이더(밝은 필라멘트 + 가장자리 발광) · 후광 · 전자 궤도 고리 3개와 전자 · 핵에서 튀는 번개 ·
// 좌우로 움직일 때 남는 잔상 · 바닥에 오가는 경로 표시(좌우로 움직이는 장애물임을 미리 알려줌). 판정 크기는 그대로
const ORB_Y = 0.65, ARC_N = 3, ARC_SEG = 6;
const plasmaU = { time: { value: 0 }, color: { value: new THREE.Color(0xff6a20) } };
M.plasmaMat = new THREE.ShaderMaterial({
  uniforms: plasmaU,
  vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float time; uniform vec3 color; varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){
      vec3 p = normalize(vP) * 3.0;
      float n = sin(p.x * 2.1 + time * 3.0) + sin(p.y * 2.7 - time * 2.3) + sin(p.z * 2.4 + time * 2.9) + sin((p.x + p.y - p.z) * 1.7 + time * 4.1);
      float veins = smoothstep(0.55, 1.0, 1.0 - abs(sin(n * 2.6)));
      float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
      vec3 hot = mix(color, vec3(1.0, 0.96, 0.85), 0.75);
      vec3 c = color * 0.28 + hot * veins * 1.5 + color * fres * 1.8;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
const ADD = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
M.orbHaloMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xff6a20, ...ADD, opacity: 0.9 });
M.orbTrailMat = new THREE.MeshBasicMaterial({ color: 0xff6a20, ...ADD, opacity: 0.22 });
M.orbArcMat = new THREE.LineBasicMaterial({ color: 0xffd0a0, ...ADD });
M.orbPathMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0xff6a20, ...ADD, opacity: 0.55 });
M.electronMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
M.orbCoreGeo = new THREE.SphereGeometry(0.58, 40, 28); M.trailGeo = new THREE.SphereGeometry(0.5, 16, 12);
M.electronGeo = new THREE.SphereGeometry(0.07, 8, 6); M.orbPathGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const ORB_RINGS = [[0.82, 0.03, Math.PI / 2, 0], [0.95, 0.022, 0.5, 0.9], [1.06, 0.018, -0.6, -0.7]];

function makeOrb() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(M.orbCoreGeo, M.plasmaMat); core.position.y = ORB_Y; core.castShadow = true;
  const halo = new THREE.Sprite(M.orbHaloMat); halo.position.y = ORB_Y; halo.scale.setScalar(3);
  // 전자 궤도 고리: 서로 다른 기울기로 돌고, 각 고리에 전자 하나
  const atom = new THREE.Group(); atom.position.y = ORB_Y;
  const orbits = ORB_RINGS.map(([r, tube, rx, rz]) => {
    const tilt = new THREE.Group(); tilt.rotation.set(rx, 0, rz);
    const spin = new THREE.Group(); tilt.add(spin);
    spin.add(new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 48), M.orbRingMat));
    const e = new THREE.Mesh(M.electronGeo, M.electronMat); e.position.x = r; spin.add(e);
    atom.add(tilt); return spin;
  });
  // 번개: 핵 표면에서 바깥으로 튀는 지그재그 선 3가닥 (주기적으로 새로 그림)
  const arcGeo = new THREE.BufferGeometry(); arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_N * ARC_SEG * 2 * 3), 3));
  const arcs = new THREE.LineSegments(arcGeo, M.orbArcMat); arcs.position.y = ORB_Y; arcs.frustumCulled = false;
  // 잔상: 지나온 x 위치에 점점 옅어지는 구
  const ghosts = [];
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(M.trailGeo, M.orbTrailMat); m.position.y = ORB_Y; m.scale.setScalar(1 - i * 0.12); ghosts.push(m); g.add(m); }
  // 바닥 경로 표시 (월드에 고정: 매 프레임 그룹 x의 반대로 옮김)
  const path = new THREE.Mesh(M.orbPathGeo, M.orbPathMat); path.scale.set(6.6, 1, 0.9); path.position.y = 0.035;
  g.add(path, core, halo, atom, arcs);
  g.userData.spinA = atom;
  g.userData.orb = { core, halo, orbits, arcs, ghosts, path, hist: new Float32Array(24), arcT: 0 };
  return g;
}
function zigzag(arr, o, from, to, jag) {   // from → to 를 ARC_SEG 조각 지그재그로
  let px = from.x, py = from.y, pz = from.z;
  for (let s = 1; s <= ARC_SEG; s++) {
    const k = s / ARC_SEG, j = s === ARC_SEG ? 0 : jag;
    const x = from.x + (to.x - from.x) * k + (Math.random() - 0.5) * j, y = from.y + (to.y - from.y) * k + (Math.random() - 0.5) * j, z = from.z + (to.z - from.z) * k + (Math.random() - 0.5) * j;
    arr[o++] = px; arr[o++] = py; arr[o++] = pz; arr[o++] = x; arr[o++] = y; arr[o++] = z;
    px = x; py = y; pz = z;
  }
  return o;
}
const vA = new THREE.Vector3(), vB = new THREE.Vector3();
function updateOrb(o, dt, t) {
  const d = o.userData.orb, x = o.position.x;
  // 잔상: 4프레임 간격 위치 기록
  d.hist.copyWithin(1, 0); d.hist[0] = x;
  d.ghosts.forEach((m, i) => { m.position.x = d.hist[(i + 1) * 3] - x; });
  d.path.position.x = -x;
  d.orbits.forEach((s, i) => { s.rotation.z += dt * (3.2 + i * 1.3) * (i % 2 ? -1 : 1); });
  d.halo.scale.setScalar(2.8 + Math.sin(t * 9 + o.userData.phase) * 0.3);
  d.core.scale.setScalar(1 + Math.sin(t * 14 + o.userData.phase) * 0.03);
  d.arcT -= dt;
  if (d.arcT <= 0) {
    d.arcT = 0.05 + Math.random() * 0.05;
    const arr = d.arcs.geometry.attributes.position.array; let k = 0;
    for (let i = 0; i < ARC_N; i++) {
      vA.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      vB.copy(vA).multiplyScalar(0.95 + Math.random() * 0.35).add(vA.clone().set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.5));
      vA.multiplyScalar(0.5);
      k = zigzag(arr, k, vA, vB, 0.22);
    }
    d.arcs.geometry.attributes.position.needsUpdate = true;
    d.arcs.visible = Math.random() < 0.85;   // 가끔 꺼져 지직거림
  }
}
const makers = { low: makeLaserHurdle, bar: makeLaserGate, wall: makeCrystal, orb: makeOrb };

function makePowerup(type) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(M.puRingGeo, M[RING_MAT[type]]);
  let icon;
  if (type === 'shield') icon = new THREE.Mesh(M.shieldGeo, M.shieldMat);
  else if (type === 'magnet') {
    icon = new THREE.Group(); icon.add(new THREE.Mesh(M.magnetGeo, M.magnetMat));
    for (const s of [-1, 1]) { const t = new THREE.Mesh(M.tipBoxGeo, M.whiteMat); t.position.set(s * 0.25, -0.04, 0); icon.add(t); }
  } else if (type === 'slow') {
    // 시계: 테두리 + 분침(위) + 시침(오른쪽)
    icon = new THREE.Group(); icon.add(new THREE.Mesh(M.clockGeo, M.clockMat));
    const minute = new THREE.Mesh(M.handGeo, M.whiteMat); minute.position.y = 0.09;
    const hour = new THREE.Mesh(M.handGeo, M.whiteMat); hour.scale.y = 0.7; hour.rotation.z = -Math.PI / 2; hour.position.x = 0.06;
    icon.add(minute, hour);
  } else icon = new THREE.Mesh(M.starGeo, M.starMat);
  g.add(ring, icon); g.userData = { type, icon, ring };
  return g;
}

// ---------- 풀 ----------
const pools = { low: [], bar: [], wall: [], orb: [] }, coinPool = [], puPools = { shield: [], magnet: [], slow: [], boost: [] };
export let obstacles = [], coins = [], powerups = [];
let rowsSincePowerup = 0;
const seenTypes = new Set();

function acquire(type) { const o = pools[type].pop() || withGlow(makers[type](), type); o.userData.type = type; return o; }
function release(o) { scene.remove(o); pools[o.userData.type].push(o); }
function releaseCoin(c) { scene.remove(c); coinPool.push(c); }
function releasePowerup(p) { scene.remove(p); puPools[p.userData.type].push(p); }

// Fisher-Yates: Array.sort(랜덤 비교자)는 엔진마다 결과가 달라 데일리 코스 재현이 깨짐
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

// rnd: 보스가 소환할 땐 Math.random을 넘겨 데일리 시드 난수 순서를 건드리지 않음. z: 생성 위치(기본 SPAWN_Z)
// chase > 0: 보스 소환 장애물. 플레이어 뒤(+z)에서 생겨 초당 chase만큼 플레이어 쪽(-z)으로 덮쳐옴
export function spawnObstacle(lane, type, rnd = G.rng, z = PHYS.SPAWN_Z, chase = 0) {
  const o = acquire(type);
  o.position.set(type === 'orb' ? 0 : LANES[lane], 0, z);
  Object.assign(o.userData, { phase: rnd() * Math.PI * 2, crossed: false, passed: false, wasHit: false, hint: !seenTypes.has(type), spawnZ: z, chase });
  seenTypes.add(type);
  scene.add(o); obstacles.push(o);
}
export function spawnCoin(lane, z, y = 1) {
  const m = coinPool.pop() || new THREE.Mesh(M.coinGeo, M.coinMat);
  m.position.set(LANES[lane], y, z); scene.add(m); coins.push(m);
}
// 아이템 종류 가중 선택. rng 호출은 정확히 1회 (데일리 코스 재현성)
const ITEM_TYPES = Object.keys(ITEM_WEIGHTS), ITEM_TOTAL = ITEM_TYPES.reduce((s, t) => s + ITEM_WEIGHTS[t], 0);
function pickItem() {
  let r = G.rng() * ITEM_TOTAL;
  for (const t of ITEM_TYPES) if ((r -= ITEM_WEIGHTS[t]) < 0) return t;
  return ITEM_TYPES[0];
}
export function spawnPowerup(lane, z, type = pickItem()) {
  const g = puPools[type].pop() || makePowerup(type);
  g.position.set(LANES[lane], 1.1, z);
  scene.add(g); powerups.push(g);
}

export function resetObstacles() {
  for (const o of obstacles) release(o); obstacles = [];
  for (const c of coins) releaseCoin(c); coins = [];
  for (const p of powerups) releasePowerup(p); powerups = [];
  rowsSincePowerup = 0; seenTypes.clear();
}
// 부활 시 플레이어 근처 장애물 제거
export function clearAhead(zMin) {
  for (let i = obstacles.length - 1; i >= 0; i--) if (obstacles[i].position.z > zMin) { release(obstacles[i]); obstacles.splice(i, 1); }
}

// ---------- 스폰 규칙 ----------
function pickType(w) {
  let r = G.rng() * (w.low + w.bar + w.wall);
  if ((r -= w.low) < 0) return 'low';
  if ((r -= w.bar) < 0) return 'bar';
  return 'wall';
}
// 첫 판 연습 구간: 가운데 레인에 한 종류씩 (점프 → 구르기 → 피하기), 양옆 레인엔 코인
function spawnTutorialRow() {
  const type = TUTORIAL.ROWS[G.tutorialRows % TUTORIAL.ROWS.length], Z = PHYS.SPAWN_Z;
  G.tutorialRows++;
  spawnObstacle(1, type);
  if (type === 'wall') { for (const l of [0, 2]) for (let k = 0; k < 3; k++) spawnCoin(l, Z - 4 - k * 2.5); }
  else for (let k = -1; k <= 1; k++) spawnCoin(1, Z + k * 2, type === 'low' ? 2.2 - Math.abs(k) * 0.5 : 0.5);
}

export function spawnRow(diff) {
  if (G.tutorial) return spawnTutorialRow();
  const theme = THEMES[G.zone % THEMES.length], rng = G.rng, Z = PHYS.SPAWN_Z;
  rowsSincePowerup++;
  if (rng() < theme.orb + diff * 0.08) { spawnObstacle(1, 'orb'); return -1; }

  const lanes = shuffle([0, 1, 2], rng);
  const r = rng();
  const count = r < 0.15 + diff * 0.25 ? 3 : r < 0.6 + diff * 0.2 ? 2 : 1;
  const types = Array.from({ length: count }, () => pickType(theme.weights));
  if (count === 3 && types.every(t => t === 'wall')) types[0] = rng() < 0.5 ? 'low' : 'bar';   // 3레인 전부 벽이면 통과 불가

  for (let i = 0; i < count; i++) {
    spawnObstacle(lanes[i], types[i]);
    if (types[i] === 'low' && rng() < 0.4) for (let k = -1; k <= 1; k++) spawnCoin(lanes[i], Z + k * 2, 2.2 - Math.abs(k) * 0.5);
    if (types[i] === 'bar' && rng() < 0.3) for (let k = -1; k <= 1; k++) spawnCoin(lanes[i], Z + k * 1.5, 0.5);
  }
  if (count < 3) {
    const free = lanes[count];
    if (!G.mod?.noItems && rowsSincePowerup > 7 && rng() < 0.25) { spawnPowerup(free, Z - 4); rowsSincePowerup = 0; }
    else if (rng() < 0.6) for (let k = 0; k < 5; k++) spawnCoin(free, Z - 6 - k * 2.5);
    return free;   // 빈 레인
  }
  return -1;
}

// ---------- 판정 ----------
// 판정용 X: 레인 이동을 시작했으면(첫 프레임에 0.3 이상 움직이면) 이미 목표 레인에 있는 것으로 봄 → 입력 반응이 즉각적으로 느껴짐.
// 화면상 이동은 스프링으로 부드럽게(player.steer) 하되 판정은 키를 누른 다음 프레임에 바로 넘어감
export function logicalX() { const tx = LANES[G.lane]; return Math.abs(player.position.x - tx) < 2.2 ? tx : player.position.x; }
// 프레임이 느려도(한 프레임에 2~3유닛 이동) 통과되지 않도록, 이번 프레임에 지나간 구간 [prevZ, z]이 판정 구간과 겹치는지 검사
function hits(o, roll, prevZ) {
  const dx = Math.abs(logicalX() - o.position.x);
  // 지나간 구간 [lo, hi] (뒤에서 덮쳐오는 소환 장애물은 z가 줄어드는 방향)
  if (Math.max(prevZ, o.position.z) < -0.9 || Math.min(prevZ, o.position.z) > 0.9) return false;
  switch (o.userData.type) {
    case 'low':  return dx < 1.4 && G.jumpY < 0.9;
    case 'bar':  return dx < 1.4 && !roll && G.jumpY < 1.45;
    case 'wall': return dx < 1.4 && G.jumpY < 2.9;
    case 'orb':  return dx < 1.1 && G.jumpY < 1.15;
  }
  return false;
}

// ev: { onHit(o) → 'smash'|'shield'|'ignore'|'dead', onPass(o, ud), onHint(type) }
export function updateObstacles(dt, t, dz, ev) {
  M.beamMat.opacity = 0.75 + Math.sin(t * 40) * 0.2;
  plasmaU.time.value = t;
  M.barBeamMat.opacity = 0.75 + Math.sin(t * 33 + 1) * 0.2;
  const roll = rolling(), px = logicalX();
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i], ud = o.userData, prevZ = o.position.z, ch = ud.chase;
    o.position.z += ch ? -ch * dt : dz;
    // 등장 연출: 생성 지점에서 24유닛 동안 바닥에서 솟아오르며(살짝 튀어나왔다 자리 잡음) 나타남. 판정과 무관한 시각 효과
    const a = Math.min(1, Math.abs(o.position.z - ud.spawnZ) / 24);
    if (a < 1) { const e = 1 + 2.4 * (a - 1) ** 3 + 1.4 * (a - 1) ** 2; o.scale.set(1, Math.max(0.01, e), 1); }   // 빛 웅덩이는 바닥 평면이라 세로 배율과 무관
    else if (o.scale.y !== 1) o.scale.set(1, 1, 1);
    if (ud.spinA) ud.spinA.rotation.y += dt * (ud.type === 'orb' ? 4 : 1.2);
    if (ud.spinB) ud.spinB.rotation.y -= dt * 2;
    if (ud.type === 'orb') { o.position.x = Math.sin(ud.phase + t * 1.6) * 2.5; updateOrb(o, dt, t); }
    // 뒤에서 덮쳐오는 소환 장애물은 플레이어를 지나 앞쪽 카메라(z -9)에 닿기 전에 사라짐
    if (ch ? o.position.z < -5 : o.position.z > 12) { release(o); obstacles.splice(i, 1); continue; }
    if (ud.hint && o.position.z > -75) { ud.hint = false; ev.onHint(ud.type); }
    if (!ud.crossed && (ch ? o.position.z <= 0.25 : o.position.z >= -0.25)) {
      ud.crossed = true; ud.crossDx = Math.abs(px - o.position.x); ud.crossRoll = roll; ud.crossJump = G.jumpY;
      ud.crossRealDx = Math.abs(player.position.x - o.position.x);   // 판정용 X가 아닌 실제 몸 위치 (마지막 순간 레인 변경 감지)
    }
    if (hits(o, roll, prevZ)) {
      const r = ev.onHit(o);
      if (r === 'dead') return;
      if (r === 'ignore') { ud.wasHit = true; continue; }
      release(o); obstacles.splice(i, 1); continue;     // smash / shield
    }
    if (!ud.passed && (ch ? o.position.z < -1.0 : o.position.z > 1.0)) { ud.passed = true; ev.onPass(o, ud); }
  }
}

export function updateCoins(dt, t, dz, center, magnet, onCollect) {
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i], prevZ = c.position.z; c.position.z += dz; c.rotation.y += dt * 4;
    if (magnet && c.position.z > -25 && c.position.z < 3) { c.position.lerp(center, Math.min(1, dt * 9)); if (Math.random() < 0.6) vfx.magnetTrail(c.position); }   // 끌려오는 코인의 금빛 꼬리
    if (c.position.z > 12) { releaseCoin(c); coins.splice(i, 1); continue; }
    if (Math.abs(c.position.x - center.x) < 1.1 && Math.abs(c.position.y - center.y) < 1.2 && c.position.z >= center.z - 1.1 && prevZ <= center.z + 1.1) {
      onCollect(c); releaseCoin(c); coins.splice(i, 1);
    }
  }
}
export function updatePowerups(dt, t, dz, center, onCollect) {
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i], prevZ = p.position.z; p.position.z += dz;
    p.userData.icon.rotation.y += dt * 3; p.userData.ring.rotation.y -= dt * 2;
    p.position.y = 1.1 + Math.sin(t * 4 + i) * 0.15;
    if (p.position.z > 12) { releasePowerup(p); powerups.splice(i, 1); continue; }
    if (Math.abs(p.position.x - center.x) < 1.3 && Math.abs(p.position.y - center.y) < 1.4 && p.position.z >= center.z - 1.3 && prevZ <= center.z + 1.3) {
      onCollect(p); releasePowerup(p); powerups.splice(i, 1);
    }
  }
}
