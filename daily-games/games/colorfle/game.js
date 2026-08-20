// ============================================================
// COLORFLE — guess the hex code of the color shown
// You see the actual color the whole time (that's the puzzle); each
// guess gives tiered closeness feedback per R/G/B channel, plus an
// overall % match, rather than an exact numeric offset (which would
// make it trivially solvable in one guess).
// ============================================================

const MAX_GUESSES = 6;

// Deterministic PRNG (mulberry32) so "today's color" is identical for
// everyone without needing a server — same technique as the other games,
// just applied to raw RGB values instead of picking from a list.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getTodaysColor() {
  const start = new Date(2024, 0, 1);
  const today = new Date();
  const dayIndex = Math.floor((today - start) / (1000 * 60 * 60 * 24)) + 214;
  const rng = mulberry32(dayIndex);
  return {
    r: Math.floor(rng() * 256),
    g: Math.floor(rng() * 256),
    b: Math.floor(rng() * 256),
  };
}

function randomColor() {
  return {
    r: Math.floor(Math.random() * 256),
    g: Math.floor(Math.random() * 256),
    b: Math.floor(Math.random() * 256),
  };
}

function toHex({ r, g, b }) {
  return "#" + [r, g, b].map(n => n.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function parseHex(str) {
  const clean = str.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function proximityPct(guess, answer) {
  const dr = guess.r - answer.r, dg = guess.g - answer.g, db = guess.b - answer.b;
  const dist = Math.sqrt(dr * dr + dg * dg + db * db);
  const maxDist = Math.sqrt(3 * 255 * 255);
  return Math.max(0, Math.round(100 - (dist / maxDist) * 100));
}

// Tiered closeness per channel — direction plus a rough magnitude bucket,
// not the exact numeric difference (keeps some guessing challenge).
function channelFeedback(guessVal, answerVal) {
  const diff = guessVal - answerVal;
  if (diff === 0) return { tier: "correct", dir: "exact" };
  const abs = Math.abs(diff);
  const dir = diff > 0 ? "lower" : "higher"; // guess needs to go this direction
  if (abs <= 10) return { tier: "close", dir };
  if (abs <= 40) return { tier: "warm", dir };
  return { tier: "cold", dir };
}

const ARROW = { higher: "&uarr;", lower: "&darr;", exact: "&check;" };

const state = {
  answer: getTodaysColor(),
  guesses: [],
  gameOver: false,
};

const swatchEl = document.getElementById("swatch");
const hexLabelEl = document.getElementById("swatch-hex");
const attemptsEl = document.getElementById("attempts-left");
const statusEl = document.getElementById("status");
const guessForm = document.getElementById("guess-form");
const guessInput = document.getElementById("guess-input");
const guessList = document.getElementById("guess-list");
const playAgainBtn = document.getElementById("play-again");

function showStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

function setup() {
  swatchEl.style.background = `rgb(${state.answer.r}, ${state.answer.g}, ${state.answer.b})`;
  hexLabelEl.textContent = state.gameOver ? toHex(state.answer) : "?  ?  ?  ?  ?  ?";
  attemptsEl.textContent = `${MAX_GUESSES - state.guesses.length} guesses left`;
}
setup();

function renderGuess(guessColor, pct, isCorrect) {
  const row = document.createElement("div");
  row.className = "colorfle-row" + (isCorrect ? " correct" : "");

  const channels = ["r", "g", "b"].map(ch => {
    const fb = channelFeedback(guessColor[ch], state.answer[ch]);
    return `<span class="cf-channel cf-${fb.tier}" title="${ch.toUpperCase()}">${ch.toUpperCase()} ${ARROW[fb.dir]}</span>`;
  }).join("");

  row.innerHTML = `
    <span class="cf-swatch" style="background:rgb(${guessColor.r},${guessColor.g},${guessColor.b})"></span>
    <span class="cf-hex">${toHex(guessColor)}</span>
    <span class="cf-channels">${channels}</span>
    <span class="cf-pct">${pct.toFixed(0)}%</span>
  `;
  guessList.prepend(row);
}

guessForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (state.gameOver) return;

  const guessColor = parseHex(guessInput.value);
  if (!guessColor) {
    showStatus("Enter a 6-digit hex code, like 3fae02", true);
    return;
  }

  showStatus("");
  state.guesses.push(guessColor);
  guessInput.value = "";

  const isCorrect = guessColor.r === state.answer.r && guessColor.g === state.answer.g && guessColor.b === state.answer.b;
  const pct = proximityPct(guessColor, state.answer);
  renderGuess(guessColor, pct, isCorrect);

  if (isCorrect) {
    endGame(true);
    return;
  }

  attemptsEl.textContent = `${MAX_GUESSES - state.guesses.length} guesses left`;

  if (state.guesses.length >= MAX_GUESSES) {
    endGame(false);
  }
});

function endGame(won) {
  state.gameOver = true;
  guessInput.disabled = true;
  playAgainBtn.classList.add("show");
  hexLabelEl.textContent = toHex(state.answer);
  showStatus(won ? "Solved! 🎉" : `The color was ${toHex(state.answer)}`);
}

playAgainBtn.addEventListener("click", () => {
  state.answer = randomColor();
  state.guesses = [];
  state.gameOver = false;
  guessInput.disabled = false;
  guessInput.value = "";
  guessList.innerHTML = "";
  playAgainBtn.classList.remove("show");
  showStatus("");
  setup();
});
