import { createHmac } from 'crypto';
import { ChatCallService } from './chat-call.service';
import { isCallId, isCallOutcome, isMissedCallOutcome, messagePreviewText } from './chat.constants';

const service = (cfg: Record<string, unknown>) =>
  new ChatCallService({} as never, {} as never, { get: (key: string) => cfg[key] } as never);

describe('ChatCallService.getIceServers', () => {
  it('returns STUN only when no TURN is configured', () => {
    const { iceServers } = service({ 'calls.stunUrls': 'stun:a:1, stun:b:2', 'calls.turnUrls': '' }).getIceServers('u1');
    expect(iceServers).toEqual([{ urls: ['stun:a:1', 'stun:b:2'] }]);
  });

  it('uses static TURN credentials when given', () => {
    const { iceServers } = service({
      'calls.stunUrls': 'stun:a:1',
      'calls.turnUrls': 'turn:t:3478',
      'calls.turnUsername': 'user',
      'calls.turnCredential': 'pass',
    }).getIceServers('u1');
    expect(iceServers[1]).toEqual({ urls: ['turn:t:3478'], username: 'user', credential: 'pass' });
  });

  it('mints coturn REST credentials from a shared secret', () => {
    const { iceServers, ttl } = service({
      'calls.stunUrls': '',
      'calls.turnUrls': 'turn:t:3478,turns:t:5349',
      'calls.turnSecret': 's3cret',
      'calls.turnTtlSeconds': 600,
    }).getIceServers('user42');
    expect(ttl).toBe(600);
    const turn = iceServers[0];
    expect(turn.urls).toEqual(['turn:t:3478', 'turns:t:5349']);
    const [expiry, uid] = String(turn.username).split(':');
    expect(uid).toBe('user42');
    expect(Number(expiry)).toBeGreaterThan(Date.now() / 1000);
    expect(turn.credential).toBe(createHmac('sha1', 's3cret').update(String(turn.username)).digest('base64'));
  });
});

describe('call helpers', () => {
  it('validates call ids and outcomes', () => {
    expect(isCallId('0b6f2a64-7c1e-4c1b-9e2a-5f1d2c3b4a59')).toBe(true);
    expect(isCallId('x')).toBe(false);
    expect(isCallId('room:<script>')).toBe(false);
    expect(isCallOutcome('completed')).toBe(true);
    expect(isCallOutcome('exploded')).toBe(false);
  });

  it('treats unanswered calls as missed and previews them so', () => {
    expect(isMissedCallOutcome('no_answer')).toBe(true);
    expect(isMissedCallOutcome('canceled')).toBe(true);
    expect(isMissedCallOutcome('completed')).toBe(false);
    expect(messagePreviewText({ text: '', call: { type: 'audio', outcome: 'no_answer' } })).toBe('📞 مكالمة صوتية فائتة');
    expect(messagePreviewText({ text: '', call: { type: 'video', outcome: 'completed' } })).toBe('🎥 مكالمة فيديو');
  });
});
