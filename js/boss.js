// 보스전: 등장 → 전투(레인 레이저 · 폭탄 · 장애물 소환) → 격파 / 도주
//  - 보스는 플레이어 뒤 하늘(BOSS.POS_Y, POS_Z > 0)에서 쫓아오고 월드와 함께 흘러가지 않음. 카메라는 앞에서 플레이어와 보스를 함께 비춤(main.js)
//  - 공격과 파란 오브는 전부 뒤(보스 쪽)에서 플레이어 쪽(-z)으로 다가옴 → 앞을 보는 카메라에서도 미리 보임
//  - 파란 오브를 먹으면 유도탄이 날아가 HP 1 감소
//  - 보스 난수는 Math.random (데일리 시드 난수 순서를 건드리지 않음)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { scene } from './world.js';
import { BOSS, LANES } from './config.js';
import { G } from './state.js';
import * as O from './obstacles.js';
import * as vfx from './vfx.js';
import * as fx from './fx.js';
import * as audio from './audio.js';

const rnd = Math.random;
const ADD = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();

// ---------- 보스 모델 ----------
const col = new THREE.Color();
const coreMat = new THREE.MeshStandardMaterial({ color: 0x140820, emissive: 0xff2bd6, emissiveIntensity: 0.6, flatShading: true, metalness: 0.7, roughness: 0.3 });
const wireMat = new THREE.MeshBasicMaterial({ color: 0xff2bd6, wireframe: true, transparent: true, opacity: 0.55 });
const ringMat = new THREE.MeshBasicMaterial({ color: 0xff2bd6 });
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const pupilMat = new THREE.MeshBasicMaterial({ color: 0xff2bd6 });
const haloMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xff2bd6, ...ADD, opacity: 0.7 });
const shardMat = new THREE.MeshStandardMaterial({ color: 0x200a30, emissive: 0xff2bd6, emissiveIntensity: 0.9, flatShading: true });

// 뒤에서 쫓아오므로 눈(로컬 +z)이 플레이어 쪽(-z)을 보도록 180° 돌림
const boss = new THREE.Group(); boss.visible = false; boss.scale.setScalar(BOSS.SCALE); boss.rotation.y = Math.PI; scene.add(boss);
const body = new THREE.Group(); boss.add(body);
const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.1, 1), coreMat);
const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(2.75, 1), wireMat);
const eye = new THREE.Mesh(new THREE.SphereGeometry(0.75, 24, 16), eyeMat); eye.position.z = 1.75; eye.scale.z = 0.5;
const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), pupilMat); pupil.position.z = 2.05;
const halo = new THREE.Sprite(haloMat); halo.scale.setScalar(13);
body.add(halo, core, shell, eye, pupil);
const rings = [3.6, 4.5].map((r, i) => {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 6, 72), ringMat);
  m.rotation.x = Math.PI / 2 + (i ? 0.5 : -0.35); body.add(m); return m;
});
const shardGroup = new THREE.Group(); body.add(shardGroup);
for (let i = 0; i < 6; i++) {
  const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), shardMat), a = i / 6 * Math.PI * 2;
  s.position.set(Math.cos(a) * 3.9, Math.sin(a * 2) * 0.6, Math.sin(a) * 3.9); s.scale.y = 1.8; shardGroup.add(s);
}

// ---------- 3D 모델 (BOSS.MODELS: 보스마다 하나) ----------
// 로딩되면 절차 생성 몸통(core·shell·eye)을 숨기고 그 보스의 모델로 교체. 고리·파편·후광은 그대로 모델 주위를 돎.
// 재질: 어두운 금속 + 보스 색 은은한 발광 + 가장자리(프레넬) 네온 테두리 (+ 원본의 노멀맵으로 표면 결). 피격 땐 테두리가 하늘색으로 번쩍
const RIM = 2.0, MODEL_GLOW = 0.07;   // 평소 테두리 발광 · 몸 발광 세기
const rimU = { rimColor: { value: new THREE.Color(0xff2bd6) }, rimStr: { value: RIM } };
const rimShader = sh => {
  Object.assign(sh.uniforms, rimU);
  sh.fragmentShader = 'uniform vec3 rimColor;\nuniform float rimStr;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
    '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += rimColor * rimStr * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);');
};
const modelMats = [];   // 모든 모델 재질 (보스 색·피격 번쩍임을 한꺼번에 갱신)
function neonMat(normalMap) {
  const m = new THREE.MeshStandardMaterial({ color: 0x241a30, metalness: 0.6, roughness: 0.32, emissive: 0xff2bd6, emissiveIntensity: MODEL_GLOW, normalMap });
  m.onBeforeCompile = rimShader; modelMats.push(m); return m;
}
// look: 고개 돌림(플레이어를 따라봄 · 그로기 땐 휘청). 모델·눈 발광이 그 안에 있음
const look = new THREE.Group(); body.add(look);
const eyeGlowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xff2bd6, ...ADD });
const eyeCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
// 그로기 눈: 빙글빙글 도는 소용돌이 (@_@)
const spiralMat = new THREE.SpriteMaterial({ ...ADD, color: 0xffffff, map: (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.translate(64, 64); g.strokeStyle = '#fff'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath();
  for (let a = 0; a < Math.PI * 6; a += 0.1) { const r = 4 + a * 3; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.stroke(); return new THREE.CanvasTexture(c);
})() });

