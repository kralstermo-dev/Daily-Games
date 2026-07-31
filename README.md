# Daily Games

A small library of daily guessing games (Wordle, Flagle, and more to
come), built with plain HTML/CSS/JS (no build tools, no frameworks) so
it can be hosted for free on GitHub Pages.

> Work In Progress

## Link
https://kralstermo-dev.github.io/Daily-Games/

---

## Project structure

```
dle-hub/
├── index.html          ← the hub page (lists all games)
├── styles/
│   └── main.css         ← shared design tokens + styles for every game
└── games/
    ├── wordle/
    │   ├── index.html    ← the Wordle game page
    │   ├── game.js        ← game logic
    │   └── words.js       ← the list of possible answers
    └── flagle/
        ├── index.html    ← the Flagle game page
        ├── game.js        ← game logic (distance/direction math etc.)
        └── countries.js   ← country names, codes, and coordinates
```

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

- Flag images are hotlinked from [flagcdn.com](https://flagcdn.com) (a free
  flag image CDN) rather than stored in this repo — one less thing to
  manage, and it works fine from GitHub Pages.
- `countries.js` holds each country's name, 2-letter code (for the flag
  image URL), and approximate lat/lng center.
- `game.js` computes distance (haversine formula) and direction (initial
  bearing) between your guess and the answer, same idea as the real Flagle.
- The "zoom" is done in pure CSS: the flag image is scaled way up and
  cropped by a fixed-size container, then scaled back down a notch with
  each guess.

## Rule34dle

Higher-or-lower game: two character names, guess which has more posts
on rule34.xxx. Uses a static snapshot of popular tags (no live API,
no images — names + counts only). Streak is saved in localStorage.

Files live under `games/rule34dle/`:
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

1. Duplicate `games/wordle/` (or `games/flagle/`) as a new folder
2. Swap out the game logic in `game.js` for that game's rules
3. Reuse `styles/main.css` — the `.game-shell`, `.cell`, `.key` classes
   etc. are written to be generic enough for most of these games
4. Add a new `.ticket.live` card in the hub `index.html` linking to it,
   and remove its `.soon` placeholder card

