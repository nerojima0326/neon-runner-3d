// 파티클(InstancedMesh 1드로우콜) · 대시 잔상 · 스피드 라인
import * as THREE from 'three';
import { scene, cur } from './world.js';
import { PHYS } from './config.js';

// ---------- 파티클 ----------
const MAX_P = 600;
const pMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_P);
pMesh.frustumCulled = false; pMesh.setColorAt(0, new THREE.Color(1, 1, 1)); pMesh.count = 0;
scene.add(pMesh);
const parts = [], free = [];
for (let i = 0; i < MAX_P; i++) free.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, rot: 0, color: new THREE.Color() });
const dummy = new THREE.Object3D();

export function burst(pos, color, n = 30, power = 8) {
  for (let i = 0; i < n && free.length; i++) {
    const p = free.pop();
    p.x = pos.x; p.y = pos.y; p.z = pos.z;
    p.vx = (Math.random() - 0.5) * power; p.vy = Math.random() * power; p.vz = (Math.random() - 0.5) * power;
    p.life = 1; p.rot = Math.random() * 6; p.color.set(color);
    parts.push(p);
  }
}
export function updateParticles(dt) {
  let n = 0;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.vy -= PHYS.GRAVITY * 0.5 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += dt * 5; p.life -= dt * 0.8;
    if (p.life <= 0) { parts.splice(i, 1); free.push(p); continue; }
    dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(p.rot, p.rot * 0.7, 0); dummy.scale.setScalar(Math.max(0.01, p.life));
    dummy.updateMatrix(); pMesh.setMatrixAt(n, dummy.matrix); pMesh.setColorAt(n, p.color); n++;
  }
  pMesh.count = n;
  if (n) { pMesh.instanceMatrix.needsUpdate = true; pMesh.instanceColor.needsUpdate = true; }
}

// ---------- 대시 잔상 ----------
const ghostGeo = new THREE.SphereGeometry(0.42, 16, 12);
const ghosts = [], ghostFree = [];
for (let i = 0; i < 40; i++) {
  const m = new THREE.Mesh(ghostGeo, new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.45, depthWrite: false }));
  m.visible = false; scene.add(m); ghostFree.push(m);
}
export function spawnGhost(pos) {
  const g = ghostFree.pop(); if (!g) return;
  g.position.copy(pos); g.userData.life = 1; g.visible = true; ghosts.push(g);
}
export function updateGhosts(dt, dz) {
  for (let i = ghosts.length - 1; i >= 0; i--) {
    const g = ghosts[i]; g.position.z += dz; g.userData.life -= dt * 3;
    if (g.userData.life <= 0) { g.visible = false; ghosts.splice(i, 1); ghostFree.push(g); continue; }
    g.material.opacity = g.userData.life * 0.45; g.scale.setScalar(0.5 + g.userData.life * 0.5);
  }
}

// ---------- 스피드 라인 ----------
const SL = 140, slPos = new Float32Array(SL * 6), slData = [];
for (let i = 0; i < SL; i++) slData.push({ x: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 9), y: 0.5 + Math.random() * 9, z: -Math.random() * 130 });
const slGeo = new THREE.BufferGeometry(); slGeo.setAttribute('position', new THREE.BufferAttribute(slPos, 3));
const slMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
slMat.color = cur.a;
const speedLines = new THREE.LineSegments(slGeo, slMat); speedLines.frustumCulled = false; scene.add(speedLines);

export function updateSpeedLines(dt, dz, targetOpacity, len) {
  slMat.opacity += (targetOpacity - slMat.opacity) * Math.min(1, dt * 3);
  if (slMat.opacity < 0.01) { speedLines.visible = false; return; }
  speedLines.visible = true;
  for (let i = 0; i < SL; i++) {
    const s = slData[i]; s.z += dz * 1.6; if (s.z > 10) s.z -= 140;
    const o = i * 6; slPos[o] = s.x; slPos[o + 1] = s.y; slPos[o + 2] = s.z; slPos[o + 3] = s.x; slPos[o + 4] = s.y; slPos[o + 5] = s.z - len;
  }
  slGeo.attributes.position.needsUpdate = true;
}

// ============================================================
//  충돌 이펙트: 파편(바닥에 튕김) · 불꽃 줄기(속도 방향으로 늘어난 빛) · 충격파 링 · 섬광 구 · 순간 조명
//  전부 풀링, 파편·불꽃은 InstancedMesh 1드로우콜씩. 월드와 함께 흘러가도록 setScroll(dz)
// ============================================================
let scroll = 0;
export function setScroll(dz) { scroll = dz; }
const tmpV = new THREE.Vector3(), tmpC = new THREE.Color();

