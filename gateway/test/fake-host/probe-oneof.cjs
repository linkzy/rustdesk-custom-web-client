// Does protobufjs keep a oneof member whose value is its proto3 default?
//
// This is the check that closes the last hole in the 7 -> 8 argument. A proto3
// scalar absent from the wire means "default", but a ONEOF member has explicit
// presence: `unicode: 0` is not the same message as "no union member set". If
// 8.x dropped a default-valued oneof member, KeyEvent would decode as an empty
// union instead of "unicode = 0", which is a real behaviour change.
//
// Field-name trap: protobufjs accepts BOTH the .proto name and the camelCase
// form depending on how the Root was loaded. With { keepCase: true } (what this
// gateway's loadProtos uses) the names stay snake_case, and passing camelCase
// is silently ignored — protobufjs drops unknown keys rather than throwing, so
// a wrong-name test "passes" while proving nothing. This probe therefore
// inspects the real field names first and reports which spelling is in use.
//
//   node test/fake-host/probe-oneof.cjs
const path = require('node:path');
const { loadProtos, encodeMessage, decodeMessage } = require(
  path.join(__dirname, '..', '..', 'dist', 'utils', 'proto.js'),
);

async function main() {
  const root = await loadProtos();
  const KeyEvent = root.lookupType('KeyEvent');
  const MouseEvent = root.lookupType('MouseEvent');

  const installed = require(path.join(__dirname, '..', '..', 'node_modules', 'protobufjs', 'package.json')).version;
  console.log(`protobufjs ${installed}`);
  console.log(`KeyEvent fields: ${Object.keys(KeyEvent.fields).join(', ')}`);
  console.log(`KeyEvent oneofs: ${Object.keys(KeyEvent.oneofs || {}).join(', ')}`);
  console.log(`  union members: ${(KeyEvent.oneofs.union ? KeyEvent.oneofs.union.oneof : []).join(', ')}`);
  console.log('');

  // The spelling the loaded Root actually uses, discovered not assumed.
  // NOTE: this gateway's loadProtos uses { keepCase: true }, so fields keep
  // their .proto snake_case names. protobufjs's *default* is camelCase, so a
  // probe written against the wrong convention silently tests an undefined key
  // and "passes" while proving nothing. Match both spellings explicitly.
  const findField = (type, snake) => {
    const camel = snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    return Object.keys(type.fields).find((n) => n === snake) ?? Object.keys(type.fields).find((n) => n === camel);
  };

  const unicodeName = findField(KeyEvent, 'unicode');
  const controlKeyName = findField(KeyEvent, 'control_key');
  const chrName = findField(KeyEvent, 'chr');
  const seqName = findField(KeyEvent, 'seq');
  const modeName = findField(KeyEvent, 'mode');
  const maskName = findField(MouseEvent, 'mask');

  if (!unicodeName || !controlKeyName || !chrName || !seqName || !modeName || !maskName) {
    throw new Error(`could not resolve every field name (unicode=${unicodeName}, control_key=${controlKeyName}, chr=${chrName}, seq=${seqName}, mode=${modeName}, mask=${maskName})`);
  }
  console.log(`resolved names: unicode=${unicodeName} control_key=${controlKeyName} chr=${chrName} seq=${seqName} mode=${modeName} mask=${maskName}`);
  console.log('');

  const hex = (bytes) => Buffer.from(bytes).toString('hex');

  /** Encodes, decodes, and reports whether the union member survived. */
  function probe(label, payload, expectField) {
    const bytes = encodeMessage(root, payload);
    const decoded = decodeMessage(root, bytes);
    const keyEvent = decoded.key_event ?? decoded.mouse_event ?? {};
    const unionPresent = expectField in keyEvent;
    const value = keyEvent[expectField];
    console.log(
      `${unionPresent ? 'KEPT   ' : 'DROPPED'} ${label.padEnd(28)} hex=${hex(bytes).padEnd(22)} ` +
      `decoded.${expectField}=${JSON.stringify(value)}`,
    );
    return unionPresent;
  }

  let ok = true;

  // 1. oneof members holding their default value.
  ok = probe('oneof unicode = 0', { key_event: { down: true, [unicodeName]: 0, [modeName]: 0 } }, unicodeName) && ok;
  ok = probe('oneof control_key = 0', { key_event: { down: true, [controlKeyName]: 0, [modeName]: 0 } }, controlKeyName) && ok;
  ok = probe('oneof chr = 0', { key_event: { down: true, [chrName]: 0, [modeName]: 0 } }, chrName) && ok;
  ok = probe('oneof seq = ""', { key_event: { down: true, [seqName]: '', [modeName]: 0 } }, seqName) && ok;

  // 2. A plain (non-oneof) scalar at its default, in the same message.
  ok = probe('plain mode = 0 (not oneof)', { key_event: { down: true, [unicodeName]: 97, [modeName]: 0 } }, unicodeName) && ok;

  // 3. A plain scalar default on a different message.
  ok = probe('mouse mask = 0', { mouse_event: { [maskName]: 0, x: 5, y: 6, modifiers: [] } }, maskName) && ok;

  // 4. Show the trap explicitly: the "wrong" spelling must be ignored, so a
  //    checker knows the difference between a real pass and a meaningless one.
  const wrongSpelling = unicodeName === 'unicode'
    ? (controlKeyName === 'control_key' ? 'controlKey' : 'control_key')
    : 'unicode';
  const wrongPayload = { key_event: { down: true, [wrongSpelling]: 0, [modeName]: 0 } };
  const wrongBytes = encodeMessage(root, wrongPayload);
  const wrongDecoded = decodeMessage(root, wrongBytes);
  const wrongPresent = (KeyEvent.oneofs.union.oneof || []).some((f) => f in (wrongDecoded.key_event ?? {}));
  console.log('');
  console.log(`field-name trap: this Root uses "${unicodeName}" / "${controlKeyName}".`);
  console.log(`  encoding with the other spelling "${wrongSpelling}" -> union member set? ${wrongPresent} (must be false)`);
  console.log(`  hex with wrong spelling = ${hex(wrongBytes)}  <- shorter: the key was dropped, not encoded`);

  console.log('');
  console.log(ok && !wrongPresent ? 'RESULT: oneof presence preserved on 8.x' : 'RESULT: PROBLEM — see lines above');
  process.exit(ok && !wrongPresent ? 0 : 1);
}

main().catch((e) => {
  console.error('probe-oneof failed:', e.message);
  process.exit(1);
});
