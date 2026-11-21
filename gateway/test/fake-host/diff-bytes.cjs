// Compares two compare-bytes JSON files case by case and reports exactly which
// byte sequences differ. Anything other than "all identical" means the bump
// changes the wire format and must not ship.
const fs = require('node:fs');

const a = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const b = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));

const keys = [...new Set([...Object.keys(a.cases), ...Object.keys(b.cases)])].sort();

let same = 0;
const diffs = [];
for (const key of keys) {
  const left = a.cases[key];
  const right = b.cases[key];
  if (!left || !right) {
    diffs.push({ key, reason: 'missing on one side' });
    continue;
  }
  if (left.sha256 === right.sha256 && left.length === right.length) {
    same += 1;
  } else {
    diffs.push({
      key,
      reason: 'bytes differ',
      left: { len: left.length, hex: left.hex },
      right: { len: right.length, hex: right.hex },
    });
  }
}

console.log(`A: protobufjs ${a.protobufjsVersion}  rollup ${a.rollup}`);
console.log(`B: protobufjs ${b.protobufjsVersion}  rollup ${b.rollup}`);
console.log(`cases: ${keys.length}  identical: ${same}  different: ${diffs.length}`);
console.log('');

if (diffs.length === 0) {
  console.log('RESULT: every encoded byte sequence is identical across both versions.');
  process.exit(0);
}

console.log('RESULT: DIFFERENCES FOUND');
for (const d of diffs) {
  console.log('');
  console.log(`  ${d.key} — ${d.reason}`);
  if (d.left) console.log(`    A (${d.left.len}B): ${d.left.hex}`);
  if (d.right) console.log(`    B (${d.right.len}B): ${d.right.hex}`);
}
process.exit(1);
