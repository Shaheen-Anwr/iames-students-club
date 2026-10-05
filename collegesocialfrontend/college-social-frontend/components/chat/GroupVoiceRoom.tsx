'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Headphones, Loader2, Mic, MicOff, PhoneOff } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { api } from '@/lib/api';
import { useSocket } from '@/lib/socket-context';
import { useToast } from '@/lib/toast-context';
import { haptic } from '@/lib/haptics';
import { assetUrl, cn } from '@/lib/utils';
import { useCall } from './CallProvider';

interface VoiceParticipant {
  userId: string;
  socketId: string;
  name: string;
  photoUrl: string | null;
  muted: boolean;
}

interface VoiceState {
  conversationId: string;
  capacity: number;
  participants: VoiceParticipant[];
}

type Ack = { ok?: boolean; error?: string } & Partial<VoiceState>;

const FALLBACK_ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const HEARTBEAT_MS = 20_000;
const SPEAKING_LEVEL = 0.045;

// A group chat's voice room ("غرفة صوتية"): an always-available audio hangout for up to 8 members
// -- study together, talk through an assignment. Audio flows peer-to-peer (a mesh: every member
// connects to every other), so there's no media server to run; the chat socket only relays the
// WebRTC handshake and holds the seat list (server-side leases, renewed by a heartbeat). Of each
// pair, the member with the lower socket id makes the offer, so exactly one side ever does.
export function GroupVoiceRoom({ conversationId, joinSignal }: { conversationId: string; joinSignal: number }) {
  const { socket } = useSocket();
  const { showToast } = useToast();
  const { call } = useCall();
  const [state, setState] = useState<VoiceState | null>(null);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());

  const localStream = useRef<MediaStream | null>(null);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const audios = useRef(new Map<string, HTMLAudioElement>());
  const analysers = useRef(new Map<string, AnalyserNode>());
  const audioCtx = useRef<AudioContext | null>(null);
  const iceServers = useRef<RTCIceServer[] | null>(null);
  const joinedRef = useRef(false);
  joinedRef.current = joined;

  const emit = useCallback(
    (event: string, payload: object): Promise<Ack> =>
      new Promise((resolve) => {
        if (!socket?.connected) {
          resolve({ ok: false, error: 'لا يوجد اتصال الآن' });
          return;
        }
        socket.timeout(10_000).emit(event, payload, (err: Error | null, ack?: Ack) =>
          resolve(err ? { ok: false, error: 'انتهت مهلة الاتصال' } : (ack ?? { ok: false })),
        );
      }),
    [socket],
  );

  // --- media / peers ---

  const watchLevel = useCallback((key: string, stream: MediaStream) => {
    try {
      const ctx = (audioCtx.current ??= new AudioContext());
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      analysers.current.set(key, analyser);
    } catch {
      /* no Web Audio -- just no speaking rings */
    }
  }, []);

  const closePeer = useCallback((socketId: string) => {
    peers.current.get(socketId)?.close();
    peers.current.delete(socketId);
    const audio = audios.current.get(socketId);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
    }
    audios.current.delete(socketId);
    analysers.current.delete(socketId);
  }, []);

  const peerFor = useCallback(
    (remoteSocketId: string): RTCPeerConnection => {
      const existing = peers.current.get(remoteSocketId);
      if (existing) return existing;
      const pc = new RTCPeerConnection({ iceServers: iceServers.current ?? FALLBACK_ICE });
      localStream.current?.getTracks().forEach((track) => pc.addTrack(track, localStream.current!));
      pc.onicecandidate = (e) => {
        if (e.candidate) void emit('voiceRoom:signal', { conversationId, toSocketId: remoteSocketId, candidate: e.candidate.toJSON() });
      };
      pc.ontrack = (e) => {
        const [stream] = e.streams;
        if (!stream) return;
        let audio = audios.current.get(remoteSocketId);
        if (!audio) {
          audio = document.createElement('audio');
          audio.autoplay = true;
          audio.setAttribute('playsinline', '');
          audio.style.display = 'none';
          document.body.appendChild(audio);
          audios.current.set(remoteSocketId, audio);
        }
        audio.srcObject = stream;
        void audio.play().catch(() => undefined);
        watchLevel(remoteSocketId, stream);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') pc.restartIce?.();
      };
      peers.current.set(remoteSocketId, pc);
      return pc;
    },
    [conversationId, emit, watchLevel],
  );

  const offerTo = useCallback(
    async (remoteSocketId: string) => {
      const pc = peerFor(remoteSocketId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await emit('voiceRoom:signal', { conversationId, toSocketId: remoteSocketId, description: pc.localDescription });
    },
    [conversationId, emit, peerFor],
  );

  // Connect to newcomers / drop leavers whenever the seat list changes.
  const reconcilePeers = useCallback(
    (next: VoiceState) => {
      if (!joinedRef.current || !socket?.id) return;
      const me = socket.id;
      const others = next.participants.filter((p) => p.socketId !== me);
      const present = new Set(others.map((p) => p.socketId));
      for (const id of [...peers.current.keys()]) if (!present.has(id)) closePeer(id);
      for (const p of others) {
        if (!peers.current.has(p.socketId) && me < p.socketId) void offerTo(p.socketId).catch(() => undefined);
      }
    },
    [socket, closePeer, offerTo],
  );

  const teardown = useCallback(() => {
    for (const id of [...peers.current.keys()]) closePeer(id);
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;
    analysers.current.clear();
    void audioCtx.current?.close().catch(() => undefined);
    audioCtx.current = null;
    setJoined(false);
    setSpeaking(new Set());
  }, [closePeer]);

  // --- socket wiring ---

  useEffect(() => {
    if (!socket) return;
    const onState = (next: VoiceState) => {
      if (next?.conversationId !== conversationId) return;
      setState(next);
      reconcilePeers(next);
      // Removed server-side (lease lapsed, kicked from the group): release the microphone.
      if (joinedRef.current && socket.id && !next.participants.some((p) => p.socketId === socket.id)) teardown();
    };
    const onSignal = async (payload: {
      conversationId: string;
      fromSocketId: string;
      description?: RTCSessionDescriptionInit;
      candidate?: RTCIceCandidateInit;
    }) => {
      if (payload?.conversationId !== conversationId || !joinedRef.current) return;
      const pc = peerFor(payload.fromSocketId);
      try {
        if (payload.description) {
          await pc.setRemoteDescription(payload.description);
          if (payload.description.type === 'offer') {
            await pc.setLocalDescription(await pc.createAnswer());
            await emit('voiceRoom:signal', { conversationId, toSocketId: payload.fromSocketId, description: pc.localDescription });
          }
        } else if (payload.candidate) {
          await pc.addIceCandidate(payload.candidate).catch(() => undefined);
        }
      } catch {
        /* a stale/raced signal -- the next state update reconciles */
      }
    };
    const watch = () => {
      void emit('voiceRoom:state', { conversationId }).then((ack) => {
        if (ack.ok && ack.participants) onState(ack as VoiceState);
      });
    };
    socket.on('voiceRoom:state', onState);
    socket.on('voiceRoom:signal', onSignal);
    socket.on('connect', watch);
    watch();
    return () => {
      socket.off('voiceRoom:state', onState);
      socket.off('voiceRoom:signal', onSignal);
      socket.off('connect', watch);
    };
  }, [socket, conversationId, emit, peerFor, reconcilePeers, teardown]);

  // Leaving the conversation leaves the room (and stops watching it).
  useEffect(
    () => () => {
      void emit('voiceRoom:leave', { conversationId, unwatch: true });
      teardown();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationId],
  );

  // Seat lease heartbeat.
  useEffect(() => {
    if (!joined) return;
    const t = setInterval(() => {
      void emit('voiceRoom:heartbeat', { conversationId }).then((ack) => {
        if (!ack.ok) {
          showToast(ack.error || 'انقطع اتصالك بالغرفة الصوتية.', 'error');
          teardown();
        }
      });
    }, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [joined, conversationId, emit, showToast, teardown]);

  // Speaking rings: sample every analyser a few times a second.
  useEffect(() => {
    if (!joined) return;
    const buf = new Uint8Array(512);
    const t = setInterval(() => {
      const next = new Set<string>();
      analysers.current.forEach((analyser, key) => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        if (Math.sqrt(sum / buf.length) > SPEAKING_LEVEL) next.add(key);
      });
      setSpeaking((prev) => (prev.size === next.size && [...next].every((k) => prev.has(k)) ? prev : next));
    }, 220);
    return () => clearInterval(t);
  }, [joined]);

  const join = useCallback(async () => {
    if (joinedRef.current || joining) return;
    if (call) {
      showToast('أنهِ مكالمتك الحالية أولًا.', 'error');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast('المتصفح لا يدعم الميكروفون هنا.', 'error');
      return;
    }
    setJoining(true);
    try {
      if (!iceServers.current) {
        iceServers.current = await api
          .get<{ iceServers: RTCIceServer[] }>('/chat/calls/ice-servers')
          .then((r) => (r.iceServers?.length ? r.iceServers : FALLBACK_ICE))
          .catch(() => FALLBACK_ICE);
      }
      localStream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      watchLevel('me', localStream.current);
      const ack = await emit('voiceRoom:join', { conversationId, muted: false });
      if (!ack.ok) {
        localStream.current.getTracks().forEach((t) => t.stop());
        localStream.current = null;
        showToast(ack.error || 'تعذّر الانضمام إلى الغرفة.', 'error');
        return;
      }
      haptic('success');
      setMuted(false);
      setJoined(true);
      joinedRef.current = true;
      if (ack.participants) {
        setState(ack as VoiceState);
        reconcilePeers(ack as VoiceState);
      }
    } catch {
      localStream.current?.getTracks().forEach((t) => t.stop());
      localStream.current = null;
      showToast('اسمح باستخدام الميكروفون للانضمام إلى الغرفة.', 'error');
    } finally {
      setJoining(false);
    }
  }, [call, joining, conversationId, emit, reconcilePeers, showToast, watchLevel]);

  const leave = useCallback(async () => {
    haptic('tap');
    teardown();
    await emit('voiceRoom:leave', { conversationId });
  }, [conversationId, emit, teardown]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    localStream.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
    haptic('select');
    void emit('voiceRoom:mute', { conversationId, muted: next });
  }, [muted, conversationId, emit]);

  // The header's "غرفة صوتية" button.
  useEffect(() => {
    if (joinSignal > 0) void join();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinSignal]);

  const participants = state?.participants ?? [];
  const me = socket?.id;
  if (!participants.length && !joined && !joining) return null;

  return (
    <AnimatePresence initial={false}>
      <motion.div
        key="voice-room"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="relative z-20 overflow-hidden border-b border-border/50 bg-surface/75 backdrop-blur-xl"
      >
        <div className="flex items-center gap-2.5 px-3 py-2 sm:px-4">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
              joined ? 'bg-success text-white' : 'bg-success/15 text-success',
            )}
          >
            <Headphones className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-foreground">
              {joined ? 'أنت في الغرفة الصوتية' : 'غرفة صوتية نشطة'}
              <span className="ms-1.5 text-[11px] font-normal text-muted-foreground">
                {participants.length}/{state?.capacity ?? 8}
              </span>
            </p>
            <div className="mt-1 flex items-center gap-1">
              {participants.slice(0, 8).map((p) => {
                const isMe = p.socketId === me;
                const talking = speaking.has(isMe ? 'me' : p.socketId) && !p.muted;
                return (
                  <span key={p.socketId} title={isMe ? 'أنت' : p.name} className="relative">
                    <span
                      className={cn(
                        'block rounded-full transition-shadow',
                        talking ? 'shadow-[0_0_0_2px_rgb(var(--success))]' : 'shadow-[0_0_0_2px_transparent]',
                      )}
                    >
                      <Avatar src={assetUrl(p.photoUrl)} name={p.name} size="xs" />
                    </span>
                    {p.muted && (
                      <span className="absolute -bottom-1 -end-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-surface text-danger ring-1 ring-border">
                        <MicOff className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
          {joined ? (
            <>
              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted ? 'تشغيل الميكروفون' : 'كتم الميكروفون'}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
                  muted ? 'bg-danger/10 text-danger' : 'bg-surface-2 text-foreground hover:bg-surface-3',
                )}
              >
                {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => void leave()}
                aria-label="مغادرة الغرفة"
                className="flex h-9 items-center gap-1.5 rounded-full bg-danger px-3 text-xs font-semibold text-white"
              >
                <PhoneOff className="h-3.5 w-3.5" /> مغادرة
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={joining}
              onClick={() => void join()}
              className="flex h-9 items-center gap-1.5 rounded-full bg-success px-3.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              {joining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Headphones className="h-3.5 w-3.5" />}
              انضم
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
