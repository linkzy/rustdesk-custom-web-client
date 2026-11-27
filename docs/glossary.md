# Glossary

The words this project uses for its things. One word per thing: if a document or a
message uses a different word for the same thing, treat that as a bug and use the
term here.

Grouped by area; add new terms in the right group rather than at the end.

## The project

| Term | Means | Not |
|---|---|---|
| **rclient** | This project: the browser client plus its gateway. Written lowercase, never "RClient" or "R-Client". | RClient, r-client, the web client (alone) |
| **self-hosted** | The user runs the relay and this project on their own machine, with their own keys. There is no hosted service and no account. | on-premise, managed |
| **RustDesk** | The upstream remote-desktop application whose protocol and relay we speak. Always capitalised as one word. | Rustdesk, Rust Desk |
| **relay pair** | `hbbs` and `hbbr` together: the two RustDesk server processes a deployment needs. | relay server (alone — it means `hbbr` only), relay |
| **session** | One browser connection to one remote machine, from connect to disconnect. Not the same as a socket or a WebSocket. | connection (alone), link |

## Components

| Term | Means | Not |
|---|---|---|
| **gateway** | The Node/TypeScript service in `gateway/`: speaks the RustDesk protocol, holds the encryption state, serves the browser. | backend, server (alone), bridge |
| **web** | The React app in `web/`: the page the user sees. | frontend, client, UI |
| **`hbbs`** | RustDesk's rendezvous server: the ID server peers register with. | ID server (in prose, prefer `hbbs`), matchmaker |
| **`hbbr`** | RustDesk's relay server: carries the actual session traffic when a direct connection is not used. | relay (alone), proxy |

## The browser side

| Term | Means | Not |
|---|---|---|
| **connect form** | The screen with the machine ID, password and Advanced options. | login page, login form, landing page, device ID field |
| **remote screen** | The canvas that renders the remote machine, plus its input handling. | viewer, canvas (alone), screen view |
| **session toolbar** | The bar shown above the remote screen while connected (fit, fullscreen, theme, disconnect). | toolbar (alone), top bar |
| **Debug Panel** | The collapsible log panel fed by the gateway and the browser. | console, log viewer |
| **remember password** | The opt-in checkbox that lets the browser store the RustDesk password. Lowercase when naming the behaviour, quoted when naming the control. | save password, store password |
| **input capture** | Listening for keyboard and mouse events and forwarding them to the gateway. | keylogging, hooking |

## The protocol

| Term | Means | Not |
|---|---|---|
| **peer** | The remote machine's RustDesk host application, as seen by the gateway. | host (alone — "host" also means a server), target |
| **machine ID** | The ID the user types to connect, as shown in RustDesk on the remote machine. This is the user-facing name (UI labels, prose for users). | device ID, Device ID |
| **target ID** | The same ID in code, protocol messages, logs and developer docs (e.g. `targetId`). Same thing as *machine ID*, different register. | device ID, client ID, peer ID, machine ID (in code) |
| **rendezvous** | Asking `hbbs` where a peer is and how to reach it. The gateway always forces relay mode. | discovery, lookup, punch-hole (alone) |
| **force relay** | The gateway's deliberate choice to always route through `hbbr` rather than attempt a direct connection (`force_relay: true`). | relay mode, no-NAT |
| **secure handshake** | The step where the client generates the session key and sends it to the peer, sealed with the peer's public key. | key exchange, crypto handshake |
| **frame marker** | The first byte of a binary frame from the gateway: `5` means Opus audio, anything else is a video codec. | header byte, opcode |
| **TestDelay echo** | Returning the peer's `test_delay` message with `from_client: false`, once a second, so the peer can measure the round trip. | ping, keepalive (both are something else) |

## Testing and tooling

| Term | Means | Not |
|---|---|---|
| **fake host** | The stand-in RustDesk host and relay pair in `gateway/test/fake-host/`, used to test without a real machine. | mock server, stub, test server |
| **e2e suite** | The Playwright tests in `e2e/` that drive a real browser against the fake host. | integration tests, browser tests |
| **unit suite** | The vitest tests inside `gateway/` and `web/`. | unit tests (when naming the suite) |

## Deploying

| Term | Means | Not |
|---|---|---|
| **demo** | A public instance meant for strangers to try, separate from anyone's personal deployment. | the site, the hosted version |
| **production instance** | A deployment someone actually uses day to day. Never described with its hostname in this repository. | prod, live site, my server |
| **relay key** | The relay pair's public key, which visitors paste into their RustDesk. | server key, licence key |
| **Advanced options** | The form section where a user sets their own relay hosts and key. | settings, preferences, config |
