// systems/hud.js — owns ALL HUD DOM: saved/score/level chips, the health
// bar, timer, damage flash, low-HP pulse and overlay buttons. game.js calls
// the methods; main.js just wires the buttons.
const $ = (id) => document.getElementById(id);

export function createHud() {
  const hudEl = $("hud");
  const savedEl = $("savedCount");
  const totalEl = $("totalCount");
  const scoreEl = $("scoreValue");
  const levelEl = $("levelName");
  const timerEl = $("timerValue");
  const timerBoxEl = $("timerBox");
  const promptEl = $("interactPrompt");
  const dangerEl = $("dangerVignette");
  const heatEl = $("heatTint");
  const canvasEl = document.querySelector("#game canvas");
  const healthFillEl = $("healthFill");
  const healthBoxEl = $("healthBox");
  const heartEl = $("heartIcon");
  const actionBtn = $("actionBtn");

  function fmtTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ":" + String(sec).padStart(2, "0");
  }

  function showHud(on) {
    hudEl.classList.toggle("hidden", !on);
    if (!on) promptEl.classList.add("hidden");
  }

  function showResult({ won, reason, level, score, saved, total, time, next }) {
    $("resultBadge").textContent = won
      ? level < 2
        ? "Shift complete"
        : "Mission complete"
      : reason === "collapsed"
        ? "Firefighter down"
        : "Time's up";
    $("resultTitle").textContent = won
      ? level < 2
        ? "Everyone is safe!"
        : "The city is safe!"
      : reason === "collapsed"
        ? "Our hero collapsed in the smoke…"
        : "Some were left behind…";
    $("resultText").textContent = won
      ? level < 2
        ? "Whole crowd rescued with room to spare. Bigger alarms are waiting — ready for the next shift?"
        : "Every level cleared. The little firefighter is the town's hero now."
      : "You saved " +
        saved +
        " of " +
        total +
        ". " +
        (reason === "collapsed"
          ? "Keep an eye on the health bar — stand clear of the flames and heal at the green zone."
          : "The fire spread too fast this time — try again!");
    $("resultSaved").textContent = saved + " / " + total;
    $("resultTime").textContent = fmtTime(time);
    $("resultScore").textContent = String(score);
    // againBtn doubles as "Next shift" when there is a next level
    $("againBtn").textContent = next ? "▶  Next shift" : "↻  Play again";
    $("result").classList.remove("hidden");
  }

  let flashT = 0;
  let lastHurt = 0;
  // Dirty-check cache: writing the same textContent every frame forces style/
  // layout work on phones — only touch the DOM when a value actually changes.
  const _txt = {};
  function setTxt(el, key, val) {
    if (_txt[key] !== val) {
      _txt[key] = val;
      el.textContent = val;
    }
  }

  function update(game, dt) {
    if (game.state === "title") return;
    setTxt(savedEl, "saved", String(game.savedCount));
    setTxt(totalEl, "total", String(game.totalCount));
    setTxt(scoreEl, "score", String(game.score.score));
    setTxt(levelEl, "level", "F" + (game.levelCfg().floor + 1) + " · " + game.levelName);
    setTxt(timerEl, "timer", fmtTime(game.timeLeft));

    // health bar
    const hp = game.health;
    const pct = Math.max(0, (hp.hp / hp.max) * 100);
    healthFillEl.style.width = pct + "%";
    healthFillEl.classList.toggle("low", hp.low);
    healthBoxEl.classList.toggle("low", hp.low);
    heartEl.classList.toggle("beat", hp.low);

    // low-time warning
    timerBoxEl.classList.toggle("low", game.timeLeft < 20 && game.state === "playing");

    // action button: free a trapped person (same action all the time now)
    setTxt(actionBtn, "action", "✋");
    actionBtn.classList.toggle("grab", true);

    // interact prompt
    setTxt(promptEl, "prompt", game.prompt || "");
    promptEl.classList.toggle("hidden", !game.prompt);

    // damage flash decays; danger vignette tracks proximity + low hp
    flashT = Math.max(0, flashT - dt * 2.2);
    if (hp.dmgThisFrame > 0.02 && game.time - lastHurt > 0.25) {
      flashT = 1;
      lastHurt = game.time;
    }
    const danger =
      game.state === "playing"
        ? Math.max(game.danger * 0.7, hp.low ? 0.55 : 0, flashT * 0.8)
        : 0;
    dangerEl.style.opacity = String(Math.min(1, danger + flashT * 0.5));
  }

  // Ultra-danger state: the whole screen blurs and takes on a hot tint.
  // Pure class toggles — CSS transitions do the animation, zero per-frame cost.
  function setUltra(on) {
    if (canvasEl) canvasEl.classList.toggle("ultra", on);
    if (heatEl) heatEl.classList.toggle("on", on);
  }

  return { showHud, showResult, update, setUltra };
}