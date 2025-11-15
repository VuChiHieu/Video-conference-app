// backend/src/socketHandlers.js
import { RoomManager } from './utils/roomManager.js';

const roomManager = new RoomManager();

// ✅ ĐÚNG: Đặt ở NGOÀI, ở TOP của file (sau imports)
const offerThrottle = new Map();
const THROTTLE_MS = 500;

function shouldThrottle(key) {
  const last = offerThrottle.get(key);
  const now = Date.now();
  
  if (last && (now - last) < THROTTLE_MS) {
    return true;
  }
  
  offerThrottle.set(key, now);
  return false;
}

// ✅ Cleanup old entries every 10s
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of offerThrottle.entries()) {
    if (now - timestamp > 5000) {
      offerThrottle.delete(key);
    }
  }
}, 10000);

export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log('👤 User connected:', socket.id);

    // JOIN ROOM
    socket.on('join-room', ({ roomId, username }) => {
      try {
        if (!roomId || !username) {
          socket.emit('error', { message: 'Room ID and username are required' });
          return;
        }

        socket.join(roomId);
        
        const participant = roomManager.addParticipant(roomId, {
          id: socket.id,
          username,
          isMuted: false,
          isVideoOff: false,
          isScreenSharing: false
        });

        const room = roomManager.getRoom(roomId);

        socket.emit('room-joined', {
          participants: Array.from(room.participants.values()),
          messages: room.messages
        });

        socket.to(roomId).emit('user-joined', participant);

        const systemMsg = {
          type: 'system',
          message: `${username} đã tham gia phòng`,
          timestamp: new Date().toISOString()
        };
        
        roomManager.addMessage(roomId, systemMsg);
        io.to(roomId).emit('chat-message', systemMsg);

        console.log(`👤 ${username} joined room: ${roomId} (${room.participants.size} participants)`);
      } catch (error) {
        console.error('❌ Error joining room:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // CHAT MESSAGE
    socket.on('chat-message', ({ roomId, username, message }) => {
      try {
        if (!message || !message.trim()) return;
        
        const chatMsg = {
          type: 'chat',
          username,
          message: message.trim().substring(0, 1000),
          timestamp: new Date().toISOString()
        };

        roomManager.addMessage(roomId, chatMsg);
        io.to(roomId).emit('chat-message', chatMsg);

        console.log(`💬 [${roomId}] ${username}: ${message.substring(0, 50)}...`);
      } catch (error) {
        console.error('❌ Error sending chat message:', error);
      }
    });

    // TOGGLE MUTE
    socket.on('toggle-mute', ({ roomId, isMuted }) => {
      try {
        const updated = roomManager.updateParticipant(roomId, socket.id, { isMuted });
        
        if (updated) {
          socket.to(roomId).emit('user-toggle-mute', {
            userId: socket.id,
            isMuted
          });
          console.log(`🔇 User ${socket.id} ${isMuted ? 'muted' : 'unmuted'}`);
        }
      } catch (error) {
        console.error('❌ Error toggling mute:', error);
      }
    });

    // TOGGLE VIDEO
    socket.on('toggle-video', ({ roomId, isVideoOff }) => {
      try {
        const updated = roomManager.updateParticipant(roomId, socket.id, { isVideoOff });
        
        if (updated) {
          socket.to(roomId).emit('user-toggle-video', {
            userId: socket.id,
            isVideoOff
          });
          console.log(`📹 User ${socket.id} ${isVideoOff ? 'turned off' : 'turned on'} video`);
        }
      } catch (error) {
        console.error('❌ Error toggling video:', error);
      }
    });

    // WEBRTC SIGNALING - Offer
    socket.on('webrtc-offer', ({ roomId, targetId, offer }) => {
      try {
        // ✅ Throttle check
        const throttleKey = `${roomId}-${socket.id}-${targetId}`;
        if (shouldThrottle(throttleKey)) {
          console.warn(`⚠️ Throttling offer from ${socket.id} to ${targetId}`);
          return;
        }
        
        const targetExists = roomManager.getParticipant(roomId, targetId);
        if (!targetExists) {
          console.warn(`⚠️ Target ${targetId} not found`);
          return;
        }

        socket.to(targetId).emit('webrtc-offer', {
          senderId: socket.id,
          offer
        });
        console.log(`📞 Offer: ${socket.id} → ${targetId}`);
      } catch (error) {
        console.error('❌ Error sending offer:', error);
      }
    });

    // WEBRTC SIGNALING - Answer
    socket.on('webrtc-answer', ({ roomId, targetId, answer }) => {
      try {
        const targetExists = roomManager.getParticipant(roomId, targetId);
        if (!targetExists) {
          console.warn(`⚠️ Target ${targetId} not found`);
          return;
        }

        socket.to(targetId).emit('webrtc-answer', {
          senderId: socket.id,
          answer
        });
        console.log(`📞 Answer: ${socket.id} → ${targetId}`);
      } catch (error) {
        console.error('❌ Error sending answer:', error);
      }
    });

    // WEBRTC SIGNALING - ICE Candidate
    socket.on('webrtc-ice-candidate', ({ roomId, targetId, candidate }) => {
      try {
        socket.to(targetId).emit('webrtc-ice-candidate', {
          senderId: socket.id,
          candidate
        });
      } catch (error) {
        console.error('❌ Error sending ICE candidate:', error);
      }
    });

    // SCREEN SHARE STARTED
    socket.on('screen-share-started', ({ roomId }) => {
      try {
        roomManager.updateParticipant(roomId, socket.id, { isScreenSharing: true });
        
        console.log(`🖥️ User ${socket.id} started screen sharing`);
        socket.to(roomId).emit('user-screen-share-started', { userId: socket.id });
      } catch (error) {
        console.error('❌ Error handling screen share start:', error);
      }
    });

    // SCREEN SHARE STOPPED
    socket.on('screen-share-stopped', ({ roomId }) => {
      try {
        roomManager.updateParticipant(roomId, socket.id, { isScreenSharing: false });
        
        console.log(`🛑 User ${socket.id} stopped screen sharing`);
        socket.to(roomId).emit('user-screen-share-stopped', { userId: socket.id });
      } catch (error) {
        console.error('❌ Error handling screen share stop:', error);
      }
    });

    // SCREEN SHARE OFFER
    socket.on('screen-share-offer', ({ roomId, targetId, offer }) => {
      try {
        const targetExists = roomManager.getParticipant(roomId, targetId);
        if (!targetExists) {
          console.warn(`⚠️ Screen share target ${targetId} not found`);
          return;
        }

        socket.to(targetId).emit('screen-share-offer', {
          senderId: socket.id,
          offer
        });
        console.log(`🖥️ Screen share offer: ${socket.id} → ${targetId}`);
      } catch (error) {
        console.error('❌ Error sending screen share offer:', error);
      }
    });

    // SCREEN SHARE ANSWER
    socket.on('screen-share-answer', ({ roomId, targetId, answer }) => {
      try {
        socket.to(targetId).emit('screen-share-answer', {
          senderId: socket.id,
          answer
        });
        console.log(`🖥️ Screen share answer: ${socket.id} → ${targetId}`);
      } catch (error) {
        console.error('❌ Error sending screen share answer:', error);
      }
    });

    // SCREEN ICE CANDIDATE
    socket.on('screen-ice-candidate', ({ roomId, targetId, candidate }) => {
      try {
        socket.to(targetId).emit('screen-ice-candidate', {
          senderId: socket.id,
          candidate
        });
      } catch (error) {
        console.error('❌ Error sending screen ICE candidate:', error);
      }
    });

    // FILE MESSAGE
    socket.on('file-message', ({ roomId, username, fileData }) => {
      try {
        if (!fileData || !fileData.filename) {
          console.error('❌ Invalid file data');
          return;
        }

        const fileMsg = {
          type: 'file',
          username,
          fileData,
          timestamp: new Date().toISOString()
        };

        roomManager.addMessage(roomId, fileMsg);
        io.to(roomId).emit('chat-message', fileMsg);

        console.log(`📎 [${roomId}] ${username} sent file: ${fileData.originalName || fileData.filename}`);
      } catch (error) {
        console.error('❌ Error sending file message:', error);
      }
    });

    // LEAVE ROOM
    socket.on('leave-room', ({ roomId, username }) => {
      handleUserLeave(socket, roomId, username, io, roomManager);
    });

    // DISCONNECT
    socket.on('disconnect', () => {
      console.log('❌ User disconnected:', socket.id);
      
      const userRooms = roomManager.getUserRooms(socket.id);
      
      if (userRooms.length > 0) {
        userRooms.forEach(roomId => {
          const participant = roomManager.getParticipant(roomId, socket.id);
          if (participant) {
            handleUserLeave(socket, roomId, participant.username, io, roomManager);
          }
        });
      }
    });

    socket.on('error', (error) => {
      console.error('❌ Socket error:', socket.id, error);
    });
  });
}

// ✅ handleUserLeave KHÔNG CÓ throttle code bên trong
function handleUserLeave(socket, roomId, username, io, roomManager) {
  try {
    const participant = roomManager.getParticipant(roomId, socket.id);
    
    if (!participant) {
      console.warn(`⚠️ User ${socket.id} not found in room ${roomId}`);
      socket.leave(roomId);
      return;
    }

    if (participant.isScreenSharing) {
      socket.to(roomId).emit('user-screen-share-stopped', { userId: socket.id });
    }

    roomManager.removeParticipant(roomId, socket.id);

    const systemMsg = {
      type: 'system',
      message: `${username} đã rời phòng`,
      timestamp: new Date().toISOString()
    };
    
    roomManager.addMessage(roomId, systemMsg);
    io.to(roomId).emit('chat-message', systemMsg);
    
    socket.to(roomId).emit('user-left', { userId: socket.id });

    console.log(`👋 ${username} left room: ${roomId}`);

    socket.leave(roomId);
  } catch (error) {
    console.error('❌ Error handling user leave:', error);
    socket.leave(roomId);
  }
}

export { roomManager };