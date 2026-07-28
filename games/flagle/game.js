// ============================================================
// FLAGLE — guess the country from a zoomed-in flag
// ============================================================

const MAX_GUESSES = 6;
// Zoom scale for each guess attempt (starts very zoomed in, reveals more each time)
const ZOOM_LEVELS = [4.5, 3.2, 2.4, 1.8, 1.3, 1];

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
  const h = hashString(state.answer.code);
  const ox = 20 + (h % 61);           // 20–80%
  const oy = 20 + ((h >> 8) % 61);    // 20–80%
  flagImg.style.setProperty("--ox", ox + "%");
  flagImg.style.setProperty("--oy", oy + "%");
  updateZoom();

  datalist.innerHTML = COUNTRIES
    .map(c => `<option value="${c.name}">`)
    .join("");
}
setup();

function updateZoom() {
  const level = ZOOM_LEVELS[Math.min(state.guesses.length, ZOOM_LEVELS.length - 1)];
  flagImg.style.setProperty("--zoom", level);
  attemptsEl.textContent = `${MAX_GUESSES - state.guesses.length} guesses left`;
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
  } else {
    const km = distanceKm(country, state.answer);
    const deg = bearingDeg(country, state.answer);
    const pct = proximityPct(km);
    row.innerHTML = `
      <img class="flagle-thumb" src="https://flagcdn.com/w80/${country.code}.png" alt="">
      <span class="flagle-name">${country.name}</span>
      <span class="flagle-dist">${km.toLocaleString()} km</span>
      <span class="flagle-arrow" title="direction">${arrowSvg(deg)}</span>
      <span class="flagle-pct" style="--pct:${pct}%">${pct}%</span>
    `;
  }
  guessList.prepend(row);
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
  flagImg.style.setProperty("--zoom", 1);
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
