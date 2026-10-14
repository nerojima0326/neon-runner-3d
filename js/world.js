// 렌더러 · 후처리 · 배경 월드(하늘/태양/도시/산맥/트랙/아치/부유 도형)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { THEMES } from './config.js';

export const BLOOM_BASE = 0.55;
export const CAM_BASE = new THREE.Vector3(0, 4.2, 8);

// ---------- 테마 색 (모든 머티리얼이 이 Color 객체를 참조 → lerp 하면 맵 전체가 변함) ----------
export const cur = {
  a: new THREE.Color(THEMES[0].a), b: new THREE.Color(THEMES[0].b),
  sky: new THREE.Color(THEMES[0].sky), fog: new THREE.Color(THEMES[0].fog),
  sunTop: new THREE.Color(THEMES[0].sunTop), sunBot: new THREE.Color(THEMES[0].sunBot),
};
const target = {};
for (const k in cur) target[k] = cur[k].clone();
export function setTheme(i) { const t = THEMES[i % THEMES.length]; for (const k in target) target[k].set(t[k]); }
const DIM = 0.75;                     // 넓게 빛나는 요소용 어두운 버전
export const dim = { a: new THREE.Color(), b: new THREE.Color() };
function updateDim() { dim.a.copy(cur.a).multiplyScalar(DIM); dim.b.copy(cur.b).multiplyScalar(DIM); }
updateDim();

// ---------- 렌더러 / 후처리 ----------
export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.LinearToneMapping;   // 노출(밝기) 설정용
renderer.toneMappingExposure = 1;
document.body.prepend(renderer.domElement);

export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 60, 300);
scene.fog.color = cur.fog;

export const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 1200);
camera.position.copy(CAM_BASE);

export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
export const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), BLOOM_BASE, 0.4, 0.38);
composer.addPass(bloom);
composer.addPass(new OutputPass());

export function setBrightness(v) { renderer.toneMappingExposure = v; }

scene.add(new THREE.HemisphereLight(0x8844ff, 0x110022, 0.7));
const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
sunLight.position.set(5, 12, 6); sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
Object.assign(sunLight.shadow.camera, { left: -10, right: 10, top: 10, bottom: -30, near: 1, far: 60 });
sunLight.shadow.camera.updateProjectionMatrix();   // 범위 변경은 이 호출이 있어야 적용됨
scene.add(sunLight);

// ---------- 하늘 돔 + 별 ----------
scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(900, 32, 16),
  new THREE.ShaderMaterial({
    uniforms: { top: { value: cur.sky }, horizon: { value: cur.fog } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vP;
      void main(){ float h = clamp(vP.y * 3.0, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.5)), 1.0); }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  })
));
{
  const N = 2500, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.45, r = 800;
    pos[i * 3] = Math.cos(th) * Math.cos(ph) * r; pos[i * 3 + 1] = Math.sin(ph) * r + 20; pos[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * r;
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, fog: false, sizeAttenuation: false })));
}

// ---------- 줄무늬 신스웨이브 태양 + 후광 ----------
const sunMat = new THREE.ShaderMaterial({
  uniforms: { top: { value: cur.sunTop }, bot: { value: cur.sunBot }, time: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform vec3 top; uniform vec3 bot; uniform float time; varying vec2 vUv;
    void main(){
      float y = vUv.y;
      float band = fract(y * 16.0 + time * 0.4);
      float gap = smoothstep(0.62, 0.0, y) * 0.75;
      if (band < gap) discard;
      gl_FragColor = vec4(mix(bot, top, smoothstep(0.0, 1.0, y)) * 0.75, 1.0);
    }`,
  fog: false,
});
const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(110, 64), sunMat);
sunDisc.position.set(0, 55, -700); scene.add(sunDisc);
const halo = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), new THREE.ShaderMaterial({
  uniforms: { col: { value: cur.sunBot } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform vec3 col; varying vec2 vUv;
    void main(){ float d = distance(vUv, vec2(0.5)) * 2.0; gl_FragColor = vec4(col, smoothstep(1.0, 0.35, d) * 0.22); }`,
  transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
}));
halo.position.set(0, 55, -720); scene.add(halo);

