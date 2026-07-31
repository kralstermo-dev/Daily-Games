// ============================================================
// WORDLE CLONE — game logic
// Plain JS, no build step needed — this file just runs in the browser.
// ============================================================

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;

// Pick today's word deterministically, so everyone playing today
// gets the same word (like the real Wordle). We turn today's date
// into a number, then use it to index into the word list.
function getTodaysWord() {
  const start = new Date(2024, 0, 1); // arbitrary epoch for day-counting
  const today = new Date();
  const dayIndex = Math.floor((today - start) / (1000 * 60 * 60 * 24));
  return ANSWER_WORDS[dayIndex % ANSWER_WORDS.length];
}

const state = {
  answer: getTodaysWord(),
  row: 0,
  col: 0,
  guesses: Array.from({ length: MAX_GUESSES }, () => Array(WORD_LENGTH).fill("")),
  gameOver: false,
};

const gridEl = document.getElementById("grid");
const statusEl = document.getElementById("status");
const playAgainBtn = document.getElementById("play-again");

// ---------- build the grid of empty cells ----------
function buildGrid() {
  gridEl.innerHTML = "";
  for (let r = 0; r < MAX_GUESSES; r++) {
    const rowEl = document.createElement("div");
    rowEl.className = "grid-row";
    for (let c = 0; c < WORD_LENGTH; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.id = `cell-${r}-${c}`;
      rowEl.appendChild(cell);
    }
    gridEl.appendChild(rowEl);
  }
}
buildGrid();

// ---------- on-screen keyboard ----------
const KEY_ROWS = [
  ["q","w","e","r","t","y","u","i","o","p"],
  ["a","s","d","f","g","h","j","k","l"],
  ["enter","z","x","c","v","b","n","m","back"],
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

// ---------- input handling ----------
function handleKey(key) {
  if (state.gameOver) return;

  if (key === "back") {
    if (state.col > 0) {
      state.col--;
      setCellLetter(state.row, state.col, "");
    }
    return;
  }

  if (key === "enter") {
    submitGuess();
    return;
  }

  if (/^[a-z]$/.test(key) && state.col < WORD_LENGTH) {
    setCellLetter(state.row, state.col, key);
    state.col++;
  }
}

function setCellLetter(r, c, letter) {
  state.guesses[r][c] = letter;
  const cellEl = document.getElementById(`cell-${r}-${c}`);
  cellEl.textContent = letter;
  cellEl.classList.toggle("filled", letter !== "");
  if (letter) {
    cellEl.classList.add("pop");
    setTimeout(() => cellEl.classList.remove("pop"), 150);
  }
}

function showStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

function shake(row) {
  for (let c = 0; c < WORD_LENGTH; c++) {
    document.getElementById(`cell-${row}-${c}`).animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(-4px)" },
       { transform: "translateX(4px)" }, { transform: "translateX(0)" }],
      { duration: 200 }
    );
  }
}

function submitGuess() {
  if (state.col < WORD_LENGTH) {
    showStatus("Not enough letters", true);
    shake(state.row);
    return;
  }

  const guess = state.guesses[state.row].join("");
  const result = scoreGuess(guess, state.answer);
  revealRow(state.row, result, guess);

  if (guess === state.answer) {
    state.gameOver = true;
    setTimeout(() => showStatus("Solved! 🎉"), MAX_GUESSES * 80 + 500);
    endGame();
    return;
  }

  state.row++;
  state.col = 0;

  if (state.row === MAX_GUESSES) {
    state.gameOver = true;
    setTimeout(() => showStatus(`The word was "${state.answer.toUpperCase()}"`), 500);
    endGame();
  }
}

// Standard Wordle scoring: correct > present > absent,
// handling repeated letters correctly.
function scoreGuess(guess, answer) {
  const result = Array(WORD_LENGTH).fill("absent");
  const answerLetters = answer.split("");
  const used = Array(WORD_LENGTH).fill(false);

  // first pass: correct letters in correct spot
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === answerLetters[i]) {
      result[i] = "correct";
      used[i] = true;
    }
  }
  // second pass: correct letters in wrong spot
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === "correct") continue;
    const idx = answerLetters.findIndex((l, j) => l === guess[i] && !used[j]);
    if (idx !== -1) {
      result[i] = "present";
      used[idx] = true;
    }
  }
  return result;
}

function revealRow(row, result, guess) {
  for (let c = 0; c < WORD_LENGTH; c++) {
    const cell = document.getElementById(`cell-${row}-${c}`);
    setTimeout(() => {
      cell.classList.add("flip");
      cell.style.setProperty("--tile-color",
        result[c] === "correct" ? "var(--accent)" :
        result[c] === "present" ? "var(--accent-2)" : "#2a2e38");
      cell.classList.add(result[c]);
      updateKeyboardKey(guess[c], result[c]);
    }, c * 220);
  }
}

// Keep the best-known status for each key (correct beats present beats absent)
const keyStatus = {};
function updateKeyboardKey(letter, status) {
  const rank = { correct: 3, present: 2, absent: 1 };
  if (!keyStatus[letter] || rank[status] > rank[keyStatus[letter]]) {
    keyStatus[letter] = status;
    const btn = document.querySelector(`.key[data-key="${letter}"]`);
    if (btn) {
      btn.classList.remove("correct", "present", "absent");
      btn.classList.add(status);
    }
  }
}

function endGame() {
  playAgainBtn.classList.add("show");
}

// ---------- physical keyboard support ----------
document.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (key === "backspace") handleKey("back");
  else if (key === "enter") handleKey("enter");
  else if (/^[a-z]$/.test(key)) handleKey(key);
});

// ---------- play again (practice mode: picks a random word, not today's) ----------
playAgainBtn.addEventListener("click", () => {
  state.answer = ANSWER_WORDS[Math.floor(Math.random() * ANSWER_WORDS.length)];
  state.row = 0;
  state.col = 0;
  state.gameOver = false;
  state.guesses = Array.from({ length: MAX_GUESSES }, () => Array(WORD_LENGTH).fill(""));
  Object.keys(keyStatus).forEach(k => delete keyStatus[k]);
  document.querySelectorAll(".key").forEach(k => k.classList.remove("correct", "present", "absent"));
  playAgainBtn.classList.remove("show");
  showStatus("");
  buildGrid();
});
