# R-18: firewall guidance for self-hosted relays

**Labels:** `help wanted`, `area:deploy`, `documentation` · **Milestone:** v0.2.0 — Community-ready

**Context.** RustDesk relay ports are scanned constantly by internet-wide crawlers.
The docs say "block scanners at the firewall" in one line and leave the reader to
work out which ports are even needed.

**Do.** A short page: the ports RustDesk requires (`21115/tcp`, `21116/tcp+udp`,
`21117/tcp`, `21118/tcp`, `21119/tcp`), a `ufw` example opening exactly those,
why rate-limiting `21115` (NAT test) is safe but `21116` is not, and an optional
`fail2ban` jail watching the hbbr log — clearly marked optional.

**Where.** New `docs/deployment/HARDENING.md`; link from `docs/README.md` and the
README's Step 2.

**Accept.** Port list matches the relay example and `deploy/DEMO.md`; every command
copy-pasteable and idempotent; no real hostnames, IPs or keys.

**Test without a host.** `ufw --dry-run` on any Linux box; cross-check the port
list against the README's relay compose example.
