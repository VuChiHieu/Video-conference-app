// backend/src/socketHandlers.js
import { RoomManager } from './utils/roomManager.js';

const roomManager = new RoomManager();

export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log('✅ User connected:', socket.id);

    // JOIN ROOM
    socket.on('join-room', ({ roomId, username }) => {
      try {
        socket.join(roomId);
        
        // Thêm user vào room
        const participant = roomManager.addParticipant(roomId, {
          id: socket.id,
          username,
          isMuted: false,
          isVideoOff: false
        });

        // Lấy thông tin room
        const room = roomManager.getRoom(roomId);

        // Gửi thông tin room cho user mới join
        socket.emit('room-joined', {
          participants: Array.from(room.participants.values()),
          messages: room.messages
        });

        // Thông báo cho những user khác
        socket.to(roomId).emit('user-joined', participant);

        // System message
        const systemMsg = {
          type: 'system',
          message: `${username} đã tham gia phòng`,
          timestamp: new Date().toISOString()
        };
        
        roomManager.addMessage(roomId, systemMsg);
        io.to(roomId).emit('chat-message', systemMsg);

        console.log(`👤 ${username} joined room: ${roomId}`);
      } catch (error) {
        console.error('Error joining room:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // CHAT MESSAGE
    socket.on('chat-message', ({ roomId, username, message }) => {
      try {
        const chatMsg = {
          type: 'chat',
          username,
          message,
          timestamp: new Date().toISOString()
        };

        roomManager.addMessage(roomId, chatMsg);
        io.to(roomId).emit('chat-message', chatMsg);

        console.log(`💬 [${roomId}] ${username}: ${message}`);
      } catch (error) {
        console.error('Error sending chat message:', error);
      }
    });

    socket.on('file-message', ({ roomId, username, fileData }) => {
      try {
        const fileMsg = {
          type: 'file',
          username,
          fileData,
          timestamp: new Date().toISOString()
        };

        roomManager.addMessage(roomId, fileMsg);
        io.to(roomId).emit('chat-message', fileMsg);

        console.log(`📎 [${roomId}] ${username} sent file: ${fileData.originalName}`);
      } catch (error) {
        console.error('Error sending file message:', error);
      }
    });

    // TOGGLE MUTE
    socket.on('toggle-mute', ({ roomId, isMuted }) => {
      try {
        roomManager.updateParticipant(roomId, socket.id, { isMuted });
        socket.to(roomId).emit('user-toggle-mute', {
          userId: socket.id,
          isMuted
        });
        console.log(`🔇 User ${socket.id} ${isMuted ? 'muted' : 'unmuted'}`);
      } catch (error) {
        console.error('Error toggling mute:', error);
      }
    });

    // TOGGLE VIDEO
    socket.on('toggle-video', ({ roomId, isVideoOff }) => {
      try {
        roomManager.updateParticipant(roomId, socket.id, { isVideoOff });
        socket.to(roomId).emit('user-toggle-video', {
          userId: socket.id,
          isVideoOff
        });
        console.log(`📹 User ${socket.id} ${isVideoOff ? 'turned off' : 'turned on'} video`);
      } catch (error) {
        console.error('Error toggling video:', error);
      }
    });

    // WEBRTC SIGNALING - Offer
    socket.on('webrtc-offer', ({ roomId, targetId, offer }) => {
      socket.to(targetId).emit('webrtc-offer', {
        senderId: socket.id,
        offer
      });
      console.log(`📞 WebRTC offer sent from ${socket.id} to ${targetId}`);
    });

    // WEBRTC SIGNALING - Answer
    socket.on('webrtc-answer', ({ roomId, targetId, answer }) => {
      socket.to(targetId).emit('webrtc-answer', {
        senderId: socket.id,
        answer
      });
      console.log(`📞 WebRTC answer sent from ${socket.id} to ${targetId}`);
    });

    // WEBRTC SIGNALING - ICE Candidate
    socket.on('webrtc-ice-candidate', ({ roomId, targetId, candidate }) => {
      socket.to(targetId).emit('webrtc-ice-candidate', {
        senderId: socket.id,
        candidate
      });
    });

    // LEAVE ROOM
    socket.on('leave-room', ({ roomId, username }) => {
      handleUserLeave(socket, roomId, username, io);
    });

    // Screen share started
    socket.on('screen-share-started', ({ roomId }) => {
      console.log(`🖥️ User ${socket.id} started screen sharing in room: ${roomId}`);
      socket.to(roomId).emit('user-screen-share-started', { userId: socket.id });
    });

    // Screen share stopped
    socket.on('screen-share-stopped', ({ roomId }) => {
      console.log(`🛑 User ${socket.id} stopped screen sharing in room: ${roomId}`);
      socket.to(roomId).emit('user-screen-share-stopped', { userId: socket.id });
    });

    // Screen share offer
    socket.on('screen-share-offer', ({ roomId, targetId, offer }) => {
      socket.to(targetId).emit('screen-share-offer', {
        senderId: socket.id,
        offer
      });
      console.log(`🖥️ Screen share offer sent from ${socket.id} to ${targetId}`);
    });

    // Screen share answer
    socket.on('screen-share-answer', ({ roomId, targetId, answer }) => {
      socket.to(targetId).emit('screen-share-answer', {
        senderId: socket.id,
        answer
      });
      console.log(`🖥️ Screen share answer sent from ${socket.id} to ${targetId}`);
    });

    // Screen ICE candidate
    socket.on('screen-ice-candidate', ({ roomId, targetId, candidate }) => {
      socket.to(targetId).emit('screen-ice-candidate', {
        senderId: socket.id,
        candidate
      });
    });

    // DISCONNECT
    socket.on('disconnect', () => {
      console.log('❌ User disconnected:', socket.id);
      
      // Tìm và xóa user khỏi tất cả rooms
      const userRooms = roomManager.getUserRooms(socket.id);
      userRooms.forEach(roomId => {
        const participant = roomManager.getParticipant(roomId, socket.id);
        if (participant) {
          handleUserLeave(socket, roomId, participant.username, io);
        }
      });
    });
  });
}

function handleUserLeave(socket, roomId, username, io) {
  try {
    const participant = roomManager.removeParticipant(roomId, socket.id);
    
    if (participant) {
      // System message
      const systemMsg = {
        type: 'system',
        message: `${username} đã rời phòng`,
        timestamp: new Date().toISOString()
      };
      
      roomManager.addMessage(roomId, systemMsg);
      socket.to(roomId).emit('chat-message', systemMsg);
      socket.to(roomId).emit('user-left', { userId: socket.id });

      console.log(`👋 ${username} left room: ${roomId}`);

      // Xóa room nếu trống
      if (roomManager.isRoomEmpty(roomId)) {
        roomManager.deleteRoom(roomId);
        console.log(`🗑️  Room ${roomId} deleted (empty)`);
      }
    }

    socket.leave(roomId);
  } catch (error) {
    console.error('Error handling user leave:', error);
  }
}