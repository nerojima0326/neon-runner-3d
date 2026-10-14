// 플레이어 · 획득 이펙트 (충돌 이펙트는 fx.js의 impact — 여기와 분리)
//  - 별 반짝이(카메라를 보는 십자 별, InstancedMesh 1드로우콜)
//  - 바닥 링(먼지 고리·착지·시간 파문·자기장 파동) · 카메라를 보는 링(코인 팝·콤보·대시 시작)
//  - 지속 오라: 자석 자기장 파동 · 점수 2배 금빛 반짝이 · 슬로우모 시간 파문 · 구르기 불꽃 자국
import * as THREE from 'three';
import { scene, camera, cur } from './world.js';

let scroll = 0;
export function setScroll(dz) { scroll = dz; }

function canvasTex(draw, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  return new THREE.CanvasTexture(c);
}
// 십자 별 + 둥근 빛
const starTex = canvasTex((g, s) => {
  const h = s / 2, grd = g.createRadialGradient(h, h, 0, h, h, h);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.18, 'rgba(255,255,255,.55)'); grd.addColorStop(0.5, 'rgba(255,255,255,.08)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
  g.globalCompositeOperation = 'lighter';
  for (const [w, l] of [[s * 0.035, h * 0.98], [s * 0.02, h * 0.6]]) {
    g.save(); g.translate(h, h); if (l < h * 0.9) g.rotate(Math.PI / 4);
    for (let k = 0; k < 2; k++) {
      const lg = g.createLinearGradient(-l, 0, l, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg; g.fillRect(-l, -w / 2, l * 2, w); g.rotate(Math.PI / 2);
    }
    g.restore();
  }
});
// 링 텍스처 (가장자리가 부드러운 원형 띠)
const ringTex = canvasTex((g, s) => {
  const h = s / 2, grd = g.createRadialGradient(h, h, h * 0.62, h, h, h);
  grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.55, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
});

// ---------- 별 반짝이 ----------
const MAX_ST = 420;
const stMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: starTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), MAX_ST);
stMesh.frustumCulled = false; stMesh.setColorAt(0, new THREE.Color(1, 1, 1)); stMesh.count = 0; stMesh.renderOrder = 5; scene.add(stMesh);
const stars = [], stFree = [];
for (let i = 0; i < MAX_ST; i++) stFree.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, life: 0, decay: 1, size: 1, spin: 0, rot: 0, color: new THREE.Color(), follow: false });
const dummy = new THREE.Object3D(), tmpC = new THREE.Color(), tmpQ = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1);

// o: { vx, vy, vz, g(중력), life, decay, size, follow(월드와 함께 흘러감) }
function star(x, y, z, color, o = {}) {
  const s = stFree.pop(); if (!s) return;
  s.x = x; s.y = y; s.z = z; s.vx = o.vx || 0; s.vy = o.vy || 0; s.vz = o.vz || 0; s.g = o.g ?? 0;
  s.life = 1; s.decay = o.decay || 2; s.size = o.size || 0.4; s.spin = (Math.random() - 0.5) * 6; s.rot = Math.random() * 6;
  s.color.set(color); s.follow = o.follow ?? true;
  stars.push(s);
}
// 구 모양으로 퍼지는 별 n개
function starBurst(p, color, n, speed, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI * 0.6, v = speed * (0.5 + Math.random() * 0.6);
    star(p.x, p.y, p.z, i % 4 === 0 ? 0xffffff : color, { vx: Math.cos(a) * Math.cos(e) * v, vy: Math.sin(e) * v + (o.up || 0), vz: Math.sin(a) * Math.cos(e) * v, g: o.g ?? 6, decay: o.decay || 2.2, size: (o.size || 0.35) * (0.7 + Math.random() * 0.6) });
  }
}

