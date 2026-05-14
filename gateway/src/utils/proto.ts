import * as protobuf from 'protobufjs';
import path from 'path';

const PROTO_DIR = path.resolve(__dirname, '../proto');

export async function loadProtos(): Promise<protobuf.Root> {
  const root = new protobuf.Root();
  await root.load(
    [
      path.join(PROTO_DIR, 'rendezvous.proto'),
      path.join(PROTO_DIR, 'message.proto'),
    ],
    { keepCase: true }
  );
  return root;
}

export function encodeRendezvousMessage(
  root: protobuf.Root,
  payload: Record<string, unknown>
): Uint8Array {
  const RendezvousMessage = root.lookupType('RendezvousMessage');
  const err = RendezvousMessage.verify(payload);
  if (err) throw new Error(`RendezvousMessage verify failed: ${err}`);
  const msg = RendezvousMessage.create(payload);
  return RendezvousMessage.encode(msg).finish();
}

export function decodeRendezvousMessage(
  root: protobuf.Root,
  data: Uint8Array
): Record<string, unknown> {
  const RendezvousMessage = root.lookupType('RendezvousMessage');
  const msg = RendezvousMessage.decode(data);
  return RendezvousMessage.toObject(msg, { longs: String, enums: String, defaults: true }) as Record<string, unknown>;
}

export function encodeMessage(
  root: protobuf.Root,
  payload: Record<string, unknown>
): Uint8Array {
  const Message = root.lookupType('Message');
  const err = Message.verify(payload);
  if (err) throw new Error(`Message verify failed: ${err}`);
  const msg = Message.create(payload);
  return Message.encode(msg).finish();
}

export function decodeMessage(
  root: protobuf.Root,
  data: Uint8Array
): Record<string, unknown> {
  const Message = root.lookupType('Message');
  const msg = Message.decode(data);
  return Message.toObject(msg, { longs: String, enums: String, defaults: true }) as Record<string, unknown>;
}
