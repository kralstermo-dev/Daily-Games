// ============================================================
// FLAGLE - guess the country from a flag
// Two modes: Zoomed Flag (progressive zoom reveal) and
// Color Match (pixel-position color comparison against the answer).
// ============================================================

const MAX_GUESSES = 6;
// Zoom scale for each guess attempt (starts very zoomed in, reveals more each time).
// The last level MUST be 1 (full flag, dead-center) - see setZoomStep() below for why.
const ZOOM_LEVELS = [4, 3, 2.4, 2, 1.6, 1];

// How close two pixels' RGB values need to be (squared Euclidean distance)
// to count as a "match" in Color Match mode. Tune this if matches feel too
// strict or too loose.
const PIXEL_THRESHOLD = 60;
const PIXEL_THRESHOLD_SQ = PIXEL_THRESHOLD * PIXEL_THRESHOLD;

// Each mode: how it's labeled in the tab, and its subtitle under the title.
// To add a future mode, add an entry here and branch on state.mode in
// renderGuess() / applyModeUI() below.
const MODES = [
  { id: "zoom", label: "Zoomed Flag", desc: "Guess the country from a zoomed-in flag. It zooms out each guess." },
  { id: "colormatch", label: "Color Match", desc: "The flag starts blank. Each guess reveals a bit more of the true flag wherever its colors line up - it gets clearer the more you guess." },
];
const MODE_STORAGE_KEY = "flagle-mode";
const SHOW_FLAGS_KEY = "flagle-show-flags";

function getTodaysCountry() {
  const start = new Date(2024, 0, 1);
  const today = new Date();
  // offset by 37 so Flagle doesn't always land on the same list-position parity as Wordle
  const dayIndex = Math.floor((today - start) / (1000 * 60 * 60 * 24)) + 37;
  return COUNTRIES[dayIndex % COUNTRIES.length];
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

function toRad(deg) { return (deg * Math.PI) / 180; }
function toDeg(rad) { return (rad * 180) / Math.PI; }

function distanceKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

function bearingDeg(a, b) {
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function loadImage(url, fallbackUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // required so canvas can read pixels back out
    img.onload = () => resolve(img);
    img.onerror = () => {
      if (fallbackUrl) {
        img.onerror = () => reject(new Error(`Failed to load image (local and fallback both failed): ${url}`));
        img.src = fallbackUrl;
      } else {
        reject(new Error(`Failed to load image: ${url}`));
      }
    };
    img.src = url;
  });
}

// ============================================================
// FLAG IMAGE SOURCES
// Every flag is tried locally first (games/flagle/flags/<code>.png), which
// you can populate with your own images - handy for flags whose real aspect
// ratio (Nepal's pennant shape, Switzerland/Vatican's square, etc.) doesn't
// sit well cropped into our rectangular boxes. Any country without a local
// file just falls back to flagcdn.com automatically, so nothing breaks
// while the flags/ folder is empty or only partially filled in.
// ============================================================

const LOCAL_FLAGS_DIR = "flags";

function flagLocalUrl(code) {
  return `${LOCAL_FLAGS_DIR}/${code}.png`;
}
function flagCdnUrl(code, sizePx) {
  return `https://flagcdn.com/w${sizePx}/${code}.png`;
}
// Inline fallback for <img> tags built via template strings.
function flagOnerrorAttr(code, sizePx) {
  return `this.onerror=null;this.src='${flagCdnUrl(code, sizePx)}'`;
}
// For <img> elements set via JS (not a template string).
function setImgWithFallback(imgEl, code, sizePx) {
  imgEl.onerror = () => {
    imgEl.onerror = null;
    imgEl.src = flagCdnUrl(code, sizePx);
  };
  imgEl.src = flagLocalUrl(code);
}

// ============================================================
// COLOR MATCH - pixel-position comparison
// Both flags are stretched to the same w×h grid, then compared
// pixel by pixel. Matching pixels keep the guess's own color;
// everything else goes transparent, so only the overlapping
// shapes/colors of the guessed flag show through.
// ============================================================

