// ============================================================
// COLORFLE
// Three modes:
//  - Normal: pick which 3 palette colors go in which of 3 fixed
//    size slots (small/medium/large) to match the mixed target color.
//    Scored like Wordle: green = right color in the right slot,
//    yellow = right color, wrong slot, gray = not part of the mix.
//  - Hard: same idea with 4 colors / 4 size slots.
//  - Impossible: free-form hex-code guessing (the original mode) —
//    genuinely much harder since there's no fixed palette to reason from.
// ============================================================

const MAX_GUESSES = 6;
const MODE_STORAGE_KEY = "colorfle-mode";

// ---------- shared helpers ----------

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex({ r, g, b }) {
  return "#" + [r, g, b].map(n => n.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function proximityPct(a, b) {
  const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
  const dist = Math.sqrt(dr * dr + dg * dg + db * db);
  const maxDist = Math.sqrt(3 * 255 * 255);
  return Math.max(0, Math.round(100 - (dist / maxDist) * 100));
}

function dayIndex(offset) {
  const start = new Date(2024, 0, 1);
  const today = new Date();
  return Math.floor((today - start) / (1000 * 60 * 60 * 24)) + offset;
}

// ---------- MIX modes (Normal / Hard) ----------

const PALETTE = [
  { id: "white",    hex: "#FFFFFF" }, { id: "cream",   hex: "#FFF3B0" },
  { id: "yellow",   hex: "#FFD500" }, { id: "orange",  hex: "#FF8C1A" },
  { id: "brown",    hex: "#8B5A2B" }, { id: "crimson", hex: "#E8114B" },
  { id: "darkred",  hex: "#7A0C0C" }, { id: "cyan",    hex: "#33E0FF" },
  { id: "mint",     hex: "#8CFFC7" }, { id: "lime",    hex: "#C6FF33" },
  { id: "green",    hex: "#2FAE4E" }, { id: "olive",   hex: "#7A7A0F" },
  { id: "teal",     hex: "#0F8A82" }, { id: "salmon",  hex: "#F4A6A6" },
  { id: "lavender", hex: "#D9B8F5" }, { id: "magenta", hex: "#E619E6" },
  { id: "purple",   hex: "#7A1FA6" }, { id: "blue",    hex: "#3D6BE0" },
  { id: "navy",     hex: "#101066" }, { id: "black",   hex: "#0A0A0A" },
  { id: "gray",     hex: "#8A8A8A" },
];

const MIX_CONFIG = {
  normal: { n: 3, tiers: [0.2, 0.3, 0.5], tierLabels: ["Small", "Medium", "Large"], dayOffset: 301 },
  hard:   { n: 4, tiers: [0.1, 0.2, 0.3, 0.4], tierLabels: ["Small", "Medium", "Large", "XL"], dayOffset: 377 },
};

function pickNDistinct(rng, n) {
  const idxs = PALETTE.map((_, i) => i);
  const chosen = [];
  for (let i = 0; i < n; i++) {
    const j = Math.floor(rng() * idxs.length);
    chosen.push(idxs[j]);
    idxs.splice(j, 1);
  }
  return chosen;
}

function getTodaysMix(modeId) {
  const cfg = MIX_CONFIG[modeId];
  const rng = mulberry32(dayIndex(cfg.dayOffset));
  return pickNDistinct(rng, cfg.n);
}

function randomMix(modeId) {
  const cfg = MIX_CONFIG[modeId];
  const idxs = PALETTE.map((_, i) => i);
  const chosen = [];
  for (let i = 0; i < cfg.n; i++) {
    const j = Math.floor(Math.random() * idxs.length);
    chosen.push(idxs[j]);
    idxs.splice(j, 1);
  }
  return chosen;
}

function blendMix(colorIds, tiers) {
  let r = 0, g = 0, b = 0;
  colorIds.forEach((id, i) => {
    const c = hexToRgb(PALETTE[id].hex);
    r += c.r * tiers[i]; g += c.g * tiers[i]; b += c.b * tiers[i];
  });
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

function scoreMixGuess(guessIds, answerIds) {
  return guessIds.map((id, i) => {
    if (id === answerIds[i]) return "correct";
    return answerIds.includes(id) ? "present" : "absent";
  });
}

// ---------- HEX mode (Impossible) ----------

function getTodaysColor() {
  const rng = mulberry32(dayIndex(214));
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

function parseHex(str) {
  const clean = str.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

// Tiered closeness per channel — direction plus a rough magnitude bucket,
// not the exact numeric difference (keeps some guessing challenge).
function channelFeedback(guessVal, answerVal) {
  const diff = guessVal - answerVal;
  if (diff === 0) return { tier: "correct", dir: "exact" };
  const abs = Math.abs(diff);
  const dir = diff > 0 ? "lower" : "higher";
  if (abs <= 10) return { tier: "close", dir };
  if (abs <= 40) return { tier: "warm", dir };
  return { tier: "cold", dir };
}

const ARROW = { higher: "&uarr;", lower: "&darr;", exact: "&check;" };

// ---------- MODE CONFIG (for the tab selector) ----------

const MODES = [
  { id: "normal", label: "Normal", kind: "mix", desc: "Pick which 3 colors go in the Small/Medium/Large slots to match the mix." },
  { id: "hard", label: "Hard", kind: "mix", desc: "Same idea with 4 colors and 4 size slots — Small through XL." },
  { id: "impossible", label: "Impossible", kind: "hex", desc: "No palette this time — guess the exact hex code in 6 tries." },
];

// ============================================================
// STATE + DOM
// ============================================================

const state = {
  mode: "normal",
  guesses: [],
  gameOver: false,
};
{
  const saved = localStorage.getItem(MODE_STORAGE_KEY);
  if (MODES.some(m => m.id === saved)) state.mode = saved;
}

const modeSelectEl = document.getElementById("mode-select");
const modeDescEl = document.getElementById("mode-desc");
const statusEl = document.getElementById("status");
const attemptsEl = document.getElementById("attempts-left");
const playAgainBtn = document.getElementById("play-again");

const mixUiEl = document.getElementById("mix-ui");
const mixSwatchEl = document.getElementById("mix-swatch");
const mixSlotsEl = document.getElementById("mix-slots");
const mixPaletteEl = document.getElementById("mix-palette");
const mixGuessBtn = document.getElementById("mix-guess-btn");
const mixGuessListEl = document.getElementById("mix-guess-list");

const hexUiEl = document.getElementById("hex-ui");
const hexSwatchEl = document.getElementById("hex-swatch");
const hexLabelEl = document.getElementById("hex-swatch-hex");
const hexFormEl = document.getElementById("hex-guess-form");
const hexInputEl = document.getElementById("hex-guess-input");
const hexGuessListEl = document.getElementById("hex-guess-list");

function showStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

// ============================================================
// MODE SELECTOR
// ============================================================

function buildModeSelector() {
  modeSelectEl.innerHTML = MODES.map(m =>
    `<button class="mode-btn${m.id === state.mode ? " active" : ""}" data-mode="${m.id}" role="tab" aria-selected="${m.id === state.mode}">${m.label}</button>`
  ).join("");
  modeSelectEl.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.mode === state.mode) return;
      state.mode = btn.dataset.mode;
      localStorage.setItem(MODE_STORAGE_KEY, state.mode);
      startRound(false);
    });
  });
}

