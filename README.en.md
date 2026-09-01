<p align="center">
  <img src="public/icons/icon-128.png" width="96" alt="Hoshibiroi" />
</p>

# Hoshibiroi (星拾) — Select-to-Translate with FSRS-5 Spaced Repetition

<p align="center">Language is a night sky, and words are scattered stars. Every good word you meet is a star you pick up.</p>

<p align="center">
  <a href="README.md">中文</a> ·
  <a href="https://github.com/Miaotofu01/Hoshibiroi/releases">Releases</a> ·
  <a href="docs/srs-strategy.md">SRS strategy</a>
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/github/license/Miaotofu01/Hoshibiroi" />
  <img alt="Platform" src="https://img.shields.io/badge/platform-Chrome%20%2F%20Edge-4285F4" />
  <img alt="Release" src="https://img.shields.io/github/v/release/Miaotofu01/Hoshibiroi" />
  <img alt="Stars" src="https://img.shields.io/github/stars/Miaotofu01/Hoshibiroi" />
  <!-- Replace after Chrome Web Store listing:
  <img alt="Chrome Web Store" src="https://img.shields.io/chrome-web-store/v/YOUR_EXTENSION_ID" />
  -->
</p>

A Chrome extension (Manifest V3) that turns reading into vocabulary learning: **select text → instant translation → one click to save → FSRS-5 schedules the review**. No account, no cloud — everything stays on your machine.

## ✨ Highlights

- **A closed loop while you read**: select → translate → favorite → FSRS-5 review scheduling. No break in flow, words go into long-term memory naturally.
- **LLM-enriched dictionary entries**: DeepSeek classifies the input (word / phrase / technical term / sentence) and returns only the fields that fit — inflections, synonyms/antonyms, collocations, word roots, usage notes, and memory tips for words; **a precise professional encyclopedia entry for technical terms** (e.g. "static checking means inspecting source code without running the program"). Popup sections are fully customizable.
- **Word-form merging**: `run / runs / running / ran` and `Hello / hello` automatically collapse into one entry — review progress never splits.
- **Privacy-first**: no account, no cloud sync; vocabulary and translation cache live only in local storage.

## Install

1. Clone and build:

```bash
git clone git@github.com:Miaotofu01/Hoshibiroi.git
cd Hoshibiroi
npm install
npm run build
```

Requires Node.js ≥ 18. Output goes to `dist/`.

2. Load the unpacked extension:

- Open `chrome://extensions`
- Enable **Developer mode** (top right)
- Click **Load unpacked** and select the `dist/` folder

3. Configure a translation source (optional but recommended):

- **DeepSeek** (recommended, low cost): get an API key at [platform.deepseek.com](https://platform.deepseek.com) (registration + top-up required), open the extension options (right-click the toolbar icon → Options), paste the key. DeepSeek powers the full enriched fields (inflections, collocations, word roots, memory tips, …) plus encyclopedia entries for technical terms.
- **Google Translate** works out of the box (requires access to Google services).
- Tencent TMT, Baidu, and DeepL are also supported.

## Features

### Select-to-translate

- Select any text on any page → frosted-glass translation bubble that follows the page's light/dark theme
- **Long-text support**: up to 20,000 characters, auto-split at sentence boundaries with per-source size limits; partial results returned with a failure note if some chunks fail
- Chinese / English / Japanese / Korean / French / German / Spanish
- Multiple sources (DeepSeek, Google, Tencent, Baidu, DeepL) with one-click source switching inside the popup
- Enriched breakdown: IPA, parts of speech, inflections, synonyms/antonyms, collocations, word roots, usage notes, memory tips, register — popup sections are user-configurable. The AI picks fields by input type: full knowledge for words, no word roots for phrases/terms, translation-only for sentences, plus a **professional encyclopedia entry** for technical terms
- Shortcuts: `Alt+T` translate, `Alt+R` read aloud, `Esc` close

### Vocabulary & spaced repetition

Favorited words go into the word bank, scheduled by a full **FSRS-5** model (difficulty D and stability S evolve with every rating):

- **Learn panel** — flashcard reviews with Again / Hard / Good / Easy, instant feedback, same-session safeguards against "flip-and-forget"
- **Browse panel** — search, filter, sort, and manage all words; merged word forms shown inline (`run · runs · running`)
- **Stats panel** — GitHub-style calendar heatmap, learning trends, mastery distribution, review forecast

### Browse panel details

| Feature | Description |
|---------|-------------|
| Star | Pin important words; starred words sort first |
| Note cards | Add/edit/delete/reorder custom note cards per word |
| TTS | Read a word aloud from its card |
| Sort | Newest / oldest / A–Z / starred / next review / mastery |
| Filter | All / new / learning / mastered |
| Search | Matches headword, merged forms, meanings, notes |
| Examples | Source context + translated examples, horizontally scrollable |
| Due date | Next review date shown; today's due highlighted |
| CSV/JSON import | Deduplicated by the same word-form key; local progress kept |

## FSRS-5 scheduling

The default parameters are tuned for language learning; the full rationale lives in [docs/srs-strategy.md](docs/srs-strategy.md):

- Failed new-word learning steps (step 1→2) don't penalize FSRS state
- Post-lapse recovery builds on residual stability instead of a full reset
- Maximum interval of 90 days (no cards scheduled a year out for language learning)
- Words marked `learned: true` after graduation

## Architecture

```
Web page (content script)      Service Worker          Vocabulary page
═══════════════════           ══════════════          ════════════
src/content/index.ts  ──msg→  src/worker/       ←msg→ src/vocab/
  Shadow DOM injection         handlers/               panels/learn.ts
  translation bubble           review.ts               panels/browse.ts
  favorites                    stats.ts                panels/stats.ts
                               storage.ts
                               srs.ts  FSRS-5
                               translate.ts
```

All content↔worker↔vocab messages are typed in `src/shared/messages.ts`.

## Tech stack

TypeScript + Vite + [vite-plugin-web-extension](https://github.com/aklinker1/vite-plugin-web-extension) + [Sayo UI](https://github.com/Miaotofu01/Sayo-UI)

## Tests

```bash
npx vitest run tests/srs.test.ts
```

## Contributing

Issues and PRs are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