// ---------- 도시 스카이라인 (지오메트리 병합 → 드로우콜 2개) ----------
{
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 128; y += 8) for (let x = 4; x < 64; x += 8)
    if (Math.random() < 0.45) { g.fillStyle = `rgba(255,255,255,${0.4 + Math.random() * 0.6})`; g.fillRect(x, y, 4, 4); }
  const winTex = new THREE.CanvasTexture(c); winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping; winTex.colorSpace = THREE.SRGBColorSpace;
  const cityMat = new THREE.MeshStandardMaterial({ color: 0x05030c, emissiveMap: winTex, emissiveIntensity: 1.0, roughness: 1 });
  cityMat.emissive = cur.b;
  const roofMat = new THREE.MeshBasicMaterial(); roofMat.color = dim.a;
  const bGeos = [], rGeos = [];
  for (let i = 0; i < 90; i++) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const w = 8 + Math.random() * 14, h = 20 + Math.random() ** 2 * 90, d = 8 + Math.random() * 10;
    const x = side * (45 + Math.random() * 200), z = -230 - Math.random() * 160;
    bGeos.push(new THREE.BoxGeometry(w, h, d).translate(x, h / 2, z));
    if (Math.random() < 0.5) rGeos.push(new THREE.BoxGeometry(w + 0.4, 0.6, d + 0.4).translate(x, h, z));
  }
  scene.add(new THREE.Mesh(mergeGeometries(bGeos), cityMat));
  scene.add(new THREE.Mesh(mergeGeometries(rGeos), roofMat));
}

// ---------- 와이어프레임 산맥 (끝없이 흐르는 지형) ----------
const MT_W = 90, MT_L = 200, MT_SEG = 3;   // 한쪽에 3조각: 보스전 카메라가 뒤를 볼 때도 플레이어 뒤쪽 지형이 이어짐
const mtWireMat = new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.4 }); mtWireMat.color = cur.b;
const mtFillMat = new THREE.MeshBasicMaterial({ color: 0x020008, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
function makeMountainGeo(side) {
  const geo = new THREE.PlaneGeometry(MT_W, MT_L, 36, 50); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, k = Math.PI * 2 / MT_L;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), d = (x + MT_W / 2) / MT_W, t = side < 0 ? 1 - d : d;
    const n = Math.sin(z * k * 2 + x * 0.13) * 0.5 + Math.sin(z * k * 5 + x * 0.37) * 0.3 + Math.sin(z * k * 11 - x * 0.71) * 0.2;
    p.setY(i, Math.max(0, Math.pow(t, 1.4) * (26 + n * 18) + (t > 0.06 ? n * 2 : 0)));
  }
  return geo;
}
const mountains = [];
for (const side of [-1, 1]) {
  const geo = makeMountainGeo(side);
  for (let s = 0; s < MT_SEG; s++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, mtFillMat), new THREE.Mesh(geo, mtWireMat));
    g.position.set(side * (9 + MT_W / 2), 0, MT_L / 2 - s * MT_L);
    scene.add(g); mountains.push(g);
  }
}

// ---------- 트랙 ----------
// 플레이어 뒤로 TRACK_BACK만큼 이어짐 (보스전 카메라가 뒤를 볼 때 트랙이 끊겨 보이지 않게)
const TRACK_LEN = 400, TRACK_BACK = 80, TILE = 4;
const gridTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 2); g.lineTo(256, 2); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 4;
  for (const x of [256 / 3, 512 / 3]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(1, TRACK_LEN / TILE); return t;
})();
const groundMat = new THREE.MeshStandardMaterial({ color: 0x0a0418, emissiveMap: gridTex, emissiveIntensity: 0.45, roughness: 0.35, metalness: 0.5 });
groundMat.emissive = cur.a;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(7.5, TRACK_LEN), groundMat);
ground.rotation.x = -Math.PI / 2; ground.position.z = -TRACK_LEN / 2 + TRACK_BACK; ground.receiveShadow = true;
scene.add(ground);
const outer = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshBasicMaterial({ color: 0x020008 }));
outer.rotation.x = -Math.PI / 2; outer.position.y = -0.03; scene.add(outer);

const railMat = new THREE.MeshBasicMaterial(); railMat.color = dim.a;
for (const s of [-1, 1]) {
  const r = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, TRACK_LEN), railMat);
  r.position.set(s * 3.85, 0.12, -TRACK_LEN / 2 + TRACK_BACK); scene.add(r);
}

// 볼라드: InstancedMesh 100개 → 드로우콜 1개. 플레이어 뒤 BOLL_BACK까지 유지
const BOLL_N = 100, BOLL_SPAN = 250, BOLL_BACK = 65;
const bollardZ = new Float32Array(BOLL_N);
const bollards = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffff }), BOLL_N);
bollards.frustumCulled = false;
const dummy = new THREE.Object3D();
for (let i = 0; i < BOLL_N; i++) { bollardZ[i] = BOLL_BACK - Math.floor(i / 2) * 5; bollards.setColorAt(i, dim.a); }
function layoutBollards() {
  for (let i = 0; i < BOLL_N; i++) {
    dummy.position.set(i % 2 ? 4.4 : -4.4, 0.45, bollardZ[i]); dummy.updateMatrix(); bollards.setMatrixAt(i, dummy.matrix);
  }
  bollards.instanceMatrix.needsUpdate = true;
}
function colorBollards() {
  for (let i = 0; i < BOLL_N; i++) bollards.setColorAt(i, Math.floor(i / 2) % 2 ? dim.b : dim.a);
  bollards.instanceColor.needsUpdate = true;
}
layoutBollards(); scene.add(bollards);