// .gltf는 원본 색·거칠기·AO 텍스처를 빼고(네온 재질로 덮으니 불필요) 노멀맵만 받음. .glb는 그대로
function loadGltf(url) {
  const loader = new GLTFLoader();
  if (!/\.gltf(\?|$)/i.test(url)) return loader.loadAsync(url).then(g => g.scene);
  return fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(json => {
    for (const m of json.materials || []) {
      if (m.pbrMetallicRoughness) { delete m.pbrMetallicRoughness.baseColorTexture; delete m.pbrMetallicRoughness.metallicRoughnessTexture; }
      delete m.occlusionTexture; delete m.emissiveTexture;
    }
    return new Promise((res, rej) => loader.parse(JSON.stringify(json), url.slice(0, url.lastIndexOf('/') + 1), g => res(g.scene), rej));
  });
}
// 받침대 등 아래쪽 frac(0~1) 높이를 잘라냄: 그 아래에만 있는 삼각형을 빼고 새 지오메트리로 (남은 꼭짓점만으로 크기를 다시 재기 위해)
function cutBottom(root, frac) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root), yCut = box.min.y + (box.max.y - box.min.y) * frac, v = new THREE.Vector3();
  root.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry, pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count;
    const at = k => (idx ? idx.getX(k) : k), y = i => v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).y;
    const keep = [];
    for (let k = 0; k < n; k += 3) { const a = at(k), b = at(k + 1), c = at(k + 2); if (Math.max(y(a), y(b), y(c)) >= yCut) keep.push(a, b, c); }
    const ng = new THREE.BufferGeometry(), get = ['getX', 'getY', 'getZ', 'getW'];
    for (const name in g.attributes) {
      const src = g.attributes[name], s = src.itemSize, arr = new Float32Array(keep.length * s);   // getX 등은 정규화·인터리브를 풀어서 돌려줌
      keep.forEach((i, j) => { for (let c = 0; c < s; c++) arr[j * s + c] = src[get[c]](i); });
      ng.setAttribute(name, new THREE.BufferAttribute(arr, s));
    }
    o.geometry = ng; g.dispose();
  });
}
const models = [], loading = [];   // models[i] = { holder, eyes, mouth, front, top } (보스 번호별)
let cur = -1;                      // 지금 보스의 모델 번호
export function loadModel(i) {
  const M = BOSS.MODELS?.[i];
  if (!M?.url) return Promise.resolve(false);
  return (loading[i] ??= loadGltf(M.url).then(root => {
    if (M.cut) cutBottom(root, M.cut);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
    const s = M.size / Math.max(size.x, size.y, size.z);
    root.traverse(o => { if (o.isMesh) { const nm = o.material.normalMap || null; o.material.dispose(); o.material = neonMat(nm); o.castShadow = o.receiveShadow = false; } });
    root.scale.setScalar(s); root.position.copy(box.getCenter(new THREE.Vector3())).multiplyScalar(-s);   // 모델 중심을 원점에
    const holder = new THREE.Group(); holder.rotation.set(M.rotX || 0, M.rotY || 0, 0); holder.add(root);
    holder.updateMatrixWorld(true);
    const hb = new THREE.Box3().setFromObject(holder);   // 회전 후 크기 (look 기준): 앞면 z · 머리 꼭대기 y
    // 눈·입 위치: 설정은 [가로, 세로] 비율(-0.5~0.5). 앞에서 광선을 쏴 얼굴 표면 z를 찾고 dz만큼 앞에 둠 (눈구멍이면 구멍 안쪽)
    const meshes = [], ray = new THREE.Raycaster(), hc = hb.getCenter(new THREE.Vector3()), hs = hb.getSize(new THREE.Vector3());
    root.traverse(o => { if (o.isMesh) meshes.push(o); });
    const onFace = ([fx, fy], dz) => {
      const p = new THREE.Vector3(hc.x + fx * hs.x, hc.y + fy * hs.y, hb.max.z + 5);
      ray.set(p, new THREE.Vector3(0, 0, -1));
      const hit = ray.intersectObjects(meshes, false)[0];
      return p.setZ((hit ? hit.point.z : hb.max.z) + dz);
    };
    const eyes = new THREE.Group();
    for (const f of M.eyes || []) {
      const g = new THREE.Group(); g.position.copy(onFace(f, M.eyeDepth ?? 0.12));
      const glow = new THREE.Sprite(eyeGlowMat); glow.scale.setScalar(M.eyeSize);
      const core = new THREE.Mesh(new THREE.SphereGeometry(M.eyeSize * 0.12, 12, 8), eyeCoreMat);
      const spiral = new THREE.Sprite(spiralMat); spiral.scale.setScalar(M.eyeSize * 0.5); spiral.visible = false;
      g.add(glow, core, spiral); g.userData = { glow, core, spiral }; eyes.add(g);
    }
    holder.visible = eyes.visible = false; look.add(holder, eyes);
    models[i] = { holder, eyes, mouth: onFace(M.mouth || [0, -0.2], 0.4), front: hb.max.z, top: hb.max.y };
    if (cur === i) showModel(i);   // 싸우는 도중에 도착하면 바로 교체
    return true;
  }).catch(() => false));
}
// i번 보스의 모델로 바꿈 (아직 없으면 절차 생성 몸통)
function showModel(i) {
  cur = i;
  models.forEach((m, k) => { if (m) m.holder.visible = m.eyes.visible = k === i; });
  const m = models[i];
  core.visible = shell.visible = eye.visible = pupil.visible = !m;   // 모델일 땐 pupil은 공격 발사 지점으로만 씀
  if (m) {
    halo.position.z = -m.front * 0.8;                      // 후광은 모델 뒤로 (실루엣이 뒤에서 빛나게)
    pupil.position.copy(m.mouth);                          // 레이저·폭탄은 입 앞에서
    HIT_OFF.set(0, 0.3, -(m.front * BOSS.SCALE) - 0.3);    // 명중 이펙트는 모델 앞면에 (보스가 180° 돌아 있어 월드 -z)
    dizzy.position.y = m.top + 0.2; dizzyR = m.front * 0.6 + 0.8;
  } else {
    halo.position.z = 0; pupil.position.set(0, 0, 2.05); HIT_OFF.set(0, -0.4, -4.2);
    dizzy.position.y = 3.4; dizzyR = 3;
  }
  look.rotation.set(0, 0, 0);
}
const curModel = () => models[cur];