function currentModeInfo() {
  return MODES.find(m => m.id === state.mode);
}

// ============================================================
// ROUND LIFECYCLE
// ============================================================

// random=true starts a fresh random round in the active mode (play again);
// random=false starts today's round for whichever mode is now active
// (used on first load and right after switching modes).
function startRound(random) {
  const info = currentModeInfo();
  modeSelectEl.querySelectorAll(".mode-btn").forEach(btn => {
    const active = btn.dataset.mode === state.mode;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active);
  });
  modeDescEl.textContent = info.desc;

  state.guesses = [];
  state.gameOver = false;
  playAgainBtn.classList.remove("show");
  showStatus("");

  if (info.kind === "mix") {
    mixUiEl.classList.remove("hidden");
    hexUiEl.classList.add("hidden");
    const cfg = MIX_CONFIG[state.mode];
    state.mixAnswer = random ? randomMix(state.mode) : getTodaysMix(state.mode);
    state.mixSlots = Array(cfg.n).fill(null);
    const blended = blendMix(state.mixAnswer, cfg.tiers);
    mixSwatchEl.style.background = `rgb(${blended.r},${blended.g},${blended.b})`;
    mixGuessListEl.innerHTML = "";
    attemptsEl.textContent = `${MAX_GUESSES - state.guesses.length} guesses left`;
    renderMixSlots();
    renderMixPalette();
  } else {
    mixUiEl.classList.add("hidden");
    hexUiEl.classList.remove("hidden");
    state.hexAnswer = random ? randomColor() : getTodaysColor();
    hexSwatchEl.style.background = `rgb(${state.hexAnswer.r},${state.hexAnswer.g},${state.hexAnswer.b})`;
    hexLabelEl.textContent = "?  ?  ?  ?  ?  ?";
    hexInputEl.disabled = false;
    hexInputEl.value = "";
    hexGuessListEl.innerHTML = "";
    attemptsEl.textContent = `${MAX_GUESSES - state.guesses.length} guesses left`;
  }
}

