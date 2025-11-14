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

export const useWebRTC = (roomId) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [screenStream, setScreenStream] = useState(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteScreenStreams, setRemoteScreenStreams] = useState(new Map());
  
  const peerConnections = useRef(new Map());
  const screenPeerConnections = useRef(new Map());
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);

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

      // ✅ Bật mic thủ công
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

        // ✅ Mic vẫn bật
        localStreamRef.current.getAudioTracks().forEach(track => (track.enabled = true));
        setIsAudioEnabled(true);

        // 🧩 Thêm dummy video track để vẫn tạo video sender
        const canvas = Object.assign(document.createElement("canvas"), { width: 640, height: 480 });
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const dummyStream = canvas.captureStream(1); // 1 FPS là đủ
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

    const screenPc = screenPeerConnections.current.get(peerId);
    if (screenPc) {
      screenPc.close();
      screenPeerConnections.current.delete(peerId);
    }
    
    setRemoteStreams(prev => {
      const newMap = new Map(prev);
      newMap.delete(peerId);
      return newMap;
    });

    setRemoteScreenStreams(prev => {
      const newMap = new Map(prev);
      newMap.delete(peerId);
      return newMap;
    });
  }, []);

  /** 🔹 Tạo peer connection */
  const createPeerConnection = useCallback((peerId) => {
    try {
      console.log(`🔗 Creating peer connection for: ${peerId}`);
      const pc = new RTCPeerConnection(ICE_SERVERS);

      // Thêm local tracks (camera)
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
        console.log(`📺 Received ${event.track.kind} from: ${peerId}`);
        setRemoteStreams(prev => {
          const newMap = new Map(prev);
          if (newMap.has(peerId)) {
            newMap.get(peerId).addTrack(event.track);
          } else {
            newMap.set(peerId, event.streams[0]);
          }
          return newMap;
        });
      };

      pc.onconnectionstatechange = () => {
        if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
          handlePeerDisconnect(peerId);
        }
      };

      peerConnections.current.set(peerId, pc);
      return pc;
    } catch (error) {
      console.error('❌ Error creating peer connection:', error);
      throw error;
    }
  }, [roomId, handlePeerDisconnect]);

  /** 🔹 Tạo & gửi offer */
  const createOffer = useCallback(async (peerId) => {
    try {
      const pc = peerConnections.current.get(peerId) || createPeerConnection(peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketService.emit('webrtc-offer', { roomId, targetId: peerId, offer });
      console.log('✅ Offer sent to:', peerId);
    } catch (error) {
      console.error('❌ Error creating offer:', error);
    }
  }, [roomId, createPeerConnection]);

  /** 🔹 Nhận offer */
  const handleOffer = useCallback(async (senderId, offer) => {
    try {
      const pc = peerConnections.current.get(senderId) || createPeerConnection(senderId);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketService.emit('webrtc-answer', { roomId, targetId: senderId, answer });
    } catch (error) {
      console.error('❌ Error handling offer:', error);
    }
  }, [roomId, createPeerConnection]);

  /** 🔹 Nhận answer */
  const handleAnswer = useCallback(async (senderId, answer) => {
    try {
      const pc = peerConnections.current.get(senderId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    } catch (error) {
      console.error('❌ Error handling answer:', error);
    }
  }, []);

  /** 🔹 Nhận ICE candidate */
  const handleIceCandidate = useCallback(async (senderId, candidate) => {
    try {
      const pc = peerConnections.current.get(senderId);
      if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('❌ Error adding ICE candidate:', error);
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

  /** 🔹 Toggle video */
  const toggleVideo = useCallback(async () => {
  if (!localStreamRef.current) return false;

  const videoTrack = localStreamRef.current.getVideoTracks()[0];

  // Nếu đang bật thì tắt đi
  if (videoTrack && videoTrack.enabled) {
    videoTrack.enabled = false;
    setIsVideoEnabled(false);
    return false;
  }

  // Nếu track đã bị stop hoặc không còn tồn tại, lấy lại camera mới
  if (!videoTrack || videoTrack.readyState === "ended") {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const newTrack = newStream.getVideoTracks()[0];
      localStreamRef.current.addTrack(newTrack);
      setIsVideoEnabled(true);

      // Thay thế track cũ trong mọi peer connection
      peerConnections.current.forEach((pc, peerId) => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
        if (sender) {
          sender.replaceTrack(newTrack);
          console.log(`🎥 Restored video track for ${peerId}`);
        }
      });

      return true;
    } catch (err) {
      console.error("Error restarting camera:", err);
      return false;
    }
  }

  // Nếu track vẫn còn nhưng đang tắt → bật lại
  videoTrack.enabled = true;
  setIsVideoEnabled(true);
  return true;
}, []);


  /** 🔹 Bắt đầu chia sẻ màn hình */
  const startScreenShare = async () => {
    try {
      console.log("🖥️ Yêu cầu quyền chia sẻ màn hình...");
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" },
        audio: true
      });

      // Nếu display stream không có audio, thêm audio từ mic
      if (screenStream.getAudioTracks().length === 0 && localStreamRef.current) {
        console.log("🎙️ Màn hình không có âm thanh → gộp thêm mic track");
        localStreamRef.current.getAudioTracks().forEach(track => {
          screenStream.addTrack(track);
        });
      }

      // Lưu lại stream chia sẻ
      setScreenStream(screenStream);
      screenStreamRef.current = screenStream;
      setIsScreenSharing(true);

      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack) {
        console.warn("⚠️ Không tìm thấy video track trong screenStream!");
        return;
      }

      // Thay thế video track trong tất cả peer connections
      peerConnections.current.forEach((pc, peerId) => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          console.log(`🔄 Replacing camera track with screen track for ${peerId}`);
          sender.replaceTrack(screenTrack);
        } else {
          console.warn(`⚠️ No video sender found for ${peerId}`);
        }
      });

      // Khi người dùng dừng chia sẻ từ popup Chrome
      screenTrack.onended = () => {
        console.warn("🛑 Người dùng dừng chia sẻ màn hình (chrome event)");
        setTimeout(() => stopScreenShare(), 500); // delay 0.5s tránh lỗi renegotiation race
      };

      // 🔁 Gửi lại renegotiation offer đến tất cả peers
      peerConnections.current.forEach(async (pc, peerId) => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socketService.emit("webrtc-offer", { roomId, targetId: peerId, offer });
          console.log(`🔁 Sent renegotiation offer to ${peerId} for screen share`);
        } catch (err) {
          console.error(`❌ Error renegotiating with ${peerId}:`, err);
        }
      });

      console.log("✅ Bắt đầu chia sẻ màn hình thành công");
    } catch (err) {
      console.error("❌ Lỗi chia sẻ màn hình:", err);
    }
  };

  /** 🔹 Dừng chia sẻ màn hình */
  const stopScreenShare = () => {
    console.log("🛑 Dừng chia sẻ màn hình và khôi phục camera...");
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    setScreenStream(null);
    setIsScreenSharing(false);

    // Khôi phục lại camera
    const videoTrack = localStreamRef.current?.getVideoTracks()?.[0];
    if (!videoTrack) {
      console.warn("⚠️ Không có camera video track để khôi phục");
      return;
    }

    peerConnections.current.forEach((pc, peerId) => {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(videoTrack);
        console.log(`🎥 Restored camera track for ${peerId}`);
      }
    });

    // 🔁 Gửi renegotiation offer để đồng bộ lại camera
    peerConnections.current.forEach(async (pc, peerId) => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketService.emit("webrtc-offer", { roomId, targetId: peerId, offer });
        console.log(`🔁 Sent renegotiation offer to ${peerId} for camera restore`);
      } catch (err) {
        console.error(`❌ Error renegotiating with ${peerId}:`, err);
      }
    });
  };

  /** 🔹 Cleanup */
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
    setLocalStream(null);
    setRemoteStreams(new Map());
    setScreenStream(null);
    setRemoteScreenStreams(new Map());
  }, []);

  /** 🔹 Lắng nghe socket */
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    socket.on('webrtc-offer', ({ senderId, offer }) => handleOffer(senderId, offer));
    socket.on('webrtc-answer', ({ senderId, answer }) => handleAnswer(senderId, answer));
    socket.on('webrtc-ice-candidate', ({ senderId, candidate }) => handleIceCandidate(senderId, candidate));

    return () => {
      socket.off('webrtc-offer');
      socket.off('webrtc-answer');
      socket.off('webrtc-ice-candidate');
    };
  }, [handleOffer, handleAnswer, handleIceCandidate]);

  return {
    localStream,
    remoteStreams,
    screenStream,
    remoteScreenStreams,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
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
