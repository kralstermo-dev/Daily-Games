// ============================================================
// RULE34DLE — higher / lower + Daily mode + SFW avatars
// ============================================================

const DAILY_ROUNDS = 10;

// ---------- seeded RNG (for daily mode) ----------
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeRng(seedStr) {
  return mulberry32(xmur3(seedStr)());
}

function todayKey() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}

// ---------- state ----------
const state = {
  mode: "daily",          // "daily" | "endless"
  left: null,
  right: null,
  streak: 0,
  best: 0,
  round: 1,
  revealed: false,
  picking: false,
  dailyDone: false,
  dailyScore: 0,
  rng: null,
};

const pairEl   = document.getElementById("pair");
const statusEl = document.getElementById("status");
const streakEl = document.getElementById("streak");
const bestEl   = document.getElementById("best");
const roundEl  = document.getElementById("round");
const nextBtn  = document.getElementById("next-btn");
const shareBtn = document.getElementById("share-btn");
const modeDaily   = document.getElementById("mode-daily");
const modeEndless = document.getElementById("mode-endless");

function loadBest() {
  const key = state.mode === "daily" ? "r34dle-daily-best-" + todayKey() : "r34dle-endless-best";
  state.best = Number(localStorage.getItem(key) || 0);
  bestEl.textContent = state.best;
}

function saveBest() {
  const key = state.mode === "daily" ? "r34dle-daily-best-" + todayKey() : "r34dle-endless-best";
  localStorage.setItem(key, String(state.best));
}

function formatCount(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return Math.round(n / 1000) + "k";
  return String(n);
}

function escapeHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// Consistent color from name
function colorFromName(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 42% 42%)`;
}

function initials(name) {
  const parts = name.replace(/[()]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function avatarHtml(char) {
  // Prefer explicit SFW image if provided
  if (char.img) {
    return `<img class="r34-avatar-img" src="${escapeHtml(char.img)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <span class="r34-avatar-letter" style="display:none;background:${colorFromName(char.name)}">${escapeHtml(initials(char.name))}</span>`;
  }
  // SFW letter avatar (always works offline)
  return `<span class="r34-avatar-letter" style="background:${colorFromName(char.name)}">${escapeHtml(initials(char.name))}</span>`;
}

function pickTwo(rng) {
  const pool = VALID_CHARACTERS;
  const rand = rng || Math.random;
  let a = pool[Math.floor(rand() * pool.length)];
  let b = pool[Math.floor(rand() * pool.length)];
  let guard = 0;
  while ((a.name === b.name || a.count === b.count) && guard < 50) {
    b = pool[Math.floor(rand() * pool.length)];
    guard++;
  }
  return [a, b];
}

function renderPair() {
  if (state.mode === "daily" && state.dailyDone) return;

  state.revealed = false;
  state.picking = false;
  nextBtn.classList.remove("show");
  shareBtn.style.display = "none";
  statusEl.textContent = "";
  statusEl.classList.remove("error");

  const [left, right] = pickTwo(state.mode === "daily" ? state.rng : null);
  state.left = left;
  state.right = right;

  pairEl.innerHTML = `
    <button class="r34-card" data-side="left" type="button">
      <div class="r34-avatar">${avatarHtml(left)}</div>
      <span class="r34-name">${escapeHtml(left.name)}</span>
      <span class="r34-count hidden">${formatCount(left.count)}</span>
      <span class="r34-hint">more posts?</span>
    </button>
    <div class="r34-vs">VS</div>
    <button class="r34-card" data-side="right" type="button">
      <div class="r34-avatar">${avatarHtml(right)}</div>
      <span class="r34-name">${escapeHtml(right.name)}</span>
      <span class="r34-count hidden">${formatCount(right.count)}</span>
      <span class="r34-hint">more posts?</span>
    </button>
  `;

  pairEl.querySelectorAll(".r34-card").forEach(btn => {
    btn.addEventListener("click", () => onPick(btn.dataset.side));
  });

  roundEl.textContent = state.round;
}

