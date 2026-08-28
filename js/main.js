// main.js — entry point: renderer, scene, camera, world, post, input, audio,
// game, and all UI wiring + the render loop.
import * as THREE from "three";
import { Game } from "./game.js";
import { LEVELS, PERF } from "./config.js";
import { Input } from "./input.js";
import { createPost } from "./effects.js";
import { createWorld } from "./world/index.js";
import { createHud } from "./systems/hud.js";
import AudioBus from "./audio.js";

const $ = (id) => document.getElementById(id);

// --- DOM refs (HUD DOM lives in systems/hud.js) ---
const loadingEl = $("loading");
const titleEl = $("title");
const hudEl = $("hud");
const pauseEl = $("pause");
const resultEl = $("result");
const actionBtn = $("actionBtn");
const joystickEl = $("joystick");
const knobEl = $("joyKnob");
const muteBtn = $("muteBtn");
const pauseBtn = $("pauseBtn");

// --- Renderer ---
// `antialias` is kept on always: desktop draws through the composer, but on
// mobile we render straight to the canvas, where hardware MSAA is cheap and
// makes the capped pixel ratio look clean.
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, PERF.pixelRatioCap));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$("game").appendChild(renderer.domElement);

// --- Scene / camera / fog / lights ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x24304f);
scene.fog = new THREE.FogExp2(0x2b3a5c, 0.005);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 300);
camera.position.set(0, 6, 14);

// Bright, readable "night" lighting: warm moonlit key over a cool base, so the
// two kids are always clearly visible and the scene reads as a warm fire-lit night.
scene.add(new THREE.HemisphereLight(0xc8d3e8, 0x5a4636, 1.5));
const moon = new THREE.DirectionalLight(0xf3e6d0, 1.55);
moon.position.set(-8, 20, 10);
scene.add(moon);
scene.add(new THREE.AmbientLight(0x6a7598, 1.0));
// 4th scene light: on phones every per-pixel light is real cost, so the warm
// fill (barely visible at night anyway) is desktop-only.
if (PERF.fillLight) {
  const fill = new THREE.DirectionalLight(0xd6def0, 0.5);
  fill.position.set(10, 12, 8);
  scene.add(fill);
}

// --- World + post + input + audio ---
const world = createWorld(scene);
// Mobile: no bloom chain — render directly (tone mapping is applied by the
// renderer itself, so the look stays consistent with the desktop passes).
const post = PERF.postFX
  ? createPost(renderer, scene, camera)
  : { composer: null, resize() {} };
const input = new Input({ joystickEl, knobEl, actionEl: actionBtn });
const audio = new AudioBus();

// --- HUD (all DOM logic in systems/hud.js) + game ---
const hud = createHud();
const game = new Game({ scene, camera, world, input, audio, ui: hud });
// tiny debug handle: from the browser console you can poke the game directly,
// e.g. __game.play(1) to jump to a level, __game.state to see the current one.
window.__game = game;

// --- Render loop ---
// One exception used to kill the whole rAF chain silently (frozen game, no
// clue why -- invisible on a phone without a dev console). Now the error is
// shown on screen and the last frame keeps drawing.
let last = performance.now();
let crashed = false;
// Frame-rate cap: on 120/144Hz phones rAF fires at display rate, doubling
// the per-second GPU cost for zero gameplay gain. We only process a frame
// once at least 1000/cap ms has passed (skipped ticks just extend the dt).
const MIN_FRAME_MS = PERF.frameRateCap ? 1000 / PERF.frameRateCap - 1 : 0;
function showCrash(err) {
  if (crashed) return;
  crashed = true;
  console.error(err);
  const d = document.createElement("div");
  d.style.cssText =
    "position:fixed;left:8px;right:8px;bottom:8px;z-index:99;background:#3a0d0d;" +
    "color:#ffb4a8;border:1px solid #ff7b6b;padding:10px 14px;border-radius:10px;" +
    "font:13px/1.45 system-ui,sans-serif;white-space:pre-wrap;max-height:45vh;overflow:auto";
  d.textContent = "⚠️ Game error:\n" + (err && err.stack ? err.stack : String(err));
  document.body.appendChild(d);
}
window.addEventListener("error", (e) => showCrash(e.error || e.message));
function loop(now) {
  requestAnimationFrame(loop);
  const elapsed = now - last;
  if (MIN_FRAME_MS && elapsed < MIN_FRAME_MS) return; // 120Hz tick: skip
  last = now;
  let dt = elapsed / 1000;
  dt = Math.min(dt, 0.05);
  try {
    game.update(dt);
    hud.update(game, dt);
  } catch (err) {
    showCrash(err);
  }
  if (post.composer) post.composer.render();
  else renderer.render(scene, camera);
}

