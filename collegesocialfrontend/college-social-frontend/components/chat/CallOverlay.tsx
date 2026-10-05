'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  Lock,
  Maximize2,
  MessageSquareText,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  Phone,
  PhoneOff,
  Settings2,
  SwitchCamera,
  Video,
  VideoOff,
  Volume2,
  X,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { cldOptimize } from '@/lib/images';
import { formatDuration } from '@/lib/chat-helpers';
import { useIsMobile, useMediaQuery } from '@/lib/use-media-query';
import { assetUrl, cn } from '@/lib/utils';
import { useCall, type CallEndReason, type CallQuality, type CallState } from './CallProvider';

const DECLINE_MESSAGES = [
  'لا أستطيع الرد الآن، سأتصل بك لاحقًا.',
  'أنا في محاضرة الآن 📚',
  'اتصل بي بعد قليل من فضلك.',
  'هل يمكنك مراسلتي بدلًا من ذلك؟',
];

function endReasonText(reason: CallEndReason | null, call: CallState): string {
  switch (reason) {
    case 'completed':
      return 'انتهت المكالمة';
    case 'declined':
      return call.direction === 'outgoing' ? 'رُفضت المكالمة' : 'رفضت المكالمة';
    case 'busy':
      return 'المستخدم في مكالمة أخرى';
    case 'no_answer':
      return 'لا يوجد رد';
    case 'canceled':
      return 'أُلغيت المكالمة';
    case 'missed':
      return 'مكالمة فائتة';
    case 'permission':
      return 'لا يوجد إذن لاستخدام الميكروفون';
    case 'unavailable':
      return 'تعذّر إجراء المكالمة';
    default:
      return 'تعذّر الاتصال';
  }
}

function useElapsed(since: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  return since ? Math.max(0, Math.floor((now - since) / 1000)) : 0;
}

function statusText(call: CallState, elapsed: number): string {
  switch (call.status) {
    case 'outgoing':
      return call.peerOffline ? 'غير متصل الآن — جارٍ المحاولة…' : call.ringing ? 'يرن…' : 'جارٍ الاتصال…';
    case 'incoming':
      return call.callType === 'video' ? 'مكالمة فيديو واردة' : 'مكالمة صوتية واردة';
    case 'connecting':
      return 'جارٍ الربط…';
    case 'connected':
      return formatDuration(elapsed);
    case 'reconnecting':
      return 'الشبكة ضعيفة — إعادة الاتصال…';
    case 'ended':
      return endReasonText(call.endReason, call) + (call.connectedAt && call.endReason === 'completed' ? ` · ${formatDuration(elapsed)}` : '');
  }
}

// Binds a MediaStream to a always-muted <video> (audio plays from CallProvider's <audio>).
function VideoView({
  stream,
  version = 0,
  mirror = false,
  fit = 'cover',
  className,
}: {
  stream: MediaStream | null;
  version?: number;
  mirror?: boolean;
  fit?: 'cover' | 'contain';
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) void el.play().catch(() => undefined);
  }, [stream, version]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={cn(fit === 'contain' ? 'object-contain' : 'object-cover', mirror && '-scale-x-100', className)}
    />
  );
}

function QualityBadge({ quality }: { quality: CallQuality | null }) {
  if (!quality) return <span className="w-14" />;
  const bars = quality === 'good' ? 3 : quality === 'fair' ? 2 : 1;
  const color = quality === 'good' ? 'bg-emerald-400' : quality === 'fair' ? 'bg-amber-400' : 'bg-rose-500';
  const label = quality === 'good' ? 'ممتاز' : quality === 'fair' ? 'متوسط' : 'ضعيف';
  return (
    <span className="flex w-14 items-center justify-end gap-1.5" title={`جودة الاتصال: ${label}`} aria-label={`جودة الاتصال: ${label}`}>
      {quality === 'poor' && <span className="text-[10px] font-semibold text-rose-300">ضعيف</span>}
      <span className="flex items-end gap-[2px]" dir="ltr">
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn('w-[3px] rounded-full', i <= bars ? color : 'bg-white/25')} style={{ height: 4 + i * 3 }} />
        ))}
      </span>
    </span>
  );
}

