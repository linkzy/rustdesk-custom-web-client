# R-23: audio mute button and volume slider

**Labels:** `good first issue`, `area:web` · **Milestone:** v0.2.0 — Community-ready

**Context.** Audio works (R-09) but always plays at full volume. The player already
has a `GainNode` (`this.outGain`), so only a setter and the UI are missing.

**Do.** Add `setVolume(0..1)` / `setMuted(bool)` to `OpusAudioPlayer`, writing to
`outGain.gain` via `setTargetAtTime` (no clicks). Add a speaker button and slider to
the toolbar (`App.tsx`), visible while connected, with `aria-label`s. Persist
`rclient_volume` / `rclient_muted` like `rclient_fit`. Default: full, unmuted.

**Where.** `web/src/video/audio.ts`; `web/src/App.tsx` + `App.module.css`;
`RemoteScreen.tsx` owns the player, so the volume must reach it (prop or ref).

**Accept.** Mute silences instantly, unmute restores the level; the slider ramps
smoothly; the choice survives a reload; keyboard reachable with visible focus;
`npm run build` passes.

**Test without a host.** Call the setters from the console or a unit test; with a
host, play audio remotely and check slider and mute.
