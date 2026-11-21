// Encodes a representative message set and prints digest-ready JSON.
//
//   npm run build && node test/fake-host/compare-bytes.cjs > proto7.json
//
// It requires the *compiled* gateway (dist/utils/proto.js), so it exercises the
// exact code that ships rather than a fresh copy, and it works on both
// protobufjs 7 and 8 because the gateway is plain CommonJS.
//
// Run once per version and diff the two JSON files. Identical bytes are the
// strongest evidence available without a real RustDesk host: the gateway's job
// is to put RustDesk's exact wire format on the socket, so any encoder change
// shows up here.

const { createHash } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

const distDir = path.join(__dirname, '..', '..', 'dist', 'utils');
const { loadProtos, encodeRendezvousMessage, encodeMessage } = require(distDir + '/proto.js');

async function main() {
  const root = await loadProtos();

  const CASES = require('./cases.cjs');
  const rendezvousCases = CASES.rendezvous;
  const messageCases = CASES.message;

  const digest = (bytes) => ({
    hex: Buffer.from(bytes).toString('hex'),
    length: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });

  const installed = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', 'node_modules', 'protobufjs', 'package.json'), 'utf8'),
  ).version;

  const output = { protobufjsVersion: installed, node: process.version, cases: {} };

  for (const [name, payload] of Object.entries(rendezvousCases)) {
    output.cases['rendezvous: ' + name] = digest(encodeRendezvousMessage(root, payload));
  }
  for (const [name, payload] of Object.entries(messageCases)) {
    output.cases['message: ' + name] = digest(encodeMessage(root, payload));
  }

  const rollup = createHash('sha256');
  for (const key of Object.keys(output.cases).sort()) {
    rollup.update(key).update(output.cases[key].sha256);
  }
  output.rollup = rollup.digest('hex');
  output.caseCount = Object.keys(output.cases).length;

  // Write UTF-8 ourselves: shell redirection on Windows produces UTF-16, which
  // then will not parse as JSON when the two versions are compared.
  const outPath = process.argv[2];
  const json = JSON.stringify(output, null, 2);
  if (outPath) {
    fs.writeFileSync(outPath, json, 'utf8');
    console.log(`wrote ${outPath} (protobufjs ${output.protobufjsVersion}, ${output.caseCount} cases, rollup ${output.rollup})`);
  } else {
    console.log(json);
  }
}

main().catch((e) => {
  console.error('compare-bytes failed:', e.message);
  process.exit(1);
});