function AmbientBackdrop({ photo, name }: { photo?: string | null; name: string }) {
  const src = photo ? cldOptimize(assetUrl(photo) ?? '', { width: 480 }) : null;
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      {src ? (
        <div
          className="absolute inset-[-15%] scale-110 bg-cover bg-center opacity-55 blur-3xl"
          style={{ backgroundImage: `url("${src}")` }}
          title={name}
        />
      ) : (
        <>
          <div className="absolute -start-24 -top-24 h-96 w-96 animate-aurora-1 rounded-full bg-accent/40 blur-3xl" />
          <div className="absolute -bottom-32 -end-24 h-[28rem] w-[28rem] animate-aurora-2 rounded-full bg-accent-2/25 blur-3xl" />
        </>
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/70" />
    </div>
  );
}

function PulseRings() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          aria-hidden
          className="absolute inset-0 rounded-full border-2 border-white/30"
          initial={{ scale: 1, opacity: 0.55 }}
          animate={{ scale: 1.9, opacity: 0 }}
          transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8, ease: 'easeOut' }}
        />
      ))}
    </>
  );
}

function ControlButton({
  label,
  onClick,
  children,
  toggled = false,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  /** iOS-style: a switched-off control (muted mic, camera off) turns solid white. */
  toggled?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={toggled}
      title={label}
      className={cn(
        'flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-all active:scale-90 disabled:opacity-35 sm:h-14 sm:w-14',
        toggled ? 'bg-white text-neutral-900' : 'bg-white/15 text-white hover:bg-white/25',
      )}
    >
      {children}
    </button>
  );
}

function BigAction({
  label,
  tone,
  onClick,
  children,
  pulse = false,
}: {
  label: string;
  tone: 'green' | 'red' | 'glass';
  onClick: () => void;
  children: React.ReactNode;
  pulse?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <motion.button
        type="button"
        onClick={onClick}
        aria-label={label}
        whileTap={{ scale: 0.9 }}
        animate={pulse ? { scale: [1, 1.08, 1] } : undefined}
        transition={pulse ? { duration: 1.4, repeat: Infinity } : undefined}
        className={cn(
          'flex h-16 w-16 items-center justify-center rounded-full text-white shadow-2xl sm:h-[4.5rem] sm:w-[4.5rem]',
          tone === 'green' && 'bg-emerald-500 shadow-emerald-500/40',
          tone === 'red' && 'bg-rose-500 shadow-rose-500/40',
          tone === 'glass' && 'bg-white/15 ring-1 ring-white/20 backdrop-blur',
        )}
      >
        {children}
      </motion.button>
      <span className="text-xs font-medium text-white/80">{label}</span>
    </div>
  );
}

function selectedDeviceId(stream: MediaStream | null, kind: 'audio' | 'video'): string {
  const track = kind === 'audio' ? stream?.getAudioTracks()[0] : stream?.getVideoTracks()[0];
  return track?.getSettings().deviceId ?? '';
}