// 파편 (사면체 조각)
const MAX_SH = 260;
const shMesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_SH);
shMesh.frustumCulled = false; shMesh.setColorAt(0, tmpC.set(1, 1, 1)); shMesh.count = 0; scene.add(shMesh);
const shards = [], shFree = [];
for (let i = 0; i < MAX_SH; i++) shFree.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, wx: 0, wy: 0, life: 0, size: 1, color: new THREE.Color() });

// 불꽃 줄기 (가는 막대를 속도 방향으로 늘림, 가산 혼합)
const MAX_SP = 360;
const spMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.045, 0.045, 1),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), MAX_SP);
spMesh.frustumCulled = false; spMesh.setColorAt(0, tmpC.set(1, 1, 1)); spMesh.count = 0; scene.add(spMesh);
const sparks = [], spFree = [];
for (let i = 0; i < MAX_SP; i++) spFree.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, decay: 2, color: new THREE.Color() });

// 충격파 링(바닥) · 섬광 구
const ringGeo = new THREE.RingGeometry(0.82, 1, 56), flashGeo = new THREE.SphereGeometry(1, 20, 14);
const rings = [], flashes = [];
for (let i = 0; i < 8; i++) {
  const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  r.rotation.x = -Math.PI / 2; r.visible = false; r.userData = { life: 0, max: 3, speed: 2.4 }; scene.add(r); rings.push(r);
  const f = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  f.visible = false; f.userData = { life: 0, max: 2 }; scene.add(f); flashes.push(f);
}
// 순간 조명 (항상 씬에 두고 세기만 바꿈 → 조명 개수가 바뀌어 셰이더가 재컴파일되는 일 없음)
const hitLight = new THREE.PointLight(0xffffff, 0, 16, 1.6); scene.add(hitLight);
let lightI = 0;

function spawnShards(pos, color, n, power) {
  for (let i = 0; i < n && shFree.length; i++) {
    const s = shFree.pop(), a = Math.random() * Math.PI * 2, up = 0.4 + Math.random() * 0.9, sp = power * (0.4 + Math.random() * 0.8);
    s.x = pos.x + (Math.random() - 0.5) * 0.6; s.y = pos.y + (Math.random() - 0.5) * 0.6; s.z = pos.z + (Math.random() - 0.5) * 0.6;
    s.vx = Math.cos(a) * sp; s.vz = Math.sin(a) * sp * 0.8 - power * 0.2; s.vy = up * power;
    s.rx = Math.random() * 6; s.ry = Math.random() * 6; s.wx = (Math.random() - 0.5) * 18; s.wy = (Math.random() - 0.5) * 18;
    s.life = 1; s.size = 0.6 + Math.random() * 1.1; s.color.set(color);
    shards.push(s);
  }
}
export function spawnSparks(pos, color, n, power = 14, spread = 1) {
  for (let i = 0; i < n && spFree.length; i++) {
    const s = spFree.pop();
    tmpV.set(Math.random() - 0.5, Math.random() * 0.9 - 0.15, Math.random() - 0.5).normalize().multiplyScalar(power * (0.5 + Math.random() * 0.7));
    s.x = pos.x; s.y = pos.y; s.z = pos.z; s.vx = tmpV.x * spread; s.vy = tmpV.y; s.vz = tmpV.z;
    s.life = 1; s.decay = 2 + Math.random() * 2.2; s.color.set(i % 3 === 0 ? 0xffffff : color);
    sparks.push(s);
  }
}
function spawnRing(pos, color, maxR, speed = 2.4) {
  const r = rings.find(x => !x.visible) || rings[0];
  r.position.set(pos.x, 0.06, pos.z); r.material.color.set(color); Object.assign(r.userData, { life: 1, max: maxR, speed }); r.visible = true;
}
function spawnFlash(pos, color, maxR) {
  const f = flashes.find(x => !x.visible) || flashes[0];
  f.position.copy(pos); f.material.color.set(color); Object.assign(f.userData, { life: 1, max: maxR }); f.visible = true;
}

