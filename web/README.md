# web — rclient frontend

React + TypeScript frontend for rclient: connects to the gateway over WebSocket,
decodes video with WebCodecs (`VideoDecoder`), plays host audio with
`AudioDecoder`, renders to a canvas and captures keyboard/mouse input.

## Run it

```bash
npm ci
npm run dev      # Vite on http://localhost:5173, proxies /ws to ws://localhost:4000
```

The gateway must be running on port 4000 (`cd ../gateway && npm run dev`).

## Checks

```bash
npm run lint       # eslint .
npm run typecheck  # tsc -b
npm test           # vitest + jsdom (25 tests)
npm run build      # tsc -b && vite build
```

All four pass. CI runs the same four (see `../.github/workflows/ci.yml`); the root
`package.json` can run them for both packages at once.

## Where things are

| Path | What it does |
|---|---|
| `src/components/ConnectForm.tsx` | Machine ID, password, "Remember password", Advanced options, hCaptcha |
| `src/components/RemoteScreen.tsx` | Canvas rendering, mouse/keyboard capture |
| `src/components/DebugPanel.tsx` | The collapsible log panel (Toggle with "Show debug info") |
| `src/components/StatsOverlay.tsx` | FPS / frame-time / ping overlay |
| `src/hooks/useGateway.ts` | WebSocket lifecycle and message handling |
| `src/video/decoder.ts` | WebCodecs video decoder |
| `src/video/audio.ts` | Opus audio player (WebCodecs `AudioDecoder` + Web Audio) |
| `src/video/frameProtocol.ts` | The binary frame header (codec byte, keyframe flag) |
| `src/utils/passwordStorage.ts` | The only place the password may be persisted (opt-in only) |
| `src/utils/errors.ts` | Raw gateway errors → a short title and a next step |
| `src/utils/connectForm.ts` | `localStorage` keys and server-config normalisation |
| `public/manifest.webmanifest` | PWA manifest — no service worker, no offline claim |
| `public/og-image.png` | The 1200×630 social card (generated, not a screenshot) |
| `scripts/generate-social-assets.mjs` | Regenerates the OG card and touch icon (needs Playwright, not a dependency) |

`src/assets/hero.png` and `src/assets/vite.svg` are leftovers from the Vite
template and are not referenced by the app.

Project docs: [`../README.md`](../README.md), [`../AGENTS.md`](../AGENTS.md),
[`../docs/`](../docs/).
