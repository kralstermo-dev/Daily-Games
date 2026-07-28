// ============================================================
// RULE34DLE — higher / lower character post counts
// Static data version (matches the rest of the Daily Games hub)
// ============================================================

const state = {
  left: null,
  right: null,
  streak: 0,
  best: Number(localStorage.getItem("r34dle-best") || 0),
  revealed: false,
  picking: false,
};

const pairEl = document.getElementById("pair");
const statusEl = document.getElementById("status");
const streakEl = document.getElementById("streak");
const bestEl = document.getElementById("best");
const nextBtn = document.getElementById("next-btn");

bestEl.textContent = state.best;

function formatCount(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return Math.round(n / 1000) + "k";
  return String(n);
}

function pickTwo() {
  const pool = VALID_CHARACTERS;
  let a = pool[Math.floor(Math.random() * pool.length)];
  let b = pool[Math.floor(Math.random() * pool.length)];
  // avoid same character or identical counts (too boring)
  let guard = 0;
  while ((a.name === b.name || a.count === b.count) && guard < 40) {
    b = pool[Math.floor(Math.random() * pool.length)];
    guard++;
  }
  return [a, b];
}

function renderPair() {
  state.revealed = false;
  state.picking = false;
  nextBtn.classList.remove("show");
  statusEl.textContent = "";
  statusEl.classList.remove("error");

  const [left, right] = pickTwo();
  state.left = left;
  state.right = right;

  pairEl.innerHTML = `
    <button class="r34-card" data-side="left" type="button">
      <span class="r34-name">${escapeHtml(left.name)}</span>
      <span class="r34-count hidden" data-count>${formatCount(left.count)}</span>
      <span class="r34-hint">more posts?</span>
    </button>
    <div class="r34-vs">VS</div>
    <button class="r34-card" data-side="right" type="button">
      <span class="r34-name">${escapeHtml(right.name)}</span>
      <span class="r34-count hidden" data-count>${formatCount(right.count)}</span>
      <span class="r34-hint">more posts?</span>
    </button>
  `;

  pairEl.querySelectorAll(".r34-card").forEach(btn => {
    btn.addEventListener("click", () => onPick(btn.dataset.side));
  });
}

function escapeHtml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function onPick(side) {
  if (state.revealed || state.picking) return;
  state.picking = true;

  const chosen = side === "left" ? state.left : state.right;
  const other  = side === "left" ? state.right : state.left;
  const correct = chosen.count > other.count;

  // reveal counts
  pairEl.querySelectorAll(".r34-count").forEach(el => el.classList.remove("hidden"));
  pairEl.querySelectorAll(".r34-hint").forEach(el => el.style.display = "none");

  const cards = pairEl.querySelectorAll(".r34-card");
  cards.forEach(card => {
    card.disabled = true;
    const isChosen = card.dataset.side === side;
    const isWinner =
      (card.dataset.side === "left" && state.left.count > state.right.count) ||
      (card.dataset.side === "right" && state.right.count > state.left.count);
    if (isWinner) card.classList.add("winner");
    if (isChosen && !correct) card.classList.add("loser");
  });

  if (correct) {
    state.streak += 1;
    if (state.streak > state.best) {
      state.best = state.streak;
      localStorage.setItem("r34dle-best", String(state.best));
      bestEl.textContent = state.best;
    }
    streakEl.textContent = state.streak;
    statusEl.textContent = "Correct! +" + state.streak + " streak";
    statusEl.classList.remove("error");
  } else {
    statusEl.textContent = "Wrong — streak reset";
    statusEl.classList.add("error");
    state.streak = 0;
    streakEl.textContent = "0";
  }

  state.revealed = true;
  nextBtn.classList.add("show");
  state.picking = false;
}

nextBtn.addEventListener("click", () => {
  renderPair();
});

// keyboard: left / right arrows
document.addEventListener("keydown", (e) => {
  if (state.revealed) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      renderPair();
    }
    return;
  }
  if (e.key === "ArrowLeft") onPick("left");
  if (e.key === "ArrowRight") onPick("right");
});

renderPair();
