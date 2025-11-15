// backend/src/server.js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { setupSocketHandlers } from './socketHandlers.js';
import { upload, getFileInfo, formatFileSize, cleanupOldFiles } from './fileHandler.js';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const server = createServer(app);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
app.use(express.json({ limit: '10mb' })); // ✅ IMPROVED: Added limit
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // ✅ ADDED: For form data

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve static files từ uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Upload single file
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileInfo = getFileInfo(req.file);
    console.log('📤 File uploaded:', fileInfo.originalName, '-', formatFileSize(fileInfo.size));

    res.json({
      success: true,
      file: fileInfo
    });
  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
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

// Error handling middleware for multer
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Max size is 10MB' });
    }
    return res.status(400).json({ error: error.message });
  }
  
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  
  next();
});

// Setup Socket.IO handlers
setupSocketHandlers(io);

// ✅ ADDED: Socket.IO error handling
io.on('error', (error) => {
  console.error('❌ Socket.IO error:', error);
});

// Cleanup old files every 6 hours
const cleanupInterval = setInterval(() => {
  cleanupOldFiles(24); // Delete files older than 24 hours
}, 6 * 60 * 60 * 1000);

// ✅ ADDED: Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function shutdown() {
  console.log('\n🛑 Server shutting down gracefully...');
  
  clearInterval(cleanupInterval);
  
 const { roomManager } = await import('./socketHandlers.js');
 roomManager?.stopAutoCleanup();
  
  io.close(() => {
    console.log('✅ Socket.IO closed');
  });
  
  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(' ========================================');
  console.log(` ✅ Server đang chạy tại: http://localhost:${PORT}`);
  console.log(` 🔌 Socket.IO server sẵn sàng`);
  console.log(` 🌐 Client URL: ${process.env.CLIENT_URL || 'http://localhost:3000'}`);
  console.log(' ========================================');
});