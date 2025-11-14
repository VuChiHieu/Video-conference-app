// backend/src/utils/roomManager.js
export class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  getRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        participants: new Map(),
        messages: [],
        createdAt: new Date().toISOString()
      });
    }
    return this.rooms.get(roomId);
  }

  addParticipant(roomId, participant) {
    const room = this.getRoom(roomId);
    room.participants.set(participant.id, participant);
    return participant;
  }

  removeParticipant(roomId, participantId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    
    const participant = room.participants.get(participantId);
    room.participants.delete(participantId);
    return participant;
  }

  updateParticipant(roomId, participantId, updates) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const participant = room.participants.get(participantId);
    if (participant) {
      Object.assign(participant, updates);
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
    this.rooms.delete(roomId);
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
      createdAt: room.createdAt
    }));
  }
}