// ---------- 링 ----------
const ringGeo = new THREE.PlaneGeometry(1, 1);
function ringPool(n, flat) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    if (flat) m.rotation.x = -Math.PI / 2;
    m.visible = false; m.renderOrder = 4; m.userData = { life: 0, from: 0.2, to: 2, speed: 2.5, op: 1, follow: true }; scene.add(m); arr.push(m);
  }
  return arr;
}
const groundRings = ringPool(18, true), faceRings = ringPool(12, false);
function ring(pool, x, y, z, color, from, to, speed, op = 1, follow = true) {
  const m = pool.find(r => !r.visible) || pool.reduce((a, b) => (a.userData.life < b.userData.life ? a : b));
  m.position.set(x, y, z); m.material.color.set(color);
  Object.assign(m.userData, { life: 1, from, to, speed, op, follow }); m.visible = true;
}

// ============================================================
//  이벤트 이펙트
// ============================================================
// 코인 획득: 금빛 팝 링 + 위로 튀는 별. 콤보 배율이 오를수록 분홍·보라 별이 섞이고 많아짐
const MULT_COL = [0xffe14d, 0xffe14d, 0xffb020, 0xff6ad5, 0xc070ff, 0x7df9ff];
// 자석으로 한꺼번에 여러 개를 먹을 때 화면이 뒤덮이지 않도록 링·큰 별은 0.06초에 한 번만
let lastCoinRing = 0, clock = 0;
export function coin(p, mult = 1) {
  const col = MULT_COL[Math.min(mult, 5)];
  if (clock - lastCoinRing > 0.06) {
    lastCoinRing = clock;
    ring(faceRings, p.x, p.y, p.z, 0xffe14d, 0.25, 1.2 + mult * 0.1, 4.5, 0.6);
    star(p.x, p.y, p.z, 0xffffff, { size: 0.75, decay: 7 });
  }
  starBurst(p, col, 3 + mult, 4.5, { up: 2.5, g: 7, size: 0.28 });
}
// 점프: 발밑 먼지 고리 + 옆으로 흩어지는 별
export function jump(x) {
  ring(groundRings, x, 0.05, 0, cur.a, 0.3, 2.0, 3.2, 0.85);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; star(x + Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3, cur.a, { vx: Math.cos(a) * 3.5, vy: 0.8, vz: Math.sin(a) * 3.5, g: 2, decay: 3, size: 0.3 }); }
}
// 더블 점프: 공중 발밑에 펼쳐지는 날개 링 2겹 + 아래로 뿜는 별
export function doubleJump(x, y) {
  // 공중 링은 월드와 함께 흘러가지 않고 그 자리(발밑)에 머묾
  ring(groundRings, x, y + 0.05, 0, 0x9fe8ff, 0.3, 2.4, 3.6, 1, false);
  ring(groundRings, x, y + 0.05, 0, 0xffffff, 0.2, 1.4, 4.5, 0.8, false);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; star(x, y + 0.1, 0, i % 2 ? 0x9fe8ff : 0xffffff, { vx: Math.cos(a) * 4, vy: -2.5, vz: Math.sin(a) * 4, g: 4, decay: 2.6, size: 0.34, follow: false }); }
}
// 착지: 바닥 충격 고리 + 낮게 튀는 먼지 별 (세게 떨어질수록 큼)
export function land(x, power = 1) {
  ring(groundRings, x, 0.05, 0, cur.a, 0.4, 1.6 + power * 0.8, 3.8, 0.7);
  const n = Math.round(4 + power * 6);
  for (let i = 0; i < n; i++) { const s = Math.random() < 0.5 ? -1 : 1; star(x + s * 0.3, 0.08, (Math.random() - 0.5) * 0.4, cur.a, { vx: s * (2 + Math.random() * 3) * power, vy: 1 + Math.random() * 1.5, vz: 1.5 + Math.random() * 2, g: 9, decay: 2.8, size: 0.26 }); }
}
// 구르기 시작: 바닥 고리
export function rollStart(x) { ring(groundRings, x, 0.05, 0, 0xffffff, 0.3, 1.3, 5, 0.6); }
// 구르기 중 바닥 불꽃 자국 (매 프레임 호출, 내부에서 빈도 조절)
let skidAcc = 0;
export function skid(x, dt, dash) {
  skidAcc += dt; if (skidAcc < 0.025) return; skidAcc = 0;
  const col = dash ? 0xffd040 : 0xffffff;
  for (let k = 0; k < 2; k++) star(x + (Math.random() - 0.5) * 0.5, 0.06, 0.35, Math.random() < 0.5 ? col : cur.a, { vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 2.5, vz: 3 + Math.random() * 4, g: 12, decay: 3.5, size: 0.22 });
}
// 하이퍼 대시 시작: 카메라 쪽으로 퍼지는 금빛 링 3겹 + 별 폭발
export function dashStart(p) {
  ring(faceRings, p.x, p.y, p.z, 0xffd040, 0.4, 4.5, 2.6, 0.75, false);
  ring(faceRings, p.x, p.y, p.z, 0xffffff, 0.3, 3, 3.4, 0.5, false);
  ring(groundRings, p.x, 0.05, p.z, 0xffd040, 0.5, 4, 2.4, 0.8);
  starBurst(p, 0xffd040, 18, 9, { g: 3, size: 0.32, decay: 2 });
}
// 콤보 배율 상승: 분홍 링 + 몸 주위를 도는 별 고리
export function combo(p, mult) {
  const col = MULT_COL[Math.min(mult, 5)];
  ring(faceRings, p.x, p.y, p.z, col, 0.5, 3 + mult * 0.3, 2.8, 1, false);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; star(p.x + Math.cos(a) * 0.5, p.y + Math.sin(a) * 0.5, p.z, i % 2 ? col : 0xffffff, { vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, vz: 0, g: 0, decay: 2.2, size: 0.4, follow: false }); }
}
// 방어막 생성 순간: 하늘색 링 2겹
export function shieldUp(p) {
  ring(faceRings, p.x, p.y, p.z, 0x60e8ff, 2.4, 0.9, 3.5, 0.9, false);   // 바깥에서 안으로 모여듦
  ring(groundRings, p.x, 0.05, p.z, 0x60e8ff, 0.4, 2.2, 3, 0.8);
  starBurst(p, 0x60e8ff, 12, 3, { g: 0, decay: 2.5, size: 0.3 });
}

