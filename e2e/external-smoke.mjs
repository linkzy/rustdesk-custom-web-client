// Checks the external-services mode the CI job uses: nothing is started by the
// test runner, the addresses come from the environment, and stop() leaves the
// services alone (the workflow owns them).
//
//   E2E_EXTERNAL=1 \
//   E2E_CONTROL_URL=http://127.0.0.1:24181 \
//   E2E_GATEWAY_URL=http://127.0.0.1:24000 \
//   E2E_APP_URL=http://127.0.0.1:5173 \
//   node e2e/external-smoke.mjs

import { startStack } from './stack.mjs';

function fail(msg) {
  console.error(`[external-smoke] FAILED: ${msg}`);
  process.exit(1);
}

let stack = null;
try {
  process.env.E2E_EXTERNAL = '1';
  stack = await startStack({ log: (m) => console.log(m) });

  const state = await stack.control.state();
  if (state.id !== stack.fakeHost.id) fail(`control API reports id ${state.id}, expected ${stack.fakeHost.id}`);
  if (!stack.appUrl || !stack.gatewayUrl) fail('external stack is missing a URL');

  await stack.stop();

  // The services must still be up: they belong to the caller, not to us.
  const after = await fetch(`${process.env.E2E_CONTROL_URL}/fake/health`);
  if (!after.ok) fail('stop() took down an external service');

  console.log(`[external-smoke] OK: id=${state.id}, gateway=${stack.gatewayUrl}, app=${stack.appUrl}`);
  console.log('[external-smoke] stop() left the external services untouched');
  console.log('[external-smoke] PASS');
  process.exit(0);
} catch (e) {
  console.error(`[external-smoke] FAILED: ${e.message}`);
  if (stack) await stack.stop().catch(() => {});
  process.exit(1);
}
