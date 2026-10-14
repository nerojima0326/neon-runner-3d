// 데일리 고스트: 오늘 최고 기록 주행을 0.5m 단위로 기록 → 다음 도전에서 2m 앞에서 반투명 캐릭터로 재생
//  - 거리 기준 샘플링 (시간 기준이면 오토러너 특성상 늘 플레이어와 겹침). 최고 기록이 끝난 거리에서 사라짐 = 넘어야 할 목표
//  - 샘플 2바이트: [lane | roll<<2 | dash<<3 | flip<<4, round(jumpY*50)]. 3,000m ≈ 12KB (base64 16KB)
import * as THREE from 'three';
import { scene } from './world.js';
import { LANES, VERSION } from './config.js';
import { BODY_Y, BALL_Y } from './player.js';

const STEP = 0.5, LEAD_M = 2, LEAD_Z = -LEAD_M * 2, MAX_SAMPLES = 20000;   // 거리 1m = 월드 2유닛. 상한 10km
export const F_ROLL = 4, F_DASH = 8, F_FLIP = 16;
const COLOR = 0xc0f0ff, DASH_COLOR = 0xffd040;

const group = new THREE.Group();
const mat = new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.32, depthWrite: false });
const wireMat = new THREE.MeshBasicMaterial({ color: COLOR, wireframe: true, transparent: true, opacity: 0.5, depthWrite: false });
const body = new THREE.Group(); body.position.y = BODY_Y;
body.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), mat), new THREE.Mesh(new THREE.IcosahedronGeometry(0.52, 1), wireMat));
const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 6, 40), wireMat); band.rotation.x = Math.PI / 2; body.add(band);
group.add(body); group.visible = false; scene.add(group);

let rec = [], data = null, endDist = 0, done = true, smoothX = 0, flipA = 0;

// ---------- 기록 ----------
export function beginRecord() { rec = []; }
// 매 프레임 호출. floor(dist/STEP)+1개 샘플이 될 때까지 현재 상태로 채움 (한 프레임에 여러 샘플 가능)
export function record(dist, lane, jumpY, flags) {
  const want = Math.min(MAX_SAMPLES, Math.floor(dist / STEP) + 1) * 2;
  if (rec.length >= want) return;
  const b0 = (lane & 3) | flags, y = Math.max(0, Math.min(255, Math.round(jumpY * 50)));
  while (rec.length < want) rec.push(b0, y);
}
export function endRecord() { return encode(rec); }

function encode(arr) {
  let s = '';
  for (let i = 0; i < arr.length; i += 8192) s += String.fromCharCode.apply(null, arr.slice(i, i + 8192));
  return btoa(s);
}
function decode(s) { try { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); } catch { return null; } }

// ---------- 재생 ----------
// g = profile.daily.ghost. 버전이 다르면(코스 생성 규칙이 바뀌었을 수 있음) 무시
export function start(g) {
  stop();
  if (!g || g.v !== VERSION || !g.data) return false;
  data = decode(g.data);
  if (!data || data.length < 2) { data = null; return false; }
  endDist = g.dist; done = false; smoothX = 0; flipA = 0;
  group.visible = true; group.position.set(0, 0, LEAD_Z); body.rotation.set(0, 0, 0);
  return true;
}
export function stop() { data = null; done = true; group.visible = false; }
export const active = () => !!data && !done;
export const ghostPos = () => group.position;

// 매 프레임. 고스트 기록이 끝나는 거리를 지나는 순간 한 번 true 반환 (호출 측에서 연출)
export function update(dist, dt, t) {
  if (!data || done) return false;
  if (dist >= endDist) { done = true; group.visible = false; return true; }
  const i = Math.min(data.length / 2 - 1, Math.floor((dist + LEAD_M) / STEP)), b0 = data[i * 2], y = data[i * 2 + 1] / 50;
  const lane = Math.min(2, b0 & 3), roll = b0 & F_ROLL, dash = b0 & F_DASH, flip = b0 & F_FLIP;
  smoothX += (LANES[lane] - smoothX) * Math.min(1, dt * 12);
  group.position.set(smoothX, y, LEAD_Z);
  body.position.y = roll ? BALL_Y : BODY_Y;
  body.scale.setScalar(roll ? 0.84 : 1);
  if (roll) body.rotation.x -= dt * 14;
  else { flipA = flip ? flipA - dt * 12 : 0; body.rotation.x = flipA; }
  mat.color.setHex(dash ? DASH_COLOR : COLOR); wireMat.color.setHex(dash ? DASH_COLOR : COLOR);
  mat.opacity = 0.3 + Math.sin(t * 6) * 0.06;
  return false;
}
