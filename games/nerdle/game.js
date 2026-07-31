// ============================================================
// NERDLE — guess today's equation
// Simplified fixed format: NN[op]NN=NN (always 8 characters),
// e.g. "12+07=19". This trades away real Nerdle's variable-length
// terms for reliable validation/scoring — still uses the same
// green/right-spot, yellow/wrong-spot, gray/not-in-equation rules.
// ============================================================

const EQ_LENGTH = 8;
const MAX_GUESSES = 6;
const OPERATORS = ["+", "-", "*", "/"];

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Builds every valid equation in this fixed format, deterministically
// (no randomness) so the same list — and therefore the same day's
// answer — comes out identical for every player.
function buildEquationPool() {
  const pool = [];
  for (let a = 1; a <= 99; a++) {
    for (const op of OPERATORS) {
      for (let b = 1; b <= 99; b++) {
        let result;
        if (op === "+") result = a + b;
        else if (op === "-") result = a - b;
        else if (op === "*") result = a * b;
        else { // division — must be a clean, positive integer result
          if (a % b !== 0) continue;
          result = a / b;
        }
        if (result < 0 || result > 99) continue;
        pool.push(`${pad2(a)}${op}${pad2(b)}=${pad2(result)}`);
      }
    }
  }
  return pool;
}

const EQUATION_POOL = buildEquationPool();

function getTodaysEquation() {
  const start = new Date(2024, 0, 1);
  const today = new Date();
  const dayIndex = Math.floor((today - start) / (1000 * 60 * 60 * 24)) + 91;
  return EQUATION_POOL[dayIndex % EQUATION_POOL.length];
}

const EQUATION_RE = /^(\d{2})([+\-*/])(\d{2})=(\d{2})$/;

function isValidEquation(str) {
  const m = str.match(EQUATION_RE);
  if (!m) return false;
  const a = parseInt(m[1], 10);
  const op = m[2];
  const b = parseInt(m[3], 10);
  const result = parseInt(m[4], 10);

  let expected;
  if (op === "+") expected = a + b;
  else if (op === "-") expected = a - b;
  else if (op === "*") expected = a * b;
  else {
    if (b === 0 || a % b !== 0) return false;
    expected = a / b;
  }
  return expected === result;
}

const state = {
  answer: getTodaysEquation(),
  row: 0,
  col: 0,
  guesses: Array.from({ length: MAX_GUESSES }, () => Array(EQ_LENGTH).fill("")),
  gameOver: false,
};

const gridEl = document.getElementById("grid");
const statusEl = document.getElementById("status");
const playAgainBtn = document.getElementById("play-again");

function buildGrid() {
  gridEl.innerHTML = "";
  for (let r = 0; r < MAX_GUESSES; r++) {
    const rowEl = document.createElement("div");
    rowEl.className = "grid-row";
    for (let c = 0; c < EQ_LENGTH; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.id = `cell-${r}-${c}`;
      rowEl.appendChild(cell);
    }
    gridEl.appendChild(rowEl);
  }
}
buildGrid();

const KEY_ROWS = [
  ["1", "2", "3", "4", "5"],
  ["6", "7", "8", "9", "0"],
  ["+", "-", "*", "/", "="],
  ["enter", "back"],
];

function buildKeyboard() {
  const kb = document.getElementById("keyboard");
  kb.innerHTML = "";
  KEY_ROWS.forEach(row => {
    const rowEl = document.createElement("div");
    rowEl.className = "key-row";
    row.forEach(k => {
      const btn = document.createElement("button");
      btn.className = "key" + (k === "enter" || k === "back" ? " wide" : "");
      btn.textContent = k === "back" ? "⌫" : (k === "enter" ? "Enter" : k);
      btn.dataset.key = k;
      btn.addEventListener("click", () => handleKey(k));
      rowEl.appendChild(btn);
    });
    kb.appendChild(rowEl);
  });
}
buildKeyboard();

function handleKey(key) {
  if (state.gameOver) return;

  if (key === "back") {
    if (state.col > 0) {
      state.col--;
      setCellChar(state.row, state.col, "");
    }
    return;
  }

  if (key === "enter") {
    submitGuess();
    return;
  }

  if (state.col < EQ_LENGTH) {
    setCellChar(state.row, state.col, key);
    state.col++;
  }
}

