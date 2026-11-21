// The message set both compare-bytes.cjs and cross-decode.cjs use, in one place
// so the byte comparison and the meaning comparison can never drift apart.

const rendezvous = {
  'punch_hole_request (typical)': {
    punch_hole_request: { id: '123456789', nat_type: 1, conn_type: 0, force_relay: true, licence_key: '' },
  },
  'punch_hole_request (version + port)': {
    punch_hole_request: { id: '987654321', force_relay: true, version: '1.3.8', udp_port: 21116 },
  },
  'request_relay (typical)': {
    request_relay: {
      id: '123456789',
      uuid: '11111111-2222-3333-4444-555555555555',
      relay_server: 'relay.example.com:21119',
      secure: false,
      conn_type: 0,
    },
  },
  'request_relay (secure + licence)': {
    request_relay: {
      id: '555000111',
      uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      relay_server: 'relay.example.com:21119',
      secure: true,
      licence_key: 'ODM4MTIzNDU2Nzg5MA==',
      conn_type: 1,
    },
  },
};

const message = {
  'hash (salt + challenge)': {
    hash: { salt: 'fake-host-salt-0123456789abcdef', challenge: 'fake-host-challenge-0123456789abcdef' },
  },
  'login_request (full)': {
    login_request: {
      username: '123456789',
      password: Buffer.alloc(32, 0xab),
      my_id: 'rclient-web',
      my_name: 'Web Browser',
      option: {
        image_quality: 3,
        custom_fps: 30,
        disable_audio: 1,
        supported_decoding: { ability_vp8: 1, ability_vp9: 1, ability_h264: 1, ability_av1: 1, prefer: 2 },
      },
      video_ack_required: false,
      session_id: 1234567890,
      version: '1.3.8',
    },
  },
  'login_response (peer_info)': {
    login_response: {
      peer_info: {
        username: 'fake',
        hostname: 'fake-host',
        platform: 'Linux',
        version: '1.3.8',
        current_display: 0,
        displays: [{ x: 0, y: 0, width: 640, height: 360, name: 'Fake Host Display', online: true, cursor_embedded: false }],
        features: { privacy_mode: false, terminal: false },
        encoding: { h264: false, h265: false, vp8: false, av1: false },
      },
    },
  },
  'test_delay (host sends)': { test_delay: { time: 1730000000000, from_client: false, last_delay: 0 } },
  'test_delay (client echo)': { test_delay: { time: 1730000000000, from_client: false, last_delay: 12 } },
  'video_frame (vp9 keyframe)': {
    video_frame: { vp9s: { frames: [{ data: Buffer.from([0x82, 0x49, 0x83, 0x42, 0x00, 0x77]), key: true }] } },
  },
  'audio_frame (opus)': { audio_frame: { data: Buffer.from([0xf8, 0xff, 0xfe]) } },
  'mouse_event': { mouse_event: { mask: 9, x: 160, y: 269, modifiers: [4] } },
  'key_event (unicode)': { key_event: { down: true, unicode: 97, mode: 0, modifiers: [] } },
  'key_event (control key)': { key_event: { down: true, control_key: 27, mode: 0, modifiers: [29] } },
  'misc (video_received)': { misc: { video_received: true } },
  'misc (audio_format)': { misc: { audio_format: { sample_rate: 48000, channels: 2 } } },
  'edge: repeated frames incl. empty': {
    video_frame: {
      vp9s: {
        frames: [
          { data: Buffer.alloc(1200, 0x5a), key: true },
          { data: Buffer.alloc(300, 0x11), key: false },
          { data: Buffer.alloc(0), key: false },
        ],
      },
    },
  },
  'edge: negative sint values': { mouse_event: { mask: 0, x: -1, y: -32768, modifiers: [] } },
  'edge: empty message': {},
};

module.exports = { rendezvous, message };
