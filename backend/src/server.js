// backend/src/server.js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { setupSocketHandlers } from './socketHandlers.js';

dotenv.config();

const app = express();
const server = createServer(app);

// CORS configuration
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API endpoint để lấy danh sách phòng
app.get('/api/rooms', (req, res) => {
  const rooms = Array.from(io.sockets.adapter.rooms.entries())
    .filter(([key]) => !io.sockets.sockets.has(key))
    .map(([id, sockets]) => ({
      id,
      participantCount: sockets.size
    }));
  
  res.json(rooms);
});

// Setup Socket.IO handlers
setupSocketHandlers(io);

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log('🚀 ========================================');
  console.log(`🌐 Server đang chạy tại: http://localhost:${PORT}`);
  console.log(`📡 Socket.IO server sẵn sàng`);
  console.log(`🔗 Client URL: ${process.env.CLIENT_URL}`);
  console.log('🚀 ========================================');
});