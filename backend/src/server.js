// backend/src/server.js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
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
app.use(express.json());

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

// Cleanup old files every 6 hours
setInterval(() => {
  cleanupOldFiles(24); // Delete files older than 24 hours
}, 6 * 60 * 60 * 1000);

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