// ============================================================
//  지속 오라 (매 프레임). a: { x, cy, shield, magnet, boost, slow, t }
// ============================================================
let magT = 0, boostT = 0, slowT = 0, shieldT = 0;
export function auras(dt, a) {
  if (a.magnet) {   // 자기장 파동: 바닥에서 안쪽으로 빨려드는 빨강/흰 고리 + 몸 주위를 도는 빨간 별
    magT -= dt;
    if (magT <= 0) { magT = 0.32; ring(groundRings, a.x, 0.06, 0, Math.random() < 0.5 ? 0xff4060 : 0xffd0d8, 3.2, 0.5, 2.6, 0.55, false); }
    if (Math.random() < dt * 14) { const ang = a.t * 5 + Math.random(); star(a.x + Math.cos(ang) * 1.1, a.cy + Math.sin(a.t * 3) * 0.4, Math.sin(ang) * 1.1, 0xff4060, { vx: -Math.cos(ang) * 2, vy: 0, vz: -Math.sin(ang) * 2, g: 0, decay: 3, size: 0.3, follow: false }); }
  } else magT = 0;
  if (a.boost) {    // 점수 2배: 몸 주위에서 금빛 별이 피어올라 위로
    boostT -= dt;
    if (boostT <= 0) { boostT = 0.05; const ang = Math.random() * Math.PI * 2; star(a.x + Math.cos(ang) * 0.6, a.cy - 0.4 + Math.random() * 0.8, Math.sin(ang) * 0.6, Math.random() < 0.3 ? 0xffffff : 0xffe14d, { vx: 0, vy: 1.8 + Math.random(), vz: 0.8, g: -0.5, decay: 1.8, size: 0.28 + Math.random() * 0.2, follow: false }); }
  } else boostT = 0;
  if (a.slow) {     // 슬로우모: 발밑에서 느리게 퍼지는 시간 파문
    slowT -= dt;
    if (slowT <= 0) { slowT = 0.55; ring(groundRings, a.x, 0.05, 0, 0x60ffe0, 0.5, 5, 1.1, 0.5); }
  } else slowT = 0;
  if (a.shield) {   // 방어막: 표면에서 가끔 하늘색 반짝임
    shieldT -= dt;
    if (shieldT <= 0) { shieldT = 0.09; const u = Math.random() * Math.PI * 2, v = Math.acos(Math.random() * 2 - 1); star(a.x + Math.sin(v) * Math.cos(u) * 0.92, a.cy + Math.cos(v) * 0.92, Math.sin(v) * Math.sin(u) * 0.92, 0xbff6ff, { decay: 3, size: 0.3, g: 0, follow: false }); }
  } else shieldT = 0;
}
// 범용 (보스전 등): 별 폭발 · 꼬리 한 점
export function sparkle(p, color, n = 10, speed = 5, size = 0.35, follow = false) { starBurst(p, color, n, speed, { g: 2, size }); if (!follow) for (let i = stars.length - n; i < stars.length; i++) if (stars[i]) stars[i].follow = false; }
export function trail(p, color, size = 0.35) { star(p.x, p.y, p.z, color, { decay: 3.5, size, g: 0, follow: false }); }
export function faceRing(p, color, from, to, speed = 3, op = 1) { ring(faceRings, p.x, p.y, p.z, color, from, to, speed, op, false); }
export function groundRing(x, z, color, from, to, speed = 3, op = 1) { ring(groundRings, x, 0.06, z, color, from, to, speed, op, true); }

