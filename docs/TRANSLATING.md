# Translating rclient

Adding a language is a new catalogue file and **one line** of registration, with
no build tooling, no framework and no component edits. This page is the whole
process.

If a step here does not match the code, that is a bug — open an issue.

---

## How the UI is translated

- Every user-visible string lives in a message catalogue under
  `web/src/i18n/`. Components call `t('some.key')` instead of writing English in
  JSX.
- `web/src/i18n/en.ts` is the source of truth. Its keys are the contract: a
  translation may have any values, but it must not invent keys.
- The browser's language (`navigator.language`) picks the starting locale. A
  visitor can override it in the UI, and that choice is persisted, so it survives
  a reload.
- A missing key falls back to English rather than showing the raw key or
  crashing.
- Log lines, protocol messages and anything from RustDesk stay in English:
  translating them would make bug reports harder to compare.

### What is *not* translated

- `web/index.html`'s `<title>`, description and Open Graph tags — they are for
  search engines and link previews, which read the served HTML before any
  JavaScript runs. `web/public/manifest.webmanifest` is likewise static. Do not
  "fix" these; they are English on purpose.
- The Debug Panel's protocol log.
- Error text that comes from the gateway or RustDesk itself. rclient maps the
  ones it recognises (`web/src/utils/errors.ts`) into translated sentences; the
  rest stays as the raw string in the panel.

---

## Adding a language

1. **Copy the source catalogue.**

   ```bash
   cd web/src/i18n
   cp en.ts de.ts        # name it after the language tag
   ```

   Name the file after the [BCP 47](https://www.rfc-editor.org/info/bcp47)
   language tag: `pt-BR`, `de`, `fr`, `zh-Hans`. That same tag is what
   `navigator.language` produces, so no mapping table is needed.

   In the copy, rename the export and its label:

   ```ts
   export const de = { … };        // was: export const en
   export const label = 'Deutsch'; // the language's own name, shown in the picker
   ```

   Leave the types alone — `en.ts` has none on purpose, so the copy compiles as
   plain data.

2. **Translate the values, never the keys.** Keep placeholders exactly as they
   are — `{count}`, `{host}` and friends are substituted at runtime, and a
   renamed placeholder shows up as literal braces in the UI.

3. **Register it** — one entry in `LOCALES`, in `web/src/i18n/index.ts`:

   ```ts
   { tag: 'de', catalogue: de, label: deLabel },
   ```

   That single line is the whole integration: `t()` finds the catalogue, the
   picker offers the tag, and the option shows the label you exported. No
   component changes.

4. **Check it.**

   ```bash
   cd web
   npm test           # key parity both ways, placeholders, fallback
   npm run typecheck  # the catalogue type rejects a missing or extra key
   npm run dev        # then switch the language in the UI and click every screen
   ```

   Three checks, all cheap: the test compares key lists in both directions and
   asserts every `{placeholder}` survived; the catalogue is typed
   `Record<MessageKey, string>`, so TypeScript rejects a catalogue that is missing
   a key or invents one.

   The connect screen and the toolbar are the whole surface — you do not need a
   RustDesk host to translate rclient.

5. **Open the PR** with the title `i18n: add <language>`, and say in the body
   whether you are a native speaker or used a tool. Both are welcome; the
   reviewer just needs to know how much proofreading to expect.

---

## What reviewers look for

| | |
|---|---|
| **Every key present** | The test fails if a catalogue is missing a key that `en.ts` has. |
| **Placeholders intact** | Same names, same count, in the same sentences. |
| **No leftover English** | Except proper nouns: RustDesk, rclient, hbbs, hbbr, WebCodecs. |
| **Length** | Buttons and badges are small. A translation twice the length of the English will overflow — shorten it rather than widening the layout. |
| **Tone** | Match the English: plain, direct, no marketing. "That machine is offline", not "Oops! Something went wrong!". |

---

## Fixing a translation

The same rules, minus the file: edit the value, keep the key, run the checks
above. A wrong translation is a bug like any other — quoting the screen it
appears on (and what you expected) makes it quick to verify.

---

## Maintaining the English source

When you add a UI string:

1. Add the key to `en.ts`.
2. Add it to every other catalogue **in the same PR**, even if the value is still
   the English text. A missing key fails the test, and leaving a catalogue broken
   blocks everyone else.

If a string is temporary or internal, it does not belong in the catalogue. Only
put there what a visitor reads.
