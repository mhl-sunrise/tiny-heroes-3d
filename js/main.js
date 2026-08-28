// main.js — entry point: renderer, scene, camera, world, post, input, audio,
// game, and all UI wiring + the render loop.
import * as THREE from "three";
import { Game, LEVEL_TIME } from "./game.js";
import { Input } from "./input.js";
import { createPost } from "./effects.js";
import { createWorld } from "./world.js";
import { createBoy, createGirl } from "./characters.js";
import AudioBus from "./audio.js";

const $ = (id) => document.getElementById(id);

// --- DOM refs ---
const loadingEl = $("loading");
const titleEl = $("title");
const hudEl = $("hud");
const pauseEl = $("pause");
const resultEl = $("result");
const savedCountEl = $("savedCount");
const totalCountEl = $("totalCount");
const timerValueEl = $("timerValue");
const timerBoxEl = $("timerBox");
const interactPromptEl = $("interactPrompt");
const dangerEl = $("dangerVignette");
const actionBtn = $("actionBtn");
const joystickEl = $("joystick");
const knobEl = $("joyKnob");
const muteBtn = $("muteBtn");
const pauseBtn = $("pauseBtn");

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
const fill = new THREE.DirectionalLight(0xd6def0, 0.5);
fill.position.set(10, 12, 8);
scene.add(fill);

// --- World + post + input + audio ---
const world = createWorld(scene);
const post = createPost(renderer, scene, camera);
const input = new Input({ joystickEl, knobEl, actionEl: actionBtn });
const audio = new AudioBus();

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ":" + String(sec).padStart(2, "0");
}

const ui = {
  showHud: (on) => {
    hudEl.classList.toggle("hidden", !on);
    if (!on) interactPromptEl.classList.add("hidden");
  },
  showResult: (won, saved, total, time) => {
    $("resultBadge").textContent = won ? "Mission complete" : "Time's up";
    $("resultTitle").textContent = won ? "Everyone is safe!" : "Some were left behind…";
    $("resultText").textContent = won
      ? "Our little heroes got everyone out of the flames. Amazing work!"
      : "You saved " + saved + " of " + total + ". The fire spread too fast this time — try again!";
    $("resultSaved").textContent = saved + " / " + total;
    $("resultTime").textContent = fmtTime(time);
    resultEl.classList.remove("hidden");
  },
};

const game = new Game({ scene, camera, world, input, audio, ui });
totalCountEl.textContent = game.totalCount;



// --- HUD ---
function updateHud() {
  if (game.state !== "playing") return;
  savedCountEl.textContent = game.savedCount;
  const left = Math.max(0, LEVEL_TIME - game.time);
  timerValueEl.textContent = fmtTime(left);
  timerBoxEl.classList.toggle("low", left < 20);
  if (game.prompt) {
    interactPromptEl.textContent = game.prompt;
    interactPromptEl.classList.remove("hidden");
  } else {
    interactPromptEl.classList.add("hidden");
  }
  const carrying = game.heroes.some((h) => h.carry);
  actionBtn.textContent = carrying ? "🏁" : "✋";
  actionBtn.classList.toggle("grab", !carrying);
  dangerEl.style.opacity = game.danger.toFixed(3);
}

// --- Render loop ---
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.05);
  game.update(dt);
  updateHud();
  post.composer.render();
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.resize(window.innerWidth, window.innerHeight);
});


// --- Button wiring ---
function startGame() {
  audio.init();
  audio.resume();
  audio.startFire(0.25);
  titleEl.classList.add("hidden");
  resultEl.classList.add("hidden");
  pauseEl.classList.add("hidden");
  game.play();
}
function toMenu() {
  resultEl.classList.add("hidden");
  pauseEl.classList.add("hidden");
  titleEl.classList.remove("hidden");
  ui.showHud(false);
  game.reset();
  game.state = "title";
}

$("startBtn").addEventListener("click", startGame);
$("againBtn").addEventListener("click", () => {
  resultEl.classList.add("hidden");
  audio.startFire(0.25);
  game.play();
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

// --- Title-screen portraits (2D, matching the 3D heroes) ---
function drawPortrait(cv, kind) {
  const ctx = cv.getContext("2d");
  const w = cv.width;
  const h = cv.height;
  const cx = w / 2;
  const cy = h / 2;
  ctx.clearRect(0, 0, w, h);
  // shoulders / uniform
  ctx.fillStyle = kind === "boy" ? "#17223f" : "#7d7d54";
  ctx.beginPath();
  ctx.ellipse(cx, h * 1.05, w * 0.46, h * 0.36, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  if (kind === "girl") {
    ctx.fillStyle = "#3d4a2c";
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.ellipse(cx + (Math.random() - 0.5) * w * 0.7, h * 0.93 + Math.random() * h * 0.14, w * 0.05, w * 0.04, 0, 0, 7);
      ctx.fill();
    }
  } else {
    ctx.strokeStyle = "#c8ff4d";
    ctx.lineWidth = w * 0.04;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.16, h * 0.74);
    ctx.lineTo(cx - w * 0.16, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + w * 0.16, h * 0.74);
    ctx.lineTo(cx + w * 0.16, h);
    ctx.stroke();
    ctx.strokeStyle = "#14161c";
    ctx.lineWidth = w * 0.05;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.2, h * 0.72);
    ctx.lineTo(cx + w * 0.22, h * 1.02);
    ctx.stroke();
  }
  // head
  ctx.fillStyle = "#f2c9a0";
  ctx.beginPath();
  ctx.arc(cx, cy - h * 0.05, w * 0.3, 0, 7);
  ctx.fill();
  // hair
  if (kind === "boy") {
    ctx.fillStyle = "#b08a5c";
    ctx.beginPath();
    ctx.arc(cx, cy - h * 0.09, w * 0.3, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
  } else {
    ctx.fillStyle = "#a5673f";
    ctx.beginPath();
    ctx.arc(cx, cy - h * 0.09, w * 0.31, Math.PI * 1.0, Math.PI * 2.0);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + w * 0.31, cy - h * 0.02, w * 0.08, w * 0.17, 0.3, 0, 7);
    ctx.fill();
    ctx.fillStyle = "#e9ecf5";
    ctx.beginPath();
    ctx.arc(cx + w * 0.2, cy - h * 0.16, w * 0.035, 0, 7);
    ctx.fill();
  }
  // eyes
  ctx.fillStyle = "#2a1c12";
  ctx.beginPath();
  ctx.arc(cx - w * 0.11, cy - h * 0.05, w * 0.035, 0, 7);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + w * 0.11, cy - h * 0.05, w * 0.035, 0, 7);
  ctx.fill();
  // cheeks
  ctx.fillStyle = "rgba(255,140,120,0.5)";
  ctx.beginPath();
  ctx.arc(cx - w * 0.17, cy + w * 0.03, w * 0.05, 0, 7);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + w * 0.17, cy + w * 0.03, w * 0.05, 0, 7);
  ctx.fill();
  // smile
  ctx.strokeStyle = "#b5606a";
  ctx.lineWidth = w * 0.02;
  ctx.beginPath();
  ctx.arc(cx, cy + w * 0.02, w * 0.09, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
}

// --- Init ---
drawPortrait($("portrait-boy"), "boy");
drawPortrait($("portrait-girl"), "girl");
titleEl.classList.remove("hidden");
loadingEl.classList.add("hidden");
requestAnimationFrame(loop);






