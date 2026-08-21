// ============================================================
// NERDLE - guess today's equation
// Two modes:
//  - Normal: fixed format NN[op]NN=NN (always 8 chars), one operator,
//    e.g. "12+07=19".
//  - Hard: A op B op C = DE (also 8 chars), TWO operators, evaluated
//    with standard order of operations (* and / before + and -).
// Both are fixed-position formats - that trades away real Nerdle's
// fully variable-length terms for reliable validation/scoring - but
// hard mode still lets you use two operators in one equation, unlike
// normal mode.
// ============================================================

const EQ_LENGTH = 8;
const MAX_GUESSES = 6;
const OPERATORS = ["+", "-", "*", "/"];
const MODE_STORAGE_KEY = "nerdle-mode";

function pad2(n) {
  return String(n).padStart(2, "0");
}

// ---------- GENERAL EQUATION VALIDATION (used for GUESSES in both modes) ----------
// A guess just needs to be a true, 8-character equation - it doesn't have to
// match the answer's exact shape (e.g. "12+34=46" is valid even in Hard mode,
// which only generates two-operator ANSWERS but never required two-operator
// GUESSES). Supports any number of +,-,*,/ terms with standard precedence.

function evaluateExpression(left) {
  const tokens = left.match(/\d+|[+\-*/]/g);
  if (!tokens || tokens.length % 2 === 0) return null; // must be num (op num)*

  let nums = [Number(tokens[0])];
  let ops = [];
  for (let i = 1; i < tokens.length; i += 2) {
    ops.push(tokens[i]);
    nums.push(Number(tokens[i + 1]));
  }

  // pass 1: all * and / , left to right
  for (let i = 0; i < ops.length; ) {
    if (ops[i] === "*" || ops[i] === "/") {
      const a = nums[i], b = nums[i + 1];
      let r;
      if (ops[i] === "*") r = a * b;
      else {
        if (b === 0 || a % b !== 0) return null;
        r = a / b;
      }
      nums.splice(i, 2, r);
      ops.splice(i, 1);
    } else {
      i++;
    }
  }
  // pass 2: remaining + and -, left to right
  let result = nums[0];
  for (let i = 0; i < ops.length; i++) {
    result = ops[i] === "+" ? result + nums[i + 1] : result - nums[i + 1];
  }
  return Number.isInteger(result) ? result : null;
}

function isValidEquation(str) {
  if (str.length !== EQ_LENGTH) return false;
  const eqIdx = str.indexOf("=");
  if (eqIdx === -1 || str.indexOf("=", eqIdx + 1) !== -1) return false; // exactly one '='

  const left = str.slice(0, eqIdx);
  const right = str.slice(eqIdx + 1);
  if (!/^\d+$/.test(right)) return false;
  if (!/^\d+([+\-*/]\d+)+$/.test(left)) return false; // needs at least one operator

  const result = evaluateExpression(left);
  return result !== null && result >= 0 && result === Number(right);
}

// ---------- NORMAL MODE ANSWER POOL: NN[op]NN=NN ----------

function buildNormalPool() {
  const byOp = { "+": [], "-": [], "*": [], "/": [] };
  for (let a = 1; a <= 99; a++) {
    for (const op of OPERATORS) {
      for (let b = 1; b <= 99; b++) {
        let result;
        if (op === "+") result = a + b;
        else if (op === "-") result = a - b;
        else if (op === "*") result = a * b;
        else { // division - must be a clean, positive integer result
          if (a % b !== 0) continue;
          result = a / b;
        }
        if (result < 0 || result > 99) continue;
        byOp[op].push(`${pad2(a)}${op}${pad2(b)}=${pad2(result)}`);
      }
    }
  }
  return byOp;
}

// ---------- HARD MODE ANSWER POOL: A op B op C = DE (two operators) ----------

function precedence(op) {
  return (op === "*" || op === "/") ? 2 : 1;
}

// Evaluates a op1 b op2 c respecting standard order of operations
// (multiplication/division before addition/subtraction). Returns null
// for invalid operations (division by zero or non-integer division).
function applyOp(x, op, y) {
  if (op === "+") return x + y;
  if (op === "-") return x - y;
  if (op === "*") return x * y;
  return (y !== 0 && x % y === 0) ? x / y : null; // division
}

function evalTwoOp(a, op1, b, op2, c) {
  if (precedence(op1) >= precedence(op2)) {
    const left = applyOp(a, op1, b);
    if (left === null) return null;
    return applyOp(left, op2, c);
  } else {
    const right = applyOp(b, op2, c);
    if (right === null) return null;
    return applyOp(a, op1, right);
  }
}