function stretchDraw(ctx, img, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h); // stretch to fill - ignores aspect ratio so grids line up
}

function pixelMatchRender(guessImg, answerImg, w, h) {
  const gCanvas = document.createElement("canvas");
  gCanvas.width = w; gCanvas.height = h;
  const gCtx = gCanvas.getContext("2d");
  stretchDraw(gCtx, guessImg, w, h);
  const gData = gCtx.getImageData(0, 0, w, h).data;

  const aCanvas = document.createElement("canvas");
  aCanvas.width = w; aCanvas.height = h;
  const aCtx = aCanvas.getContext("2d");
  stretchDraw(aCtx, answerImg, w, h);
  const aData = aCtx.getImageData(0, 0, w, h).data;

  const outCanvas = document.createElement("canvas");
  outCanvas.width = w; outCanvas.height = h;
  const outCtx = outCanvas.getContext("2d");
  const outImageData = outCtx.createImageData(w, h);
  const outData = outImageData.data;

  let matched = 0;
  const total = w * h;
  const matchedMask = new Uint8Array(total);

  for (let i = 0, p = 0; i < gData.length; i += 4, p++) {
    const dr = gData[i] - aData[i];
    const dg = gData[i + 1] - aData[i + 1];
    const db = gData[i + 2] - aData[i + 2];
    const distSq = dr * dr + dg * dg + db * db;
    if (distSq <= PIXEL_THRESHOLD_SQ) {
      outData[i] = gData[i];
      outData[i + 1] = gData[i + 1];
      outData[i + 2] = gData[i + 2];
      outData[i + 3] = 255;
      matched++;
      matchedMask[p] = 1;
    } else {
      outData[i + 3] = 0; // transparent - page background shows through
    }
  }
  outCtx.putImageData(outImageData, 0, 0);
  return { pct: (matched / total) * 100, canvas: outCanvas, matchedMask };
}

// Canvas size used for both the main viewport reveal and the pixel-match
// comparison grid - keep these in sync.
const REVEAL_W = 280, REVEAL_H = 187;

// Renders the ANSWER flag on the main viewport, showing only the pixels that
// have matched in ANY guess so far this round (state.revealedMask) - so the
// picture gets clearer and more complete with every guess, not just the
// latest one.
async function renderAccumulatedReveal() {
  const answerImg = await state.answerImgPromise;
  const canvas = document.createElement("canvas");
  canvas.width = REVEAL_W; canvas.height = REVEAL_H;
  const ctx = canvas.getContext("2d");
  stretchDraw(ctx, answerImg, REVEAL_W, REVEAL_H);
  const imageData = ctx.getImageData(0, 0, REVEAL_W, REVEAL_H);
  const data = imageData.data;

  for (let p = 0; p < state.revealedMask.length; p++) {
    if (!state.revealedMask[p]) {
      data[p * 4 + 3] = 0; // not yet discovered by any guess - stays transparent
    }
  }
  ctx.putImageData(imageData, 0, 0);

  flagImg.src = canvas.toDataURL();
  flagImg.style.setProperty("--zoom", 1);
  flagImg.style.setProperty("--ox", "50%");
  flagImg.style.setProperty("--oy", "50%");
  flagViewport.classList.remove("mystery");
}

// ============================================================
// STATE + DOM
// ============================================================

const state = {
  answer: getTodaysCountry(),
  guesses: [],
  gameOver: false,
  mode: localStorage.getItem(MODE_STORAGE_KEY) || "zoom",
};

