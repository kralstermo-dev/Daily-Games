# Morrmo Hub

A personal site with a few different sections — Daily Games is the
first one built out; MC Tools, General Tools, and Geo are scaffolded
but empty so far. Plain HTML/CSS/JS throughout (no build tools, no
frameworks), hosted free on GitHub Pages.

> Work In Progress

## Link
https://kralstermo-dev.github.io/Website/

---

## Project structure

```
/
├── index.html              ← site homepage (name/description + section cards)
├── styles/
│   └── main.css              ← shared design tokens + styles for the whole site
├── daily-games/
│   ├── index.html             ← the Daily Games hub (lists all games)
│   └── games/
│       ├── wordle/
│       │   ├── index.html      ← the Wordle game page
│       │   ├── game.js          ← game logic
│       │   └── words.js         ← the list of possible answers
│       ├── flagle/
│       │   ├── index.html      ← the Flagle game page
│       │   ├── game.js          ← game logic (distance/direction/pixel-match)
│       │   ├── countries.js     ← country names, codes, coordinates
│       │   └── flags/           ← optional local flag images (see its README)
│       ├── nerdle/
│       │   ├── index.html
│       │   └── game.js
│       └── rule34dle/
├── mc-tools/
│   └── index.html             ← stub page, nothing built yet
├── general-tools/
│   └── index.html             ← stub page, nothing built yet
└── geo/
    └── index.html             ← stub page, nothing built yet
```

Every page's relative path to `styles/main.css` depends on how deep
it sits — e.g. a game page three folders deep uses
`../../../styles/main.css`. If you move a file, its stylesheet
(and script) paths need to move with it.

## The homepage

`index.html` at the root is the new front door — a site name/description
placeholder (edit those directly in the file, marked with `TODO`
comments) plus a card for each section. Cards use the same `.ticket`
component as the Daily Games hub, so the whole site shares one visual
language. A card can be `.ticket.live` (fully clickable, normal
styling) or `.ticket.soon` (dimmed, still a real link — used for the
three sections that don't have content yet).

## How the Wordle game works (so you can extend it)

- `words.js` is just a JavaScript array of 5-letter words. Add more any time.
- `game.js` picks "today's word" by counting days since a fixed start date
  and using that number to index into the word list — so everyone playing
  on the same day gets the same word, with no server needed.
- Guesses aren't checked against a dictionary (to keep things simple) —
  any 5 letters can be submitted. If you want stricter validation later,
  add a second, larger word list (`VALID_GUESSES`) and check against it
  in `submitGuess()`.

## How Flagle works

- Every flag is tried from `flags/<code>.png` first (empty by default),
  falling back automatically to [flagcdn.com](https://flagcdn.com) for
  any country without a local file — see `games/flagle/flags/README.md`.
- `countries.js` holds each country's name, 2-letter code, and
  approximate lat/lng center.
- `game.js` computes distance (haversine formula) and direction (initial
  bearing) between your guess and the answer in Zoomed Flag mode, and
  does a pixel-position color comparison against the answer in Color
  Match mode.
- The "zoom" is done in pure CSS: the flag image is scaled way up and
  cropped by a fixed-size container, then scaled back down a notch with
  each guess.

## How Nerdle works

- Normal mode: fixed format `NN[op]NN=NN`, one operator, e.g. `12+07=19`.
- Hard mode: the daily answer always has two operators (e.g. `5-3+6=08`,
  proper order of operations applies) — but guesses in either mode
  accept any valid equation shape at the right length, not just the
  answer's exact shape.
- The daily equation explicitly rotates through +, −, ×, ÷ so you're
  never stuck seeing the same operator repeatedly.

## Rule34dle

Higher-or-lower game: two character names, guess which has more posts
on rule34.xxx. Uses a static snapshot of popular tags (no live API,
no images — names + counts only). Streak is saved in localStorage.

Files live under `daily-games/games/rule34dle/`:
- `characters.js` — name, tag, approximate post count
- `game.js` — higher/lower logic
- `index.html`

**Why not live API?** rule34.xxx requires an API key and blocks
cross-origin browser requests (CORS). A pure GitHub-Pages client
cannot call it directly. To make counts live you would need a tiny
server-side proxy that holds the key and forwards tag queries.

You can refresh the numbers in `characters.js` any time by looking
up tags on the site or via the API from a script on your machine.

## Adding your next game

1. Duplicate `daily-games/games/wordle/` (or `flagle/`) as a new folder
2. Swap out the game logic in `game.js` for that game's rules
3. Reuse `styles/main.css` — the `.game-shell`, `.cell`, `.key` classes
   etc. are written to be generic enough for most of these games
4. Add a new `.ticket.live` card in `daily-games/index.html` linking to
   it, and remove its `.soon` placeholder card

## Building out MC Tools / General Tools / Geo

Each currently has one stub `index.html` reusing `.game-shell` for a
centered title + description — same pattern as an empty game page.
When you're ready to build one out:

1. Decide whether it needs its own sub-pages (like Daily Games does)
   or is simple enough to live entirely on that one page
2. If it needs sub-pages, follow the same folder pattern as
   `daily-games/` — a section `index.html` linking to tool pages
   underneath it, each with its own correctly-counted `../` depth to
   `styles/main.css`
3. Flip its card on the homepage from `.ticket.soon` to `.ticket.live`
   once there's something real to link to

