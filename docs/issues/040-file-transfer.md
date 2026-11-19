# R-14: file transfer between browser and host

**Labels:** `help wanted`, `area:gateway` · **Milestone:** v0.4.0 — Bigger features

**Context.** The proto can transfer files (`FileAction`, `FileResponse`,
`FileTransferBlock`) and neither side handles it. Pushing a file to a machine you
are already controlling is the most requested feature of any remote desktop tool.

**Do.** Multi-PR, tracked here. 1) Read-only directory listing (`FileAction.read_dir`
→ panel). 2) Download one file with the block protocol (`FileTransferBlock`,
`blk_id`), streamed. 3) Upload to a temp name, rename on completion. 4) Cancel,
progress, and errors on a dropped session.

**Where.** `gateway/src/session.ts` (`file_action`/`file_response`); new
`gateway/src/files.ts`; `gateway/src/server.ts`; new
`web/src/components/FileBrowser.tsx`; proto `FileAction`, `FileResponse`,
`FileDirectory`, `FileTransferBlock`.

**Accept.** Listing works against a real host; a 100 MB download uses bounded
gateway memory (no whole-file Buffer); cancel leaves no partially-named file on the
host; no path escape beyond what the user selected; `npm run build` passes.

**Test without a host.** Block assembly/splitting is pure and unit-testable. End to
end needs a real host — a transfer cannot be faked usefully.

**Note.** Land the listing first; it proves the plumbing with far less risk.