const flagImg = document.getElementById("flag-img");
const flagViewport = document.getElementById("flag-viewport");
const guessInput = document.getElementById("guess-input");
const guessForm = document.getElementById("guess-form");
const guessList = document.getElementById("guess-list");
const statusEl = document.getElementById("status");
const attemptsEl = document.getElementById("attempts-left");
const playAgainBtn = document.getElementById("play-again");
const modeSelectEl = document.getElementById("mode-select");
const modeDescEl = document.getElementById("mode-desc");
const winBadgeEl = document.getElementById("win-badge");
const settingsBtn = document.getElementById("settings-btn");
const settingsPanel = document.getElementById("settings-panel");
const showFlagsToggle = document.getElementById("show-flags-toggle");
const autocompleteList = document.getElementById("autocomplete-list");

let showFlagsInList = localStorage.getItem(SHOW_FLAGS_KEY) !== "false"; // default true
showFlagsToggle.checked = showFlagsInList;

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
      resetRound();
    });
  });
}

function applyModeUI() {
  modeSelectEl.querySelectorAll(".mode-btn").forEach(btn => {
    const active = btn.dataset.mode === state.mode;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active);
  });
  modeDescEl.textContent = (MODES.find(m => m.id === state.mode) || MODES[0]).desc;
  attemptsEl.textContent = `${MAX_GUESSES - state.guesses.length} guesses left`;

  if (state.mode === "colormatch") {
    flagViewport.classList.add("mystery"); // blank until the first guess reveals something
  } else {
    flagViewport.classList.remove("mystery");
    setImgWithFallback(flagImg, state.answer.code, 320);
    updateZoom();
  }
}

// ============================================================
// SETUP / ROUND LIFECYCLE
// ============================================================

function setup() {
  flagImg.crossOrigin = "anonymous";
  state.answerImgPromise = loadImage(flagLocalUrl(state.answer.code), flagCdnUrl(state.answer.code, 320));
  state.revealedMask = new Uint8Array(REVEAL_W * REVEAL_H); // nothing discovered yet this round

  const h = hashString(state.answer.code);
  // Keep the crop point closer to center (35–65%) - leaves enough "overscan" at
  // every non-final zoom level that the flag always fully covers its frame.
  state.anchorX = 35 + (h % 31);
  state.anchorY = 35 + ((h >> 8) % 31);

  if (!modeSelectEl.dataset.built) {
    buildModeSelector();
    modeSelectEl.dataset.built = "true";
  }
  applyModeUI();
}

function resetRound() {
  state.answer = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
  state.guesses = [];
  state.gameOver = false;
  guessInput.disabled = false;
  guessInput.value = "";
  guessList.innerHTML = "";
  autocompleteList.classList.add("hidden");
  playAgainBtn.classList.remove("show");
  winBadgeEl.classList.add("hidden");
  showStatus("");
  setup();
}
playAgainBtn.addEventListener("click", resetRound);

// ============================================================
// ZOOM MODE
// ============================================================

function updateZoom() {
  if (state.mode !== "zoom") return;
  const level = ZOOM_LEVELS[Math.min(state.guesses.length, ZOOM_LEVELS.length - 1)];
  setZoomStep(level);
}

// A zoom of 1 means the image is exactly the size of its frame - at that size
// any off-center crop point leaves a gap on one side. So whenever we're at the
// full-size step, force the crop point back to dead-center (50%/50%) instead
// of using the country's usual off-center anchor.
function setZoomStep(level) {
  const isFullSize = level <= 1;
  flagImg.style.setProperty("--zoom", level);
  flagImg.style.setProperty("--ox", (isFullSize ? 50 : state.anchorX) + "%");
  flagImg.style.setProperty("--oy", (isFullSize ? 50 : state.anchorY) + "%");
}

function arrowSvg(deg) {
  return `<svg viewBox="0 0 24 24" width="20" height="20" style="transform:rotate(${deg}deg)">
    <path d="M12 2 L19 21 L12 17 L5 21 Z" fill="currentColor"/>
  </svg>`;
}

// ============================================================
// COLOR MATCH MODE - per-guess rendering
// ============================================================

