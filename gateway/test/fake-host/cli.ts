#!/usr/bin/env node
// Fake RustDesk host: a rendezvous + relay + host in one process.
//
//   npm run fake-host                 # defaults: id 123456789, password "demo"
//
// The gateway points at it with environment variables (or the connect form's
// Advanced options):
//
//   HBBS_HOST=127.0.0.1    HBBS_WS_PORT=21118
//   HBBR_HOST=127.0.0.1    HBBR_WS_PORT=21119
//
// Everything is deterministic: fixed key material, a fixed salt/challenge, and
// a VP9 clip whose moving elements depend only on the frame index.

import { startFakeHost, type StartOptions } from './index';
import { DEFAULTS, SCREEN } from './config';

interface CliOptions {
  id: string;
  password: string;
  acceptAnyPassword: boolean;
  hbbsPort: number;
  hbbrPort: number;
  controlPort: number;
  audio: boolean;
  video?: string;
  verbose: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    id: process.env.FAKE_HOST_ID ?? DEFAULTS.id,
    password: process.env.FAKE_HOST_PASSWORD ?? DEFAULTS.password,
    acceptAnyPassword: process.env.FAKE_HOST_ACCEPT_ANY === 'true',
    hbbsPort: Number(process.env.FAKE_HBBS_PORT ?? process.env.HBBS_WS_PORT ?? DEFAULTS.hbbsPort),
    hbbrPort: Number(process.env.FAKE_HBBR_PORT ?? process.env.HBBR_WS_PORT ?? DEFAULTS.hbbrPort),
    controlPort: Number(process.env.FAKE_CONTROL_PORT ?? DEFAULTS.controlPort),
    audio: process.env.FAKE_HOST_AUDIO === 'true',
    video: process.env.FAKE_HOST_VIDEO ?? undefined,
    verbose: process.env.FAKE_HOST_QUIET !== 'true',
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value`);
      i += 1;
      return value;
    };
    switch (arg) {
      case '--id': opts.id = next(); break;
      case '--password': opts.password = next(); break;
      case '--accept-any-password': opts.acceptAnyPassword = true; break;
      case '--hbbs-port': opts.hbbsPort = Number(next()); break;
      case '--hbbr-port': opts.hbbrPort = Number(next()); break;
      case '--control-port': opts.controlPort = Number(next()); break;
      case '--audio': opts.audio = true; break;
      case '--video': opts.video = next(); break;
      case '--quiet': opts.verbose = false; break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`unknown option ${arg} (try --help)`);
    }
  }
  return opts;
}

function printHelp(): void {
  console.log(`Fake RustDesk host (test tool — never a gateway runtime dependency)

Usage: npm run fake-host -- [options]

  --id <id>                 RustDesk ID to answer to        (default ${DEFAULTS.id})
  --password <pw>           Password the client must send   (default "${DEFAULTS.password}")
  --accept-any-password     Accept any password hash (demo/GIF mode)
  --hbbs-port <port>        Fake hbbs WebSocket port        (default ${DEFAULTS.hbbsPort})
  --hbbr-port <port>        Fake hbbr WebSocket port        (default ${DEFAULTS.hbbrPort})
  --control-port <port>     Control HTTP API port            (default ${DEFAULTS.controlPort})
  --audio                   Also send Opus (silence) frames
  --video <file.ivf>        Replay this VP9 IVF clip         (default assets/screen.ivf)
  --quiet                   Do not log every protocol message
  -h, --help                This text

Environment equivalents: FAKE_HOST_ID, FAKE_HOST_PASSWORD,
FAKE_HOST_ACCEPT_ANY, FAKE_HBBS_PORT/HBBS_WS_PORT,
FAKE_HBBR_PORT/HBBR_WS_PORT, FAKE_CONTROL_PORT, FAKE_HOST_AUDIO,
FAKE_HOST_VIDEO, FAKE_HOST_QUIET.

Point the gateway at it:
  HBBS_HOST=127.0.0.1  HBBS_WS_PORT=${DEFAULTS.hbbsPort}
  HBBR_HOST=127.0.0.1  HBBR_WS_PORT=${DEFAULTS.hbbrPort}
  Connect to ID ${DEFAULTS.id} with password "${DEFAULTS.password}"
  (${SCREEN.width}x${SCREEN.height} @ ${SCREEN.fps} fps, VP9).`);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const log = (msg: string) => {
    if (opts.verbose) console.log(msg);
  };

  const startOptions: StartOptions = {
    id: opts.id,
    password: opts.password,
    acceptAnyPassword: opts.acceptAnyPassword,
    hbbsPort: opts.hbbsPort,
    hbbrPort: opts.hbbrPort,
    controlPort: opts.controlPort,
    audio: opts.audio,
    videoFile: opts.video,
    log,
  };

  const host = await startFakeHost(startOptions);

  console.log('');
  console.log(`Fake host ready: id=${host.options.id} password=${host.options.acceptAnyPassword ? '(any)' : `"${host.options.password}"`}`);
  console.log(`  hbbs  ws://127.0.0.1:${host.options.hbbsPort}`);
  console.log(`  hbbr  ws://127.0.0.1:${host.options.hbbrPort}`);
  console.log(`  state http://127.0.0.1:${host.options.controlPort}/fake/state`);
  console.log(`  events http://127.0.0.1:${host.options.controlPort}/fake/events`);
  console.log(`  screen ${SCREEN.width}x${SCREEN.height} @ ${SCREEN.fps} fps VP9${host.options.audio ? ' + Opus' : ''}`);
  console.log('');

  const shutdown = async () => {
    await host.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((e: Error) => {
  console.error(`fake-host failed: ${e.message}`);
  process.exit(1);
});