playAgainBtn.addEventListener("click", () => startRound(true));

// ============================================================
// MIX MODE UI
// ============================================================

function renderMixSlots() {
  const cfg = MIX_CONFIG[state.mode];
  mixSlotsEl.innerHTML = cfg.tierLabels.map((label, i) => {
    const filled = state.mixSlots[i];
    const bg = filled !== null ? PALETTE[filled].hex : "transparent";
    return `
      <button type="button" class="mix-slot${filled !== null ? " filled" : ""}" data-slot="${i}" style="background:${bg}">
        <span class="mix-slot-label">${label}</span>
      </button>
    `;
  }).join("");

  mixSlotsEl.querySelectorAll(".mix-slot").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.slot);
      if (state.mixSlots[i] !== null) {
        state.mixSlots[i] = null;
        renderMixSlots();
        renderMixPalette();
      }
    });
  });

  mixGuessBtn.disabled = state.mixSlots.some(s => s === null);
}

function renderMixPalette() {
  const usedIds = new Set(state.mixSlots.filter(s => s !== null));
  mixPaletteEl.innerHTML = PALETTE.map((c, i) => `
    <button type="button" class="mix-palette-swatch${usedIds.has(i) ? " used" : ""}" data-color="${i}" style="background:${c.hex}" title="${c.id}"></button>
  `).join("");

  mixPaletteEl.querySelectorAll(".mix-palette-swatch").forEach(btn => {
    btn.addEventListener("click", () => {
      if (state.gameOver) return;
      const colorId = Number(btn.dataset.color);
      if (usedIds.has(colorId)) return;
      const emptyIndex = state.mixSlots.indexOf(null);
      if (emptyIndex === -1) return;
      state.mixSlots[emptyIndex] = colorId;
      renderMixSlots();
      renderMixPalette();
    });
  });
}

function renderMixGuessRow(guessIds, feedback, blended, pct) {
  const row = document.createElement("div");
  const solved = feedback.every(f => f === "correct");
  row.className = "mix-guess-row" + (solved ? " correct" : "");
  row.innerHTML = `
    <div class="mix-guess-tiles">
      ${guessIds.map((id, i) => `<span class="mix-tile mix-${feedback[i]}" style="background:${PALETTE[id].hex}"></span>`).join("")}
    </div>
    <span class="cf-pct">${pct.toFixed(0)}%</span>
  `;
  mixGuessListEl.prepend(row);
}

