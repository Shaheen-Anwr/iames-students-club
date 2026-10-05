'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useSocket } from '@/lib/socket-context';
import { useToast } from '@/lib/toast-context';
import { installAudioUnlock, playCallCue, startCallLoop, stopCallLoop } from '@/lib/call-sounds';
import { CallOverlay } from './CallOverlay';

export type CallType = 'audio' | 'video';
export type CallStatus = 'outgoing' | 'incoming' | 'connecting' | 'connected' | 'reconnecting' | 'ended';
export type CallEndReason =
  | 'completed'
  | 'declined'
  | 'busy'
  | 'no_answer'
  | 'canceled'
  | 'failed'
  | 'missed'
  | 'elsewhere'
  | 'permission'
  | 'unavailable';
export type CallQuality = 'good' | 'fair' | 'poor';

export interface CallPeer {
  userId: string;
  name: string;
  photoUrl?: string | null;
}

export interface CallState {
  callId: string;
  direction: 'outgoing' | 'incoming';
  peer: CallPeer;
  conversationId: string;
  /** As placed -- what the call log records. The live layout follows the media flags instead. */
  callType: CallType;
  status: CallStatus;
  /** Outgoing: one of the callee's devices is ringing. */
  ringing: boolean;
  /** Outgoing: nobody was connected to ring when the call was placed. */
  peerOffline: boolean;
  connectedAt: number | null;
  endReason: CallEndReason | null;
  minimized: boolean;
}

export interface MediaFlags {
  audio: boolean;
  video: boolean;
  screen: boolean;
}

interface CallContextValue {
  call: CallState | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  /** Bumps whenever remote tracks change, so views re-check what to render. */
  remoteVersion: number;
  local: MediaFlags;
  remote: MediaFlags;
  facingMode: 'user' | 'environment';
  quality: CallQuality | null;
  devices: MediaDeviceInfo[];
  sinkId: string;
  audioBlocked: boolean;
  canScreenShare: boolean;
  startCall: (peer: CallPeer, conversationId: string, callType: CallType) => Promise<void>;
  answerCall: (opts?: { audioOnly?: boolean }) => Promise<void>;
  declineCall: (message?: string) => void;
  endCall: () => void;
  toggleMic: () => void;
  toggleCamera: () => Promise<void>;
  switchCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  selectDevice: (kind: MediaDeviceKind, deviceId: string) => Promise<void>;
  refreshDevices: () => Promise<void>;
  setMinimized: (minimized: boolean) => void;
  dismiss: () => void;
  callAgain: () => void;
  resumeAudio: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

const NO_ANSWER_MS = 45_000;
const INCOMING_TIMEOUT_MS = 50_000;
const CONNECT_TIMEOUT_MS = 30_000;
const RECONNECT_GRACE_MS = 8_000;
const RECONNECT_GIVE_UP_MS = 25_000;
const FALLBACK_ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

const AUDIO_CONSTRAINTS: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const videoConstraints = (facingMode: 'user' | 'environment', deviceId?: string): MediaTrackConstraints => ({
  ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode }),
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30, max: 30 },
});

const NO_MEDIA: MediaFlags = { audio: false, video: false, screen: false };

function newCallId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function isPermissionError(err: unknown) {
  const name = (err as { name?: string })?.name;
  return name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError';
}

// How the caller's client reports the call into the chat (see backend ChatCallService.logCall).
function outcomeFor(reason: CallEndReason, connectedAt: number | null): string | null {
  if (connectedAt) return 'completed';
  switch (reason) {
    case 'declined':
    case 'busy':
    case 'no_answer':
    case 'canceled':
    case 'failed':
      return reason;
    default:
      return null;
  }
}

// The video sender to (re)use: the one carrying a video track, else a video transceiver whose
// sender is empty (e.g. the callee answered a video call audio-only, or a screen share ended).
function videoSender(pc: RTCPeerConnection): { sender: RTCRtpSender; transceiver?: RTCRtpTransceiver } | null {
  const withTrack = pc.getSenders().find((s) => s.track?.kind === 'video');
  if (withTrack) return { sender: withTrack };
  const transceiver = pc
    .getTransceivers()
    .find((t) => t.receiver.track?.kind === 'video' && !t.sender.track && t.currentDirection !== 'stopped');
  return transceiver ? { sender: transceiver.sender, transceiver } : null;
}