// ---------- 그로기 (파란 오브 유도탄에 맞으면 STUN_TIME초) ----------
// 머리 위를 도는 노란 별 · 소용돌이 눈(@_@) · 고개가 휘청휘청 · 몸이 내려앉아 비틀거림 · 공격 중단
const starTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,.9)'); grd.addColorStop(0.5, 'rgba(255,255,255,.15)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#fff'; g.beginPath();
  for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 18 : 44; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
  g.closePath(); g.fill();
  return new THREE.CanvasTexture(c);
})();
const dizzy = new THREE.Group(); dizzy.visible = false; body.add(dizzy);
const dizzyStars = Array.from({ length: 5 }, () => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, color: 0xffe14d, ...ADD })); dizzy.add(s); return s;
});
let dizzyR = 3;

// ---------- 공격 오브젝트 ----------
// 레인 레이저: 바닥 경고 줄무늬 → 보스 발밑부터 플레이어 바로 앞(z -6, 앞쪽 카메라에 닿기 전)까지 레인 전체를 덮는 빔
const BEAM_LEN = BOSS.POS_Z + 8, BEAM_Z = BOSS.POS_Z + 2 - BEAM_LEN / 2;
const warnMat = new THREE.MeshBasicMaterial({ color: 0xff2040, ...ADD, opacity: 0.4, side: THREE.DoubleSide });
const beamMat = new THREE.MeshBasicMaterial({ color: 0xff3060, ...ADD, opacity: 0.9 });
const beamCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, ...ADD, opacity: 1 });
function makeBeam() {
  const g = new THREE.Group();
  const warn = new THREE.Mesh(new THREE.PlaneGeometry(2.2, BEAM_LEN).rotateX(-Math.PI / 2), warnMat.clone()); warn.position.set(0, 0.05, BEAM_Z);
  const ray = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.9, BEAM_LEN), beamMat.clone()); ray.position.set(0, 0.95, BEAM_Z);
  const rcore = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, BEAM_LEN), beamCoreMat); rcore.position.set(0, 0.95, BEAM_Z);
  const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.8, 1, 10, 1, true), beamMat.clone());   // 보스 눈 → 레인 끝으로 꽂히는 빔
  g.add(warn, ray, rcore, drop); g.userData = { warn, ray, rcore, drop };
  g.visible = false; scene.add(g); return g;
}
const beamPool = [makeBeam(), makeBeam()];
// 폭탄: 빛나는 가시 공 + 바닥 착지 표시
const bombGeo = new THREE.IcosahedronGeometry(0.62, 0), spikeGeo = new THREE.ConeGeometry(0.16, 0.5, 5);
const bombMat = new THREE.MeshStandardMaterial({ color: 0x1a0610, emissive: 0xff2040, emissiveIntensity: 1.2, flatShading: true });
const markMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0xff2040, ...ADD, opacity: 0.8 });
const UP = new THREE.Vector3(0, 1, 0);
function makeBomb() {
  const g = new THREE.Group(), ball = new THREE.Group();
  ball.add(new THREE.Mesh(bombGeo, bombMat));
  for (const v of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    const s = new THREE.Mesh(spikeGeo, bombMat); s.position.set(v[0] * 0.65, v[1] * 0.65, v[2] * 0.65);
    s.quaternion.setFromUnitVectors(UP, new THREE.Vector3(...v)); ball.add(s);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff2040, ...ADD, opacity: 0.8 })); glow.scale.setScalar(2.4); ball.add(glow);
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), markMat.clone()); mark.position.y = 0.05;
  g.add(ball); g.userData = { ball, mark }; scene.add(mark); mark.visible = false; g.visible = false; scene.add(g);
  return g;
}
const bombPool = [];
// 파란 오브 (보스 공격 아이템) · 유도탄
const ORB_COL = 0x40a8ff;
const blueMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff });
const blueRingMat = new THREE.MeshBasicMaterial({ color: ORB_COL });
const blueOrb = new THREE.Group();
{
  const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 1), blueMat);
  const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 6, 32), blueRingMat), r2 = r1.clone(); r2.rotation.x = Math.PI / 2;
  const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: ORB_COL, ...ADD, opacity: 0.9 })); h.scale.setScalar(2.6);
  // 멀리서도 보이는 빛기둥
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.3, 14, 8, 1, true), new THREE.MeshBasicMaterial({ color: ORB_COL, ...ADD, opacity: 0.25 })); beacon.position.y = 6;
  blueOrb.add(c, r1, r2, h, beacon); blueOrb.userData = { c, r1, r2 };
  blueOrb.visible = false; scene.add(blueOrb);
}
const missileMat = new THREE.MeshBasicMaterial({ color: 0xd0f0ff });
const missiles = [], missilePool = [];
function getMissile() {
  let m = missilePool.pop();
  if (!m) {
    m = new THREE.Group();
    m.add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), missileMat));
    const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: ORB_COL, ...ADD })); h.scale.setScalar(1.8); m.add(h);
  }
  scene.add(m); return m;
}

