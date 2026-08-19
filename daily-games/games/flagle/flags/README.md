# Custom flag images

Drop your own flag images in this folder and the game will use them
automatically — no code changes needed.

## How it works

Every flag is tried from here FIRST. If a file isn't found for a given
country, it automatically falls back to fetching that flag from
flagcdn.com instead. That means:

- This folder can stay empty and the game works exactly as before.
- You can add just a few countries (e.g. the oddly-shaped ones) and
  everything else keeps using flagcdn.com.
- You can eventually replace all of them if you want full control.

## Naming

Each file must be named `<code>.png`, where `<code>` is that country's
2-letter code from `../countries.js` — e.g.:

```
flags/us.png   (United States)
flags/np.png   (Nepal)
flags/ch.png   (Switzerland)
flags/jp.png   (Japan)
```

Check `../countries.js` for the exact code of any country — it's the
`code:` field on each entry.

## Sizing tips

- PNG format (to match what the code expects — `.png` extension).
- Any resolution works; something like 320px on the long side is
  plenty, since the game never displays them larger than that.
- Images are cropped to fill their container (`object-fit: cover`),
  not stretched — so a non-rectangular flag (Nepal's pennant shape,
  for example) will still get cropped into a rectangle wherever it's
  shown. If you want a specific flag to look right in a rectangular
  box, that cropping/padding needs to happen in the image file itself
  before you drop it in here (e.g. pad it out to a rectangle with
  transparent or matching-color background).