// 종합 충돌 이펙트. o: { shards, sparks, power, rings: [반지름...], flash: 반지름, light: 세기, color2 }
export function impact(pos, color, o = {}) {
  const power = o.power || 1;
  if (o.shards) { spawnShards(pos, color, o.color2 ? Math.ceil(o.shards / 2) : o.shards, 7 * power); if (o.color2) spawnShards(pos, o.color2, Math.floor(o.shards / 2), 7 * power); }
  if (o.sparks) spawnSparks(pos, color, o.sparks, 15 * power);
  (o.rings || []).forEach((R, i) => spawnRing(pos, i ? 0xffffff : color, R, 2.6 - i * 0.8));
  if (o.flash) spawnFlash(pos, color, o.flash);
  if (o.light) { hitLight.position.copy(pos); hitLight.position.y += 0.8; hitLight.color.set(color); lightI = Math.max(lightI, o.light); }
}

export function updateImpacts(dt) {
  const dz = scroll;
  let n = 0;
  for (let i = shards.length - 1; i >= 0; i--) {
    const s = shards[i];
    s.vy -= 24 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt + dz; s.rx += s.wx * dt; s.ry += s.wy * dt;
    if (s.y < 0.08 && s.vy < 0) { s.y = 0.08; s.vy *= -0.38; s.vx *= 0.7; s.vz *= 0.7; s.wx *= 0.6; s.wy *= 0.6; }   // 바닥에 튕김
    s.life -= dt * 0.85;
    if (s.life <= 0 || s.z > 14) { shards.splice(i, 1); shFree.push(s); continue; }
    dummy.position.set(s.x, s.y, s.z); dummy.rotation.set(s.rx, s.ry, 0); dummy.scale.setScalar(s.size * Math.min(1, s.life * 2.5));
    dummy.updateMatrix(); shMesh.setMatrixAt(n, dummy.matrix); shMesh.setColorAt(n, s.color); n++;
  }
  shMesh.count = n; if (n) { shMesh.instanceMatrix.needsUpdate = true; shMesh.instanceColor.needsUpdate = true; }

  n = 0;
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i], drag = Math.max(0, 1 - 3.2 * dt);
    s.vx *= drag; s.vy = s.vy * drag - 9 * dt; s.vz *= drag; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt + dz;
    s.life -= dt * s.decay;
    if (s.life <= 0) { sparks.splice(i, 1); spFree.push(s); continue; }
    const v = Math.hypot(s.vx, s.vy, s.vz);
    dummy.position.set(s.x, s.y, s.z); dummy.rotation.set(0, 0, 0);
    if (v > 1e-3) dummy.lookAt(s.x + s.vx, s.y + s.vy, s.z + s.vz);
    dummy.scale.set(s.life * 1.4, s.life * 1.4, Math.max(0.08, v * 0.045 * s.life));
    dummy.updateMatrix(); spMesh.setMatrixAt(n, dummy.matrix); spMesh.setColorAt(n, tmpC.copy(s.color).multiplyScalar(0.6 + s.life * 0.9)); n++;
  }
  spMesh.count = n; if (n) { spMesh.instanceMatrix.needsUpdate = true; spMesh.instanceColor.needsUpdate = true; }

  for (const r of rings) {
    if (!r.visible) continue;
    const u = r.userData; u.life -= dt * u.speed; r.position.z += dz;
    if (u.life <= 0) { r.visible = false; continue; }
    const p = 1 - u.life; r.scale.setScalar(0.2 + (1 - (1 - p) * (1 - p)) * u.max); r.material.opacity = u.life * 0.9;
  }
  for (const f of flashes) {
    if (!f.visible) continue;
    const u = f.userData; u.life -= dt * 5; f.position.z += dz;
    if (u.life <= 0) { f.visible = false; continue; }
    f.scale.setScalar(0.3 + (1 - u.life) * u.max); f.material.opacity = u.life * u.life * 0.85;
  }
  lightI = Math.max(0, lightI - dt * lightI * 9 - dt * 2); hitLight.intensity = lightI; hitLight.position.z += dz;
}

export function clearFx() {
  while (shards.length) shFree.push(shards.pop()); shMesh.count = 0;
  while (sparks.length) spFree.push(sparks.pop()); spMesh.count = 0;
  for (const r of rings) r.visible = false;
  for (const f of flashes) f.visible = false;
  lightI = 0; hitLight.intensity = 0; scroll = 0;
  while (parts.length) free.push(parts.pop());
  pMesh.count = 0;
  while (ghosts.length) { const g = ghosts.pop(); g.visible = false; ghostFree.push(g); }
  slMat.opacity = 0; speedLines.visible = false;
}
