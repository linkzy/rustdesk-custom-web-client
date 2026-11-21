# protobufjs 7 → 8 verification

Evidence for taking (or rejecting) Dependabot PR #28. Run against a built
gateway on each version and diff the JSON.

```bash
cd gateway
npm run build
cp -r src/proto dist/proto          # tsc does not copy .proto; the Dockerfile does
node test/fake-host/compare-bytes.cjs /tmp/proto-$(node -p "require('protobufjs/package.json').version").json
node test/fake-host/cross-decode.cjs /tmp/decode-$(node -p "require('protobufjs/package.json').version").json
node test/fake-host/probe-oneof.cjs  # oneof presence + the field-name trap, exits non-zero on a problem
node test/fake-host/probe-repeated.cjs
```

Then:

```bash
node test/fake-host/diff-bytes.cjs  /tmp/proto-7.x.json /tmp/proto-8.x.json
node test/fake-host/diff-decode.cjs /tmp/decode-7.x.json /tmp/decode-8.x.json
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

### Fourth check: oneof presence

Oneof members also have explicit presence, and unlike a plain scalar proto3 must
write them even when they hold the default — the value *is* the union's content.
Dropping `unicode: 0` would turn "the user pressed the key with code point 0"
into "no union member set", which is a real behaviour change, not a shorter
encoding. `probe-oneof.cjs` checks each oneof member of `KeyEvent` at its default
value, on 8.8.1:

| member | encoded hex | decodes as |
|---|---|---|
| `unicode = 0` | `7a0408012800` | `unicode: 0` — union member present |
| `control_key = 0` | `7a0408011800` | `control_key: Unknown` — present |
| `chr = 0` | `7a0408012000` | `chr: 0` — present |
| `seq = ""` | `7a0408013200` | `seq: ""` — present |
| plain `mode = 0` (not a oneof) | `7a0408012861` | `unicode: 97` — `mode` omitted, as expected |

All four survive; 8.x preserves oneof presence correctly. `mouse_event` with
`mask = 0` likewise keeps the field (`5204100a180c`), because `mask` is a plain
scalar inside a message the gateway always fills in. 7.x produces the same
messages two bytes longer, because it *also* writes the non-oneof `mode = 0`.

**The field-name trap, so this is not re-run wrong:** protobufjs accepts the
`.proto` spelling or camelCase depending on how the `Root` was loaded. This
gateway's `loadProtos` uses `keepCase: true`, so the fields are `control_key`,
`win2win_hotkey` and so on. protobufjs's *default* is camelCase, and unknown keys
are **silently dropped** rather than rejected — so a check written with
`controlKey` against this Root encodes nothing, produces a shorter hex
(`7a020801` instead of `7a0408011800`), and decodes with no union member set. It
looks like a pass if you only compare "did it not throw". `probe-oneof.cjs`
resolves the real field names from the loaded type first and asserts the wrong
spelling produces *no* union member, so the trap is demonstrated rather than
trusted.

## Session evidence

`node gateway/test/fake-host/protocol-run.mjs` (gateway running on the version
under test) asserts, in one run: rendezvous, login with password verification,
≥2 TestDelay echoes, ≥20 video frames with a keyframe, and mouse + keyboard
arriving with the right coordinates, unicode and control-key values.

## Why the gateway survives the byte change

RustDesk's own host treats a missing proto3 scalar as its default, so shorter
frames decode the same. The reverse direction (8.x decoding 7.x bytes) is
exercised by `cross-decode.cjs`, which round-trips through `decodeMessage`.
