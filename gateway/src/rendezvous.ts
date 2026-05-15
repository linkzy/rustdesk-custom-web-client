import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { loadProtos, encodeRendezvousMessage, decodeRendezvousMessage } from './utils/proto';

export interface RendezvousResult {
  relayServer: string;
  peerPk: Uint8Array;
  uuid: string;
}

export async function performRendezvous(targetId: string, attempt = 1): Promise<RendezvousResult> {
  const hbbsHost = process.env.HBBS_HOST ?? 'localhost';
  const hbbsPort = process.env.HBBS_WS_PORT ?? '21118';
  const url = `ws://${hbbsHost}:${hbbsPort}`;
  const serverKey = (process.env.SERVER_KEY ?? '').trim();
  const MAX_ATTEMPTS = 3;

  const root = await loadProtos();

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('[rendezvous] Timeout'));
    }, 15000);

    let resolved = false;

    ws.on('open', () => {
      console.log(`[rendezvous] Connected to hbbs at ${url}`);
      const payload = {
        punch_hole_request: {
          id: targetId,
          nat_type: 1,        // ASYMMETRIC = 1
          conn_type: 0,       // DEFAULT_CONN
          force_relay: true,
          licence_key: serverKey,
        },
      };
      ws.send(encodeRendezvousMessage(root, payload));
      console.log(`[rendezvous] Sent PunchHoleRequest for peer: ${targetId}`);
    });

    ws.on('message', (data: Buffer) => {
      try {
        const decoded = decodeRendezvousMessage(root, new Uint8Array(data)) as any;
        const activeFields = Object.keys(decoded).filter(k => decoded[k] !== null && decoded[k] !== undefined && decoded[k] !== '' && decoded[k] !== 0 && decoded[k] !== false);
        console.log(`[rendezvous] Received: fields=${JSON.stringify(activeFields)} raw=${Buffer.from(data).toString('hex').slice(0, 60)}`);

        // Newer hbbs (force_relay=true) may reply directly with relay_response,
        // with uuid and relay_server already set — no need to send RequestRelay back.
        if (decoded.relay_response) {
          const resp = decoded.relay_response;
          if (resp.relay_server && resp.uuid) {
            console.log(`[rendezvous] relay_response: relay=${resp.relay_server} uuid=${resp.uuid}`);
            let pkBytes: Uint8Array = new Uint8Array(0);
            if (resp.pk) {
              pkBytes = typeof resp.pk === 'string'
                ? new Uint8Array(Buffer.from(resp.pk, 'binary'))
                : new Uint8Array(resp.pk);
            }
            resolved = true;
            clearTimeout(timeout);
            ws.close();
            resolve({ relayServer: resp.relay_server, peerPk: pkBytes, uuid: resp.uuid });
            return;
          }
          if (resp.refuse_reason) {
            clearTimeout(timeout);
            ws.close();
            reject(new Error(`[rendezvous] Relay refused: ${resp.refuse_reason}`));
            return;
          }
        }

        if (decoded.punch_hole_response) {
          const resp = decoded.punch_hole_response;

          // relay_server present = peer found (ID_NOT_EXIST is just the proto3 default enum value 0)
          if (resp.relay_server) {
            const uuid = uuidv4();
            console.log(`[rendezvous] Peer found on relay ${resp.relay_server}, uuid=${uuid}`);

            // Extract peer public key (bytes field — protobufjs returns as binary string)
            let pkBytes: Uint8Array;
            if (!resp.pk) {
              pkBytes = new Uint8Array(0);
            } else if (typeof resp.pk === 'string') {
              pkBytes = new Uint8Array(Buffer.from(resp.pk, 'binary'));
            } else if (Buffer.isBuffer(resp.pk)) {
              pkBytes = new Uint8Array(resp.pk);
            } else {
              pkBytes = new Uint8Array(Buffer.from(Object.values(resp.pk) as number[]));
            }

            // Send RequestRelay back to hbbs so it forwards UUID to peer B
            const relayPayload = {
              request_relay: {
                id: targetId,
                uuid,
                relay_server: resp.relay_server,
                secure: false,
                conn_type: 0,
                licence_key: serverKey,
              },
            };
            ws.send(encodeRendezvousMessage(root, relayPayload));
            console.log(`[rendezvous] Sent RequestRelay to hbbs, uuid=${uuid}`);

            // Give hbbs a moment to forward to peer, then we're done
            setTimeout(() => {
              resolved = true;
              clearTimeout(timeout);
              ws.close();
              resolve({ relayServer: resp.relay_server, peerPk: pkBytes, uuid });
            }, 500);
            return;
          }

          // Actual failures (non-zero enum values)
          if (resp.failure === 'OFFLINE' || resp.failure === 'LICENSE_MISMATCH' || resp.failure === 'LICENSE_OVERUSE') {
            clearTimeout(timeout);
            ws.close();
            if (resp.failure === 'OFFLINE' && attempt < MAX_ATTEMPTS) {
              console.log(`[rendezvous] Peer OFFLINE (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in 2s...`);
              setTimeout(() => {
                performRendezvous(targetId, attempt + 1).then(resolve).catch(reject);
              }, 2000);
            } else {
              const hint = resp.failure === 'OFFLINE'
                ? 'OFFLINE — make sure the RustDesk app is running and connected to your server'
                : resp.failure;
              reject(new Error(`[rendezvous] Peer not available: ${hint}`));
            }
            return;
          }
        }
      } catch (e) {
        console.error('[rendezvous] Failed to decode message:', e);
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`[rendezvous] WebSocket error: ${err.message}`));
    });

    ws.on('close', (code, reason) => {
      console.log(`[rendezvous] hbbs closed (code=${code}, reason="${reason.toString()}")`);
      if (!resolved) {
        clearTimeout(timeout);
        reject(new Error(`[rendezvous] hbbs closed connection unexpectedly (code=${code})`));
      }
    });
  });
}

