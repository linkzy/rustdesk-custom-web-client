# protobufjs 7 → 8 verification

Evidence for taking (or rejecting) Dependabot PR #28. Run against a built
gateway on each version and diff the JSON.

```bash
cd gateway
npm run build
cp -r src/proto dist/proto          # tsc does not copy .proto; the Dockerfile does
node test/fake-host/compare-bytes.cjs /tmp/proto-$(node -p "require('protobufjs/package.json').version").json
node test/fake-host/cross-decode.cjs /tmp/decode-$(node -p "require('protobufjs/package.json').version").json
```

Then:

```bash
node /path/to/diff-bytes.cjs  /tmp/proto-7.x.json /tmp/proto-8.x.json
node /path/to/diff-decode.cjs /tmp/decode-7.x.json /tmp/decode-8.x.json
```

`compare-bytes.cjs` encodes a representative message set with the gateway's own
`utils/proto.ts`; `cross-decode.cjs` decodes each back to a logical object.
`cases.cjs` holds the shared message set so the two cannot drift.

## What the 7 → 8 comparison found (2026-11-21)

19 messages: rendezvous (`punch_hole_request`, `request_relay`) and session
(`hash`, `login_request`, `login_response`, `test_delay`, `video_frame`,
`audio_frame`, `mouse_event`, `key_event` ×2, `misc` ×2, plus negative-sint,
empty-message and repeated-with-empty-element edge cases).

- **Bytes: 9 identical, 10 different.**
- **Meaning: 19/19 identical** after decoding both versions with `defaults: true`.

The byte differences are proto3 default-value omission. protobufjs 8 stopped
writing known-default values; 7 wrote some of them. Examples:

| message | 7.x | 8.x |
|---|---|---|
| `key_event` (unicode 97) | `7a06080128614800` (8B) | `7a0408012861` (6B) — drops `mode = 0` |
| `mouse_event` (x = -1) | `52080800100118ffff03` (10B) | `5206100118ffff03` (8B) — drops `mask = 0` |
| `login_request` | 108B | 106B — drops `video_ack_required = false` |
| `login_response` | 88B | 68B — drops zero-valued display scalars |

These are semantically identical to any conformant parser: a proto3 scalar
absent from the wire means its default. Nothing in this project's `.proto` files
uses the `optional` keyword (verified: 0 occurrences), so no field relies on
*presence* to distinguish "unset" from "default".

The repeated-message case was checked separately because a repeated element has
explicit presence — dropping one would change the array length rather than its
values. It does not: both versions decode the repeated `frames` to 3 elements
with the same payloads. 7.x additionally writes `0a001000` (empty `data` and
`key = false`) inside elements; 8.x omits those.

## Session evidence

`node gateway/test/fake-host/protocol-run.mjs` (gateway running on the version
under test) asserts, in one run: rendezvous, login with password verification,
≥2 TestDelay echoes, ≥20 video frames with a keyframe, and mouse + keyboard
arriving with the right coordinates, unicode and control-key values.

## Why the gateway survives the byte change

RustDesk's own host treats a missing proto3 scalar as its default, so shorter
frames decode the same. The reverse direction (8.x decoding 7.x bytes) is
exercised by `cross-decode.cjs`, which round-trips through `decodeMessage`.