// ---------- 유도탄 명중 이펙트 ----------
// 짧고 작은 섬광 → 회전하며 퍼지는 빛살 2겹(파랑 · 그로기 별과 같은 노랑) · 보스를 감싸며 팽창하는 에너지 껍질 · 명중 지점에서 보스 표면으로 뻗는 번개.
// 섬광이 크거나 길면 블룸에 하얗게 뭉쳐 보스가 안 보이므로 0.2초 안에 끝냄.
// 보스 앞면(플레이어 쪽)에 붙어서 보스와 함께 움직이고, 보스 몸에 가려지지 않게 맨 위에 그림. 연속 명중 대비 2세트
const rayTex = (() => {   // 8갈래 가는 빛살 (긴 것·짧은 것 번갈아). 가운데는 비워 둠 (빛살이 겹쳐 블룸에 하얀 덩어리가 되지 않게)
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); g.translate(128, 128); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 8; i++) {
    const len = 128 * (i % 2 ? 0.6 : 0.98), w = i % 2 ? 3 : 5, lg = g.createLinearGradient(0, 0, len, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.3, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg; g.beginPath(); g.moveTo(0, -w); g.lineTo(len, 0); g.lineTo(0, w); g.closePath(); g.fill();
    g.rotate(Math.PI / 4);
  }
  return new THREE.CanvasTexture(c);
})();
const HIT_LIFE = 0.8, HIT_OFF = new THREE.Vector3(0, -0.4, -4.2);   // 지속 시간 · 명중 지점(보스 중심 기준, 플레이어 쪽 앞면)
const HIT_ARCS = 10, HIT_SEG = 7, TOP = { ...ADD, depthTest: false };
function makeHitFx() {
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xcfeaff, ...TOP }));
  const rays = new THREE.Sprite(new THREE.SpriteMaterial({ map: rayTex, color: ORB_COL, ...TOP }));
  const rays2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: rayTex, color: 0xffe14d, ...TOP }));
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: ORB_COL, wireframe: true, ...ADD }));
  const arcGeo = new THREE.BufferGeometry(); arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(HIT_ARCS * HIT_SEG * 6), 3));
  const arcs = new THREE.LineSegments(arcGeo, new THREE.LineBasicMaterial({ color: 0xc8ecff, ...TOP })); arcs.frustumCulled = false;
  const parts = [flash, rays, rays2, shell, arcs];
  for (const o of parts) { o.renderOrder = 8; o.visible = false; scene.add(o); }
  return { flash, rays, rays2, shell, arcs, parts, t: HIT_LIFE, arcT: 0 };
}
const hitFxPool = [makeHitFx(), makeHitFx()];
const aFrom = new THREE.Vector3(), aTo = new THREE.Vector3();
function drawArcs(h) {   // 명중 지점 → 플레이어 쪽 반구의 보스 표면 여기저기로 지그재그 번개
  const arr = h.arcs.geometry.attributes.position.array; let o = 0;
  for (let i = 0; i < HIT_ARCS; i++) {
    aFrom.copy(HIT_OFF); aTo.set(rnd() - 0.5, rnd() - 0.5, -rnd() * 0.9).normalize().multiplyScalar(-HIT_OFF.z * (0.8 + rnd() * 0.9));
    let px = aFrom.x, py = aFrom.y, pz = aFrom.z;
    for (let s = 1; s <= HIT_SEG; s++) {
      const k = s / HIT_SEG, j = s === HIT_SEG ? 0 : 1.2;
      const x = aFrom.x + (aTo.x - aFrom.x) * k + (rnd() - 0.5) * j, y = aFrom.y + (aTo.y - aFrom.y) * k + (rnd() - 0.5) * j, z = aFrom.z + (aTo.z - aFrom.z) * k + (rnd() - 0.5) * j;
      arr[o++] = px; arr[o++] = py; arr[o++] = pz; arr[o++] = x; arr[o++] = y; arr[o++] = z;
      px = x; py = y; pz = z;
    }
  }
  h.arcs.geometry.attributes.position.needsUpdate = true;
}
function startHitFx() {
  const h = hitFxPool.find(x => x.t >= HIT_LIFE) || hitFxPool.reduce((a, b) => (a.t > b.t ? a : b));
  h.t = 0; h.arcT = 0; h.rays.material.rotation = rnd() * Math.PI; h.rays2.material.rotation = rnd() * Math.PI;
  for (const o of h.parts) o.visible = true;
}
function updateHitFx(dt) {
  for (const h of hitFxPool) {
    if (h.t >= HIT_LIFE) continue;
    h.t += dt;
    if (h.t >= HIT_LIFE) { for (const o of h.parts) o.visible = false; continue; }
    const k = h.t / HIT_LIFE, e = 1 - (1 - k) ** 3, fk = Math.min(1, h.t / 0.2);
    h.flash.position.copy(boss.position).add(HIT_OFF); h.rays.position.copy(h.flash.position); h.rays2.position.copy(h.flash.position);
    h.shell.position.copy(boss.position); h.arcs.position.copy(boss.position);
    h.flash.scale.setScalar(3 + 13 * (1 - (1 - fk) ** 2)); h.flash.material.opacity = 0.7 * (1 - fk) ** 2;      // 순간 섬광 (작고 짧게)
    h.rays.scale.setScalar(6 + 34 * e); h.rays.material.opacity = 0.65 * (1 - k) ** 1.5; h.rays.material.rotation += dt * 1.2;
    h.rays2.scale.setScalar(4 + 22 * e); h.rays2.material.opacity = 0.45 * (1 - k); h.rays2.material.rotation -= dt * 2.2;
    h.shell.scale.setScalar(4 + 16 * e); h.shell.material.opacity = 0.55 * (1 - k); h.shell.rotation.y += dt * 2; h.shell.rotation.x += dt;
    h.arcT -= dt; if (h.arcT <= 0) { h.arcT = 0.04; drawArcs(h); }                                            // 지직거리며 다시 그려짐
    h.arcs.material.opacity = 1 - k; h.arcs.visible = rnd() < 0.9;
  }
}

// ---------- 상태 ----------
let phase = null;          // null | 'enter' | 'fight' | 'defeat' | 'flee'
let level = 0, hp = 0, maxHp = 0, timeLeft = 0, phaseT = 0, attackCd = 0, flinch = 0, hitGlow = 0, punchT = 0;   // punchT: 피격 출렁임(찌그러짐·흔들림)
let stunT = 0, stunAmt = 0;   // 그로기 남은 시간 · 연출 세기(0~1, 부드럽게 들어가고 빠짐)
const hitCol = new THREE.Color(), HIT_TINT = new THREE.Color(0x9fdcff);
let nextAt = BOSS.FIRST_SCORE, orbCd = 0, orbOn = false, color = BOSS.COLORS[0], name = '';
const beams = [], bombs = [];
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3(), eyePos = new THREE.Vector3();

export const active = () => phase !== null;
export const fighting = () => phase === 'enter' || phase === 'fight';

function setColor(c) {
  color = c; col.setHex(c);
  coreMat.emissive.setHex(c); wireMat.color.setHex(c); ringMat.color.setHex(c); pupilMat.color.setHex(c); haloMat.color.setHex(c); shardMat.emissive.setHex(c);
  for (const m of modelMats) m.emissive.setHex(c);
  rimU.rimColor.value.setHex(c); eyeGlowMat.color.setHex(c);
}