mixGuessBtn.addEventListener("click", () => {
  if (state.gameOver) return;
  if (state.mixSlots.some(s => s === null)) return;

  const cfg = MIX_CONFIG[state.mode];
  const guessIds = state.mixSlots.slice();
  const feedback = scoreMixGuess(guessIds, state.mixAnswer);
  const blended = blendMix(guessIds, cfg.tiers);
  const answerBlended = blendMix(state.mixAnswer, cfg.tiers);
  const pct = proximityPct(blended, answerBlended);

  state.guesses.push(guessIds);
  renderMixGuessRow(guessIds, feedback, blended, pct);

  const solved = feedback.every(f => f === "correct");
  state.mixSlots = Array(cfg.n).fill(null);
  renderMixSlots();
  renderMixPalette();

  if (solved) {
    endMixGame(true);
    return;
  }

  attemptsEl.textContent = `${MAX_GUESSES - state.guesses.length} guesses left`;
  if (state.guesses.length >= MAX_GUESSES) {
    endMixGame(false);
  }
});

function endMixGame(won) {
  state.gameOver = true;
  playAgainBtn.classList.add("show");
  const cfg = MIX_CONFIG[state.mode];
  const names = state.mixAnswer.map((id, i) => `${cfg.tierLabels[i]}: ${PALETTE[id].id}`).join(", ");
  showStatus(won ? "Solved! 🎉" : `The mix was — ${names}`);
}

// ============================================================
// HEX MODE (IMPOSSIBLE) UI
// ============================================================

function renderHexGuess(guessColor, pct, isCorrect) {
  const row = document.createElement("div");
  row.className = "colorfle-row" + (isCorrect ? " correct" : "");
  const channels = ["r", "g", "b"].map(ch => {
    const fb = channelFeedback(guessColor[ch], state.hexAnswer[ch]);
    return `<span class="cf-channel cf-${fb.tier}" title="${ch.toUpperCase()}">${ch.toUpperCase()} ${ARROW[fb.dir]}</span>`;
  }).join("");
  row.innerHTML = `
    <span class="cf-swatch" style="background:rgb(${guessColor.r},${guessColor.g},${guessColor.b})"></span>
    <span class="cf-hex">${toHex(guessColor)}</span>
    <span class="cf-channels">${channels}</span>
    <span class="cf-pct">${pct.toFixed(0)}%</span>
  `;
  hexGuessListEl.prepend(row);
}

hexFormEl.addEventListener("submit", (e) => {
  e.preventDefault();
  if (state.gameOver) return;

  const guessColor = parseHex(hexInputEl.value);
  if (!guessColor) {
    showStatus("Enter a 6-digit hex code, like 3fae02", true);
    return;
  }

  showStatus("");
  state.guesses.push(guessColor);
  hexInputEl.value = "";

  const isCorrect = guessColor.r === state.hexAnswer.r && guessColor.g === state.hexAnswer.g && guessColor.b === state.hexAnswer.b;
  const pct = proximityPct(guessColor, state.hexAnswer);
  renderHexGuess(guessColor, pct, isCorrect);

  if (isCorrect) {
    endHexGame(true);
    return;
  }

  attemptsEl.textContent = `${MAX_GUESSES - state.guesses.length} guesses left`;
  if (state.guesses.length >= MAX_GUESSES) {
    endHexGame(false);
  }
});

function endHexGame(won) {
  state.gameOver = true;
  hexInputEl.disabled = true;
  playAgainBtn.classList.add("show");
  hexLabelEl.textContent = toHex(state.hexAnswer);
  showStatus(won ? "Solved! 🎉" : `The color was ${toHex(state.hexAnswer)}`);
}

// ============================================================
// INIT
// ============================================================

try {
  buildModeSelector();
  startRound(false);
} catch (err) {
  console.error("Colorfle setup failed:", err);
}