// 자석에 끌려오는 코인의 금빛 꼬리
export function magnetTrail(p) { star(p.x, p.y, p.z, 0xffe14d, { decay: 4, size: 0.28, g: 0 }); }

// ============================================================
export function update(dt) {
  const dz = scroll; clock += dt;
  tmpQ.copy(camera.quaternion);
  let n = 0;
  for (let i = stars.length - 1; i >= 0; i--) {
    const s = stars[i];
    s.vy -= s.g * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt + (s.follow ? dz : 0); s.rot += s.spin * dt;
    if (s.y < 0.04) { s.y = 0.04; s.vy *= -0.3; }
    s.life -= dt * s.decay;
    if (s.life <= 0) { stars.splice(i, 1); stFree.push(s); continue; }
    dummy.position.set(s.x, s.y, s.z); dummy.quaternion.copy(tmpQ);
    dummy.rotateOnAxis(zAxis, s.rot);
    const tw = 0.75 + 0.25 * Math.sin(s.rot * 3);   // 반짝임
    dummy.scale.setScalar(s.size * Math.min(1, s.life * 2.2) * tw);
    dummy.updateMatrix(); stMesh.setMatrixAt(n, dummy.matrix); stMesh.setColorAt(n, tmpC.copy(s.color).multiplyScalar(0.5 + s.life)); n++;
  }
  stMesh.count = n; if (n) { stMesh.instanceMatrix.needsUpdate = true; stMesh.instanceColor.needsUpdate = true; }

  for (const pool of [groundRings, faceRings]) for (const m of pool) {
    if (!m.visible) continue;
    const u = m.userData; u.life -= dt * u.speed;
    if (u.follow) m.position.z += dz;
    if (u.life <= 0) { m.visible = false; continue; }
    const p = 1 - u.life, e = 1 - (1 - p) * (1 - p);
    m.scale.setScalar(u.from + (u.to - u.from) * e);
    m.material.opacity = u.op * Math.min(1, u.life * 1.6);
    if (pool === faceRings) m.quaternion.copy(tmpQ);
  }
}
export function clear() {
  while (stars.length) stFree.push(stars.pop()); stMesh.count = 0;
  for (const m of groundRings) m.visible = false;
  for (const m of faceRings) m.visible = false;
  scroll = 0;
}