function buildHardPool() {
  const byOp = { "+": [], "-": [], "*": [], "/": [] };
  for (let a = 0; a <= 9; a++) {
    for (const op1 of OPERATORS) {
      for (let b = 0; b <= 9; b++) {
        for (const op2 of OPERATORS) {
          for (let c = 0; c <= 9; c++) {
            if ([a, b, c].filter(n => n === 0).length >= 2) continue; // skip overly trivial equations
            const result = evalTwoOp(a, op1, b, op2, c);
            if (result === null || result < 0 || result > 99) continue;
            byOp[op1].push(`${a}${op1}${b}${op2}${c}=${pad2(result)}`);
          }
        }
      }
    }
  }
  return byOp;
}

// ---------- MODE CONFIG ----------

const MODES = {
  normal: {
    label: "Normal",
    desc: "Guess the equation in 6 tries. Today's answer has one operator - e.g. 12+07=19.",
    pool: buildNormalPool(),
    dayOffset: 91,
  },
  hard: {
    label: "Hard",
    desc: "Guess the equation in 6 tries. Today's answer has two operators - normal math order applies.",
    pool: buildHardPool(),
    dayOffset: 158,
  },
};

// Picking from a flat, structurally-ordered pool by day-index alone can
// still land on long same-operator runs, since the pool was built in
// operator-grouped order. Instead, the day-index explicitly cycles through
// the 4 operators first (so you're guaranteed +, -, *, / in rotation, never
// the same one two days running), then a large-prime multiply picks a
// varied specific equation *within* that operator's bucket.
const SHUFFLE_PRIME = 104729;

function getTodaysEquation(modeId) {
  const mode = MODES[modeId];
  const start = new Date(2024, 0, 1);
  const today = new Date();
  const dayIndex = Math.floor((today - start) / (1000 * 60 * 60 * 24)) + mode.dayOffset;
  const op = OPERATORS[dayIndex % OPERATORS.length];
  const bucket = mode.pool[op];
  return bucket[(dayIndex * SHUFFLE_PRIME) % bucket.length];
}

function randomEquation(modeId) {
  const pool = MODES[modeId].pool;
  const op = OPERATORS[Math.floor(Math.random() * OPERATORS.length)];
  const bucket = pool[op];
  return bucket[Math.floor(Math.random() * bucket.length)];
}


const state = {
  mode: (localStorage.getItem(MODE_STORAGE_KEY) === "hard") ? "hard" : "normal",
  answer: null,
  row: 0,
  col: 0,
  guesses: Array.from({ length: MAX_GUESSES }, () => Array(EQ_LENGTH).fill("")),
  gameOver: false,
};
state.answer = getTodaysEquation(state.mode);

const gridEl = document.getElementById("grid");
const statusEl = document.getElementById("status");
const playAgainBtn = document.getElementById("play-again");
const modeSelectEl = document.getElementById("mode-select");
const modeDescEl = document.getElementById("mode-desc");

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

playAgainBtn.addEventListener("click", () => resetRound(true));

function buildModeSelector() {
  modeSelectEl.innerHTML = Object.entries(MODES).map(([id, m]) =>
    `<button class="mode-btn${id === state.mode ? " active" : ""}" data-mode="${id}" role="tab" aria-selected="${id === state.mode}">${m.label}</button>`
  ).join("");

  modeSelectEl.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.mode === state.mode) return;
      state.mode = btn.dataset.mode;
      localStorage.setItem(MODE_STORAGE_KEY, state.mode);
      resetRound(false); // fresh round in the new mode, using today's equation for it
    });
  });
}

function applyModeUI() {
  modeSelectEl.querySelectorAll(".mode-btn").forEach(btn => {
    const active = btn.dataset.mode === state.mode;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active);
  });
  modeDescEl.textContent = MODES[state.mode].desc;
}

// random=true picks a random equation (the "play again" button);
// random=false picks today's equation for whichever mode is now active
// (used right after switching modes).
function resetRound(random) {
  state.answer = random
    ? randomEquation(state.mode)
    : getTodaysEquation(state.mode);
  state.row = 0;
  state.col = 0;
  state.gameOver = false;
  state.guesses = Array.from({ length: MAX_GUESSES }, () => Array(EQ_LENGTH).fill(""));
  Object.keys(keyStatus).forEach(k => delete keyStatus[k]);
  document.querySelectorAll(".key").forEach(k => k.classList.remove("correct", "present", "absent"));
  playAgainBtn.classList.remove("show");
  showStatus("");
  applyModeUI();
  buildGrid();
}

try {
  buildModeSelector();
  applyModeUI();
} catch (err) {
  console.error("Nerdle mode setup failed:", err);
}