function setCellChar(r, c, ch) {
  state.guesses[r][c] = ch;
  const cellEl = document.getElementById(`cell-${r}-${c}`);
  cellEl.textContent = ch;
  cellEl.classList.toggle("filled", ch !== "");
  if (ch) {
    cellEl.classList.add("pop");
    setTimeout(() => cellEl.classList.remove("pop"), 150);
  }
}

function showStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

function shake(row) {
  for (let c = 0; c < EQ_LENGTH; c++) {
    document.getElementById(`cell-${row}-${c}`).animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(-4px)" },
       { transform: "translateX(4px)" }, { transform: "translateX(0)" }],
      { duration: 200 }
    );
  }
}

function submitGuess() {
  if (state.col < EQ_LENGTH) {
    showStatus("Not enough characters", true);
    shake(state.row);
    return;
  }

  const guess = state.guesses[state.row].join("");

  if (!isValidEquation(guess)) {
    showStatus("Not a valid equation", true);
    shake(state.row);
    return;
  }

  const result = scoreGuess(guess, state.answer);
  revealRow(state.row, result, guess);

  if (guess === state.answer) {
    state.gameOver = true;
    setTimeout(() => showStatus("Solved! 🎉"), EQ_LENGTH * 80 + 500);
    endGame();
    return;
  }

  state.row++;
  state.col = 0;

  if (state.row === MAX_GUESSES) {
    state.gameOver = true;
    setTimeout(() => showStatus(`The equation was "${state.answer}"`), 500);
    endGame();
  }
}

// Same duplicate-aware scoring as Wordle: correct > present > absent.
function scoreGuess(guess, answer) {
  const result = Array(EQ_LENGTH).fill("absent");
  const answerChars = answer.split("");
  const used = Array(EQ_LENGTH).fill(false);

  for (let i = 0; i < EQ_LENGTH; i++) {
    if (guess[i] === answerChars[i]) {
      result[i] = "correct";
      used[i] = true;
    }
  }
  for (let i = 0; i < EQ_LENGTH; i++) {
    if (result[i] === "correct") continue;
    const idx = answerChars.findIndex((ch, j) => ch === guess[i] && !used[j]);
    if (idx !== -1) {
      result[i] = "present";
      used[idx] = true;
    }
  }
  return result;
}

function revealRow(row, result, guess) {
  for (let c = 0; c < EQ_LENGTH; c++) {
    const cell = document.getElementById(`cell-${row}-${c}`);
    setTimeout(() => {
      cell.classList.add("flip");
      cell.style.setProperty("--tile-color",
        result[c] === "correct" ? "var(--correct)" :
        result[c] === "present" ? "var(--present)" : "#2a2e38");
      cell.classList.add(result[c]);
      updateKeyboardKey(guess[c], result[c]);
    }, c * 160);
  }
}

const keyStatus = {};
function updateKeyboardKey(ch, status) {
  const rank = { correct: 3, present: 2, absent: 1 };
  if (!keyStatus[ch] || rank[status] > rank[keyStatus[ch]]) {
    keyStatus[ch] = status;
    const btn = document.querySelector(`.key[data-key="${ch}"]`);
    if (btn) {
      btn.classList.remove("correct", "present", "absent");
      btn.classList.add(status);
    }
  }
}

function endGame() {
  playAgainBtn.classList.add("show");
}

document.addEventListener("keydown", (e) => {
  const key = e.key;
  if (key === "Backspace") handleKey("back");
  else if (key === "Enter") handleKey("enter");
  else if (/^[0-9+\-*/]$/.test(key)) handleKey(key);
});

playAgainBtn.addEventListener("click", () => {
  state.answer = EQUATION_POOL[Math.floor(Math.random() * EQUATION_POOL.length)];
  state.row = 0;
  state.col = 0;
  state.gameOver = false;
  state.guesses = Array.from({ length: MAX_GUESSES }, () => Array(EQ_LENGTH).fill(""));
  Object.keys(keyStatus).forEach(k => delete keyStatus[k]);
  document.querySelectorAll(".key").forEach(k => k.classList.remove("correct", "present", "absent"));
  playAgainBtn.classList.remove("show");
  showStatus("");
  buildGrid();
});
