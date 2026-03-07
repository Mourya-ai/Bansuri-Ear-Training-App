# 𝄞 Swara — Flute Ear Training

Indian classical flute ear training app. Supports Sargam + Western dual notation, Bass and Middle flute (saptak), Beginner / Intermediate / Advanced difficulty. No login, no database — all progress stored locally in the browser.

---

## Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Add your audio files
Put your recorded flute notes in `/public/audio/`:
```
public/audio/
  C3.mp3   Cs3.mp3  D3.mp3   Ds3.mp3  E3.mp3   F3.mp3
  Fs3.mp3  G3.mp3   Gs3.mp3  A3.mp3   As3.mp3  B3.mp3
  C4.mp3   Cs4.mp3  D4.mp3   Ds4.mp3  E4.mp3   F4.mp3
  Fs4.mp3  G4.mp3   Gs4.mp3  A4.mp3   As4.mp3  B4.mp3
  C5.mp3   Cs5.mp3  D5.mp3   Ds5.mp3  E5.mp3
```

**Naming rules:**
- Sharps use `s` — C# = `Cs`, F# = `Fs`, G# = `Gs` etc.
- No flats — always use the sharp equivalent
- Octave number comes after the note name: `E4.mp3`

### 3. Run locally
```bash
npm run dev
```
Open http://localhost:5173

### 4. Build for production
```bash
npm run build
```

---

## Recording Guide

Record chromatic notes on your flute. You only need **one set of recordings** — the app mathematically maps all scales and both saptak from these files.

**Range to cover:**
- Bass flute users need: C3 → E4 (about 17 files)
- Middle flute users need: C4 → E5 (about 17 files)
- To support both: C3 → E5 (~29 files)

**Tips for clean recordings:**
- Record all notes in one session (consistent room tone)
- Use Audacity (free) — trim silence before and after each note
- Export as MP3, 128kbps
- Keep mic position identical for every note
- Consistent tonguing/articulation across all notes

---

## How the Math Works

```
Sa = E, Saptak = Bass  →  saIndex=4, baseOctave=3

absoluteNote = saIndex + baseOctave×12 + semitoneOffset
noteName     = absoluteNote % 12
noteOctave   = Math.floor(absoluteNote / 12)

Example: Dha (semitoneOffset=9)
  absoluteNote = 4 + 36 + 9 = 49
  noteName     = 49 % 12    = 1  → Cs
  noteOctave   = floor(49/12) = 4
  file         = Cs4.mp3  ✓
```

---

## Deploying to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
3. Leave all settings as default (Vite is auto-detected)
4. Click Deploy

Your app will be live at `your-project.vercel.app` in ~2 minutes.

The `vercel.json` in this repo automatically sets 1-year cache headers on all audio files — so users only download each note once.

---

## Progress Storage

All progress is stored in `localStorage` on the user's device. No server, no account, no data collection. Progress includes:

- Rolling window accuracy (last 20 answers per difficulty)
- Trend indicator (improving / declining / flat)
- Practice streak (both Learn and Quiz mode count)
- Weak notes tracker (lifetime, for "Focus on these")
- Export to JSON option on Progress screen

---

## Project Structure

```
swara-app/
├── public/
│   └── audio/          ← put your .mp3 files here
├── src/
│   ├── App.jsx         ← entire app (single file)
│   └── main.jsx        ← React entry point
├── index.html
├── vite.config.js
├── vercel.json         ← audio cache headers
├── package.json
└── .gitignore
```

---

## License

Open source — free to use, modify, and distribute.