// One provider for the whole app (mounted in Providers), so a call survives navigation: the
// overlay can be minimized into a floating card while you keep using the app.
export function CallProvider({ children }: { children: React.ReactNode }) {
  const { socket } = useSocket();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [call, setCall] = useState<CallState | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteVersion, setRemoteVersion] = useState(0);
  const [local, setLocal] = useState<MediaFlags>(NO_MEDIA);
  const [remote, setRemote] = useState<MediaFlags>(NO_MEDIA);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [quality, setQuality] = useState<CallQuality | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [sinkId, setSinkId] = useState('');
  const [audioBlocked, setAudioBlocked] = useState(false);

  const callRef = useRef<CallState | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localFlagsRef = useRef<MediaFlags>(NO_MEDIA);
  const facingRef = useRef<'user' | 'environment'>('user');
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const negotiation = useRef({ ready: false, makingOffer: false, polite: false, restarted: false });
  const timers = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  const statsTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const statsPrev = useRef<{ lost: number; received: number } | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const iceCache = useRef<{ servers: RTCIceServer[]; at: number } | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const titleFlash = useRef<{ timer: ReturnType<typeof setInterval>; original: string } | null>(null);
  const lastCallRef = useRef<{ peer: CallPeer; conversationId: string; callType: CallType } | null>(null);
  const awaitingAck = useRef<string | null>(null);
  const remoteStateReceived = useRef(false);
  const socketRef = useRef(socket);
  socketRef.current = socket;

  const canScreenShare =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices;

  // ---------------------------------------------------------------------------------------------
  // small helpers

  const commit = useCallback((next: CallState | null) => {
    callRef.current = next;
    setCall(next);
  }, []);

  const patch = useCallback(
    (p: Partial<CallState>) => {
      const cur = callRef.current;
      if (cur) commit({ ...cur, ...p });
    },
    [commit],
  );

  const clearTimer = (name: string) => {
    const t = timers.current[name];
    if (t) clearTimeout(t);
    timers.current[name] = null;
  };

  const setTimer = (name: string, ms: number, fn: () => void) => {
    clearTimer(name);
    timers.current[name] = setTimeout(() => {
      timers.current[name] = null;
      fn();
    }, ms);
  };

  const setLocalFlags = (flags: MediaFlags) => {
    localFlagsRef.current = flags;
    setLocal(flags);
  };

  const publishLocalStream = () => {
    const stream = localStreamRef.current;
    // A new MediaStream object (same tracks) so views bound to it re-render.
    setLocalStream(stream ? new MediaStream(stream.getTracks()) : null);
  };

  const emitMediaState = useCallback((flags: MediaFlags) => {
    const cur = callRef.current;
    if (!cur) return;
    socketRef.current?.emit('callMediaState', { callId: cur.callId, toUserId: cur.peer.userId, ...flags });
  }, []);

  const stopTitleFlash = () => {
    if (!titleFlash.current) return;
    clearInterval(titleFlash.current.timer);
    document.title = titleFlash.current.original;
    titleFlash.current = null;
  };

  const closeIncomingNotification = (callId: string) => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
    void navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.getNotifications({ tag: `call-${callId}` }))
      .then((list) => list?.forEach((n) => n.close()))
      .catch(() => undefined);
  };

  // A backgrounded tab still has to get the user's attention: flash the title and, when push
  // permission was granted, raise a system notification that focuses the tab when tapped.
  const announceIncoming = (callId: string, name: string, type: CallType) => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') return;
    const text = `📞 ${name} يتصل بك…`;
    if (!titleFlash.current) {
      const original = document.title;
      let on = false;
      titleFlash.current = {
        original,
        timer: setInterval(() => {
          on = !on;
          document.title = on ? text : original;
        }, 1000),
      };
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && navigator.serviceWorker) {
      void navigator.serviceWorker
        .getRegistration()
        .then((reg) =>
          reg?.showNotification(`${name} يتصل بك`, {
            body: type === 'video' ? 'مكالمة فيديو واردة — اضغط للرد' : 'مكالمة صوتية واردة — اضغط للرد',
            tag: `call-${callId}`,
            requireInteraction: true,
            data: { url: window.location.href },
            icon: '/icons/icon-192.png',
          }),
        )
        .catch(() => undefined);
    }
  };

  const iceServers = async (): Promise<RTCIceServer[]> => {
    const cached = iceCache.current;
    if (cached && Date.now() - cached.at < 10 * 60_000) return cached.servers;
    try {
      const res = await api.get<{ iceServers: RTCIceServer[] }>('/chat/calls/ice-servers');
      const servers = res.iceServers?.length ? res.iceServers : FALLBACK_ICE;
      iceCache.current = { servers, at: Date.now() };
      return servers;
    } catch {
      return FALLBACK_ICE;
    }
  };

  const refreshDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      setDevices(await navigator.mediaDevices.enumerateDevices());
    } catch {
      /* ignore */
    }
  }, []);

  const playRemoteAudio = useCallback(() => {
    const el = remoteAudioRef.current;
    if (!el) return;
    if (el.srcObject !== remoteStreamRef.current) el.srcObject = remoteStreamRef.current;
    if (!remoteStreamRef.current) return;
    void el
      .play()
      .then(() => setAudioBlocked(false))
      .catch(() => setAudioBlocked(true));
  }, []);

  // ---------------------------------------------------------------------------------------------
  // teardown / finish

  const stopStats = () => {
    if (statsTimer.current) clearInterval(statsTimer.current);
    statsTimer.current = null;
    statsPrev.current = null;
    setQuality(null);
  };

  const teardownMedia = useCallback(() => {
    Object.keys(timers.current).forEach((k) => k !== 'ended' && clearTimer(k));
    stopStats();
    awaitingAck.current = null;
    const pc = pcRef.current;
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.onnegotiationneeded = null;
      pc.close();
    }
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenTrackRef.current?.stop();
    cameraTrackRef.current?.stop();
    localStreamRef.current = null;
    screenTrackRef.current = null;
    cameraTrackRef.current = null;
    remoteStreamRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    setLocalStream(null);
    setRemoteStream(null);
    setLocalFlags(NO_MEDIA);
    setRemote(NO_MEDIA);
    remoteStateReceived.current = false;
    setAudioBlocked(false);
    pendingOfferRef.current = null;
    pendingIceRef.current = [];
    negotiation.current = { ready: false, makingOffer: false, polite: false, restarted: false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = useCallback(
    (reason: CallEndReason, { notifyPeer = false }: { notifyPeer?: boolean } = {}) => {
      const cur = callRef.current;
      if (!cur || cur.status === 'ended') return;
      stopCallLoop();
      stopTitleFlash();
      closeIncomingNotification(cur.callId);
      const s = socketRef.current;
      if (notifyPeer) s?.emit('endCall', { callId: cur.callId, toUserId: cur.peer.userId });

      // The caller's client writes the call into the chat ("مكالمة صوتية · 3:24" / "فائتة").
      if (cur.direction === 'outgoing') {
        const outcome = outcomeFor(reason, cur.connectedAt);
        if (outcome) {
          s?.emit('callLog', {
            callId: cur.callId,
            conversationId: cur.conversationId,
            callType: cur.callType,
            outcome,
            duration: cur.connectedAt ? Math.round((Date.now() - cur.connectedAt) / 1000) : 0,
          });
        }
      }

      teardownMedia();
      if (reason === 'elsewhere') {
        commit(null);
        return;
      }
      playCallCue(reason === 'busy' ? 'busy' : 'ended');
      commit({ ...cur, status: 'ended', endReason: reason, minimized: false });
      setTimer('ended', reason === 'completed' || reason === 'missed' ? 2600 : 4200, () => {
        if (callRef.current?.callId === cur.callId) commit(null);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit, teardownMedia],
  );

  // ---------------------------------------------------------------------------------------------
  // media + peer connection

  const attachLocal = (stream: MediaStream, flags: MediaFlags) => {
    localStreamRef.current = stream;
    publishLocalStream();
    setLocalFlags(flags);
    void refreshDevices();
  };

  // The mic is required; the camera is best-effort (a video call falls back to audio, with a note).
  const getMedia = async (wantVideo: boolean): Promise<{ stream: MediaStream; video: boolean }> => {
    if (wantVideo) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: videoConstraints('user') });
        facingRef.current = 'user';
        setFacingMode('user');
        return { stream, video: true };
      } catch (err) {
        if (isPermissionError(err)) {
          // Maybe only the camera was refused -- try the mic alone before giving up.
          const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
          showToast('لم يُسمح باستخدام الكاميرا — ستكون المكالمة صوتية.', 'error');
          return { stream, video: false };
        }
        showToast('تعذّر تشغيل الكاميرا — ستكون المكالمة صوتية.', 'error');
      }
    }
    return { stream: await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS }), video: false };
  };

  const mediaErrorMessage = (err: unknown) =>
    isPermissionError(err)
      ? 'اسمح للمتصفح باستخدام الميكروفون لإجراء المكالمات (من إعدادات الموقع).'
      : 'تعذّر الوصول إلى الميكروفون. تأكد من توصيله وأنه غير مستخدم في تطبيق آخر.';

  const drainIce = async (pc: RTCPeerConnection) => {
    const queued = pendingIceRef.current;
    pendingIceRef.current = [];
    for (const candidate of queued) await pc.addIceCandidate(candidate).catch(() => undefined);
  };

  // Network quality from the selected candidate pair's RTT and inbound audio packet loss.
  const startStats = (pc: RTCPeerConnection) => {
    if (statsTimer.current) return;
    statsTimer.current = setInterval(async () => {
      if (pcRef.current !== pc) return;
      try {
        const report = await pc.getStats();
        let rtt: number | null = null;
        let lost = 0;
        let received = 0;
        report.forEach((r) => {
          if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected)) {
            if (typeof r.currentRoundTripTime === 'number') rtt = r.currentRoundTripTime;
          }
          if (r.type === 'inbound-rtp' && r.kind === 'audio') {
            lost += r.packetsLost ?? 0;
            received += r.packetsReceived ?? 0;
          }
        });
        const prev = statsPrev.current;
        statsPrev.current = { lost, received };
        const dLost = prev ? Math.max(0, lost - prev.lost) : 0;
        const dReceived = prev ? Math.max(0, received - prev.received) : 0;
        const lossPct = dLost + dReceived > 0 ? (dLost / (dLost + dReceived)) * 100 : 0;
        if (rtt === null) return;
        const r: number = rtt;
        setQuality(r < 0.25 && lossPct < 2 ? 'good' : r < 0.6 && lossPct < 8 ? 'fair' : 'poor');
      } catch {
        /* stats are best-effort */
      }
    }, 2000);
  };

  const onConnectionState = (pc: RTCPeerConnection) => {
    const cur = callRef.current;
    if (!cur || pcRef.current !== pc || cur.status === 'ended') return;
    const state = pc.connectionState;
    if (state === 'connected') {
      clearTimer('connect');
      clearTimer('reconnect');
      clearTimer('giveUp');
      negotiation.current.restarted = false;
      if (cur.status !== 'connected') {
        if (!cur.connectedAt) playCallCue('connected');
        patch({ status: 'connected', connectedAt: cur.connectedAt ?? Date.now() });
      }
      // Until the other side's first media-state report arrives, assume what the call type implies.
      if (!remoteStateReceived.current) setRemote({ audio: true, video: cur.callType === 'video', screen: false });
      startStats(pc);
      emitMediaState(localFlagsRef.current);
      return;
    }
    if (state === 'disconnected' || state === 'failed') {
      if (cur.status === 'connected') patch({ status: 'reconnecting' });
      // Let the network come back by itself first; then the caller (impolite side) restarts ICE.
      const restart = () => {
        if (pcRef.current !== pc || pc.connectionState === 'connected') return;
        if (!negotiation.current.polite && !negotiation.current.restarted) {
          negotiation.current.restarted = true;
          try {
            pc.restartIce();
          } catch {
            /* older browser: the give-up timer handles it */
          }
        }
      };
      if (state === 'failed') restart();
      else if (!timers.current.reconnect) setTimer('reconnect', RECONNECT_GRACE_MS, restart);
      if (!timers.current.giveUp) {
        setTimer('giveUp', RECONNECT_GIVE_UP_MS, () => {
          if (pcRef.current === pc && pc.connectionState !== 'connected') {
            showToast('انقطع الاتصال بالمكالمة.', 'error');
            finish('failed', { notifyPeer: true });
          }
        });
      }
    }
  };

  const createPeer = async (callId: string, peerUserId: string): Promise<RTCPeerConnection> => {
    const pc = new RTCPeerConnection({ iceServers: await iceServers(), iceCandidatePoolSize: 2 });
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socketRef.current?.emit('iceCandidate', { callId, toUserId: peerUserId, candidate: e.candidate.toJSON() });
      }
    };
    pc.ontrack = (e) => {
      const stream = remoteStreamRef.current ?? new MediaStream();
      remoteStreamRef.current = stream;
      if (!stream.getTracks().includes(e.track)) stream.addTrack(e.track);
      const bump = () => setRemoteVersion((v) => v + 1);
      e.track.onended = () => {
        stream.removeTrack(e.track);
        bump();
      };
      e.track.onmute = bump;
      e.track.onunmute = bump;
      setRemoteStream(stream);
      bump();
      if (e.track.kind === 'audio') playRemoteAudio();
    };
    pc.onconnectionstatechange = () => onConnectionState(pc);
    // Perfect negotiation: after the initial offer/answer, any change (video upgrade, screen share,
    // ICE restart) renegotiates through 'callRenegotiate'. The callee is the polite peer.
    pc.onnegotiationneeded = async () => {
      if (!negotiation.current.ready || pcRef.current !== pc) return;
      try {
        negotiation.current.makingOffer = true;
        await pc.setLocalDescription();
        socketRef.current?.emit('callRenegotiate', { callId, toUserId: peerUserId, description: pc.localDescription });
      } catch {
        /* a collision the polite side resolves */
      } finally {
        negotiation.current.makingOffer = false;
      }
    };
    return pc;
  };

  // Puts `next` on the video sender (or adds one, which renegotiates).
  const sendVideoTrack = async (next: MediaStreamTrack | null) => {
    const pc = pcRef.current;
    const stream = localStreamRef.current;
    if (!pc || !stream) return;
    const found = videoSender(pc);
    if (found) {
      await found.sender.replaceTrack(next);
      if (next && found.transceiver && (found.transceiver.direction === 'recvonly' || found.transceiver.direction === 'inactive')) {
        found.transceiver.direction = 'sendrecv';
      }
    } else if (next) {
      pc.addTrack(next, stream);
    }
  };

  // ---------------------------------------------------------------------------------------------
  // call actions

  const startCall = useCallback(
    async (peer: CallPeer, conversationId: string, callType: CallType) => {
      const s = socketRef.current;
      if (!s || !user) {
        showToast('لا يوجد اتصال بالخادم الآن — حاول بعد لحظات.', 'error');
        return;
      }
      const cur = callRef.current;
      if (cur && cur.status !== 'ended') {
        showToast('أنت في مكالمة بالفعل.', 'error');
        return;
      }
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
        showToast('المكالمات تتطلب متصفحًا حديثًا واتصالًا آمنًا (HTTPS).', 'error');
        return;
      }
      clearTimer('ended');
      const callId = newCallId();
      lastCallRef.current = { peer, conversationId, callType };
      commit({
        callId,
        direction: 'outgoing',
        peer,
        conversationId,
        callType,
        status: 'outgoing',
        ringing: false,
        peerOffline: false,
        connectedAt: null,
        endReason: null,
        minimized: false,
      });

      let media: { stream: MediaStream; video: boolean };
      try {
        media = await getMedia(callType === 'video');
      } catch (err) {
        showToast(mediaErrorMessage(err), 'error');
        finish('permission');
        return;
      }
      if (callRef.current?.callId !== callId) {
        media.stream.getTracks().forEach((t) => t.stop());
        return;
      }
      attachLocal(media.stream, { audio: true, video: media.video, screen: false });
      if (!media.video && callType === 'video') patch({ callType: 'audio' });

      negotiation.current = { ready: false, makingOffer: false, polite: false, restarted: false };
      const pc = await createPeer(callId, peer.userId);
      if (callRef.current?.callId !== callId) {
        pc.close();
        return;
      }
      pcRef.current = pc;
      media.stream.getTracks().forEach((track) => pc.addTrack(track, media.stream));
      await pc.setLocalDescription(await pc.createOffer());

      // The server acks a valid call; a refused one (blocked, not a DM...) raises an 'exception'
      // (shown as a toast by the socket layer) and never acks.
      awaitingAck.current = callId;
      setTimer('ack', 8000, () => {
        if (callRef.current?.callId === callId && callRef.current.status === 'outgoing') finish('unavailable');
      });
      s.emit(
        'callUser',
        {
          callId,
          toUserId: peer.userId,
          conversationId,
          offer: pc.localDescription,
          callType: media.video ? 'video' : 'audio',
        },
        (ack: { ok?: boolean; online?: boolean } | undefined) => {
          if (callRef.current?.callId !== callId) return;
          awaitingAck.current = null;
          clearTimer('ack');
          if (ack?.online === false) patch({ peerOffline: true });
        },
      );
      startCallLoop('ringback');
      setTimer('noAnswer', NO_ANSWER_MS, () => {
        if (callRef.current?.callId === callId && callRef.current.status === 'outgoing') finish('no_answer', { notifyPeer: true });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, commit, patch, finish, showToast],
  );

  const answerCall = useCallback(
    async (opts: { audioOnly?: boolean } = {}) => {
      const cur = callRef.current;
      const offer = pendingOfferRef.current;
      const s = socketRef.current;
      if (!cur || cur.status !== 'incoming' || !offer || !s) return;
      stopCallLoop();
      stopTitleFlash();
      closeIncomingNotification(cur.callId);
      clearTimer('incoming');
      patch({ status: 'connecting', ringing: false });

      let media: { stream: MediaStream; video: boolean };
      try {
        media = await getMedia(cur.callType === 'video' && !opts.audioOnly);
      } catch (err) {
        showToast(mediaErrorMessage(err), 'error');
        s.emit('rejectCall', { callId: cur.callId, toUserId: cur.peer.userId, reason: 'declined' });
        finish('permission');
        return;
      }
      if (callRef.current?.callId !== cur.callId) {
        media.stream.getTracks().forEach((t) => t.stop());
        return;
      }
      attachLocal(media.stream, { audio: true, video: media.video, screen: false });

      negotiation.current = { ready: false, makingOffer: false, polite: true, restarted: false };
      const pc = await createPeer(cur.callId, cur.peer.userId);
      pcRef.current = pc;
      try {
        // Remote description first, so our tracks attach to the offer's transceivers.
        await pc.setRemoteDescription(offer);
        media.stream.getTracks().forEach((track) => pc.addTrack(track, media.stream));
        await drainIce(pc);
        await pc.setLocalDescription(await pc.createAnswer());
      } catch {
        showToast('تعذّر بدء المكالمة.', 'error');
        finish('failed', { notifyPeer: true });
        return;
      }
      s.emit('answerCall', { callId: cur.callId, toUserId: cur.peer.userId, answer: pc.localDescription });
      negotiation.current.ready = true;
      setTimer('connect', CONNECT_TIMEOUT_MS, () => {
        if (pcRef.current === pc && callRef.current?.status === 'connecting') {
          showToast('تعذّر إنشاء الاتصال — قد تمنع الشبكة المكالمات المباشرة.', 'error');
          finish('failed', { notifyPeer: true });
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patch, finish, showToast],
  );

  const declineCall = useCallback(
    (message?: string) => {
      const cur = callRef.current;
      const s = socketRef.current;
      if (!cur || cur.status !== 'incoming' || !s) return;
      s.emit('rejectCall', { callId: cur.callId, toUserId: cur.peer.userId, reason: 'declined' });
      if (message?.trim()) s.emit('sendMessage', { conversationId: cur.conversationId, text: message.trim() });
      finish('declined');
    },
    [finish],
  );

  const endCall = useCallback(() => {
    const cur = callRef.current;
    if (!cur || cur.status === 'ended') return;
    if (cur.status === 'incoming') {
      declineCall();
      return;
    }
    finish(cur.status === 'outgoing' ? 'canceled' : 'completed', { notifyPeer: true });
  }, [finish, declineCall]);

  const toggleMic = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const flags = { ...localFlagsRef.current, audio: track.enabled };
    setLocalFlags(flags);
    emitMediaState(flags);
  }, [emitMediaState]);

  // Camera off = the track is disabled (black frames, no renegotiation) and the other side shows
  // the avatar instead. Camera on in an audio-only call adds a video track -> upgrades to video.
  const toggleCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream || !pcRef.current) return;
    if (localFlagsRef.current.screen) return;
    const existing = stream.getVideoTracks()[0];
    if (existing && existing.readyState === 'live') {
      existing.enabled = !existing.enabled;
      const flags = { ...localFlagsRef.current, video: existing.enabled };
      setLocalFlags(flags);
      emitMediaState(flags);
      publishLocalStream();
      return;
    }
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(facingRef.current) });
      const track = cam.getVideoTracks()[0];
      stream.addTrack(track);
      await sendVideoTrack(track);
      publishLocalStream();
      const flags = { ...localFlagsRef.current, video: true };
      setLocalFlags(flags);
      emitMediaState(flags);
      void refreshDevices();
    } catch (err) {
      showToast(isPermissionError(err) ? 'لم يُسمح باستخدام الكاميرا.' : 'تعذّر تشغيل الكاميرا.', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emitMediaState, refreshDevices, showToast]);

  const switchCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    const current = stream?.getVideoTracks()[0];
    if (!stream || !current || localFlagsRef.current.screen) return;
    const next: 'user' | 'environment' = facingRef.current === 'user' ? 'environment' : 'user';
    try {
      const fresh = await navigator.mediaDevices
        .getUserMedia({ video: { ...videoConstraints(next), facingMode: { exact: next } } })
        .catch(() => navigator.mediaDevices.getUserMedia({ video: videoConstraints(next) }));
      const track = fresh.getVideoTracks()[0];
      track.enabled = current.enabled;
      await sendVideoTrack(track);
      stream.removeTrack(current);
      current.stop();
      stream.addTrack(track);
      publishLocalStream();
      facingRef.current = next;
      setFacingMode(next);
    } catch {
      showToast('لا توجد كاميرا أخرى متاحة.', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast]);

  const stopScreenShare = useCallback(async () => {
    const screen = screenTrackRef.current;
    const stream = localStreamRef.current;
    if (!screen) return;
    screenTrackRef.current = null;
    screen.onended = null;
    const camera = cameraTrackRef.current;
    cameraTrackRef.current = null;
    const cameraLive = !!camera && camera.readyState === 'live';
    await sendVideoTrack(cameraLive ? camera : null).catch(() => undefined);
    screen.stop();
    if (stream) {
      stream.removeTrack(screen);
      if (cameraLive && !stream.getTracks().includes(camera!)) stream.addTrack(camera!);
    }
    publishLocalStream();
    const flags = { ...localFlagsRef.current, screen: false, video: cameraLive && camera!.enabled };
    setLocalFlags(flags);
    emitMediaState(flags);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emitMediaState]);

  const toggleScreenShare = useCallback(async () => {
    if (screenTrackRef.current) {
      await stopScreenShare();
      return;
    }
    const stream = localStreamRef.current;
    if (!stream || !pcRef.current || !navigator.mediaDevices?.getDisplayMedia) return;
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15 } }, audio: false });
      const screen = display.getVideoTracks()[0];
      const camera = stream.getVideoTracks()[0] ?? null;
      cameraTrackRef.current = camera;
      screenTrackRef.current = screen;
      await sendVideoTrack(screen);
      if (camera) stream.removeTrack(camera);
      stream.addTrack(screen);
      publishLocalStream();
      // The browser's own "Stop sharing" button ends the track.
      screen.onended = () => void stopScreenShare();
      const flags = { ...localFlagsRef.current, screen: true, video: true };
      setLocalFlags(flags);
      emitMediaState(flags);
    } catch (err) {
      if (!isPermissionError(err)) showToast('تعذّرت مشاركة الشاشة.', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emitMediaState, showToast, stopScreenShare]);

  const selectDevice = useCallback(
    async (kind: MediaDeviceKind, deviceId: string) => {
      const stream = localStreamRef.current;
      const pc = pcRef.current;
      try {
        if (kind === 'audiooutput') {
          const el = remoteAudioRef.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
          if (el?.setSinkId) {
            await el.setSinkId(deviceId);
            setSinkId(deviceId);
          }
          return;
        }
        if (!stream || !pc) return;
        if (kind === 'audioinput') {
          const old = stream.getAudioTracks()[0];
          const fresh = await navigator.mediaDevices.getUserMedia({ audio: { ...AUDIO_CONSTRAINTS, deviceId: { exact: deviceId } } });
          const track = fresh.getAudioTracks()[0];
          track.enabled = old?.enabled ?? true;
          await pc.getSenders().find((s) => s.track?.kind === 'audio')?.replaceTrack(track);
          if (old) {
            stream.removeTrack(old);
            old.stop();
          }
          stream.addTrack(track);
        } else if (kind === 'videoinput' && !localFlagsRef.current.screen) {
          const old = stream.getVideoTracks()[0];
          const fresh = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(facingRef.current, deviceId) });
          const track = fresh.getVideoTracks()[0];
          track.enabled = old?.enabled ?? true;
          await sendVideoTrack(track);
          if (old) {
            stream.removeTrack(old);
            old.stop();
          }
          stream.addTrack(track);
        }
        publishLocalStream();
      } catch {
        showToast('تعذّر التبديل إلى هذا الجهاز.', 'error');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showToast],
  );

  const setMinimized = useCallback((minimized: boolean) => patch({ minimized }), [patch]);

  const dismiss = useCallback(() => {
    clearTimer('ended');
    if (callRef.current?.status === 'ended') commit(null);
  }, [commit]);

  const callAgain = useCallback(() => {
    const cur = callRef.current;
    const target = cur ? { peer: cur.peer, conversationId: cur.conversationId, callType: cur.callType } : lastCallRef.current;
    if (!target) return;
    clearTimer('ended');
    commit(null);
    void startCall(target.peer, target.conversationId, target.callType);
  }, [commit, startCall]);

  // ---------------------------------------------------------------------------------------------
  // socket signaling

  useEffect(() => {
    installAudioUnlock();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const mine = (p: { callId?: string } | null | undefined) => !!p && !!callRef.current && p.callId === callRef.current.callId;

    const onIncoming = (p: {
      callId: string;
      fromUserId: string;
      fromUser?: { userId: string; name: string; photoUrl?: string | null };
      conversationId: string;
      offer: RTCSessionDescriptionInit;
      callType: CallType;
    }) => {
      if (!p?.callId || !p.offer) return;
      const cur = callRef.current;
      if (cur && cur.status !== 'ended') {
        if (cur.callId === p.callId) return;
        socket.emit('rejectCall', { callId: p.callId, toUserId: p.fromUserId, reason: 'busy' });
        showToast(`اتصل بك ${p.fromUser?.name ?? 'مستخدم'} أثناء مكالمتك الحالية.`);
        return;
      }
      clearTimer('ended');
      pendingOfferRef.current = p.offer;
      pendingIceRef.current = [];
      const peer = { userId: p.fromUserId, name: p.fromUser?.name ?? 'مستخدم', photoUrl: p.fromUser?.photoUrl ?? null };
      const callType: CallType = p.callType === 'video' ? 'video' : 'audio';
      lastCallRef.current = { peer, conversationId: p.conversationId, callType };
      commit({
        callId: p.callId,
        direction: 'incoming',
        peer,
        conversationId: p.conversationId,
        callType,
        status: 'incoming',
        ringing: true,
        peerOffline: false,
        connectedAt: null,
        endReason: null,
        minimized: false,
      });
      socket.emit('callRinging', { callId: p.callId, toUserId: p.fromUserId });
      startCallLoop('ringtone');
      announceIncoming(p.callId, peer.name, callType);
      setTimer('incoming', INCOMING_TIMEOUT_MS, () => {
        if (callRef.current?.callId === p.callId && callRef.current.status === 'incoming') finish('missed');
      });
    };

    const onRinging = (p: { callId: string }) => {
      if (mine(p) && callRef.current?.status === 'outgoing') patch({ ringing: true, peerOffline: false });
    };

    const onPeerOffline = (p: { callId: string }) => {
      if (mine(p)) patch({ peerOffline: true });
    };

    const onAnswered = async (p: { callId: string; answer: RTCSessionDescriptionInit }) => {
      if (!mine(p) || callRef.current?.status !== 'outgoing') return;
      const pc = pcRef.current;
      if (!pc) return;
      stopCallLoop();
      clearTimer('noAnswer');
      clearTimer('ack');
      patch({ status: 'connecting', ringing: false });
      try {
        await pc.setRemoteDescription(p.answer);
        await drainIce(pc);
        negotiation.current.ready = true;
      } catch {
        finish('failed', { notifyPeer: true });
        return;
      }
      setTimer('connect', CONNECT_TIMEOUT_MS, () => {
        if (pcRef.current === pc && callRef.current?.status === 'connecting') {
          showToast('تعذّر إنشاء الاتصال — قد تمنع الشبكة المكالمات المباشرة.', 'error');
          finish('failed', { notifyPeer: true });
        }
      });
    };

    const onIce = async (p: { callId: string; candidate: RTCIceCandidateInit }) => {
      if (!mine(p) || !p.candidate) return;
      const pc = pcRef.current;
      if (pc?.remoteDescription) await pc.addIceCandidate(p.candidate).catch(() => undefined);
      else pendingIceRef.current.push(p.candidate);
    };

    const onRenegotiate = async (p: { callId: string; description: RTCSessionDescriptionInit }) => {
      const pc = pcRef.current;
      const cur = callRef.current;
      if (!mine(p) || !pc || !cur || !p.description) return;
      const n = negotiation.current;
      const collision = p.description.type === 'offer' && (n.makingOffer || pc.signalingState !== 'stable');
      if (!n.polite && collision) return; // the impolite side ignores a colliding offer
      try {
        await pc.setRemoteDescription(p.description);
        if (p.description.type === 'offer') {
          await pc.setLocalDescription();
          socket.emit('callRenegotiate', { callId: cur.callId, toUserId: cur.peer.userId, description: pc.localDescription });
        }
      } catch {
        /* the next negotiation round recovers */
      }
    };

    const onMediaState = (p: { callId: string; audio: boolean; video: boolean; screen: boolean }) => {
      if (!mine(p)) return;
      remoteStateReceived.current = true;
      setRemote({ audio: !!p.audio, video: !!p.video, screen: !!p.screen });
    };

    const onRejected = (p: { callId: string; reason?: string }) => {
      if (mine(p)) finish(p.reason === 'busy' ? 'busy' : 'declined');
    };

    const onEnded = (p: { callId: string }) => {
      const cur = callRef.current;
      if (!mine(p) || !cur) return;
      finish(
        cur.status === 'incoming'
          ? 'missed'
          : cur.connectedAt
            ? 'completed'
            : cur.direction === 'outgoing'
              ? 'failed'
              : 'missed',
      );
    };

    const onElsewhere = (p: { callId: string }) => {
      if (mine(p) && callRef.current?.status === 'incoming') finish('elsewhere');
    };

    // A refused callUser surfaces as a generic 'exception' (and never acks) -- end that attempt now
    // instead of letting it ring into the void.
    const onException = () => {
      const cur = callRef.current;
      if (cur && awaitingAck.current === cur.callId && cur.status === 'outgoing') {
        awaitingAck.current = null;
        finish('unavailable');
      }
    };

    socket.on('incomingCall', onIncoming);
    socket.on('callRinging', onRinging);
    socket.on('callPeerOffline', onPeerOffline);
    socket.on('callAnswered', onAnswered);
    socket.on('iceCandidate', onIce);
    socket.on('callRenegotiate', onRenegotiate);
    socket.on('callMediaState', onMediaState);
    socket.on('callRejected', onRejected);
    socket.on('callEnded', onEnded);
    socket.on('callHandledElsewhere', onElsewhere);
    socket.on('exception', onException);
    return () => {
      socket.off('incomingCall', onIncoming);
      socket.off('callRinging', onRinging);
      socket.off('callPeerOffline', onPeerOffline);
      socket.off('callAnswered', onAnswered);
      socket.off('iceCandidate', onIce);
      socket.off('callRenegotiate', onRenegotiate);
      socket.off('callMediaState', onMediaState);
      socket.off('callRejected', onRejected);
      socket.off('callEnded', onEnded);
      socket.off('callHandledElsewhere', onElsewhere);
      socket.off('exception', onException);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, commit, patch, finish, showToast]);

  // Closing/refreshing the tab mid-call hangs up cleanly (the other side isn't left on a frozen
  // call), and asks for confirmation first while connected.
  useEffect(() => {
    const onPageHide = () => {
      const cur = callRef.current;
      if (!cur || cur.status === 'ended') return;
      if (cur.status === 'incoming') {
        socketRef.current?.emit('rejectCall', { callId: cur.callId, toUserId: cur.peer.userId, reason: 'declined' });
      } else {
        socketRef.current?.emit('endCall', { callId: cur.callId, toUserId: cur.peer.userId });
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const status = callRef.current?.status;
      if (status === 'connected' || status === 'reconnecting') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.addEventListener) return;
    const onChange = () => void refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange);
  }, [refreshDevices]);

  // Signed out mid-call: hang up.
  useEffect(() => {
    if (!user && callRef.current) finish('canceled', { notifyPeer: true });
  }, [user, finish]);

  const value = useMemo<CallContextValue>(
    () => ({
      call,
      localStream,
      remoteStream,
      remoteVersion,
      local,
      remote,
      facingMode,
      quality,
      devices,
      sinkId,
      audioBlocked,
      canScreenShare,
      startCall,
      answerCall,
      declineCall,
      endCall,
      toggleMic,
      toggleCamera,
      switchCamera,
      toggleScreenShare,
      selectDevice,
      refreshDevices,
      setMinimized,
      dismiss,
      callAgain,
      resumeAudio: playRemoteAudio,
    }),
    [
      call,
      localStream,
      remoteStream,
      remoteVersion,
      local,
      remote,
      facingMode,
      quality,
      devices,
      sinkId,
      audioBlocked,
      canScreenShare,
      startCall,
      answerCall,
      declineCall,
      endCall,
      toggleMic,
      toggleCamera,
      switchCamera,
      toggleScreenShare,
      selectDevice,
      refreshDevices,
      setMinimized,
      dismiss,
      callAgain,
      playRemoteAudio,
    ],
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      {/* Remote audio always plays from here (never from <video>, which stays muted): one source,
          no echo, and it keeps playing while the call UI is minimized. */}
      <audio ref={remoteAudioRef} autoPlay className="hidden" />
      <CallOverlay />
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}
