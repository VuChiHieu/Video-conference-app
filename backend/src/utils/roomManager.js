// backend/src/utils/roomManager.js
export class RoomManager {
  constructor() {
    this.rooms = new Map();
    //  ADDED: Auto cleanup empty rooms every 5 minutes
    this.startAutoCleanup();
  }

  getRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        participants: new Map(),
        messages: [],
        createdAt: new Date().toISOString(),
        lastActivity: Date.now() //  ADDED: Track activity
      });
    }
    return this.rooms.get(roomId);
  }

  addParticipant(roomId, participant) {
    const room = this.getRoom(roomId);
    
    //  IMPROVED: Check for duplicate participant
    if (room.participants.has(participant.id)) {
      console.warn(`⚠️  Participant ${participant.id} already in room ${roomId}`);
      return room.participants.get(participant.id);
    }
    
    room.participants.set(participant.id, {
      ...participant,
      joinedAt: new Date().toISOString() //  ADDED: Track join time
    });
    
    room.lastActivity = Date.now(); //  ADDED: Update activity
    return room.participants.get(participant.id);
  }

  removeParticipant(roomId, participantId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    
    const participant = room.participants.get(participantId);
    if (participant) {
      room.participants.delete(participantId);
      room.lastActivity = Date.now(); //  ADDED: Update activity
      
      //  ADDED: Auto cleanup if room becomes empty
      if (room.participants.size === 0) {
        this.scheduleRoomDeletion(roomId);
      }
    }
    return participant;
  }

  updateParticipant(roomId, participantId, updates) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const participant = room.participants.get(participantId);
    if (participant) {
      Object.assign(participant, updates);
      room.lastActivity = Date.now(); //  ADDED: Update activity
    }
    return participant;
  }

  getParticipant(roomId, participantId) {
    const room = this.rooms.get(roomId);
    return room?.participants.get(participantId);
  }

  addMessage(roomId, message) {
    const room = this.getRoom(roomId);
    room.messages.push(message);
    room.lastActivity = Date.now(); //  ADDED: Update activity
    
    // Giới hạn 100 tin nhắn gần nhất
    if (room.messages.length > 100) {
      room.messages = room.messages.slice(-100);
    }
  }

  isRoomEmpty(roomId) {
    const room = this.rooms.get(roomId);
    return !room || room.participants.size === 0;
  }

  deleteRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (room) {
      //  ADDED: Clear all data before deleting
      room.participants.clear();
      room.messages = [];
      this.rooms.delete(roomId);
      console.log(`🗑️  Room ${roomId} deleted completely`);
    }
  }

  //  ADDED: Schedule room deletion after timeout
  scheduleRoomDeletion(roomId, timeoutMs = 5 * 60 * 1000) {
    setTimeout(() => {
      if (this.isRoomEmpty(roomId)) {
        this.deleteRoom(roomId);
      }
    }, timeoutMs);
  }

  getUserRooms(userId) {
    const rooms = [];
    this.rooms.forEach((room, roomId) => {
      if (room.participants.has(userId)) {
        rooms.push(roomId);
      }
    });
    return rooms;
  }

  getAllRooms() {
    return Array.from(this.rooms.values()).map(room => ({
      id: room.id,
      participantCount: room.participants.size,
      createdAt: room.createdAt,
      lastActivity: room.lastActivity //  ADDED
    }));
  }

  //  ADDED: Get room statistics
  getRoomStats() {
    let totalParticipants = 0;
    let totalMessages = 0;
    
    this.rooms.forEach(room => {
      totalParticipants += room.participants.size;
      totalMessages += room.messages.length;
    });

    return {
      totalRooms: this.rooms.size,
      totalParticipants,
      totalMessages,
      rooms: this.getAllRooms()
    };
  }

  //  ADDED: Auto cleanup stale rooms
  startAutoCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const staleTimeout = 30 * 60 * 1000; // 30 minutes

      this.rooms.forEach((room, roomId) => {
        // Delete empty rooms that have been inactive for 30 mins
        if (room.participants.size === 0 && 
            (now - room.lastActivity) > staleTimeout) {
          console.log(`🧹 Auto-cleaning stale room: ${roomId}`);
          this.deleteRoom(roomId);
        }
      });
    }, 5 * 60 * 1000); // Run every 5 minutes
  }

  // ADDED: Stop cleanup (for graceful shutdown)
  stopAutoCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // ADDED: Clear all rooms (for testing or shutdown)
  clearAll() {
    this.rooms.forEach((room, roomId) => {
      room.participants.clear();
      room.messages = [];
    });
    this.rooms.clear();
    console.log('🧹 All rooms cleared');
  }
}