// --- Viewport sync (mobile-safe) ---
// Mobile Chrome keeps a "layout viewport" that can be bigger than the area the
// user actually sees (browser toolbar showing/hiding, pinch zoom, scroll).
// `position: fixed` elements and window.innerWidth/Height are pinned to the
// layout viewport, so when the two disagree the joystick / action button float
// away from the screen edges and the 3D view misaligns with the UI.
// Fix: track visualViewport (the visible area) and pin canvas + HUD to it.
function syncViewport() {
  const vv = window.visualViewport;
  const w = vv ? vv.width : window.innerWidth;
  const h = vv ? vv.height : window.innerHeight;
  const ox = vv ? vv.offsetLeft : 0;
  const oy = vv ? vv.offsetTop : 0;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  post.resize(w, h);
  const t = vv && (ox || oy) ? `translate(${ox}px, ${oy}px)` : "";
  renderer.domElement.style.transform = t;
  hudEl.style.transform = t;
}
window.addEventListener("resize", syncViewport);
window.addEventListener("orientationchange", syncViewport);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", syncViewport);
  window.visualViewport.addEventListener("scroll", syncViewport);
}
syncViewport();


// --- Button wiring ---
function startGame() {
  audio.init();
  audio.resume();
  audio.startFire(0.25);
  audio.startMusic();
  titleEl.classList.add("hidden");
  resultEl.classList.add("hidden");
  pauseEl.classList.add("hidden");
  game.play(0);
}
function toMenu() {
  audio.stopMusic();
  resultEl.classList.add("hidden");
  pauseEl.classList.add("hidden");
  titleEl.classList.remove("hidden");
  hud.showHud(false);
  game.level = 0;
  game.score.reset();
  game.reset();
  game.state = "title";
}

$("startBtn").addEventListener("click", startGame);
$("againBtn").addEventListener("click", () => {
  resultEl.classList.add("hidden");
  audio.startFire(0.25);
  audio.startMusic();
  // won + more shifts left -> next level; won on last / lost -> (re)start
  if (game.state === "won" && game.level + 1 < LEVELS.length) game.nextLevel();
  else game.play(game.state === "lost" ? game.level : 0);
});
$("menuBtn").addEventListener("click", toMenu);
pauseBtn.addEventListener("click", () => {
  if (game.state === "playing") {
    game.state = "paused";
    pauseEl.classList.remove("hidden");
  }
});
$("resumeBtn").addEventListener("click", () => {
  if (game.state === "paused") {
    game.state = "playing";
    pauseEl.classList.add("hidden");
  }
});
$("quitBtn").addEventListener("click", toMenu);
muteBtn.addEventListener("click", () => {
  const m = !audio.isMuted();
  audio.setMuted(m);
  muteBtn.textContent = m ? "🔇" : "🔊";
});

// --- Title-screen portrait (2D, matching the 3D firefighter) ---
function drawFirefighterPortrait(cv) {
  const ctx = cv.getContext("2d");
  const w = cv.width;
  const h = cv.height;
  const cx = w / 2;
  const cy = h / 2;
  ctx.clearRect(0, 0, w, h);
  // coat shoulders
  ctx.fillStyle = "#22305a";
  ctx.beginPath();
  ctx.ellipse(cx, h * 1.05, w * 0.46, h * 0.36, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  // reflective band across the shoulders
  ctx.fillStyle = "#cfd6e4";
  ctx.fillRect(w * 0.28, h * 0.86, w * 0.44, h * 0.055);
  ctx.fillStyle = "#dfff5e";
  ctx.fillRect(w * 0.28, h * 0.877, w * 0.44, h * 0.026);
  // head
  ctx.fillStyle = "#f2c9a0";
  ctx.beginPath();
  ctx.arc(cx, cy - h * 0.02, w * 0.3, 0, 7);
  ctx.fill();
  // helmet dome
  ctx.fillStyle = "#f5821f";
  ctx.beginPath();
  ctx.arc(cx, cy - h * 0.055, w * 0.335, Math.PI * 1.02, Math.PI * 1.98);
  ctx.fill();
  // brim
  ctx.fillStyle = "#c96511";
  ctx.beginPath();
  ctx.ellipse(cx, cy + h * 0.075, w * 0.38, h * 0.05, 0, 0, 7);
  ctx.fill();
  // front shield
  ctx.fillStyle = "#d9dfe8";
  ctx.fillRect(cx - w * 0.09, cy - h * 0.045, w * 0.18, h * 0.085);
  // eyes
  ctx.fillStyle = "#fff";
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + sx * w * 0.11, cy + h * 0.02, w * 0.05, w * 0.06, 0, 0, 7);
    ctx.fill();
  }
  ctx.fillStyle = "#3a2a1a";
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + sx * w * 0.11, cy + h * 0.025, w * 0.026, 0, 7);
    ctx.fill();
  }
  // cheeks
  ctx.fillStyle = "rgba(255,140,120,0.5)";
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + sx * w * 0.18, cy + h * 0.07, w * 0.045, 0, 7);
    ctx.fill();
  }
  // smile
  ctx.strokeStyle = "#b5606a";
  ctx.lineWidth = w * 0.02;
  ctx.beginPath();
  ctx.arc(cx, cy + h * 0.06, w * 0.09, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
}

// --- Init ---
drawFirefighterPortrait($("portrait-hero"));
titleEl.classList.remove("hidden");
loadingEl.classList.add("hidden");
requestAnimationFrame(loop);






