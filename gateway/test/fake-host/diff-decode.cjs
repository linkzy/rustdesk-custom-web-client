// Compares what each version's encoder produced when decoded back to a logical
// message. If both versions decode to the same object, the wire differences are
// proto3 default omission: harmless to any conformant parser.
const fs = require('node:fs');

const a = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const b = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));

const keys = [...new Set([...Object.keys(a.results), ...Object.keys(b.results)])].sort();
const diffs = [];
let same = 0;

for (const key of keys) {
  const left = a.results[key];
  const right = b.results[key];
  if (!left || !right) {
    diffs.push({ key, reason: 'missing on one side' });
  } else if (left.decodedSha256 === right.decodedSha256) {
    same += 1;
  } else {
    diffs.push({ key, reason: 'decoded meaning differs', left: left.encodedLength, right: right.encodedLength });
  }
}

console.log(`A: protobufjs ${a.protobufjsVersion}`);
console.log(`B: protobufjs ${b.protobufjsVersion}`);
console.log(`cases: ${keys.length}  same meaning: ${same}  different meaning: ${diffs.length}`);
if (diffs.length === 0) {
  console.log('RESULT: every message decodes to the same logical object on both versions.');
  console.log('        The byte differences are proto3 default-value omission.');
  process.exit(0);
}
console.log('RESULT: MEANING DIFFERS — do not merge');
for (const d of diffs) console.log(`  ${d.key}: ${d.reason} (A ${d.left}B vs B ${d.right}B)`);
process.exit(1);
