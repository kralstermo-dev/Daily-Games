// ============================================================
// FLAGLE — guess the country from a zoomed-in flag
// ============================================================

const MAX_GUESSES = 6;
// Zoom scale for each guess attempt (starts very zoomed in, reveals more each time).
// The last level MUST be 1 (full flag, dead-center) — see setZoomStep() below for why.
const ZOOM_LEVELS = [4, 3, 2.4, 2, 1.6, 1];

function getTodaysCountry() {
  const start = new Date(2024, 0, 1);
  const today = new Date();
  // offset by 37 so Flagle doesn't always land on the same list-position parity as Wordle
  const dayIndex = Math.floor((today - start) / (1000 * 60 * 60 * 24)) + 37;
  return COUNTRIES[dayIndex % COUNTRIES.length];
}

// Simple deterministic hash → used to pick a consistent "crop point" per country
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

function toRad(deg) { return (deg * Math.PI) / 180; }
function toDeg(rad) { return (rad * 180) / Math.PI; }

// Haversine distance in km
function distanceKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

// Initial bearing in degrees (0 = north, 90 = east, etc.)
function bearingDeg(a, b) {
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function proximityPct(km) {
  const HALF_EARTH = 20015; // km, half the circumference — max possible distance
  return Math.max(0, Math.round(100 - (km / HALF_EARTH) * 100));
}

// ============================================================
// COLOR MATCH — finds colors the guessed flag and the answer's
// flag have in common, then re-renders the guess with only the
// shared-color regions in full color (the rest faded to gray).
// Colors are found by sampling actual pixels, not a hand-typed
// list, so it works for every country automatically.
// ============================================================

const COLOR_PALETTE = [
  { name: "red",        rgb: [206, 17, 38] },
  { name: "white",      rgb: [255, 255, 255] },
  { name: "black",      rgb: [0, 0, 0] },
  { name: "blue",       rgb: [0, 57, 166] },
  { name: "light blue", rgb: [0, 158, 224] },
  { name: "green",      rgb: [0, 122, 51] },
  { name: "yellow",     rgb: [255, 204, 0] },
  { name: "orange",     rgb: [255, 103, 31] },
  { name: "maroon",     rgb: [126, 17, 40] },
  { name: "purple",     rgb: [102, 45, 145] },
];

function nearestColorName(r, g, b) {
  let best = null, bestDist = Infinity;
  for (const c of COLOR_PALETTE) {
    const d = (r - c.rgb[0]) ** 2 + (g - c.rgb[1]) ** 2 + (b - c.rgb[2]) ** 2;
    if (d < bestDist) { bestDist = d; best = c.name; }
  }
  return best;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // required so canvas can read pixels back out
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Downsamples an already-loaded flag image and returns the set of color
// names that cover at least ~6% of it (filters out antialiasing noise).
function dominantColors(img) {
  const w = 48, h = 32;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const counts = {};
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue; // skip transparent
    const name = nearestColorName(data[i], data[i + 1], data[i + 2]);
    counts[name] = (counts[name] || 0) + 1;
    total++;
  }

  const dominant = new Set();
  for (const [name, count] of Object.entries(counts)) {
    if (count / total >= 0.06) dominant.add(name);
  }
  return dominant;
}

// Re-renders the guessed flag: pixels in a shared color stay full-color,
// everything else fades to gray. Returns a data URL.
function renderColorMatch(img, sharedNames) {
  const w = 80, h = 53;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const { data } = imageData;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const name = nearestColorName(data[i], data[i + 1], data[i + 2]);
    if (!sharedNames.has(name)) {
      const gray = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
      data[i] = data[i + 1] = data[i + 2] = gray * 0.55 + 255 * 0.15; // fade toward light gray
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}

// Fills in a guess row's color-match block, asynchronously. Fails silently
// (just removes the block) if the flag CDN ever blocks canvas pixel reads —
// the distance/direction hints already work fine without it.
async function attachColorMatch(row, country) {
  const holder = row.querySelector(".flagle-colormatch");
  try {
    const [answerImg, guessImg] = await Promise.all([
      loadImage(`https://flagcdn.com/w160/${state.answer.code}.png`),
      loadImage(`https://flagcdn.com/w160/${country.code}.png`),
    ]);
    const answerColors = dominantColors(answerImg);
    const guessColors = dominantColors(guessImg);
    const shared = [...guessColors].filter(c => answerColors.has(c));

    if (shared.length === 0) {
      holder.innerHTML = `<span class="colormatch-label">No shared colors</span>`;
      return;
    }
    const maskedSrc = renderColorMatch(guessImg, new Set(shared));
    holder.innerHTML = `
      <img class="colormatch-img" src="${maskedSrc}" alt="${country.name} flag, shared-color regions highlighted">
      <span class="colormatch-label">Shares: ${shared.join(", ")}</span>
    `;
  } catch (err) {
    if (holder) holder.remove();
    console.warn("Color match unavailable:", err);
  }
}

const state = {
  answer: getTodaysCountry(),
  guesses: [],
  gameOver: false,
};

const flagImg = document.getElementById("flag-img");
const guessInput = document.getElementById("guess-input");
const guessForm = document.getElementById("guess-form");
const guessList = document.getElementById("guess-list");
const statusEl = document.getElementById("status");
const attemptsEl = document.getElementById("attempts-left");
const datalist = document.getElementById("country-options");
const playAgainBtn = document.getElementById("play-again");

function setup() {
  flagImg.src = `https://flagcdn.com/w320/${state.answer.code}.png`;
  flagImg.crossOrigin = "anonymous"; // needed so we can read pixels later for the color-match feature
  const h = hashString(state.answer.code);
  // Keep the crop point closer to center (35–65%) than before — this leaves enough
  // "overscan" at every non-final zoom level that the flag always fully covers its
  // frame, no matter which corner the crop point lands in.
  state.anchorX = 35 + (h % 31);         // 35–65%
  state.anchorY = 35 + ((h >> 8) % 31);  // 35–65%
  updateZoom();

  datalist.innerHTML = COUNTRIES
    .map(c => `<option value="${c.name}">`)
    .join("");
}
setup();

function updateZoom() {
  const level = ZOOM_LEVELS[Math.min(state.guesses.length, ZOOM_LEVELS.length - 1)];
  setZoomStep(level);
  attemptsEl.textContent = `${MAX_GUESSES - state.guesses.length} guesses left`;
}

// A zoom of 1 means the image is exactly the size of its frame — at that size
// any off-center crop point leaves a gap on one side. So whenever we're at the
// full-size step, force the crop point back to dead-center (50%/50%) instead
// of using the country's usual off-center anchor.
function setZoomStep(level) {
  const isFullSize = level <= 1;
  flagImg.style.setProperty("--zoom", level);
  flagImg.style.setProperty("--ox", (isFullSize ? 50 : state.anchorX) + "%");
  flagImg.style.setProperty("--oy", (isFullSize ? 50 : state.anchorY) + "%");
}

function showStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

function arrowSvg(deg) {
  return `<svg viewBox="0 0 24 24" width="20" height="20" style="transform:rotate(${deg}deg)">
    <path d="M12 2 L19 21 L12 17 L5 21 Z" fill="currentColor"/>
  </svg>`;
}

function renderGuess(country, isCorrect) {
  const row = document.createElement("div");
  row.className = "flagle-row";

  if (isCorrect) {
    row.innerHTML = `
      <img class="flagle-thumb" src="https://flagcdn.com/w80/${country.code}.png" alt="">
      <span class="flagle-name">${country.name}</span>
      <span class="flagle-correct">Correct! 🎉</span>
    `;
    guessList.prepend(row);
    return;
  }

  const km = distanceKm(country, state.answer);
  const deg = bearingDeg(country, state.answer);
  const pct = proximityPct(km);
  row.innerHTML = `
    <img class="flagle-thumb" src="https://flagcdn.com/w80/${country.code}.png" alt="">
    <span class="flagle-name">${country.name}</span>
    <span class="flagle-arrow" title="direction">${arrowSvg(deg)}</span>
    <span class="flagle-pct" style="--pct:${pct}%">${pct}% match</span>
    <div class="flagle-colormatch loading">Comparing colors…</div>
  `;
  guessList.prepend(row);
  attachColorMatch(row, country);
}

guessForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (state.gameOver) return;

  const typed = guessInput.value.trim();
  const country = COUNTRIES.find(c => c.name.toLowerCase() === typed.toLowerCase());

  if (!country) {
    showStatus("Not a recognized country name — pick from the suggestions", true);
    return;
  }
  if (state.guesses.some(g => g.code === country.code)) {
    showStatus("Already guessed that one", true);
    return;
  }

  showStatus("");
  state.guesses.push(country);
  guessInput.value = "";

  if (country.code === state.answer.code) {
    renderGuess(country, true);
    endGame(true);
    return;
  }

  renderGuess(country, false);
  updateZoom();

  if (state.guesses.length >= MAX_GUESSES) {
    endGame(false);
  }
});

function endGame(won) {
  state.gameOver = true;
  setZoomStep(1);
  guessInput.disabled = true;
  playAgainBtn.classList.add("show");
  showStatus(won ? "Solved! 🎉" : `The flag was ${state.answer.name}`);
}

playAgainBtn.addEventListener("click", () => {
  state.answer = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
  state.guesses = [];
  state.gameOver = false;
  guessInput.disabled = false;
  guessList.innerHTML = "";
  playAgainBtn.classList.remove("show");
  showStatus("");
  setup();
});
