import { useState, useRef, useCallback, useEffect } from 'react';
import socketService from '../services/socketService';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
};

export const useWebRTC = (roomId) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [screenStream, setScreenStream] = useState(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [streamVersion, setStreamVersion] = useState(0);
 
  const peerConnections = useRef(new Map());
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  
  // ✅ FIX: Add flags to handle signaling race conditions
  const makingOffer = useRef(new Map());
  const ignoreOffer = useRef(new Map());
  const isSettingRemoteAnswerPending = useRef(new Map());
  
  // ✅ FIX LỖI 2: Queue ICE candidates
  const pendingIceCandidates = useRef(new Map());

  /** 🔹 Khởi tạo camera + mic */
  const initializeMedia = useCallback(async () => {
    try {
      console.log('🎥 Requesting media permissions...');
     
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });

      console.log('✅ Media stream obtained:', stream.id);
      localStreamRef.current = stream;
      setLocalStream(stream);

      localStreamRef.current.getAudioTracks().forEach(track => (track.enabled = true));
      setIsAudioEnabled(true);
      return stream;

    } catch (error) {
      console.error('❌ Error accessing media devices:', error);
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        console.log('⚠️ Video not available, using audio only');
        localStreamRef.current = audioStream;
        setLocalStream(audioStream);
        setIsVideoEnabled(false);

        localStreamRef.current.getAudioTracks().forEach(track => (track.enabled = true));
        setIsAudioEnabled(true);

        const canvas = Object.assign(document.createElement("canvas"), { width: 640, height: 480 });
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const dummyStream = canvas.captureStream(1);
        const dummyTrack = dummyStream.getVideoTracks()[0];
        localStreamRef.current.addTrack(dummyTrack);
        console.log('🧩 Added dummy video track for compatibility');

        return localStreamRef.current;

      } catch (audioError) {
        console.error('❌ Cannot access any media devices:', audioError);
        throw audioError;
      }
    }
  }, []);

  /** 🔹 Ngắt kết nối peer */
  const handlePeerDisconnect = useCallback((peerId) => {
    console.log('🚪 Peer disconnected:', peerId);
   
    const pc = peerConnections.current.get(peerId);
    if (pc) {
      pc.close();
      peerConnections.current.delete(peerId);
    }
    
    // ✅ Clear pending ICE candidates
    pendingIceCandidates.current.delete(peerId);
   
    setRemoteStreams(prev => {
      const newMap = new Map(prev);
      newMap.delete(peerId);
      return newMap;
    });
  }, []);

  /** 🔹 Process queued ICE candidates - ✅ FIX LỖI 2 */
  const processQueuedCandidates = useCallback(async (peerId, pc) => {
    const queued = pendingIceCandidates.current.get(peerId);
    if (queued && queued.length > 0) {
      console.log(`📦 Processing ${queued.length} queued ICE candidates for ${peerId}`);
      for (const candidate of queued) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error(`❌ Error adding queued candidate:`, error);
        }
      }
      pendingIceCandidates.current.delete(peerId);
    }
  }, []);

  /** 🔹 Tạo peer connection */
  const createPeerConnection = useCallback((peerId) => {
    try {
      console.log(`🔗 Creating peer connection for: ${peerId}`);
      const pc = new RTCPeerConnection(ICE_SERVERS);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current);
          console.log(`➕ Added ${track.kind} track to peer connection`);
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketService.emit('webrtc-ice-candidate', {
            roomId,
            targetId: peerId,
            candidate: event.candidate
          });
        }
      };

      pc.ontrack = (event) => {
        console.log(`📺 ✅ Received ${event.track.kind} from ${peerId}`, {
          streamId: event.streams[0]?.id,
          trackId: event.track.id,
          trackState: event.track.readyState
        });
        
        setRemoteStreams(prev => {
          const newMap = new Map(prev);
          const stream = event.streams[0];
          
          if (!stream) {
            console.warn(`⚠️ No stream in ontrack event for ${peerId}`);
            return newMap;
          }
          
          if (newMap.has(peerId)) {
            console.log(`🔄 Updating stream for ${peerId}`);
            const existingStream = newMap.get(peerId);
            
            existingStream.getTracks()
              .filter(t => t.kind === event.track.kind)
              .forEach(t => {
                console.log(`🗑️ Removing old ${t.kind} track`);
                existingStream.removeTrack(t);
              });
            
            existingStream.addTrack(event.track);
            console.log(`✅ Added new ${event.track.kind} track to existing stream`);
          } else {
            console.log(`✨ Creating new stream for ${peerId}`);
            newMap.set(peerId, stream);
          }
          
          return newMap;
        });
        
        setStreamVersion(v => {
          console.log(`🔄 Stream version updated: ${v} → ${v + 1}`);
          return v + 1;
        });
      };

      pc.onconnectionstatechange = () => {
        console.log(`🔌 Peer ${peerId} connection state: ${pc.connectionState}`);
        if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
          handlePeerDisconnect(peerId);
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`🧊 Peer ${peerId} ICE state: ${pc.iceConnectionState}`);
      };

      peerConnections.current.set(peerId, pc);
      return pc;
    } catch (error) {
      console.error('❌ Error creating peer connection:', error);
      throw error;
    }
  }, [roomId, handlePeerDisconnect]);

  /** 🔹 Tạo & gửi offer - ✅ FINAL: Prevent spam */
  const createOffer = useCallback(async (peerId) => {
    try {
      // ✅ Check if already making offer
      if (makingOffer.current.get(peerId)) {
        console.warn(`⚠️ Already making offer to ${peerId}`);
        return;
      }
      
      console.log(`📤 Creating offer for ${peerId}...`);
      let pc = peerConnections.current.get(peerId);
      
      if (!pc) {
        pc = createPeerConnection(peerId);
      }
      
      // ✅ Check signaling state
      if (pc.signalingState !== 'stable') {
        console.warn(`⚠️ Cannot create offer, state: ${pc.signalingState}`);
        return;
      }
      
      makingOffer.current.set(peerId, true);
      
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        console.log(`📤 Sending offer to ${peerId}`);
        socketService.emit('webrtc-offer', { roomId, targetId: peerId, offer });
        console.log(`✅ Offer sent`);
      } finally {
        setTimeout(() => {
          makingOffer.current.set(peerId, false);
        }, 1000); // ✅ Longer delay
      }
    } catch (error) {
      console.error(`❌ Error creating offer:`, error);
      makingOffer.current.set(peerId, false);
    }
  }, [roomId, createPeerConnection]);

  /** 🔹 Nhận offer - ✅ FINAL FIX: Complete Perfect Negotiation */
  const handleOffer = useCallback(async (senderId, offer) => {
    try {
      console.log(`📥 ✅ Handling offer from ${senderId}`);
      let pc = peerConnections.current.get(senderId);
      
      if (!pc) {
        pc = createPeerConnection(senderId);
      }
      
      // ✅ FIX: Detect collision
      const offerCollision = 
        (offer.type === 'offer') &&
        (makingOffer.current.get(senderId) || pc.signalingState !== 'stable');

      const socket = socketService.getSocket();
      const isPolite = socket && senderId > socket.id;
      
      ignoreOffer.current.set(senderId, !isPolite && offerCollision);
      
      if (ignoreOffer.current.get(senderId)) {
        console.warn(`⚠️ Ignoring offer from ${senderId} (glare, we're impolite)`);
        return;
      }

      // ✅ FIX: Polite peer rolls back
      if (offerCollision) {
        console.log(`🔄 Collision with ${senderId}, rolling back (we're polite)`);
        
        if (pc.signalingState === 'have-local-offer') {
          await pc.setLocalDescription({type: 'rollback'});
          console.log(`✅ Rollback successful`);
        }
      }

      // ✅ CRITICAL FIX: Set remote description
      console.log(`🔧 Setting remote description (state: ${pc.signalingState})`);
      
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        console.log(`✅ Remote description set`);
      } catch (error) {
        console.error(`❌ Failed to set remote description:`, error);
        
        // ✅ If setRemoteDescription fails, close and retry
        pc.close();
        peerConnections.current.delete(senderId);
        
        setTimeout(() => {
          console.log(`🔄 Retrying connection with ${senderId}...`);
          createOffer(senderId);
        }, 1500);
        return;
      }
      
      // ✅ Process queued ICE candidates
      await processQueuedCandidates(senderId, pc);
      
      // ✅ CRITICAL FIX: Only create answer if in correct state
      if (pc.signalingState !== 'have-remote-offer') {
        console.warn(`⚠️ Cannot create answer, state is: ${pc.signalingState}`);
        return;
      }
      
      console.log(`🔧 Creating answer`);
      const answer = await pc.createAnswer();
      
      console.log(`🔧 Setting local description`);
      await pc.setLocalDescription(answer);
      
      console.log(`📤 Sending answer to ${senderId}`);
      socketService.emit('webrtc-answer', { roomId, targetId: senderId, answer });
      console.log(`✅ Answer sent`);
      
    } catch (error) {
      console.error(`❌ Error handling offer from ${senderId}:`, error);
    }
  }, [roomId, createPeerConnection, processQueuedCandidates, createOffer]);

  /** 🔹 Nhận answer - ✅ FIX LỖI 2: Process queued candidates */
  const handleAnswer = useCallback(async (senderId, answer) => {
    try {
      console.log(`📥 ✅ Handling answer from ${senderId}`);
      const pc = peerConnections.current.get(senderId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log(`✅ Remote description set for ${senderId}`);
        
        // ✅ FIX LỖI 2: Process queued ICE candidates
        await processQueuedCandidates(senderId, pc);
      } else {
        console.warn(`⚠️ No peer connection found for ${senderId}`);
      }
    } catch (error) {
      console.error(`❌ Error handling answer from ${senderId}:`, error);
    }
  }, [processQueuedCandidates]);

  /** 🔹 Nhận ICE candidate - ✅ FIX LỖI 2: Queue candidates properly */
  const handleIceCandidate = useCallback(async (senderId, candidate) => {
    try {
      const pc = peerConnections.current.get(senderId);
      if (!pc) {
        console.warn(`⚠️ No peer connection for ICE candidate from ${senderId}`);
        return;
      }

      // ✅ FIX LỖI 2: Queue if remote description not set
      if (pc.remoteDescription === null) {
        console.log(`📦 Queuing ICE candidate for ${senderId}`);
        if (!pendingIceCandidates.current.has(senderId)) {
          pendingIceCandidates.current.set(senderId, []);
        }
        pendingIceCandidates.current.get(senderId).push(candidate);
        return;
      }

      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log(`🧊 ICE candidate added for ${senderId}`);
    } catch (error) {
      console.error(`❌ Error adding ICE candidate from ${senderId}:`, error);
    }
  }, []);

  /** 🔹 Toggle audio */
  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsAudioEnabled(track.enabled);
        return track.enabled;
      }
    }
    return false;
  }, []);

  /** 🔹 Toggle video - ✅ IMPROVED: Better track state propagation */
  const toggleVideo = useCallback(async () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getVideoTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsVideoEnabled(track.enabled);
        
        console.log(`📹 Video ${track.enabled ? 'enabled' : 'disabled'}`);
        
        // ✅ FIX: Force renegotiation để đối phương nhận được update
        if (!isScreenSharing) {
          // ✅ THÊM: Small delay để ensure track state đã update
          await new Promise(resolve => setTimeout(resolve, 100));
          
          for (const [peerId, pc] of peerConnections.current.entries()) {
            try {
              // ✅ IMPROVED: Recreate offer với track state mới
              const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
              });
              await pc.setLocalDescription(offer);
              socketService.emit('webrtc-offer', { roomId, targetId: peerId, offer });
              console.log(`🔁 Video toggle renegotiation sent to ${peerId}`);
            } catch (err) {
              console.error(`❌ Error renegotiating with ${peerId}:`, err);
            }
          }
        }
        
        return track.enabled;
      }
    }
    return false;
  }, [roomId, isScreenSharing]);

  /** 🔹 Bắt đầu chia sẻ màn hình */
  const startScreenShare = async () => {
    try {
      console.log("🖥️ Requesting screen share...");
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" },
        audio: true
      });

      if (screenStream.getAudioTracks().length === 0 && localStreamRef.current) {
        console.log("🎙️ Adding mic audio to screen share");
        localStreamRef.current.getAudioTracks().forEach(track => {
          screenStream.addTrack(track);
        });
      }

      setScreenStream(screenStream);
      screenStreamRef.current = screenStream;
      setIsScreenSharing(true);

      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack) {
        console.warn("⚠️ No video track in screen stream!");
        return;
      }

      socketService.emit('screen-share-started', { roomId });
      console.log("📢 Notified server about screen share");

      console.log(`🔄 Replacing camera with screen for ${peerConnections.current.size} peers`);
      for (const [peerId, pc] of peerConnections.current.entries()) {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(screenTrack);
          console.log(`✅ Replaced track for peer ${peerId}`);
        }
      }

      screenTrack.onended = () => {
        console.warn("🛑 Screen share stopped (browser event)");
        stopScreenShare();
      };

      console.log("🔁 Sending renegotiation offers...");
      for (const [peerId, pc] of peerConnections.current.entries()) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socketService.emit("webrtc-offer", { roomId, targetId: peerId, offer });
          console.log(`🔁 Renegotiation sent to ${peerId}`);
        } catch (err) {
          console.error(`❌ Renegotiation error with ${peerId}:`, err);
        }
      }

      console.log("✅ Screen share started successfully");
    } catch (err) {
      console.error("❌ Screen share error:", err);
      setIsScreenSharing(false);
    }
  };

  /** 🔹 Dừng chia sẻ màn hình */
  const stopScreenShare = async () => {
    console.log("🛑 Stopping screen share...");
    
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    
    setScreenStream(null);
    setIsScreenSharing(false);

    socketService.emit('screen-share-stopped', { roomId });
    console.log("📢 Notified server screen share stopped");

    const videoTrack = localStreamRef.current?.getVideoTracks()?.[0];
    if (!videoTrack) {
      console.warn("⚠️ No camera track to restore");
      return;
    }

    if (videoTrack.enabled) {
      console.log("🎥 Restoring camera track...");
      for (const [peerId, pc] of peerConnections.current.entries()) {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(videoTrack);
          console.log(`✅ Camera restored for ${peerId}`);
        }
      }
    }

    console.log("🔁 Sending renegotiation offers...");
    for (const [peerId, pc] of peerConnections.current.entries()) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketService.emit("webrtc-offer", { roomId, targetId: peerId, offer });
        console.log(`🔁 Renegotiation sent to ${peerId}`);
      } catch (err) {
        console.error(`❌ Renegotiation error with ${peerId}:`, err);
      }
    }
  };

  /** 🔹 Cleanup - ✅ FIX LỖI 5: Clear screen sharing state */
  const cleanup = useCallback(() => {
    console.log('🧹 Cleaning up WebRTC resources...');
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    peerConnections.current.forEach(pc => pc.close());
    peerConnections.current.clear();
    pendingIceCandidates.current.clear(); // ✅ Clear queued candidates
    setLocalStream(null);
    setRemoteStreams(new Map());
    setScreenStream(null);
    setIsScreenSharing(false); // ✅ FIX LỖI 5
  }, []);

  /** 🔹 Setup socket listeners */
  useEffect(() => {
    console.log('🔌 useWebRTC: Setting up socket listeners');
    
    const setupListeners = () => {
      const socket = socketService.getSocket();
      
      if (!socket) {
        console.warn('⚠️ Socket not available yet, retrying in 100ms...');
        setTimeout(setupListeners, 100);
        return;
      }

      console.log('✅ Socket available, setting up listeners');

      const onOffer = ({ senderId, offer }) => {
        console.log(`📨 🔔 SOCKET EVENT: webrtc-offer from ${senderId}`);
        handleOffer(senderId, offer);
      };
      
      const onAnswer = ({ senderId, answer }) => {
        console.log(`📨 🔔 SOCKET EVENT: webrtc-answer from ${senderId}`);
        handleAnswer(senderId, answer);
      };
      
      const onIceCandidate = ({ senderId, candidate }) => {
        console.log(`📨 🔔 SOCKET EVENT: webrtc-ice-candidate from ${senderId}`);
        handleIceCandidate(senderId, candidate);
      };

      socket.on('webrtc-offer', onOffer);
      socket.on('webrtc-answer', onAnswer);
      socket.on('webrtc-ice-candidate', onIceCandidate);
      
      console.log('✅ WebRTC socket listeners registered');

      return () => {
        console.log('🧹 Cleaning up WebRTC socket listeners');
        socket.off('webrtc-offer', onOffer);
        socket.off('webrtc-answer', onAnswer);
        socket.off('webrtc-ice-candidate', onIceCandidate);
      };
    };

    const cleanup = setupListeners();
    return cleanup;
  }, [handleOffer, handleAnswer, handleIceCandidate]);

  return {
    localStream,
    remoteStreams,
    screenStream,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    streamVersion,
    initializeMedia,
    createOffer,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    handlePeerDisconnect,
    cleanup
  };
};