export function reset() {
  phase = null; level = 0; nextAt = BOSS.FIRST_SCORE; boss.visible = false; stunT = stunAmt = 0; dizzy.visible = false;
  clearAttacks();
  for (const h of hitFxPool) { h.t = HIT_LIFE; for (const o of h.parts) o.visible = false; }   // 명중 이펙트는 격파 연출과 겹치도록 clearAttacks에선 지우지 않음
}
// 부활·격파·도주 시: 날아오던 공격 전부 제거
export function clearAttacks() {
  for (const b of beams) b.visible = false; beams.length = 0;
  for (const b of bombs) { b.visible = false; b.userData.mark.visible = false; bombPool.push(b); } bombs.length = 0;
  for (const m of missiles) { scene.remove(m); missilePool.push(m); } missiles.length = 0;
  blueOrb.visible = false; orbOn = false;
}

// 점수가 다음 보스 점수에 닿으면 등장(force: 디버그 소환, lv: 디버그로 레벨 지정). 시작했으면 { name, color, level } 반환
export function check(score, force = false, lv = 0) {
  if (phase || G.tutorial || (!force && score < nextAt)) return null;
  level = lv > 0 ? lv : level + 1;
  const i = (level - 1) % BOSS.NAMES.length, n = BOSS.NAMES.length;
  name = BOSS.NAMES[i] + (level > n ? ` MK-${Math.ceil(level / n)}` : '');
  setColor(BOSS.COLORS[i]);
  showModel(i); loadModel(i); loadModel((i + 1) % n);   // 이 보스 모델(아직이면 도착 즉시 교체) + 다음 보스 모델 미리 받기
  maxHp = hp = BOSS.HP + (level - 1) * BOSS.HP_STEP;
  timeLeft = BOSS.TIME_LIMIT; phase = 'enter'; phaseT = 0; attackCd = 1.2; flinch = 0; hitGlow = 0; punchT = 0; stunT = stunAmt = 0;
  orbCd = 1.5; orbOn = false;
  boss.visible = true; boss.position.set(0, BOSS.POS_Y + 30, BOSS.POS_Z); body.rotation.set(0, 0, 0);
  audio.arpeggio([220, 196, 175, 147], 'sawtooth', 160, 0.09);
  return { name, color, level };
}

// 파란 오브: 레이저·폭탄이 없는 레인을 골라 플레이어 뒤에서 다가오게 함
function spawnBlueOrb() {
  const busy = l => beams.some(b => b.userData.lane === l) || bombs.some(b => b.userData.lane === l);
  const free = [0, 1, 2].filter(l => !busy(l)), pick = free.length ? free : [0, 1, 2];
  orbOn = true;
  blueOrb.position.set(LANES[pick[Math.floor(rnd() * pick.length)]], 1.1, BOSS.ORB_Z); blueOrb.visible = true;
  vfx.groundRing(blueOrb.position.x, BOSS.ORB_Z, ORB_COL, 0.4, 2.6, 2.4, 0.9);
}

// ---------- 공격 ----------
const attackCooldown = () => Math.max(BOSS.ATTACK_CD_MIN, BOSS.ATTACK_CD - (level - 1) * BOSS.ATTACK_CD_STEP) * (1 - 0.3 * (1 - hp / maxHp));
const eyeWorld = out => pupil.getWorldPosition(out);
function fireBeam(lane) {
  const b = beamPool.find(x => !x.visible); if (!b) return;
  const u = b.userData;
  b.position.x = LANES[lane]; b.visible = true;
  Object.assign(u, { lane, t: 0, hit: false });
  u.ray.visible = u.rcore.visible = u.drop.visible = false; u.warn.visible = true;
  u.warn.material.color.copy(col); u.ray.material.color.copy(col); u.drop.material.color.copy(col);
  beams.push(b);
  audio.beep(880, 0.25, 'sawtooth', 0.05, -400);
}
function throwBomb(lane) {
  const b = bombPool.pop() || makeBomb(), u = b.userData;
  eyeWorld(eyePos);
  Object.assign(u, { lane, t: 0, landed: false, from: eyePos.clone(), x: LANES[lane], crossed: false });
  b.position.copy(eyePos); b.visible = true;
  u.mark.position.set(LANES[lane], 0.05, BOSS.BOMB_LAND_Z); u.mark.scale.setScalar(0.5); u.mark.visible = true; u.mark.material.color.copy(col);
  bombs.push(b);
  audio.beep(160, 0.3, 'square', 0.06, 200);
}
// 소환: 플레이어 뒤에 장애물을 만들어 덮쳐오게 함 (빨강 점프 · 노랑 구르기 · 크리스탈 피하기)
function summon() {
  const lane = Math.floor(rnd() * 3), type = ['low', 'bar', 'wall'][Math.floor(rnd() * 3)];
  O.spawnObstacle(lane, type, rnd, BOSS.CHASE_Z, BOSS.CHASE_SPEED);
  tmp.set(LANES[lane], 1.2, BOSS.CHASE_Z);
  vfx.groundRing(LANES[lane], BOSS.CHASE_Z, color, 0.5, 4, 2, 1);
  vfx.sparkle(tmp, color, 16, 6, 0.45, true);
  eyeWorld(eyePos); for (let i = 0; i < 10; i++) { tmp2.lerpVectors(eyePos, tmp, i / 10); vfx.trail(tmp2, color, 0.5); }
  audio.beep(300, 0.3, 'triangle', 0.06, -150);
}
function attack() {
  const r = rnd();
  if (r < 0.42 && beams.length === 0) {
    fireBeam(G.lane);
    // 레벨 2+ · HP 절반 이하: 레인 두 개를 동시에 (한 레인은 항상 비워 둠)
    if (level >= 2 && hp <= maxHp / 2) { const other = [0, 1, 2].filter(l => l !== G.lane); fireBeam(other[Math.floor(rnd() * 2)]); }
  } else if (r < 0.75) {
    throwBomb(G.lane);
    if (level >= 3) throwBomb([0, 1, 2].filter(l => l !== G.lane)[Math.floor(rnd() * 2)]);
  } else summon();
}

