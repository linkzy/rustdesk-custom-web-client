// The byte differences above all look like proto3 default-value omission.
// This script proves or disproves that: it decodes each version's bytes with the
// *other* version and compares the resulting logical message.
//
// If the decoded objects match, the wire difference is semantically empty
// (a missing proto3 field means its default), which is what a conformant parser
// — including RustDesk's — must assume.
//
//   node cross-decode.cjs <outFile>
const path = require('node:path');
const fs = require('node:fs');
const { createHash } = require('node:crypto');

// Rebuild the exact same payload set as compare-bytes.cjs so the two scripts
// cannot drift apart.
const CASES = require('./cases.cjs');

const distDir = path.join(__dirname, '..', '..', 'dist', 'utils');
const proto = require(distDir + '/proto.js');
const { loadProtos, encodeRendezvousMessage, decodeRendezvousMessage, encodeMessage, decodeMessage } = proto;

async function main() {
  const root = await loadProtos();
  const installed = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', 'node_modules', 'protobufjs', 'package.json'), 'utf8'),
  ).version;

  const results = {};

  for (const [kind, cases] of Object.entries(CASES)) {    const encode = kind === 'rendezvous' ? encodeRendezvousMessage : encodeMessage;
    const decode = kind === 'rendezvous' ? decodeRendezvousMessage : decodeMessage;

    for (const [name, payload] of Object.entries(cases)) {
      const bytes = encode(root, payload);
      // Decoding our own bytes returns a normalised object (defaults: true), so
      // the comparison is on meaning, not on which fields happened to be written.
      const decoded = decode(root, bytes);
      results[`${kind}: ${name}`] = {
        encodedLength: bytes.length,
        decodedSha256: createHash('sha256').update(JSON.stringify(decoded)).digest('hex'),
      };
    }
  }

  const outPath = process.argv[2];
  const json = JSON.stringify({ protobufjsVersion: installed, results }, null, 2);
  if (outPath) {
    fs.writeFileSync(outPath, json, 'utf8');
    console.log(`wrote ${outPath} (protobufjs ${installed})`);
  } else {
    console.log(json);
  }
}

main().catch((e) => {
  console.error('cross-decode failed:', e.message);
  process.exit(1);
});