async function fillColorMatchRow(row, country, isCorrect) {
  const pctEl = row.querySelector(".cm-pct");
  const iconEl = row.querySelector(".cm-icon");

  if (isCorrect) {
    pctEl.textContent = "100.0%";
    setImgWithFallback(iconEl, country.code, 80);
    return;
  }

  try {
    const [answerImg, guessImg] = await Promise.all([
      state.answerImgPromise,
      loadImage(flagLocalUrl(country.code), flagCdnUrl(country.code, 320)),
    ]);
    const { pct, canvas, matchedMask } = pixelMatchRender(guessImg, answerImg, REVEAL_W, REVEAL_H);
    const dataUrl = canvas.toDataURL();

    pctEl.textContent = `${pct.toFixed(1)}%`;
    iconEl.src = dataUrl; // the row's small icon still shows just THIS guess's own match

    // Fold this guess's matches into the running total, then re-render the
    // main viewport from the accumulated set - so it gets more complete with
    // every guess instead of only reflecting the latest one.
    for (let p = 0; p < matchedMask.length; p++) {
      if (matchedMask[p]) state.revealedMask[p] = 1;
    }

    // Only update the main viewport if the round hasn't already ended (avoids
    // clobbering the final reveal if this resolves after the round wrapped up).
    if (!state.gameOver) {
      renderAccumulatedReveal();
    }
  } catch (err) {
    pctEl.textContent = "-";
    console.warn("Color match unavailable:", err);
  }
}

// ============================================================
// GUESS ROWS
// ============================================================

function renderGuess(country, isCorrect) {
  const row = document.createElement("div");
  row.className = "flagle-row";

  if (state.mode === "colormatch") {
    row.classList.add("cm-mode");
    if (isCorrect) row.classList.add("correct");
    row.innerHTML = `
      <span class="flagle-name">${country.name}</span>
      <span class="cm-pct">…</span>
      <div class="cm-icon-wrap"><img class="cm-icon" src="" alt="${country.name} flag, matched regions"></div>
    `;
    guessList.prepend(row);
    fillColorMatchRow(row, country, isCorrect);
    return;
  }

  if (isCorrect) {
    row.innerHTML = `
      <img class="flagle-thumb" src="${flagLocalUrl(country.code)}" onerror="${flagOnerrorAttr(country.code, 80)}" alt="">
      <span class="flagle-name">${country.name}</span>
      <span class="flagle-correct">Correct! 🎉</span>
    `;
    guessList.prepend(row);
    return;
  }

  // zoom mode, wrong guess
  const km = distanceKm(country, state.answer);
  const deg = bearingDeg(country, state.answer);
  row.innerHTML = `
    <img class="flagle-thumb" src="${flagLocalUrl(country.code)}" onerror="${flagOnerrorAttr(country.code, 80)}" alt="">
    <span class="flagle-name">${country.name}</span>
    <span class="flagle-arrow" title="direction">${arrowSvg(deg)}</span>
    <span class="flagle-dist">${km.toLocaleString()} km</span>
  `;
  guessList.prepend(row);
}

// ============================================================
// GUESS SUBMISSION
// ============================================================

function showStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

guessForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (state.gameOver) return;

  const typed = guessInput.value.trim();
  const country = COUNTRIES.find(c => c.name.toLowerCase() === typed.toLowerCase());

  if (!country) {
    showStatus("Not a recognized country name - pick from the suggestions", true);
    return;
  }
  if (state.guesses.some(g => g.code === country.code)) {
    showStatus("Already guessed that one", true);
    return;
  }

  showStatus("");
  state.guesses.push(country);
  guessInput.value = "";
  autocompleteList.classList.add("hidden");

  const isCorrect = country.code === state.answer.code;
  renderGuess(country, isCorrect);

  if (isCorrect) {
    endGame(true);
    return;
  }

  attemptsEl.textContent = `${MAX_GUESSES - state.guesses.length} guesses left`;
  updateZoom();

  if (state.guesses.length >= MAX_GUESSES) {
    endGame(false);
  }
});

