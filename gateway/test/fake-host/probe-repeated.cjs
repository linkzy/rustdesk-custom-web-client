// Focused probe for the one case where the byte difference might not be a
// harmless default omission: a repeated message element whose fields are all
// defaults. In proto3 a repeated element has explicit presence, so dropping it
// would change the array length (3 -> 2) rather than its values.
//
//   node probe-repeated.cjs
const path = require('node:path');
const { loadProtos, encodeMessage, decodeMessage } = require(
  path.join(__dirname, '..', '..', 'dist', 'utils', 'proto.js'),
);

async function main() {
  const root = await loadProtos();
  const payload = {
    video_frame: {
      vp9s: {
        frames: [
          { data: Buffer.alloc(1200, 0x5a), key: true },
          { data: Buffer.alloc(300, 0x11), key: false },
          { data: Buffer.alloc(0), key: false },
        ],
      },
    },
  };

  const bytes = encodeMessage(root, payload);
  const decoded = decodeMessage(root, bytes);
  const frames = decoded.video_frame.vp9s.frames;

  console.log('encoded length:', bytes.length);
  console.log('decoded frames length:', frames.length);
  console.log('frame key flags:', frames.map((f) => f.key).join(','));
  console.log('frame data lengths:', frames.map((f) => (f.data ? f.data.length : 0)).join(','));

  const tail = Buffer.from(bytes).toString('hex').slice(-24);
  console.log('last 24 hex chars:', tail);
}

main().catch((e) => {
  console.error('probe failed:', e.message);
  process.exit(1);
});
