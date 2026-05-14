import { loadProtos, encodeRendezvousMessage, decodeRendezvousMessage } from './proto';

async function main() {
  const root = await loadProtos();
  console.log('[test] Protos loaded OK');

  const payload = {
    punch_hole_request: {
      id: 'test-peer-id',
      force_relay: true,
    },
  };

  const encoded = encodeRendezvousMessage(root, payload);
  console.log('[test] Encoded bytes:', encoded.length, 'bytes');

  const decoded = decodeRendezvousMessage(root, encoded);
  console.log('[test] Decoded:', JSON.stringify(decoded, null, 2));

  const req = (decoded as any).punch_hole_request;
  if (!req || req.id !== 'test-peer-id') {
    throw new Error('Round-trip failed: id mismatch');
  }
  if (!req.force_relay) {
    throw new Error('Round-trip failed: force_relay mismatch');
  }
  console.log('[test] Round-trip OK ✅');
}

main().catch((e) => { console.error(e); process.exit(1); });
