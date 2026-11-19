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
npm run build    # tsc -b && vite build
npm run lint     # eslint .
```

`npm run lint` currently fails on pre-existing `react-hooks` errors in
`src/components/RemoteScreen.tsx` and `src/components/ConnectForm.tsx`; see the
notes in [`../docs/TASKS.md`](../docs/TASKS.md).

## Where things are

| Path | What it does |
|---|---|
| `src/components/ConnectForm.tsx` | Device ID, password, "Remember password", Advanced options, hCaptcha |
| `src/components/RemoteScreen.tsx` | Canvas rendering, mouse/keyboard capture |
| `src/hooks/useGateway.ts` | WebSocket lifecycle and message handling |
| `src/video/decoder.ts` | WebCodecs video decoder |
| `src/video/audio.ts` | Opus audio player |
| `src/utils/passwordStorage.ts` | The only place the password may be persisted (opt-in only) |

Project docs: [`../README.md`](../README.md), [`../AGENTS.md`](../AGENTS.md),
[`../docs/`](../docs/).