// ---------- 네온 아치 ----------
const archOuterMat = new THREE.MeshBasicMaterial(); archOuterMat.color = dim.a;
const archInnerMat = new THREE.MeshBasicMaterial(); archInnerMat.color = dim.b;
const arches = [], ARCH_GAP = 45, ARCH_COUNT = 7, ARCH_BACK = 45;   // 플레이어 뒤 ARCH_BACK까지 유지
{
  const outerGeo = new THREE.TorusGeometry(6.4, 0.12, 8, 64, Math.PI);
  const innerGeo = new THREE.TorusGeometry(5.8, 0.05, 6, 64, Math.PI);
  const footGeo = new THREE.BoxGeometry(0.8, 0.4, 0.8);
  for (let i = 0; i < ARCH_COUNT; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(outerGeo, archOuterMat), new THREE.Mesh(innerGeo, archInnerMat));
    for (const s of [-1, 1]) { const f = new THREE.Mesh(footGeo, archInnerMat); f.position.set(s * 6.4, 0.2, 0); g.add(f); }
    g.position.z = -20 - i * ARCH_GAP; scene.add(g); arches.push(g);
  }
}

// ---------- 하늘에 떠 있는 거대 도형 ----------
const floatMatA = new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.55 }); floatMatA.color = cur.b;
const floatMatB = new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.55 }); floatMatB.color = cur.a;
const floaters = [];
{
  const geos = [new THREE.IcosahedronGeometry(6, 1), new THREE.TorusKnotGeometry(5, 1.2, 80, 8), new THREE.OctahedronGeometry(7, 0), new THREE.TorusGeometry(7, 0.6, 8, 32)];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(geos[i % geos.length], i % 2 ? floatMatA : floatMatB);
    m.position.set((i % 2 ? 1 : -1) * (22 + Math.random() * 30), 20 + Math.random() * 25, -30 - i * 25);
    m.userData.spin = new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(0.6);
    m.userData.baseY = m.position.y;
    scene.add(m); floaters.push(m);
  }
}

// ---------- 매 프레임 ----------
export function update(dt, t, bloomExtra = 0) {
  const k = Math.min(1, dt * 1.8);
  for (const key in cur) cur[key].lerp(target[key], k);
  updateDim(); colorBollards();
  sunMat.uniforms.time.value = t;
  bloom.strength += (BLOOM_BASE + bloomExtra - bloom.strength) * Math.min(1, dt * 2);
  const pulse = 1 + Math.sin(t * 6) * 0.03;
  for (const a of arches) a.scale.setScalar(pulse);
}

export function scrollWorld(dz, t) {
  gridTex.offset.y += dz / TILE;
  for (let i = 0; i < BOLL_N; i++) { bollardZ[i] += dz; if (bollardZ[i] > BOLL_BACK) bollardZ[i] -= BOLL_SPAN; }
  layoutBollards();
  for (const a of arches) { a.position.z += dz; if (a.position.z > ARCH_BACK) a.position.z -= ARCH_GAP * ARCH_COUNT; }
  for (const m of mountains) { m.position.z += dz; if (m.position.z > MT_L + 10) m.position.z -= MT_L * MT_SEG; }   // 플레이어 뒤로 110~310 · 앞으로 290~490 유지
  for (const f of floaters) {
    f.position.z += dz * 0.35; if (f.position.z > 20) f.position.z -= 260;
    f.rotation.x += f.userData.spin.x * 0.016; f.rotation.y += f.userData.spin.y * 0.016;
    f.position.y = f.userData.baseY + Math.sin(t + f.userData.baseY) * 2;
  }
}

// ---------- 품질 / 리사이즈 ----------
export let quality = 'high';
export function setQuality(q) {
  quality = q;
  const pr = q === 'low' ? 1 : q === 'medium' ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 1.5);
  renderer.setPixelRatio(pr); composer.setPixelRatio(pr);
  renderer.shadowMap.enabled = q === 'high'; sunLight.castShadow = q === 'high';
  bloom.enabled = q !== 'low';
  resize();
}
export function resize() {
  if (!innerWidth || !innerHeight) return;   // 최소화 시 0 크기로 버퍼가 깨지는 것 방지
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
}
export function render() { composer.render(); }
