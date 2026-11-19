import { describe, it, expect, beforeAll } from 'vitest';
import type * as protobuf from 'protobufjs';
import {
  loadProtos,
  encodeRendezvousMessage,
  decodeRendezvousMessage,
} from './proto';

let root: protobuf.Root;

beforeAll(async () => {
  root = await loadProtos();
});

describe('rendezvous protobuf', () => {
  it('loads both .proto files and can look up the message types', () => {
    expect(root.lookupType('RendezvousMessage')).toBeTruthy();
    expect(root.lookupType('PunchHoleRequest')).toBeTruthy();
    expect(root.lookupType('RequestRelay')).toBeTruthy();
  });

  it('round-trips PunchHoleRequest, keeping force_relay = false distinct from absent', () => {
    const encoded = encodeRendezvousMessage(root, {
      punch_hole_request: { id: 'test-peer-id', force_relay: true },
    });
    expect(encoded.length).toBeGreaterThan(0);

    const relayed = decodeRendezvousMessage(root, encoded) as any;
    expect(relayed.punch_hole_request.id).toBe('test-peer-id');
    expect(relayed.punch_hole_request.force_relay).toBe(true);

    const direct = decodeRendezvousMessage(root, encodeRendezvousMessage(root, {
      punch_hole_request: { id: 'peer', force_relay: false },
    })) as any;
    expect(direct.punch_hole_request.force_relay).toBe(false);
  });

  it('round-trips RequestRelay (id, uuid, relay_server, secure)', () => {
    const payload = {
      request_relay: {
        id: 'target-machine',
        uuid: '11111111-2222-3333-4444-555555555555',
        relay_server: 'relay.example.com:21119',
        secure: false,
        conn_type: 0,
        licence_key: '',
      },
    };

    const decoded = decodeRendezvousMessage(
      root,
      encodeRendezvousMessage(root, payload),
    ) as any;

    expect(decoded.request_relay.id).toBe('target-machine');
    expect(decoded.request_relay.uuid).toBe('11111111-2222-3333-4444-555555555555');
    expect(decoded.request_relay.relay_server).toBe('relay.example.com:21119');
    expect(decoded.request_relay.secure).toBe(false);
  });

  it('leaves unset oneof members undefined (a bare punch hole decodes as such)', () => {
    const decoded = decodeRendezvousMessage(
      root,
      encodeRendezvousMessage(root, { punch_hole_request: { id: 'x' } }),
    ) as any;
    expect(decoded.punch_hole_request.id).toBe('x');
    expect(decoded.request_relay).toBeUndefined();
  });
});
