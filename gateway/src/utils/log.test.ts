import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatLog, log } from './log';

describe('formatLog', () => {
  it('renders level, fields and quoted msg in one line', () => {
    expect(formatLog('INFO', '[session] login successful', { session: '7f3a', target: '123456789' }))
      .toBe('INFO session=7f3a target=123456789 msg="[session] login successful"');
  });

  it('quotes values with spaces and skips missing fields', () => {
    expect(formatLog('WARN', 'x', { session: 'ab12', reason: 'host closed', missing: undefined }))
      .toBe('WARN session=ab12 reason="host closed" msg="x"');
  });
});

describe('log', () => {
  afterEach(() => vi.restoreAllMocks());

  it('routes ERROR to console.error and INFO to console.log', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    log('ERROR', '[rendezvous] failed', { session: '7f3a' });
    log('INFO', '[session] ok');
    expect(err).toHaveBeenCalledWith('ERROR session=7f3a msg="[rendezvous] failed"');
    expect(out).toHaveBeenCalledWith('INFO msg="[session] ok"');
  });
});
