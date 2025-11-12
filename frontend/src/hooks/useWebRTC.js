// frontend/src/hooks/useWebRTC.js
import { useState, useRef, useCallback, useEffect } from 'react';
import socketService from '../services/socketService';

// STUN servers cho NAT traversal
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
};

export const useWebRTC = (roomId, username) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  
  const peerConnections = useRef(new Map());
  const localStreamRef = useRef(null);

  // Khởi tạo local media stream (camera + mic)
  const initializeMedia = useCallback(async () => {
    try {
      console.log('🎥 Requesting media permissions...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      console.log('✅ Media stream obtained:', stream.id);
      localStreamRef.current = stream;
      setLocalStream(stream);
      
      return stream;
    } catch (error) {
      console.error('❌ Error accessing media devices:', error);
      
      // Fallback: chỉ audio nếu không có camera
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false
        });
        console.log('⚠️ Video not available, using audio only');
        localStreamRef.current = audioStream;
        setLocalStream(audioStream);
        setIsVideoEnabled(false);
        return audioStream;
      } catch (audioError) {
        console.error('❌ Cannot access any media devices:', audioError);
        throw audioError;
      }
    }
  }, []);

  // Tạo peer connection mới
  const createPeerConnection = useCallback((peerId) => {
    try {
      console.log(`🔗 Creating peer connection for: ${peerId}`);
      
      const pc = new RTCPeerConnection(ICE_SERVERS);
      
      // Thêm local tracks vào peer connection
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current);
          console.log(`➕ Added ${track.kind} track to peer connection`);
        });
      }

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('🧊 Sending ICE candidate to:', peerId);
          socketService.emit('webrtc-ice-candidate', {
            roomId,
            targetId: peerId,
            candidate: event.candidate
          });
        }
      };

      // Handle remote stream
      pc.ontrack = (event) => {
        console.log(`📺 Received ${event.track.kind} track from:`, peerId);
        
        setRemoteStreams(prev => {
          const newMap = new Map(prev);
          
          if (newMap.has(peerId)) {
            // Thêm track vào stream hiện có
            const existingStream = newMap.get(peerId);
            existingStream.addTrack(event.track);
          } else {
            // Tạo stream mới
            newMap.set(peerId, event.streams[0]);
          }
          
          return newMap;
        });
      };

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        console.log(`🔌 Connection state with ${peerId}:`, pc.connectionState);
        
        if (pc.connectionState === 'disconnected' || 
            pc.connectionState === 'failed' || 
            pc.connectionState === 'closed') {
          handlePeerDisconnect(peerId);
        }
      };

      // Handle ICE connection state changes
      pc.oniceconnectionstatechange = () => {
        console.log(`🧊 ICE connection state with ${peerId}:`, pc.iceConnectionState);
      };

      peerConnections.current.set(peerId, pc);
      return pc;
      
    } catch (error) {
      console.error('❌ Error creating peer connection:', error);
      throw error;
    }
  }, [roomId]);

  // Tạo và gửi offer
  const createOffer = useCallback(async (peerId) => {
    try {
      const pc = peerConnections.current.get(peerId) || createPeerConnection(peerId);
      
      console.log('📤 Creating offer for:', peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      socketService.emit('webrtc-offer', {
        roomId,
        targetId: peerId,
        offer: offer
      });
      
      console.log('✅ Offer sent to:', peerId);
    } catch (error) {
      console.error('❌ Error creating offer:', error);
    }
  }, [roomId, createPeerConnection]);

  // Xử lý nhận offer
  const handleOffer = useCallback(async (senderId, offer) => {
    try {
      console.log('📥 Received offer from:', senderId);
      
      const pc = peerConnections.current.get(senderId) || createPeerConnection(senderId);
      
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      socketService.emit('webrtc-answer', {
        roomId,
        targetId: senderId,
        answer: answer
      });
      
      console.log('✅ Answer sent to:', senderId);
    } catch (error) {
      console.error('❌ Error handling offer:', error);
    }
  }, [roomId, createPeerConnection]);

  // Xử lý nhận answer
  const handleAnswer = useCallback(async (senderId, answer) => {
    try {
      console.log('📥 Received answer from:', senderId);
      
      const pc = peerConnections.current.get(senderId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('✅ Remote description set for:', senderId);
      }
    } catch (error) {
      console.error('❌ Error handling answer:', error);
    }
  }, []);

  // Xử lý nhận ICE candidate
  const handleIceCandidate = useCallback(async (senderId, candidate) => {
    try {
      const pc = peerConnections.current.get(senderId);
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('🧊 ICE candidate added from:', senderId);
      }
    } catch (error) {
      console.error('❌ Error adding ICE candidate:', error);
    }
  }, []);

  // Xử lý peer disconnect
  const handlePeerDisconnect = useCallback((peerId) => {
    console.log('🚪 Peer disconnected:', peerId);
    
    const pc = peerConnections.current.get(peerId);
    if (pc) {
      pc.close();
      peerConnections.current.delete(peerId);
    }
    
    setRemoteStreams(prev => {
      const newMap = new Map(prev);
      newMap.delete(peerId);
      return newMap;
    });
  }, []);

  // Toggle audio
  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
        console.log(`🔊 Audio ${audioTrack.enabled ? 'enabled' : 'disabled'}`);
        return audioTrack.enabled;
      }
    }
    return false;
  }, []);

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
        console.log(`📹 Video ${videoTrack.enabled ? 'enabled' : 'disabled'}`);
        return videoTrack.enabled;
      }
    }
    return false;
  }, []);

  // Cleanup
  const cleanup = useCallback(() => {
    console.log('🧹 Cleaning up WebRTC resources...');
    
    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log(`⏹️ Stopped ${track.kind} track`);
      });
      localStreamRef.current = null;
    }
    
    // Close all peer connections
    peerConnections.current.forEach((pc, peerId) => {
      pc.close();
      console.log(`❌ Closed connection with: ${peerId}`);
    });
    peerConnections.current.clear();
    
    setLocalStream(null);
    setRemoteStreams(new Map());
  }, []);

  // Setup socket listeners
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    socket.on('webrtc-offer', ({ senderId, offer }) => {
      handleOffer(senderId, offer);
    });

    socket.on('webrtc-answer', ({ senderId, answer }) => {
      handleAnswer(senderId, answer);
    });

    socket.on('webrtc-ice-candidate', ({ senderId, candidate }) => {
      handleIceCandidate(senderId, candidate);
    });

    return () => {
      socket.off('webrtc-offer');
      socket.off('webrtc-answer');
      socket.off('webrtc-ice-candidate');
    };
  }, [handleOffer, handleAnswer, handleIceCandidate]);

  return {
    localStream,
    remoteStreams,
    isAudioEnabled,
    isVideoEnabled,
    initializeMedia,
    createOffer,
    toggleAudio,
    toggleVideo,
    handlePeerDisconnect,
    cleanup
  };
};