function endGame(won) {
  state.gameOver = true;
  guessInput.disabled = true;
  playAgainBtn.classList.add("show");

  if (state.mode === "zoom") {
    setZoomStep(1);
    showStatus(won ? "Solved! 🎉" : `The flag was ${state.answer.name}`);
  } else {
    flagViewport.classList.remove("mystery");
    setImgWithFallback(flagImg, state.answer.code, 320); // full, unmasked reveal
    if (won) {
      winBadgeEl.classList.remove("hidden");
    } else {
      showStatus(`The flag was ${state.answer.name}`);
    }
  }
}

// ============================================================
// SETTINGS
// ============================================================

settingsBtn.addEventListener("click", () => {
  const willShow = settingsPanel.classList.contains("hidden");
  settingsPanel.classList.toggle("hidden");
  settingsBtn.setAttribute("aria-expanded", String(willShow));
});

showFlagsToggle.addEventListener("change", () => {
  showFlagsInList = showFlagsToggle.checked;
  localStorage.setItem(SHOW_FLAGS_KEY, String(showFlagsInList));
  renderAutocompleteOptions(guessInput.value);
});

// ============================================================
// AUTOCOMPLETE (custom, so we can show flag thumbnails)
// ============================================================

let currentOptions = [];
let activeIndex = -1;

function renderAutocompleteOptions(query) {
  const q = query.trim().toLowerCase();
  currentOptions = q
    ? COUNTRIES.filter(c => c.name.toLowerCase().includes(q))
    : COUNTRIES.slice();

  activeIndex = -1;

  if (currentOptions.length === 0) {
    autocompleteList.classList.add("hidden");
    autocompleteList.innerHTML = "";
    return;
  }

  autocompleteList.innerHTML = currentOptions.map((c, i) => `
    <div class="autocomplete-option" data-index="${i}">
      ${showFlagsInList ? `<span class="ac-flag-wrap"><img class="autocomplete-flag" src="${flagLocalUrl(c.code)}" onerror="${flagOnerrorAttr(c.code, 40)}" alt=""></span>` : ""}
      <span>${c.name}</span>
    </div>
  `).join("");
  autocompleteList.classList.remove("hidden");

  autocompleteList.querySelectorAll(".autocomplete-option").forEach(opt => {
    opt.addEventListener("mousedown", (e) => {
      e.preventDefault(); // keep input focused so the click registers before any blur-close
      const country = currentOptions[Number(opt.dataset.index)];
      guessInput.value = country.name;
      autocompleteList.classList.add("hidden");
    });
  });
}

function updateActiveOption(opts) {
  opts.forEach((o, i) => o.classList.toggle("active", i === activeIndex));
  if (opts[activeIndex]) opts[activeIndex].scrollIntoView({ block: "nearest" });
}

guessInput.addEventListener("input", () => renderAutocompleteOptions(guessInput.value));
guessInput.addEventListener("focus", () => renderAutocompleteOptions(guessInput.value));

guessInput.addEventListener("keydown", (e) => {
  if (autocompleteList.classList.contains("hidden")) return;
  const opts = autocompleteList.querySelectorAll(".autocomplete-option");
  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeIndex = Math.min(activeIndex + 1, opts.length - 1);
    updateActiveOption(opts);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeIndex = Math.max(activeIndex - 1, 0);
    updateActiveOption(opts);
  } else if (e.key === "Enter" && activeIndex >= 0) {
    e.preventDefault();
    guessInput.value = currentOptions[activeIndex].name;
    autocompleteList.classList.add("hidden");
  } else if (e.key === "Escape") {
    autocompleteList.classList.add("hidden");
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".autocomplete")) {
    autocompleteList.classList.add("hidden");
  }
});

// Runs last, after every listener above is already attached - if anything in
// here ever throws, Settings/autocomplete/mode-switching still work.
try {
  setup();
} catch (err) {
  console.error("Flagle setup failed:", err);
  showStatus("Something went wrong loading today's flag - try refreshing.", true);
}