function onPick(side) {
  if (state.revealed || state.picking || state.dailyDone) return;
  state.picking = true;

  const chosen = side === "left" ? state.left : state.right;
  const other  = side === "left" ? state.right : state.left;
  const correct = chosen.count > other.count;

  pairEl.querySelectorAll(".r34-count").forEach(el => el.classList.remove("hidden"));
  pairEl.querySelectorAll(".r34-hint").forEach(el => el.style.display = "none");

  pairEl.querySelectorAll(".r34-card").forEach(card => {
    card.disabled = true;
    const isChosen = card.dataset.side === side;
    const isWinner =
      (card.dataset.side === "left"  && state.left.count  > state.right.count) ||
      (card.dataset.side === "right" && state.right.count > state.left.count);
    if (isWinner) card.classList.add("winner");
    if (isChosen && !correct) card.classList.add("loser");
  });

  if (correct) {
    state.streak += 1;
    if (state.mode === "daily") state.dailyScore = state.streak;
    if (state.streak > state.best) {
      state.best = state.streak;
      saveBest();
      bestEl.textContent = state.best;
    }
    streakEl.textContent = state.streak;
    statusEl.textContent = "Correct!";
    statusEl.classList.remove("error");

    if (state.mode === "daily" && state.round >= DAILY_ROUNDS) {
      finishDaily(true);
    } else {
      nextBtn.classList.add("show");
      nextBtn.textContent = state.mode === "daily" ? "Next round" : "Next pair";
    }
  } else {
    statusEl.textContent = "Wrong";
    statusEl.classList.add("error");
    if (state.mode === "daily") {
      finishDaily(false);
    } else {
      state.streak = 0;
      streakEl.textContent = "0";
      nextBtn.classList.add("show");
      nextBtn.textContent = "Next pair";
    }
  }

  state.revealed = true;
  state.picking = false;
}

function finishDaily(perfect) {
  state.dailyDone = true;
  const score = state.dailyScore;
  statusEl.textContent = perfect
    ? `Daily complete! Perfect ${DAILY_ROUNDS}/${DAILY_ROUNDS}`
    : `Daily over — scored ${score}/${DAILY_ROUNDS}`;
  nextBtn.classList.remove("show");
  shareBtn.style.display = "inline-block";
  shareBtn.classList.add("show");
}

function startMode(mode) {
  state.mode = mode;
  state.streak = 0;
  state.round = 1;
  state.dailyDone = false;
  state.dailyScore = 0;
  state.revealed = false;
  streakEl.textContent = "0";
  loadBest();

  if (mode === "daily") {
    state.rng = makeRng("r34dle-" + todayKey());
    // consume a few values so first pair isn't always the same index pattern
    for (let i = 0; i < 3; i++) state.rng();
  } else {
    state.rng = null;
  }

  modeDaily.classList.toggle("active", mode === "daily");
  modeEndless.classList.toggle("active", mode === "endless");
  document.getElementById("round-label").style.display = mode === "daily" ? "" : "none";

  // restore daily progress if already finished today
  const finishedKey = "r34dle-daily-finished-" + todayKey();
  if (mode === "daily" && localStorage.getItem(finishedKey)) {
    state.dailyDone = true;
    state.dailyScore = Number(localStorage.getItem("r34dle-daily-score-" + todayKey()) || 0);
    state.streak = state.dailyScore;
    streakEl.textContent = state.streak;
    statusEl.textContent = `Already played today — scored ${state.dailyScore}/${DAILY_ROUNDS}`;
    pairEl.innerHTML = "";
    shareBtn.style.display = "inline-block";
    shareBtn.classList.add("show");
    nextBtn.classList.remove("show");
    return;
  }

  renderPair();
}

nextBtn.addEventListener("click", () => {
  if (state.mode === "daily") {
    state.round += 1;
    if (state.round > DAILY_ROUNDS) {
      finishDaily(true);
      return;
    }
  }
  renderPair();
});

shareBtn.addEventListener("click", async () => {
  const score = state.dailyScore;
  const text = `Rule34dle ${todayKey()}\n${score}/${DAILY_ROUNDS}\n\nHigher or lower — character post counts`;
  try {
    if (navigator.share) await navigator.share({ text });
    else {
      await navigator.clipboard.writeText(text);
      statusEl.textContent = "Copied to clipboard!";
      statusEl.classList.remove("error");
    }
  } catch (_) {
    statusEl.textContent = text;
  }
});

// mark daily finished when it ends
function markDailyFinished() {
  if (state.mode !== "daily") return;
  localStorage.setItem("r34dle-daily-finished-" + todayKey(), "1");
  localStorage.setItem("r34dle-daily-score-" + todayKey(), String(state.dailyScore));
}

// wrap finishDaily
const _finish = finishDaily;
finishDaily = function (perfect) {
  _finish(perfect);
  markDailyFinished();
};

modeDaily.addEventListener("click", () => startMode("daily"));
modeEndless.addEventListener("click", () => startMode("endless"));

document.addEventListener("keydown", (e) => {
  if (state.dailyDone) return;
  if (state.revealed) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (nextBtn.classList.contains("show")) nextBtn.click();
    }
    return;
  }
  if (e.key === "ArrowLeft") onPick("left");
  if (e.key === "ArrowRight") onPick("right");
});

// boot
startMode("daily");
