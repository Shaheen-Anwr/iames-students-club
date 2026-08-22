'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useSocket } from '@/lib/socket-context';
import { CallOverlay } from './CallOverlay';

export type CallType = 'audio' | 'video';
export type CallStatus = 'calling' | 'ringing' | 'connected';

export interface CallPeer {
  userId: string;
  name: string;
  photoUrl?: string | null;
}

interface ActiveCall {
  peer: CallPeer;
  conversationId: string;
  callType: CallType;
  status: CallStatus;
}

interface CallContextValue {
  activeCall: ActiveCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  startCall: (peer: CallPeer, conversationId: string, callType: CallType) => Promise<void>;
  answerCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { socket } = useSocket();
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingOfferRef = useRef<{ fromUserId: string; offer: RTCSessionDescriptionInit } | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    pendingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    setActiveCall(null);
  }, []);

  function createPeerConnection(toUserId: string, conversationId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pc.onicecandidate = (e) => {
      if (e.candidate) socket?.emit('iceCandidate', { toUserId, conversationId, candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      setRemoteStream(e.streams[0]);
    };
    return pc;
  }

  const startCall = useCallback(
    async (peer: CallPeer, conversationId: string, callType: CallType) => {
      if (!socket) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video' });
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = createPeerConnection(peer.userId, conversationId);
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('callUser', { toUserId: peer.userId, conversationId, offer, callType });

      setActiveCall({ peer, conversationId, callType, status: 'calling' });
    },
    [socket],
  );

  const answerCall = useCallback(async () => {
    if (!socket || !activeCall || !pendingOfferRef.current) return;
    const { fromUserId, offer } = pendingOfferRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: activeCall.callType === 'video' });
    localStreamRef.current = stream;
    setLocalStream(stream);

    const pc = createPeerConnection(fromUserId, activeCall.conversationId);
    pcRef.current = pc;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    for (const candidate of pendingCandidatesRef.current) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
    pendingCandidatesRef.current = [];

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('answerCall', { toUserId: fromUserId, conversationId: activeCall.conversationId, answer });

    setActiveCall((prev) => (prev ? { ...prev, status: 'connected' } : prev));
  }, [socket, activeCall]);

  const rejectCall = useCallback(() => {
    if (activeCall) socket?.emit('rejectCall', { toUserId: activeCall.peer.userId, conversationId: activeCall.conversationId });
    cleanup();
  }, [socket, activeCall, cleanup]);

  const endCall = useCallback(() => {
    if (activeCall) socket?.emit('endCall', { toUserId: activeCall.peer.userId, conversationId: activeCall.conversationId });
    cleanup();
  }, [socket, activeCall, cleanup]);

  useEffect(() => {
    if (!socket) return;

    const onIncomingCall = (payload: {
      fromUserId: string;
      conversationId: string;
      offer: RTCSessionDescriptionInit;
      callType: CallType;
      fromUser?: CallPeer;
    }) => {
      pendingOfferRef.current = { fromUserId: payload.fromUserId, offer: payload.offer };
      setActiveCall({
        peer: payload.fromUser ?? { userId: payload.fromUserId, name: 'مستخدم' },
        conversationId: payload.conversationId,
        callType: payload.callType,
        status: 'ringing',
      });
    };

    const onCallAnswered = async (payload: { answer: RTCSessionDescriptionInit }) => {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
      for (const candidate of pendingCandidatesRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      pendingCandidatesRef.current = [];
      setActiveCall((prev) => (prev ? { ...prev, status: 'connected' } : prev));
    };

    const onIceCandidate = async (payload: { candidate: RTCIceCandidateInit }) => {
      const pc = pcRef.current;
      if (pc?.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } else {
        pendingCandidatesRef.current.push(payload.candidate);
      }
    };

    const onCallEnded = () => cleanup();
    const onCallRejected = () => cleanup();

    socket.on('incomingCall', onIncomingCall);
    socket.on('callAnswered', onCallAnswered);
    socket.on('iceCandidate', onIceCandidate);
    socket.on('callEnded', onCallEnded);
    socket.on('callRejected', onCallRejected);

    return () => {
      socket.off('incomingCall', onIncomingCall);
      socket.off('callAnswered', onCallAnswered);
      socket.off('iceCandidate', onIceCandidate);
      socket.off('callEnded', onCallEnded);
      socket.off('callRejected', onCallRejected);
    };
  }, [socket, cleanup]);

  return (
    <CallContext.Provider value={{ activeCall, localStream, remoteStream, startCall, answerCall, rejectCall, endCall }}>
      {children}
      <CallOverlay />
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}
