'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { assetUrl } from '@/lib/utils';
import { useCall } from './CallProvider';

export function CallOverlay() {
  const { activeCall, localStream, remoteStream, answerCall, rejectCall, endCall } = useCall();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  if (!activeCall) return null;

  function toggleMute() {
    localStream?.getAudioTracks().forEach((t) => (t.enabled = muted));
    setMuted((m) => !m);
  }

  function toggleVideo() {
    localStream?.getVideoTracks().forEach((t) => (t.enabled = videoOff));
    setVideoOff((v) => !v);
  }

  const isVideo = activeCall.callType === 'video';
  const statusLabel =
    activeCall.status === 'calling' ? 'جارٍ الاتصال…' : activeCall.status === 'ringing' ? 'مكالمة واردة' : 'متصل';

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-md">
      <audio ref={remoteAudioRef} autoPlay className={isVideo ? 'hidden' : ''} />

      {isVideo && activeCall.status === 'connected' ? (
        <div className="relative flex-1">
          <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute top-4 end-4 h-28 w-20 rounded-xl2 border-2 border-white/20 object-cover shadow-card sm:top-auto sm:bottom-6 sm:h-44 sm:w-32"
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-white">
          <Avatar src={assetUrl(activeCall.peer.photoUrl)} name={activeCall.peer.name} size="xl" className="animate-fade-in" />
          <p className="text-xl font-semibold">{activeCall.peer.name}</p>
          <p className="text-sm text-white/70">{statusLabel}</p>
        </div>
      )}

      <div className="flex items-center justify-center gap-4 pb-10 pt-6">
        {activeCall.status === 'ringing' ? (
          <>
            <button
              onClick={rejectCall}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-danger text-white shadow-card transition-transform hover:scale-105 active:scale-95"
            >
              <PhoneOff className="h-6 w-6" />
            </button>
            <button
              onClick={answerCall}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-card transition-transform hover:scale-105 active:scale-95"
            >
              <Phone className="h-6 w-6" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={toggleMute}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-white transition-transform hover:scale-105 active:scale-95"
            >
              {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            {isVideo && (
              <button
                onClick={toggleVideo}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-white transition-transform hover:scale-105 active:scale-95"
              >
                {videoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
              </button>
            )}
            <button
              onClick={endCall}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-danger text-white shadow-card transition-transform hover:scale-105 active:scale-95"
            >
              <PhoneOff className="h-6 w-6" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