function DeviceSheet({ onClose }: { onClose: () => void }) {
  const { devices, localStream, local, sinkId, selectDevice, switchCamera, refreshDevices } = useCall();
  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);
  const mics = devices.filter((d) => d.kind === 'audioinput');
  const cams = devices.filter((d) => d.kind === 'videoinput');
  const speakers = devices.filter((d) => d.kind === 'audiooutput');
  const canPickSpeaker =
    typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype && speakers.length > 0;

  const field = (label: string, list: MediaDeviceInfo[], value: string, kind: MediaDeviceKind, icon: React.ReactNode) =>
    list.length > 0 && (
      <label className="block">
        <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-white/70">
          {icon} {label}
        </span>
        <select
          value={value}
          onChange={(e) => void selectDevice(kind, e.target.value)}
          className="h-11 w-full rounded-xl bg-white/10 px-3 text-sm text-white ring-1 ring-white/15 focus:outline-none focus:ring-2 focus:ring-white/40 [&>option]:text-neutral-900"
        >
          {list.map((d, i) => (
            <option key={d.deviceId || i} value={d.deviceId}>
              {d.label || `${label} ${i + 1}`}
            </option>
          ))}
        </select>
      </label>
    );

  return (
    <motion.div className="absolute inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 36 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-t-3xl bg-neutral-900/95 p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] ring-1 ring-white/10 backdrop-blur-xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold">إعدادات المكالمة</p>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-full p-1.5 text-white/70 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        {field('الميكروفون', mics, selectedDeviceId(localStream, 'audio'), 'audioinput', <Mic className="h-3.5 w-3.5" />)}
        {local.video && !local.screen && field('الكاميرا', cams, selectedDeviceId(localStream, 'video'), 'videoinput', <Video className="h-3.5 w-3.5" />)}
        {canPickSpeaker && field('مكبر الصوت', speakers, sinkId || 'default', 'audiooutput', <Volume2 className="h-3.5 w-3.5" />)}
        {local.video && !local.screen && cams.length > 1 && (
          <button
            type="button"
            onClick={() => void switchCamera()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-medium hover:bg-white/15"
          >
            <SwitchCamera className="h-4 w-4" /> تبديل الكاميرا الأمامية/الخلفية
          </button>
        )}
        <p className="text-[11px] leading-relaxed text-white/50">
          اختصارات لوحة المفاتيح: M كتم/تشغيل الميكروفون · V الكاميرا · Esc تصغير المكالمة.
        </p>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------------------------

function FullCall() {
  const {
    call,
    localStream,
    remoteStream,
    remoteVersion,
    local,
    remote,
    facingMode,
    quality,
    audioBlocked,
    canScreenShare,
    devices,
    answerCall,
    declineCall,
    endCall,
    toggleMic,
    toggleCamera,
    switchCamera,
    toggleScreenShare,
    setMinimized,
    dismiss,
    callAgain,
    resumeAudio,
  } = useCall();
  const c = call!;
  const elapsedLive = useElapsed(c.status === 'connected' || c.status === 'reconnecting' ? c.connectedAt : null);
  // Freeze the duration at hang-up for the "ended" screen.
  const lastElapsed = useRef(0);
  if (c.status === 'connected' || c.status === 'reconnecting') lastElapsed.current = elapsedLive;
  const elapsed = c.status === 'ended' ? lastElapsed.current : elapsedLive;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [swap, setSwap] = useState(false);
  const boundsRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const coarse = useMediaQuery('(pointer: coarse)');

  const active = c.status === 'outgoing' || c.status === 'connecting' || c.status === 'connected' || c.status === 'reconnecting';
  const live = c.status === 'connected' || c.status === 'reconnecting';
  const remoteVideoTrack = remoteStream?.getVideoTracks().find((t) => t.readyState === 'live');
  const remoteVideoOn = live && !!remoteVideoTrack && (remote.video || remote.screen);
  const localVideoOn = !!localStream?.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled) && (local.video || local.screen);
  // Before the other side's video arrives (ringing / connecting), your own camera fills the screen.
  const mainIsLocal = (swap && remoteVideoOn && localVideoOn) || (!remoteVideoOn && localVideoOn && !live && c.status !== 'ended');
  const mainStream = mainIsLocal ? localStream : remoteVideoOn ? remoteStream : null;
  const pipStream = mainIsLocal ? (remoteVideoOn ? remoteStream : null) : localVideoOn ? localStream : null;
  const pipIsLocal = !mainIsLocal;
  const status = statusText(c, elapsed);
  const multipleCameras = devices.filter((d) => d.kind === 'videoinput').length > 1;

  useEffect(() => {
    if (!remoteVideoOn) setSwap(false);
  }, [remoteVideoOn]);

  // Desktop shortcuts: M mic, V camera, Esc minimize.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'm') toggleMic();
      else if (key === 'v') void toggleCamera();
      else if (key === 'escape' && !settingsOpen) setMinimized(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, settingsOpen, toggleMic, toggleCamera, setMinimized]);

  return (
    <motion.div
      ref={boundsRef}
      className="fixed inset-0 z-[10050] flex flex-col overflow-hidden bg-[#06070c] text-white"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.22 }}
      role="dialog"
      aria-modal="true"
      aria-label={`مكالمة مع ${c.peer.name}`}
    >
      {mainStream ? (
        <VideoView
          stream={mainStream}
          version={remoteVersion}
          mirror={mainIsLocal && facingMode === 'user' && !local.screen}
          fit={!mainIsLocal && remote.screen ? 'contain' : 'cover'}
          className="absolute inset-0 h-full w-full bg-black"
        />
      ) : (
        <AmbientBackdrop photo={c.peer.photoUrl} name={c.peer.name} />
      )}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/70 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/85 to-transparent" />

      {/* Top bar */}
      <div className="relative z-10 flex items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+12px)] sm:px-5">
        {active ? (
          <button
            type="button"
            onClick={() => setMinimized(true)}
            aria-label="تصغير المكالمة"
            title="تصغير المكالمة (Esc)"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        ) : (
          <span className="w-10" />
        )}
        <div className="min-w-0 flex-1 text-center">
          {mainStream && (
            <>
              <p className="truncate text-base font-semibold drop-shadow">{c.peer.name}</p>
              <p className="text-xs tabular-nums text-white/80 drop-shadow">{status}</p>
            </>
          )}
          <p className="mt-0.5 flex items-center justify-center gap-1 text-[11px] text-white/55">
            <Lock className="h-3 w-3" /> مشفّرة بين الطرفين
          </p>
        </div>
        <QualityBadge quality={live ? quality : null} />
      </div>

      {/* Identity (no full-screen video) */}
      {!mainStream ? (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="relative">
            {(c.status === 'outgoing' || c.status === 'incoming') && <PulseRings />}
            <Avatar src={assetUrl(c.peer.photoUrl)} name={c.peer.name} size="xl" className="relative h-28 w-28 text-3xl ring-4 ring-white/15 sm:h-32 sm:w-32" />
            {live && !remote.audio && (
              <span className="absolute -bottom-1 -end-1 flex h-8 w-8 items-center justify-center rounded-full bg-rose-500 ring-4 ring-[#06070c]" title="الميكروفون مكتوم">
                <MicOff className="h-4 w-4" />
              </span>
            )}
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{c.peer.name}</h2>
            <p className={cn('mt-1 text-sm tabular-nums', c.status === 'reconnecting' ? 'text-amber-300' : 'text-white/75')}>{status}</p>
          </div>
          {live && c.callType === 'video' && !remote.video && !remote.screen && (
            <p className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/75">الكاميرا متوقفة لدى {c.peer.name}</p>
          )}
        </div>
      ) : (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-start gap-2 pt-3">
          {live && !remote.audio && (
            <span className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1 text-xs backdrop-blur">
              <MicOff className="h-3.5 w-3.5" /> {c.peer.name} كتم الميكروفون
            </span>
          )}
          {live && remote.screen && !mainIsLocal && (
            <span className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1 text-xs backdrop-blur">
              <MonitorUp className="h-3.5 w-3.5" /> {c.peer.name} يشارك الشاشة
            </span>
          )}
          {c.status === 'reconnecting' && (
            <span className="rounded-full bg-amber-500/90 px-3 py-1 text-xs font-medium text-black">الشبكة ضعيفة — إعادة الاتصال…</span>
          )}
        </div>
      )}

      {/* Picture-in-picture: drag it anywhere, tap to swap with the main view */}
      <AnimatePresence>
        {pipStream && (
          <motion.button
            key="pip"
            type="button"
            drag
            dragConstraints={boundsRef}
            dragElastic={0.15}
            dragMomentum={false}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onTap={() => remoteVideoOn && localVideoOn && setSwap((v) => !v)}
            aria-label="تبديل العرض"
            className="absolute end-3 top-[calc(env(safe-area-inset-top)+72px)] z-20 h-40 w-28 cursor-grab overflow-hidden rounded-2xl bg-black shadow-2xl ring-2 ring-white/20 active:cursor-grabbing sm:end-5 sm:h-56 sm:w-40"
          >
            <VideoView
              stream={pipStream}
              version={remoteVersion}
              mirror={pipIsLocal && facingMode === 'user' && !local.screen}
              className="h-full w-full"
            />
            {pipIsLocal && !local.audio && (
              <span className="absolute bottom-1.5 start-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/90">
                <MicOff className="h-3.5 w-3.5" />
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {audioBlocked && live && (
        <button
          type="button"
          onClick={resumeAudio}
          className="relative z-20 mx-auto mb-3 flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow-xl"
        >
          <Volume2 className="h-4 w-4" /> اضغط لتشغيل الصوت
        </button>
      )}

      {/* Controls */}
      <div className="relative z-10 px-3 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-2">
        {c.status === 'incoming' ? (
          <div className="flex flex-col items-center gap-5">
            <AnimatePresence>
              {declineOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  className="w-full max-w-sm space-y-1.5"
                >
                  {DECLINE_MESSAGES.map((text) => (
                    <button
                      key={text}
                      type="button"
                      onClick={() => declineCall(text)}
                      className="block w-full rounded-2xl bg-white/[0.12] px-4 py-3 text-start text-sm ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-white/20"
                    >
                      {text}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <div className="flex items-start justify-center gap-8 sm:gap-14">
              <BigAction label="رفض" tone="red" onClick={() => declineCall()}>
                <PhoneOff className="h-7 w-7" />
              </BigAction>
              {c.callType === 'video' && (
                <BigAction label="رد صوتي" tone="glass" onClick={() => void answerCall({ audioOnly: true })}>
                  <Phone className="h-6 w-6" />
                </BigAction>
              )}
              <BigAction label={c.callType === 'video' ? 'رد بالفيديو' : 'رد'} tone="green" pulse onClick={() => void answerCall()}>
                {c.callType === 'video' ? <Video className="h-7 w-7" /> : <Phone className="h-7 w-7" />}
              </BigAction>
            </div>
            <button
              type="button"
              onClick={() => setDeclineOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm text-white/90 ring-1 ring-white/15 backdrop-blur hover:bg-white/15"
            >
              <MessageSquareText className="h-4 w-4" /> رفض برسالة
            </button>
          </div>
        ) : c.status === 'ended' ? (
          <div className="flex items-start justify-center gap-14">
            <BigAction label="إغلاق" tone="glass" onClick={dismiss}>
              <X className="h-6 w-6" />
            </BigAction>
            {c.endReason !== 'permission' && (
              <BigAction label="إعادة الاتصال" tone="green" onClick={callAgain}>
                {c.callType === 'video' ? <Video className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
              </BigAction>
            )}
          </div>
        ) : (
          <div className="mx-auto flex w-fit max-w-full items-center gap-2 rounded-[2rem] bg-white/10 px-3 py-2.5 ring-1 ring-white/15 backdrop-blur-2xl sm:gap-3 sm:px-4">
            <ControlButton label={local.audio ? 'كتم الميكروفون (M)' : 'إلغاء الكتم (M)'} toggled={!local.audio} onClick={toggleMic}>
              {local.audio ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </ControlButton>
            <ControlButton
              label={localVideoOn && !local.screen ? 'إيقاف الكاميرا (V)' : 'تشغيل الكاميرا (V)'}
              toggled={!localVideoOn || local.screen}
              disabled={local.screen}
              onClick={() => void toggleCamera()}
            >
              {localVideoOn && !local.screen ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </ControlButton>
            {localVideoOn && !local.screen && (coarse || multipleCameras) && (
              <ControlButton label="تبديل الكاميرا" onClick={() => void switchCamera()}>
                <SwitchCamera className="h-5 w-5" />
              </ControlButton>
            )}
            {canScreenShare && !isMobile && (
              <ControlButton label={local.screen ? 'إيقاف مشاركة الشاشة' : 'مشاركة الشاشة'} toggled={local.screen} onClick={() => void toggleScreenShare()}>
                {local.screen ? <MonitorX className="h-5 w-5" /> : <MonitorUp className="h-5 w-5" />}
              </ControlButton>
            )}
            <ControlButton label="إعدادات الأجهزة" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="h-5 w-5" />
            </ControlButton>
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={endCall}
              aria-label="إنهاء المكالمة"
              title="إنهاء المكالمة"
              className="flex h-12 w-14 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/40 hover:bg-rose-600 sm:h-14 sm:w-16"
            >
              <PhoneOff className="h-6 w-6" />
            </motion.button>
          </div>
        )}
      </div>

      <AnimatePresence>{settingsOpen && <DeviceSheet key="settings" onClose={() => setSettingsOpen(false)} />}</AnimatePresence>
    </motion.div>
  );
}

// Minimized: a draggable floating card so the call keeps going while you use the app.
function MiniCall() {
  const { call, remoteStream, remoteVersion, remote, local, toggleMic, endCall, setMinimized } = useCall();
  const c = call!;
  const elapsed = useElapsed(c.connectedAt);
  const boundsRef = useRef<HTMLDivElement>(null);
  const live = c.status === 'connected' || c.status === 'reconnecting';
  const remoteVideoOn = live && (remote.video || remote.screen) && !!remoteStream?.getVideoTracks().some((t) => t.readyState === 'live');
  const status = statusText(c, elapsed);

  return (
    <div ref={boundsRef} className="pointer-events-none fixed inset-2 z-[10050]">
      <motion.div
        drag
        dragConstraints={boundsRef}
        dragMomentum={false}
        dragElastic={0.1}
        initial={{ opacity: 0, scale: 0.85, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className={cn(
          'pointer-events-auto absolute bottom-24 end-2 cursor-grab overflow-hidden text-white shadow-2xl ring-1 ring-white/15 active:cursor-grabbing md:bottom-6',
          remoteVideoOn ? 'h-52 w-36 rounded-3xl bg-black' : 'rounded-full bg-neutral-900/95 backdrop-blur-xl',
        )}
      >
        {remoteVideoOn ? (
          <>
            <VideoView stream={remoteStream} version={remoteVersion} fit={remote.screen ? 'contain' : 'cover'} className="absolute inset-0 h-full w-full" />
            <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-2">
              <span className="truncate text-[11px] font-semibold">{c.peer.name}</span>
              <button type="button" onClick={() => setMinimized(false)} aria-label="تكبير المكالمة" className="rounded-full p-1 hover:bg-white/15">
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent p-2">
              <button
                type="button"
                onClick={toggleMic}
                aria-label={local.audio ? 'كتم الميكروفون' : 'إلغاء الكتم'}
                className={cn('flex h-8 w-8 items-center justify-center rounded-full', local.audio ? 'bg-white/20' : 'bg-white text-neutral-900')}
              >
                {local.audio ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              </button>
              <span className="text-[11px] tabular-nums">{status}</span>
              <button type="button" onClick={endCall} aria-label="إنهاء المكالمة" className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-500">
                <PhoneOff className="h-4 w-4" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 py-1.5 pe-1.5 ps-1.5">
            <button type="button" onClick={() => setMinimized(false)} className="flex items-center gap-2 pe-1" aria-label="تكبير المكالمة">
              <span className="relative">
                <Avatar src={assetUrl(c.peer.photoUrl)} name={c.peer.name} size="sm" />
                {live && <span className="absolute -bottom-0.5 -end-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-neutral-900" />}
              </span>
              <span className="text-start">
                <span className="block max-w-[7rem] truncate text-xs font-semibold">{c.peer.name}</span>
                <span className={cn('block text-[11px] tabular-nums', c.status === 'reconnecting' ? 'text-amber-300' : 'text-white/70')}>{status}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={toggleMic}
              aria-label={local.audio ? 'كتم الميكروفون' : 'إلغاء الكتم'}
              className={cn('flex h-9 w-9 items-center justify-center rounded-full', local.audio ? 'bg-white/15' : 'bg-white text-neutral-900')}
            >
              {local.audio ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </button>
            <button type="button" onClick={endCall} aria-label="إنهاء المكالمة" className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-500">
              <PhoneOff className="h-4 w-4" />
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export function CallOverlay() {
  const { call } = useCall();
  return (
    <AnimatePresence>
      {call && (call.minimized && call.status !== 'incoming' && call.status !== 'ended' ? <MiniCall key="mini" /> : <FullCall key={`full-${call.callId}`} />)}
    </AnimatePresence>
  );
}
