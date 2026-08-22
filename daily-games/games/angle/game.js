// ============================================================
// ANGLE - guess the degree measure of the angle shown
// Two rays from a shared vertex form an angle with no markings - you
// guess its measure in degrees. Feedback is tiered closeness (same
// idea as Colorfle's Impossible mode) plus each past guess's ray gets
// drawn on the diagram so you can visually compare where you've been.
// ============================================================

const MAX_GUESSES = 6;

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dayIndex(offset) {
  const start = new Date(2024, 0, 1);
  const today = new Date();
  return Math.floor((today - start) / (1000 * 60 * 60 * 24)) + offset;
}

// Kept away from 0/360 (degenerate, rays overlap) and comfortably off
// straight-line territory too, so every angle actually looks like one.
function getTodaysAngle() {
  const rng = mulberry32(dayIndex(452));
  return 5 + Math.floor(rng() * 351); // 5..355
}

function randomAngle() {
  return 5 + Math.floor(Math.random() * 351);
}

function angularDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function proximityPct(diff) {
  return Math.max(0, Math.round(100 - (diff / 180) * 100));
}

function tierFor(diff) {
  if (diff === 0) return "correct";
  if (diff <= 5) return "close";
  if (diff <= 20) return "warm";
  return "cold";
}

const TIER_COLOR_VAR = {
  correct: "var(--correct)",
  close: "var(--present)",
  warm: "var(--accent)",
  cold: "#5a5f6b",
};

const state = {
  answer: getTodaysAngle(),
  guesses: [],
  gameOver: false,
};

const diagramEl = document.getElementById("angle-diagram");
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

// Vertex + ray geometry. Ray 1 is fixed pointing straight up so every
// puzzle is visually anchored the same way; only ray 2's position (and
// so the angle between them) actually varies.
const CX = 150, CY = 260, R = 220;
const RAY1_DEG = 90; // straight up, math convention (0 = right, 90 = up)

function rayEndpoint(deg) {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + R * Math.cos(rad), y: CY - R * Math.sin(rad) };
}

function buildDiagramSvg(revealAnswer) {
  const ray1 = rayEndpoint(RAY1_DEG);
  const ray2Deg = RAY1_DEG - state.answer;
  const ray2 = rayEndpoint(ray2Deg);

  const guessRays = state.guesses.map(g => {
    const deg = RAY1_DEG - g.value;
    const p = rayEndpoint(deg);
    return `<line x1="${CX}" y1="${CY}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="${TIER_COLOR_VAR[g.tier]}" stroke-width="3" stroke-linecap="round" opacity="0.85" />`;
  }).join("");

  return `
    <svg viewBox="0 0 300 300" width="100%" height="100%">
      <line x1="${CX}" y1="${CY}" x2="${ray1.x.toFixed(1)}" y2="${ray1.y.toFixed(1)}" stroke="var(--ink)" stroke-width="4" stroke-linecap="round" />
      ${revealAnswer
        ? `<line x1="${CX}" y1="${CY}" x2="${ray2.x.toFixed(1)}" y2="${ray2.y.toFixed(1)}" stroke="var(--ink)" stroke-width="4" stroke-linecap="round" />`
        : ""
      }
      ${guessRays}
      <circle cx="${CX}" cy="${CY}" r="4" fill="var(--ink)" />
    </svg>
  `;
}

function renderDiagram() {
  diagramEl.innerHTML = buildDiagramSvg(state.gameOver);
}
renderDiagram();
attemptsEl.textContent = `${MAX_GUESSES - state.guesses.length} guesses left`;

function renderGuessRow(value, diff, pct, tier, isCorrect) {
  const row = document.createElement("div");
  row.className = "angle-row" + (isCorrect ? " correct" : "");
  row.innerHTML = `
    <span class="angle-value">${value}&deg;</span>
    <span class="cf-channel cf-${tier}">${isCorrect ? "exact" : `${diff}&deg; off`}</span>
    <span class="cf-pct">${pct}%</span>
  `;
  guessList.prepend(row);
}

guessForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (state.gameOver) return;

  const raw = guessInput.value.trim();
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || value < 0 || value > 360) {
    showStatus("Enter a whole number of degrees, 0 to 360", true);
    return;
  }

  showStatus("");
  const diff = angularDiff(value, state.answer);
  const pct = proximityPct(diff);
  const tier = tierFor(diff);
  const isCorrect = diff === 0;

  state.guesses.push({ value, tier });
  guessInput.value = "";
  renderGuessRow(value, diff, pct, tier, isCorrect);
  renderDiagram();

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
  renderDiagram();
  showStatus(won ? "Solved! 🎉" : `The angle was ${state.answer}\u00b0`);
}

playAgainBtn.addEventListener("click", () => {
  state.answer = randomAngle();
  state.guesses = [];
  state.gameOver = false;
  guessInput.disabled = false;
  guessInput.value = "";
  guessList.innerHTML = "";
  playAgainBtn.classList.remove("show");
  showStatus("");
  attemptsEl.textContent = `${MAX_GUESSES - state.guesses.length} guesses left`;
  renderDiagram();
});