// ---------- 매 프레임 ----------
// ctx: { t, center(몸 중심), px(판정 X),
//        hurt(kind, pos, color) → 'dead'|'shield'|'smash'|'ignore', onOrb(), onHit(hp, maxHp), onDefeat(level), onFlee() }
export function update(dt, ctx) {
  if (!phase) return;
  const { t } = ctx;
  phaseT += dt;
  flinch = Math.max(0, flinch - dt * 3); hitGlow = Math.max(0, hitGlow - dt * 3); punchT = Math.max(0, punchT - dt * 2);
  updateHitFx(dt);

  // 그로기 세기: 걸리면 빠르게 1로, 풀리면 천천히 0으로 (정신 차리는 느낌)
  if (stunT > 0) stunT = Math.max(0, stunT - dt);
  stunAmt += ((stunT > 0 ? 1 : 0) - stunAmt) * Math.min(1, dt * (stunT > 0 ? 8 : 3));
  const sa = phase === 'fight' ? stunAmt : 0, spin = 1 - sa * 0.75;   // 그로기 중엔 고리·파편도 느려짐

  // 보스 몸 애니메이션
  shell.rotation.y += dt * 0.6; shell.rotation.x += dt * 0.25; core.rotation.y -= dt * 0.4;
  rings[0].rotation.z += dt * 1.4 * spin; rings[1].rotation.z -= dt * 0.9 * spin; shardGroup.rotation.y += dt * 0.8 * spin;
  rings[0].rotation.y = Math.sin(t * 3.1) * 0.35 * sa; rings[1].rotation.y = Math.cos(t * 2.7) * 0.4 * sa;   // 고리가 비틀비틀
  for (const s of shardGroup.children) s.rotation.y += dt * 3;
  shardGroup.position.y = -1.2 * sa;   // 파편이 힘없이 처짐
  coreMat.emissiveIntensity = 0.6 + hitGlow * 2.5 + Math.sin(t * 6) * 0.1;
  haloMat.opacity = (0.55 + Math.sin(t * 3) * 0.1) * (1 - sa * 0.4) + hitGlow * 0.4;
  eyeMat.color.setHex(hitGlow > 0.5 ? ORB_COL : 0xffffff);
  // 피격: 몸 전체가 하늘색으로 번쩍 + 젤리처럼 출렁(가로로 퍼졌다 세로로 늘어남) + 좌우로 고개를 흔듦
  hitCol.copy(col).lerp(HIT_TINT, Math.min(1, hitGlow * 1.2));
  coreMat.emissive.copy(hitCol); wireMat.color.copy(hitCol); ringMat.color.copy(hitCol); shardMat.emissive.copy(hitCol);
  for (const m of modelMats) { m.emissive.copy(hitCol); m.emissiveIntensity = MODEL_GLOW + hitGlow * 0.3; }
  rimU.rimColor.value.copy(hitCol); eyeGlowMat.color.copy(hitCol);
  rimU.rimStr.value = (RIM + hitGlow * 1.5 + Math.sin(t * 4) * 0.2) * (1 - sa * 0.35);   // 그로기 중엔 테두리 빛도 흐려짐 (너무 세면 블룸에 하얗게 뭉개짐)
  const sq = Math.sin((1 - punchT) * Math.PI * 5) * punchT * 0.25;
  boss.scale.set(BOSS.SCALE * (1 + sq), BOSS.SCALE * (1 - sq), BOSS.SCALE * (1 + sq));
  if (phase === 'fight') body.rotation.y = Math.sin((1 - punchT) * Math.PI * 3) * punchT * 0.6;
  // 눈(모델이면 고개)이 플레이어를 따라봄 (보스가 180° 돌아 있어 로컬 x는 월드 -x). 그로기 땐 고개가 크게 휘청이며 아래로 처짐
  const m = curModel();
  const trackY = THREE.MathUtils.clamp(-(ctx.px - boss.position.x) * 0.07, -0.35, 0.35) * (1 - sa);
  look.rotation.y += (trackY + Math.sin(t * 3.2) * 0.5 * sa - look.rotation.y) * Math.min(1, dt * 6);
  look.rotation.x = (m ? 0.12 : 0) + Math.sin(t * 2.3) * 0.04 + (0.12 + Math.sin(t * 4.4) * 0.1) * sa;
  look.rotation.z = Math.sin(t * 5.1) * 0.4 * sa;
  if (m) {
    const blink = 0.85 + Math.sin(t * 9) * 0.15 + hitGlow * 0.6;
    for (const g of m.eyes.children) {   // 그로기: 눈빛이 꺼지고 소용돌이 눈(@_@)
      const u = g.userData; u.glow.scale.setScalar(BOSS.MODELS[cur].eyeSize * blink * (1 - sa * 0.7)); u.core.visible = sa < 0.5;
      u.spiral.visible = sa > 0.05; u.spiral.material.opacity = sa;
    }
  } else { pupil.position.x = THREE.MathUtils.clamp(-(ctx.px - boss.position.x) * 0.12, -0.35, 0.35) * (1 - sa) + Math.sin(t * 9) * 0.3 * sa; pupil.position.y = -0.18 + Math.cos(t * 9) * 0.3 * sa; }
  spiralMat.rotation -= dt * 9;
  // 머리 위를 빙빙 도는 노란 별 5개 (기울어진 타원 궤도, 앞쪽에 올 때 커 보임)
  dizzy.visible = sa > 0.02;
  if (dizzy.visible) {
    dizzy.rotation.z = Math.sin(t * 5.1) * 0.4 * sa;   // 고개와 같이 기울어짐
    dizzyStars.forEach((s, k) => {
      const a = t * 5 + k * Math.PI * 2 / dizzyStars.length;
      s.position.set(Math.cos(a) * dizzyR, Math.sin(a * 2) * 0.25, Math.sin(a) * dizzyR * 0.45);
      s.scale.setScalar((0.9 + Math.sin(a) * 0.25) * 1.5 * Math.min(1, sa * 1.4));
      s.material.rotation = -a * 1.5;
    });
  }

  if (phase === 'enter') {
    const k = Math.min(1, phaseT / 2.4), e = 1 - (1 - k) ** 3;
    boss.position.y = BOSS.POS_Y + 30 * (1 - e);
    body.rotation.y = (1 - e) * Math.PI * 2;
    if (k >= 1) { phase = 'fight'; phaseT = 0; vfx.faceRing(boss.position, color, 2, 14, 1.6, 0.9); audio.crash(0.1); }
    return;
  }
  if (phase === 'defeat') {
    // 연속 폭발 → 마지막 대폭발과 함께 사라짐
    body.rotation.z += dt * 4; boss.position.x += (Math.random() - 0.5) * 0.4 * (1 - phaseT / 1.6);
    if (Math.floor(phaseT * 8) !== Math.floor((phaseT - dt) * 8)) {
      tmp.copy(boss.position).add(tmp2.set((rnd() - 0.5) * 5, (rnd() - 0.5) * 4, (rnd() - 0.5) * 3));
      vfx.sparkle(tmp, rnd() < 0.5 ? color : 0xffffff, 14, 8, 0.6); fx.burst(tmp, color, 10, 10); audio.crash(0.08);
    }
    if (phaseT > 1.6) {
      tmp.copy(boss.position); vfx.sparkle(tmp, color, 60, 16, 0.9); vfx.sparkle(tmp, 0xffffff, 30, 12, 0.7);
      vfx.faceRing(tmp, color, 2, 26, 1.4, 1); vfx.faceRing(tmp, 0xffffff, 1, 16, 2, 0.8); fx.burst(tmp, color, 60, 18);
      audio.crash(0.2);
      boss.visible = false; phase = null;
    }
    return;
  }
  if (phase === 'flee') {
    boss.position.y += dt * (8 + phaseT * 20); boss.position.z += dt * 30; body.rotation.y += dt * 6;
    if (phaseT > 1.5) { boss.visible = false; phase = null; }
    return;
  }

  // ===== 전투 =====
  // 그로기: 높이가 내려앉고 술 취한 듯 8자로 비틀거림
  boss.position.x = Math.sin(t * 0.7) * 2.2 * (1 - sa) + Math.sin(t * 2.2) * 2.4 * sa + (rnd() - 0.5) * flinch * 0.8;
  boss.position.y = BOSS.POS_Y + Math.sin(t * 1.3) * 0.6 + flinch * 0.8 - (1.8 + Math.sin(t * 4.4) * 0.4) * sa;
  boss.position.z = BOSS.POS_Z + flinch * 3.5;   // 명중 순간 뒤로 밀려났다 돌아옴
  body.rotation.z = Math.sin(t * 0.9) * 0.12 + Math.sin(t * 2.2 + 1) * 0.3 * sa; body.rotation.x = -flinch * 0.4;
  timeLeft -= dt;
  if (timeLeft <= 0) { endFight('flee'); ctx.onFlee(); return; }

  if (stunT <= 0) { attackCd -= dt; if (attackCd <= 0) { attackCd = attackCooldown(); attack(); } }   // 그로기 중엔 공격 안 함

  // 레인 레이저: BEAM_WARN 동안 경고(점점 빨라지는 깜빡임) → BEAM_FIRE 동안 발사. 옆 레인으로 피해야 함 (점프로는 못 넘음)
  for (let i = beams.length - 1; i >= 0; i--) {
    const b = beams[i], u = b.userData; u.t += dt;
    if (u.t < BOSS.BEAM_WARN) { u.warn.material.opacity = 0.15 + 0.4 * (0.5 + 0.5 * Math.sin(u.t * (14 + u.t * 24))); continue; }
    const f = u.t - BOSS.BEAM_WARN;
    if (!u.ray.visible) {
      u.ray.visible = u.rcore.visible = u.drop.visible = true; u.warn.material.opacity = 0.6;
      audio.beep(110, 0.45, 'sawtooth', 0.09, -40);
      tmp.set(b.position.x, 1, -2); vfx.sparkle(tmp, color, 10, 6, 0.4, true);
    }
    // 눈 → 보스 바로 앞(플레이어 쪽) 레인에 꽂히는 빔 (그룹 로컬 좌표)
    eyeWorld(eyePos); tmp.set(b.position.x, 0.95, BOSS.POS_Z - 8);
    const d = u.drop;
    d.position.copy(eyePos).add(tmp).multiplyScalar(0.5); d.position.x -= b.position.x;
    d.scale.set(1, eyePos.distanceTo(tmp), 1); d.quaternion.setFromUnitVectors(UP, tmp3.subVectors(tmp, eyePos).normalize());
    const w = 1 + Math.sin(f * 60) * 0.12; u.ray.scale.set(w, w, 1);
    u.ray.material.opacity = 0.85 * Math.min(1, (BOSS.BEAM_FIRE - f) * 8);
    if (!u.hit && Math.abs(ctx.px - b.position.x) < 1.3) {
      u.hit = true;
      if (ctx.hurt('beam', ctx.center, color) === 'dead') return;
    }
    if (f >= BOSS.BEAM_FIRE) { b.visible = false; beams.splice(i, 1); }
  }

  // 폭탄: 포물선으로 날아와 플레이어 뒤 BOMB_LAND_Z에 착지 → 플레이어 쪽으로 굴러옴. 점프로 넘거나 옆 레인으로 피함
  for (let i = bombs.length - 1; i >= 0; i--) {
    const b = bombs[i], u = b.userData;
    u.ball.rotation.x -= dt * 10; u.ball.rotation.y += dt * 3;
    if (!u.landed) {
      u.t += dt; const k = Math.min(1, u.t / BOSS.BOMB_FLY);
      b.position.set(u.from.x + (u.x - u.from.x) * k, u.from.y + (0.62 - u.from.y) * k + Math.sin(k * Math.PI) * 6, u.from.z + (BOSS.BOMB_LAND_Z - u.from.z) * k);
      u.mark.scale.setScalar(0.6 + k * 2.4); u.mark.material.opacity = 0.4 + 0.5 * Math.abs(Math.sin(u.t * 12));
      if (k >= 1) {
        u.landed = true; u.mark.visible = false;
        vfx.groundRing(b.position.x, b.position.z, color, 0.5, 3.6, 2.4, 1); fx.burst(b.position, color, 14, 7); audio.crash(0.06);
      }
      continue;
    }
    const prevZ = b.position.z; b.position.z -= BOSS.BOMB_ROLL * dt;
    if (rnd() < 0.5) vfx.trail(b.position, color, 0.35);
    if (b.position.z < -5) { b.visible = false; bombs.splice(i, 1); bombPool.push(b); continue; }   // 앞쪽 카메라에 닿기 전에 사라짐
    if (!u.crossed && prevZ >= -0.9 && b.position.z <= 0.9 && Math.abs(ctx.px - b.position.x) < 1.3 && G.jumpY < 1.0) {
      u.crossed = true;
      const r = ctx.hurt('bomb', b.position, color);
      if (r === 'dead') return;
      if (r !== 'ignore') { vfx.sparkle(b.position, color, 18, 9, 0.5, true); b.visible = false; bombs.splice(i, 1); bombPool.push(b); }
    }
  }

  // 파란 오브: 플레이어 뒤에서 다가옴. 그 레인으로 옮겨 먹으면 유도탄
  if (orbOn) {
    const prevZ = blueOrb.position.z; blueOrb.position.z -= BOSS.ORB_SPEED * dt;
    blueOrb.position.y = 1.1 + Math.sin(t * 5) * 0.15;
    const u = blueOrb.userData; u.c.rotation.y += dt * 3; u.r1.rotation.y += dt * 2; u.r2.rotation.x += dt * 2.5;
    const c = ctx.center;
    if (Math.abs(blueOrb.position.x - c.x) < 1.3 && Math.abs(blueOrb.position.y - c.y) < 1.5 && prevZ >= c.z - 1.3 && blueOrb.position.z <= c.z + 1.3) {
      orbOn = false; blueOrb.visible = false; orbCd = BOSS.ORB_CD;
      launchMissile(c); ctx.onOrb();
    } else if (blueOrb.position.z < -5) { orbOn = false; blueOrb.visible = false; orbCd = BOSS.ORB_CD * 0.5; }
  } else if (orbCd > 0) orbCd -= dt;
  else spawnBlueOrb();

  // 유도탄: 플레이어 → 위로 솟았다가 보스에 꽂힘 (2차 베지어)
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i], u = m.userData; u.t += dt * 1.5;
    const k = Math.min(1, u.t), p = boss.position;
    tmp2.set(u.from.x + u.side * 4, u.from.y + 9, (u.from.z + p.z) / 2);
    const a = (1 - k) * (1 - k), b2 = 2 * (1 - k) * k, c2 = k * k;
    m.position.set(u.from.x * a + tmp2.x * b2 + p.x * c2, u.from.y * a + tmp2.y * b2 + p.y * c2, u.from.z * a + tmp2.z * b2 + p.z * c2);
    vfx.trail(m.position, ORB_COL, 0.55); vfx.trail(m.position, 0xffffff, 0.3);
    if (k < 1) continue;
    scene.remove(m); missiles.splice(i, 1); missilePool.push(m);
    hp--; flinch = 1; hitGlow = 1; punchT = 1;
    // 명중: 섬광·빛살·에너지 껍질·번개 + 별 폭발(파랑·노랑) + 카메라를 향해 퍼지는 링 2겹 + 보스 색 파편과 파란 불꽃 + 순간 조명
    startHitFx();
    const ip = tmp.copy(p).add(HIT_OFF);
    vfx.sparkle(ip, ORB_COL, 34, 24, 0.8); vfx.sparkle(ip, 0xffe14d, 18, 16, 0.7); vfx.sparkle(ip, 0xffffff, 10, 18, 0.5);   // 많으면 가운데가 하얗게 뭉침
    vfx.faceRing(ip, ORB_COL, 3, 40, 1.4, 0.55); vfx.faceRing(ip, color, 1, 22, 2.2, 0.45);
    fx.impact(ip, ORB_COL, { shards: 26, color2: color, sparks: 44, light: curModel() ? 6 : 26, power: 1.9 });   // 모델은 조명을 받아서 약하게 (세면 하얗게 날아감)
    fx.burst(ip, ORB_COL, 24, 16);
    audio.crash(0.22); audio.beep(70, 0.6, 'sawtooth', 0.14, -30); audio.beep(1400, 0.25, 'square', 0.05, -900);
    if (hp <= 0) { stunT = 0; endFight('defeat'); ctx.onDefeat(level); return; }
    // 그로기: 경고 중이던 레이저는 취소 (이미 발사된 빔·굴러오는 폭탄은 그대로) + 띠용~ 하고 어지러운 소리
    stunT = BOSS.STUN_TIME;
    for (let j = beams.length - 1; j >= 0; j--) if (beams[j].userData.t < BOSS.BEAM_WARN) { beams[j].visible = false; beams.splice(j, 1); }
    audio.beep(900, 0.7, 'sine', 0.06, -650); setTimeout(() => audio.arpeggio([1319, 1047, 1319, 1047], 'triangle', 110, 0.04), 250);
    ctx.onHit(hp, maxHp);
  }
}
function launchMissile(from) {
  const m = getMissile(); m.position.copy(from);
  m.userData = { t: 0, from: from.clone(), side: from.x <= 0 ? -1 : 1 };
  missiles.push(m);
  vfx.faceRing(from, ORB_COL, 0.4, 3, 3.5, 0.9); vfx.sparkle(from, ORB_COL, 16, 6, 0.4);
  audio.arpeggio([523, 784, 1047], 'square', 40, 0.06);
}
function endFight(how) {
  clearAttacks();
  phase = how; phaseT = 0;
  nextAt = Math.floor(G.distance) + G.coinScore + G.bonus + BOSS.EVERY;   // 끝난 시점 점수 + EVERY
}

// HUD 표시용 (등장·전투 중에만)
export function hudInfo() {
  if (phase !== 'enter' && phase !== 'fight') return null;
  return { name, color, hp, maxHp, time: Math.max(0, Math.ceil(timeLeft)), level, stun: stunT > 0 };
}
