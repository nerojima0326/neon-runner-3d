// 플레이어 캐릭터
//  - 기본: glTF 로봇 모델(config.CHARACTER · RobotExpressive, CC0) + 스켈레톤 애니메이션(달리기·점프·대기·손흔들기)
//  - 공 모드(구르기·대시)와 모델 로딩 실패(오프라인 첫 실행 등) 시: 절차 생성 구체 캐릭터(눈·안테나·팔·발)
//  - 스킨은 두 모델 모두에 적용 (body→로봇 Main, limb→로봇 Grey)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { scene } from './world.js';
import { LANES, PHYS, SKINS, CHARACTER, MOTION } from './config.js';
import { G, rolling, speedFrac } from './state.js';
import * as fx from './fx.js';

export const BODY_Y = 0.75;   // 서 있을 때 몸 중심 높이
export const BALL_Y = 0.42;   // 공처럼 말았을 때 중심 높이

export const player = new THREE.Group();
const body = new THREE.Group(); body.position.y = BODY_Y; player.add(body);

const torsoMat = new THREE.MeshStandardMaterial({ color: 0x3fc8ff, emissive: 0x0a3060, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.15 });
const torso = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), torsoMat); torso.castShadow = true; body.add(torso);
const bandMat = new THREE.MeshBasicMaterial({ color: 0x7fd8f0 });
const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 8, 48), bandMat); band.rotation.x = Math.PI / 2;
const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.505, 0.025, 8, 48), bandMat); stripe.rotation.y = Math.PI / 2;
body.add(band, stripe);

const eyes = [];
{
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff }), pupilMat = new THREE.MeshBasicMaterial({ color: 0x10101e });
  for (const s of [-1, 1]) {
    const e = new THREE.Group();
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 8), pupilMat); p.position.z = -0.09;
    e.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), whiteMat), p);
    e.position.set(s * 0.18, 0.12, -0.42); body.add(e); eyes.push(e);
  }
}
const antenna = new THREE.Group(); antenna.position.y = 0.45; body.add(antenna);
{
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6), new THREE.MeshStandardMaterial({ color: 0x9fcfee })); stalk.position.y = 0.17;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd84a })); bulb.position.y = 0.37;
  antenna.add(stalk, bulb);
}
const limbMat = new THREE.MeshStandardMaterial({ color: 0x1b7fc0, roughness: 0.5 });
const arms = [], feet = [];
for (const s of [-1, 1]) {
  const a = new THREE.Group(); a.position.set(s * 0.5, 0, 0); a.userData.side = s;
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), limbMat); hand.position.y = -0.18;
  a.add(hand); body.add(a); arms.push(a);
  const f = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), limbMat);
  f.scale.set(1, 0.7, 1.4); f.position.set(s * 0.22, 0.1, 0); f.castShadow = true;
  player.add(f); feet.push(f);
}
const playerLight = new THREE.PointLight(0x3fc8ff, 3, 7); playerLight.position.y = 1.2; player.add(playerLight);

