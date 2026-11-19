# R-10: clipboard sync between browser and host

**Labels:** `help wanted`, `area:gateway` · **Milestone:** v0.3.0 — Everyday remote desktop

**Context.** Copy/paste between browser and remote machine does not exist. The proto
has the legacy `Clipboard` message and the newer `Cliprdr` stream; neither is
handled. It is also the missing half of KI-006 — forwarding Ctrl+C is useless
without a clipboard.

**Do.** Text only, both directions, using `Clipboard` first: gateway decodes
`msg.clipboard` (check `compress` — `deflate`; `format` says what the content is)
into `{type:"clipboard", text}` for the browser, and compresses the reverse; web
listens for `copy`/`paste` on the canvas container and uses
`navigator.clipboard` (handling the permission rejection). Announce support with
`OptionMessage.disable_clipboard: No`.

**Where.** `gateway/src/session.ts` (`handleClipboard`, beside `handleAudioFrame`);
`gateway/src/server.ts`; `web/src/hooks/useGateway.ts`;
`web/src/components/RemoteScreen.tsx`.

**Accept.** Text round-trips both ways; ~1 MB does not hang the socket; a denied
permission shows one hint, not an unhandled rejection; files/images explicitly out
of scope; `npm run build` passes in both packages.

**Test without a host.** Unit-test the deflate/inflate round-trip; drive the browser
half with a fake WS server that echoes `clipboard`.

**Note.** `Cliprdr` is a multi-step protocol (monitor ready → format list →
request). Rich formats are a follow-up, not this PR.
