# R-12: multi-monitor support

**Labels:** `help wanted`, `area:gateway` · **Milestone:** v0.4.0 — Bigger features

**Context.** `gateway/src/session.ts` reads only `peerInfo.displays[0]`, so a
two-screen machine shows one and hides the rest. The proto already carries the list
(`PeerInfo.displays`, `SwitchDisplay`, `CaptureDisplays`); both sides ignore it.

**Do.** Send the full display list in `connected`
(`displays: [{ x, y, width, height, name, online }]`, keeping `width`/`height` for
compatibility). Add a toolbar selector, shown only when there is more than one.
Switching sends `Misc { switch_display: { display: <index> } }` (a `SwitchDisplay`
message, not a bare int) and expects a new stream. Respect `DisplayInfo.online`
when offering a display.

**Where.** `gateway/src/session.ts` (`handlePeerInfo`, ~line 201); a
`switchDisplay`; `gateway/src/server.ts` (`{type:"switch_display"}`);
`web/src/hooks/useGateway.ts`; `App.tsx`.

**Accept.** A two-monitor host shows both and switching changes the stream; a
single-monitor host behaves exactly as today (no new control); the decoder resets
cleanly on switch (no smeared frame); `npm run build` passes.

**Test without a host.** Unit-test the `PeerInfo` → display-list mapping with a
two-display protobuf fixture. The switch needs a real host.

**Note.** Check `VideoFrame.display` — RustDesk may label frames for a display
index different from the one you requested.