// 🛡 방어막: 가장자리가 밝게 빛나는 에너지막(프레넬) + 위아래로 흐르는 스캔 띠 + 육각 패턴 + 돌아가는 삼각 격자.
// 켜질 때 탄성 있게 부풀어 오르고, 남은 동안 숨 쉬듯 맥동
const shieldU = { time: { value: 0 }, color: { value: new THREE.Color(0x40d8ff) }, intro: { value: 1 } };
const shieldMat = new THREE.ShaderMaterial({
  uniforms: shieldU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float time; uniform vec3 color; uniform float intro; varying vec3 vN; varying vec3 vV; varying vec3 vP;
    float hex(vec2 p){ p.x *= 1.1547; p.y += mod(floor(p.x), 2.0) * 0.5; p = abs(fract(p) - 0.5); return abs(max(p.x * 1.5 + p.y, p.y * 2.0) - 1.0); }
    void main(){
      float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
      vec3 d = normalize(vP);
      vec2 uv = vec2(atan(d.z, d.x) * 2.2, d.y * 3.2);
      float edge = smoothstep(0.12, 0.0, hex(uv * 1.6 + vec2(0.0, time * 0.25)));
      float scan = smoothstep(0.86, 1.0, sin(d.y * 9.0 - time * 5.0) * 0.5 + 0.5);
      float a = (0.05 + fres * 0.85 + edge * (0.18 + fres * 0.5) + scan * 0.22) * intro;
      gl_FragColor = vec4(color * (0.7 + fres * 1.3 + scan * 0.8), a);
    }`,
});
const shieldBubble = new THREE.Group();
shieldBubble.add(
  new THREE.Mesh(new THREE.SphereGeometry(0.9, 40, 28), shieldMat),
  new THREE.Mesh(new THREE.IcosahedronGeometry(0.93, 2), new THREE.MeshBasicMaterial({ color: 0x9ff2ff, wireframe: true, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending })),
);
shieldBubble.position.y = BODY_Y; shieldBubble.visible = false; player.add(shieldBubble);
let shieldAge = 1;   // 0 → 1: 켜지는 애니메이션 진행도

// 🧲 자석: 자기장 고리 3개가 자이로스코프처럼 엇갈려 돌고(빨강·흰·빨강), 발밑엔 N/S 반원 고리가 회전
const magnetField = new THREE.Group();
{
  const red = new THREE.MeshBasicMaterial({ color: 0xff3a5c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const pale = new THREE.MeshBasicMaterial({ color: 0xffd6de, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  const g1 = new THREE.TorusGeometry(1.0, 0.022, 6, 48), g2 = new THREE.TorusGeometry(1.1, 0.015, 6, 48);
  const rings = [new THREE.Mesh(g1, red), new THREE.Mesh(g2, pale), new THREE.Mesh(g1, red)];
  rings[0].rotation.set(Math.PI / 2, 0.5, 0); rings[1].rotation.set(Math.PI / 2, -0.6, 0.4); rings[2].rotation.set(0.3, 0, 0.9);
  const gyro = new THREE.Group(); gyro.add(...rings); gyro.position.y = BODY_Y;
  const half = new THREE.TorusGeometry(0.85, 0.05, 6, 32, Math.PI);
  const base = new THREE.Group(); base.position.y = 0.06;
  const n = new THREE.Mesh(half, red), s = new THREE.Mesh(half, pale); n.rotation.x = s.rotation.x = -Math.PI / 2; s.rotation.z = Math.PI;
  base.add(n, s);
  magnetField.add(gyro, base); magnetField.userData = { rings, gyro, base };
}
magnetField.visible = false; player.add(magnetField);
const magnetRing = magnetField;   // (호환용 이름)
// ✨ 점수 2배: 머리 위 노란 링
const boostRing = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
boostRing.rotation.x = Math.PI / 2; boostRing.position.y = BODY_Y + 0.95; boostRing.visible = false; player.add(boostRing);

// 로봇 구르기용 에너지 껍질: 웅크린 로봇을 감싸는 반투명 구 + 와이어 + 회전 링 2개 (스킨 빛 색, 대시 중엔 금색)
const shellMat = new THREE.MeshBasicMaterial({ color: 0x3fc8ff, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending });
const shellWireMat = new THREE.MeshBasicMaterial({ color: 0x3fc8ff, wireframe: true, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
const shellRingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending });
const rollShell = new THREE.Group();
{
  const ringGeo = new THREE.TorusGeometry(0.62, 0.014, 6, 40);
  const r1 = new THREE.Mesh(ringGeo, shellRingMat), r2 = new THREE.Mesh(ringGeo, shellRingMat); r2.rotation.y = Math.PI / 2;
  rollShell.add(new THREE.Mesh(new THREE.SphereGeometry(0.58, 24, 16), shellMat), new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), shellWireMat), r1, r2);
  rollShell.userData.rings = [r1, r2];
}
rollShell.position.y = BALL_Y + 0.02; rollShell.visible = false; player.add(rollShell);
scene.add(player);

// ---------- glTF 로봇 모델 ----------
// rig(회전 중심 = 몸 중앙) > robot(모델, 발이 rig 아래 pivotY만큼) 구조라 공중제비가 몸 중앙을 축으로 돎
const rig = new THREE.Group(); rig.position.y = CHARACTER.pivotY; rig.visible = false; player.add(rig);
let robot = null, mixer = null, current = null;
const actions = {}, robotMats = {};
export let modelReady = false;

// 모델 로드 (비동기, 실패하면 false → 구체 캐릭터 유지)
export function loadModel() {
  if (!CHARACTER.url) return Promise.resolve(false);
  return new Promise(resolve => new GLTFLoader().load(CHARACTER.url, gltf => {
    const m = gltf.scene;
    m.scale.setScalar(CHARACTER.scale); m.rotation.y = Math.PI; m.position.y = -CHARACTER.pivotY;   // 달리는 방향(-Z)을 보게
    m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; robotMats[o.material.name] = o.material; } });
    mixer = new THREE.AnimationMixer(m);
    for (const c of gltf.animations) actions[c.name] = mixer.clipAction(c);
    for (const n of [CHARACTER.clips.jump, CHARACTER.clips.wave, CHARACTER.clips.roll]) if (actions[n]) { actions[n].setLoop(THREE.LoopOnce, 1); actions[n].clampWhenFinished = true; }
    if (actions[CHARACTER.clips.roll]) actions[CHARACTER.clips.roll].timeScale = CHARACTER.roll.tuckSpeed;   // 빠르게 몸을 맒
    mixer.addEventListener('finished', e => { if (e.action === actions[CHARACTER.clips.wave] && G.state === 'menu') play(CHARACTER.clips.idle, 0.4); });
    rig.add(m); robot = m; modelReady = true; applySkin(skin.id);
    resolve(true);
  }, undefined, () => resolve(false)));
}
function play(name, fade = 0.15, startAt = 0) {
  const a = actions[name]; if (!a || current === a) return;
  if (current) current.fadeOut(fade);
  a.reset(); a.time = startAt; a.fadeIn(fade).play(); current = a;
}

let skin = SKINS[0], runPhase = 0, squash = 0, blinkT = 2, rollAngle = 0;
let wantBody = true, wantRig = false, wasAir = false, wasBalled = false, waveT = 1;
const tmp = new THREE.Vector3();

// ---------- 레인 이동 · 기울기 ----------
// 임계 감쇠 스프링(Unity SmoothDamp와 같은 식): 부드럽게 출발해서 부드럽게 멈추고, 이동 중 방향을 바꿔도 속도가 이어짐
let vx = 0, leanZ = 0, yaw = 0, popT = 0;
export function steer(targetX, dt, sf) {
  if (dt <= 0) return;
  const st = MOTION.LANE_TIME + (MOTION.LANE_TIME_FAST - MOTION.LANE_TIME) * sf;
  const w = 2 / st, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const cur = player.position.x, change = cur - targetX, temp = (vx + w * change) * dt;
  let out = targetX + (change + temp) * e;
  vx = (vx - w * temp) * e;
  if ((targetX - cur > 0) === (out > targetX) || Math.abs(out - targetX) < 1e-3 && Math.abs(vx) < 0.05) { out = targetX; vx = 0; }   // 오버슈트·잔떨림 방지
  player.position.x = out;
}
// 기울기는 "남은 거리"가 아니라 실제 좌우 속도에서 계산 → 키를 누른 순간 홱 돌지 않고 움직임에 따라 기울었다 돌아옴
function updateLean(dt, active) {
  const k = 1 - Math.exp(-MOTION.TILT_RATE * dt);
  leanZ += ((active ? -vx * MOTION.LEAN : 0) - leanZ) * k;
  yaw += ((active ? vx * MOTION.YAW : 0) - yaw) * k;
}
const easeOutBack = p => 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2);   // 0→1, 살짝 튀어나왔다 자리 잡음
const popScale = () => (popT > 0 ? 0.55 + 0.45 * easeOutBack(1 - popT) : 1);

export function applySkin(id) {
  skin = SKINS.find(s => s.id === id) || SKINS[0];
  torsoMat.color.setHex(skin.body); torsoMat.emissive.setHex(skin.emissive);
  torsoMat.wireframe = !!skin.wire; torsoMat.transparent = !!skin.wire; torsoMat.opacity = skin.wire ? 0.75 : 1;
  torsoMat.metalness = skin.metal ? 0.9 : 0.15; torsoMat.roughness = skin.metal ? 0.25 : 0.3;
  limbMat.color.setHex(skin.limb); bandMat.color.setHex(skin.band); playerLight.color.setHex(skin.light);
  shellMat.color.setHex(skin.light); shellWireMat.color.setHex(skin.light);
  // 로봇: Main(몸) ← body, Grey(부품) ← limb, Black(얼굴)은 그대로
  const main = robotMats.Main, grey = robotMats.Grey;
  if (main) {
    main.color.setHex(skin.body); main.emissive.setHex(skin.emissive); main.emissiveIntensity = 0.55;
    main.metalness = skin.metal ? 0.9 : 0.1; main.roughness = skin.metal ? 0.3 : 0.8;
  }
  if (grey) { grey.color.setHex(skin.limb); grey.emissive.setHex(skin.emissive); grey.emissiveIntensity = 0.25; grey.metalness = skin.metal ? 0.7 : 0.1; }
  for (const m of Object.values(robotMats)) { m.wireframe = !!skin.wire; m.transparent = !!skin.wire; m.opacity = skin.wire ? 0.8 : 1; }
}
export const skinLight = () => skin.light;
export const skinColors = () => [skin.body, skin.limb, skin.light];   // 사망 파편 색
export function landed() { squash = 1; }

export function animatePlayer(dt, t, mode) {
  const air = G.jumpY > 0 || G.vy > 0, running = mode === 'run', balled = running && rolling();
  const useRobot = modelReady;   // 로봇 모델이 있으면 구를 때도 로봇이 몸을 말고 구름. 구체는 모델 로딩 실패 시에만
  runPhase += dt * (running ? 6 + G.speed * 0.25 : 3);
  squash = Math.max(0, squash - dt * 5);
  updateLean(dt, running);
  // 로봇 ↔ 공 전환: 새로 나타나는 쪽이 작게 시작해 튀어나오듯 커짐 + 작은 파티클
  if (running && balled !== wasBalled) {
    popT = 1;
    if (modelReady) { tmp.set(player.position.x, player.position.y + (balled ? BALL_Y : BODY_Y), player.position.z); fx.burst(tmp, skin.light, 8, 3); }
  }
  popT = Math.max(0, popT - dt / MOTION.POP_TIME);
  wasBalled = balled;
  const pop = popScale();
  wantBody = !useRobot; wantRig = useRobot;
  body.visible = wantBody; rig.visible = wantRig;
  for (const f of feet) f.visible = !balled && !useRobot;
  for (const a of arms) a.visible = !balled;
  antenna.visible = !balled;
  rollShell.visible = useRobot && balled;

  if (balled) {
    if (G.dashT > 0) rollAngle -= dt * 26;
    else rollAngle = -(1 - G.rollT / PHYS.ROLL_TIME) * Math.PI * 4;
  }
  if (balled && useRobot) {
    rollRobot(dt, t, pop);
  } else if (balled) {
    // (모델 로딩 실패 시) 구체 공 모드: 팔다리를 넣고 몸 전체가 앞으로 굴러감
    body.rotation.set(rollAngle, 0, leanZ * 1.3);
    const b = 0.84 * pop;
    body.scale.set(b * (1 + squash * 0.2), b * (1 - squash * 0.25), b * (1 + squash * 0.2));
    body.position.y = BALL_Y;
  } else if (useRobot) {
    animateRobot(dt, mode, air, running);
  } else {
    feet.forEach((f, i) => {
      const ph = runPhase + i * Math.PI;
      if (running && !air) { f.position.z = Math.sin(ph) * 0.28; f.position.y = 0.1 + Math.max(0, Math.cos(ph)) * 0.18; }
      else if (air) { f.position.z = i ? -0.12 : 0.12; f.position.y = 0.2; }
      else { f.position.z *= 0.8; f.position.y = 0.1; }
    });
    arms.forEach((a, i) => {
      const s = a.userData.side;
      if (running && !air) { a.rotation.x = Math.sin(runPhase + i * Math.PI) * 0.9; a.rotation.z = s * 0.3; }
      else if (air) { a.rotation.x = 0; a.rotation.z = s * 2.4; }
      else if (mode === 'wave' && s > 0) { a.rotation.x = 0; a.rotation.z = 2.6 + Math.sin(t * 10) * 0.35; }
      else { a.rotation.x = 0; a.rotation.z = s * 0.25; }
    });
    smoothScale(body, air, dt, pop);
    body.position.y = BODY_Y + (running && !air ? Math.abs(Math.sin(runPhase)) * 0.08 : 0);
    body.rotation.z = leanZ;
    body.rotation.y = yaw;
    body.rotation.x = G.flipT > 0 ? -(1 - G.flipT / PHYS.FLIP_TIME) * Math.PI * 2 : (running ? -0.15 : 0);   // 더블 점프 공중제비
    antenna.rotation.x = Math.sin(runPhase * 2) * 0.15 + (air ? 0.4 : 0);
    antenna.rotation.z = -leanZ * 1.5;   // 기울기 반대로 살짝 휘청
    rollAngle = 0;
  }

  blinkT -= dt;
  const closed = blinkT < 0.12;
  for (const e of eyes) e.scale.y = closed ? 0.1 : 1;
  if (blinkT < 0) blinkT = 2 + Math.random() * 2.5;

  if (skin.rainbow) {
    torsoMat.color.setHSL((t * 0.25) % 1, 1, 0.62); torsoMat.emissive.copy(torsoMat.color).multiplyScalar(0.35);
    if (robotMats.Main) { robotMats.Main.color.copy(torsoMat.color); robotMats.Main.emissive.copy(torsoMat.emissive); }
  }
  if (G.dashT > 0) { torsoMat.emissive.setHex(0x806000); playerLight.color.setHex(0xffd040); }
  else { if (!skin.rainbow) torsoMat.emissive.setHex(skin.emissive); playerLight.color.setHex(skin.light); }
}

// 로봇 구르기: 웅크린 자세로 몸 중심을 축 삼아 앞으로 텀블링, 작게 축소 + 에너지 껍질
function rollRobot(dt, t, pop) {
  const R = CHARACTER.roll, dash = G.dashT > 0;
  play(CHARACTER.clips.roll, 0.06);
  robot.position.set(0, -R.centerY, -R.centerZ);          // 웅크린 몸의 중심이 rig 원점에 오도록
  rig.position.y = BALL_Y + 0.02;
  rig.rotation.set(rollAngle, yaw * 0.4, leanZ * 1.3);
  const s = R.scale * pop;
  rig.scale.set(s * (1 + squash * 0.2), s * (1 - squash * 0.25), s * (1 + squash * 0.2));
  // 껍질: 구르는 방향으로 돌고 링은 서로 엇갈려 회전. 대시 중엔 금색으로 크게 빛남
  const col = dash ? 0xffd040 : skin.light;
  shellMat.color.setHex(col); shellWireMat.color.setHex(col);
  shellMat.opacity = dash ? 0.12 : 0.05 + Math.sin(t * 20) * 0.02; shellWireMat.opacity = dash ? 0.4 : 0.22;
  rollShell.rotation.set(rollAngle * 0.5, 0, leanZ);
  const [r1, r2] = rollShell.userData.rings; r1.rotation.x += dt * 9; r2.rotation.z += dt * 11;
  rollShell.scale.setScalar(pop * (dash ? 1.12 : 1) * (1 + squash * 0.15));
  rollShell.position.y = BALL_Y + 0.02;
  wasAir = G.jumpY > 0;   // 구르기가 끝나면 착지 상태에 맞는 클립으로 복귀
  mixer.update(dt);
}

// 로봇 모델 애니메이션: 달리기(속도에 맞춰 빠르게) · 점프(한 번, 마지막 자세 유지) · 메뉴에선 대기 + 가끔 손흔들기
function animateRobot(dt, mode, air, running) {
  const C = CHARACTER.clips;
  robot.position.set(0, -CHARACTER.pivotY, 0);
  if (running) {
    if (current === actions[C.roll]) play(air ? C.jump : C.run, 0.1, air ? 0.35 : 0);   // 구르기 직후 자세 복귀
    if (air && !wasAir) play(C.jump, 0.08, CHARACTER.jumpStart);
    else if (!air) { play(C.run, 0.12); if (actions[C.run]) actions[C.run].timeScale = 0.9 + speedFrac() * 1.2; }
    rig.rotation.z = leanZ; rig.rotation.y = yaw;
    rig.rotation.x = G.flipT > 0 ? -(1 - G.flipT / PHYS.FLIP_TIME) * Math.PI * 2 : 0;   // 더블 점프 공중제비
    smoothScale(rig, air, dt, popScale());
  } else {
    waveT -= dt;
    if (waveT <= 0) { waveT = 5 + Math.random() * 4; play(C.wave, 0.3); }
    else if (current !== actions[C.wave]) play(C.idle, 0.3);
    rig.rotation.set(0, 0, 0); smoothScale(rig, false, dt, 1);
  }
  rig.position.y = CHARACTER.pivotY;
  wasAir = air;
  mixer.update(dt);
}

// 점프 상승 중 늘어남 · 착지 찌그러짐을 목표값으로 보간 (한 프레임에 툭 바뀌지 않게). pop = 변신 팝 배율(즉시 적용)
const sTarget = new THREE.Vector3();
function smoothScale(obj, air, dt, pop) {
  let sy = 1 - squash * 0.28, sxz = 1 + squash * 0.22;
  if (air && G.vy > 0) { sy = 1.1; sxz = 0.94; }
  const k = 1 - Math.exp(-MOTION.SCALE_RATE * dt), base = obj.userData.base || (obj.userData.base = new THREE.Vector3(1, 1, 1));
  base.lerp(sTarget.set(sxz, sy, sxz), squash > 0.6 ? 1 : k);   // 착지 직후 찌그러짐은 즉시(타격감), 나머지는 부드럽게
  obj.scale.copy(base).multiplyScalar(pop);
}

export function setBuffVisuals(shield, magnet, t, boost = false) {
  const cy = rolling() ? BALL_Y : BODY_Y;
  // 방어막: 켜질 때 0 → 1.15 → 1 탄성 팽창, 이후 맥동
  if (shield && !shieldBubble.visible) shieldAge = 0;
  shieldAge = Math.min(1, shieldAge + 0.016 / 0.35);
  const pa = shieldAge - 1, intro = 1 + 2.4 * pa * pa * pa + 1.4 * pa * pa;
  shieldBubble.visible = shield; shieldBubble.position.y = cy; shieldBubble.rotation.y += 0.016;
  shieldBubble.scale.setScalar(Math.max(0.01, intro) * (1 + Math.sin(t * 4) * 0.025) * (rolling() ? 0.8 : 1));
  shieldU.time.value = t; shieldU.intro.value = Math.min(1, shieldAge * 2);
  // 자석: 고리들이 서로 다른 축으로 회전, 발밑 N/S 고리는 반대로
  magnetField.visible = magnet;
  if (magnet) {
    const { rings, gyro, base } = magnetField.userData;
    rings[0].rotation.z += 0.05; rings[1].rotation.z -= 0.07; rings[2].rotation.y += 0.06;
    gyro.rotation.y = t * 1.5; gyro.position.y = cy; gyro.scale.setScalar(1 + Math.sin(t * 8) * 0.05);
    base.rotation.y = -t * 3; base.scale.setScalar(1 + Math.sin(t * 8) * 0.08);
  }
  boostRing.visible = boost; boostRing.position.y = cy + 0.95; boostRing.scale.setScalar(1 + Math.sin(t * 6) * 0.08);
}
// 무적 깜빡임: 현재 보이는 모델(로봇 또는 구체)만 토글
export function setFlicker(on, t) { const hide = on && Math.floor(t * 20) % 2 === 1; body.visible = wantBody && !hide; rig.visible = wantRig && !hide; }
export function bodyCenter(out) { return out.set(player.position.x, player.position.y + (rolling() ? BALL_Y : BODY_Y), player.position.z); }

export function resetPlayerPose() {
  player.position.set(0, 0, 0); player.rotation.y = 0; player.visible = true;
  body.visible = true; body.rotation.set(0, 0, 0); body.scale.set(1, 1, 1); body.position.y = BODY_Y;
  rig.rotation.set(0, 0, 0); rig.scale.set(1, 1, 1); rig.position.y = CHARACTER.pivotY;
  if (mixer) { mixer.stopAllAction(); current = null; }
  for (const o of [body, rig]) if (o.userData.base) o.userData.base.set(1, 1, 1);
  vx = 0; leanZ = 0; yaw = 0; popT = 0; rollShell.visible = false;
  if (robot) robot.position.set(0, -CHARACTER.pivotY, 0);
  wasAir = false; wasBalled = false; waveT = 1.5;
  shieldBubble.visible = false; magnetRing.visible = false; boostRing.visible = false; squash = 0; rollAngle = 0;
}
export function menuIdle(dt, t) {
  player.position.set(0, 0, 0);
  player.rotation.y += (Math.PI - player.rotation.y) * Math.min(1, dt * 4);
  animatePlayer(dt, t, 'wave');
  body.position.y = BODY_Y + Math.abs(Math.sin(t * 3)) * 0.12;
}
