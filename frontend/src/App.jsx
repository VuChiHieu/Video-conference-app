import React, { useState, useEffect, useRef } from 'react';
import { Send, Users, Video, Mic, MicOff, VideoOff, PhoneOff, Settings, MoreVertical, Smile, Paperclip, Monitor, X } from 'lucide-react';
import socketService from './services/socketService';
import { useWebRTC } from './hooks/useWebRTC';
import ScreenSharePlayer from './components/ScreenSharePlayer';
import VideoPlayer from './components/VideoPlayer';
import FileMessage from './components/FileMessage';
import EmojiPicker from 'emoji-picker-react';

function App() {
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef(null);

  // ✅ FIX LỖI 4: Removed remoteScreenStreams (không tồn tại)
  const {
    localStream,
    remoteStreams,
    isAudioEnabled,
    isVideoEnabled,
    screenStream,
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
  } = useWebRTC(roomId);

  useEffect(() => {
    if (isJoined) {
      console.log('🚀 Starting initialization...');
      
      const socket = socketService.connect();

      socket.on('connect', () => {
        console.log('✅ Connected to server:', socket.id);
        setConnectionStatus('connected');
      });

      socket.on('disconnect', () => {
        console.log('❌ Disconnected from server');
        setConnectionStatus('disconnected');
      });

      socket.on('connect_error', (error) => {
        console.error('❌ Connection error:', error);
        setConnectionStatus('error');
      });

      socket.on('room-joined', ({ participants: roomParticipants, messages: roomMessages }) => {
        console.log('🏠 Joined room:', roomId);
        console.log('👥 Participants:', roomParticipants);
        setParticipants(roomParticipants.map(p => ({
          ...p,
          isMe: p.id === socket.id
        })));
        setMessages(roomMessages);

        setTimeout(() => {
          roomParticipants.forEach(participant => {
            if (participant.id !== socket.id) {
              console.log('📞 Creating offer for existing participant:', participant.id);
              createOffer(participant.id);
            }
          });
        }, 3000);
      });

      socket.on('user-joined', (newUser) => {
        console.log('👤 New user joined:', newUser);
        setParticipants(prev => [...prev, { ...newUser, isMe: false }]);
        
        setTimeout(() => {
          console.log('📞 Creating offer for new user:', newUser.id);
          createOffer(newUser.id);
        }, 3000);
      });

      socket.on('user-left', ({ userId }) => {
        console.log('👋 User left:', userId);
        setParticipants(prev => prev.filter(p => p.id !== userId));
        handlePeerDisconnect(userId);
      });

      socket.on('chat-message', (msg) => {
        console.log('💬 New message:', msg);
        setMessages(prev => [...prev, msg]);
      });

      socket.on('user-toggle-mute', ({ userId, isMuted }) => {
        console.log(`🔇 User ${userId} ${isMuted ? 'muted' : 'unmuted'}`);
        setParticipants(prev => prev.map(p =>
          p.id === userId ? { ...p, isMuted } : p
        ));
      });

      socket.on('user-toggle-video', ({ userId, isVideoOff }) => {
        console.log(`📹 User ${userId} ${isVideoOff ? 'turned off' : 'turned on'} video`);
        setParticipants(prev => prev.map(p =>
          p.id === userId ? { ...p, isVideoOff } : p
        ));
      });

      socket.on('user-screen-share-started', ({ userId }) => {
        console.log(`🖥️ User ${userId} started screen sharing`);
        setParticipants(prev => prev.map(p =>
          p.id === userId ? { ...p, isScreenSharing: true } : p
        ));
      });

      socket.on('user-screen-share-stopped', ({ userId }) => {
        console.log(`🛑 User ${userId} stopped screen sharing`);
        setParticipants(prev => prev.map(p =>
          p.id === userId ? { ...p, isScreenSharing: false } : p
        ));
      });

      initializeMedia()
        .then((stream) => {
          console.log('✅ Media initialized successfully:', stream.id);
          
          if (socket.connected) {
            console.log('📤 Emitting join-room...');
            socket.emit('join-room', { roomId, username });
          } else {
            console.log('⏳ Waiting for socket connection before joining room...');
          }
        })
        .catch((error) => {
          console.error('❌ Failed to initialize media:', error);
          alert(`Không thể truy cập camera/microphone!\n\nLỗi: ${error.message}`);
          setIsJoined(false);
        });

      return () => {
        console.log('🚪 Leaving room and cleaning up...');
        const socket = socketService.getSocket();
        if (socket) {
          socket.emit('leave-room', { roomId, username });
          socket.off('connect');
          socket.off('disconnect');
          socket.off('connect_error');
          socket.off('room-joined');
          socket.off('user-joined');
          socket.off('user-left');
          socket.off('chat-message');
          socket.off('user-toggle-mute');
          socket.off('user-toggle-video');
          socket.off('user-screen-share-started');
          socket.off('user-screen-share-stopped');
        }
        cleanup();
        socketService.disconnect();
      };
    }
  }, [isJoined, roomId, username, initializeMedia, createOffer, handlePeerDisconnect, cleanup]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  const handleJoinRoom = () => {
    if (roomId.trim() && username.trim()) {
      console.log(`🚀 Attempting to join room: ${roomId} as ${username}`);
      setIsJoined(true);
    }
  };

  const handleSendMessage = () => {
    if (message.trim()) {
      console.log('📤 Sending message:', message);
      socketService.emit('chat-message', {
        roomId,
        username,
        message: message.trim()
      });
      setMessage('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  const handleToggleMute = () => {
    const enabled = toggleAudio();
    socketService.emit('toggle-mute', { roomId, isMuted: !enabled });
    console.log(`🔇 Bạn đã ${enabled ? 'bật' : 'tắt'} mic`);
  };

  const handleToggleVideo = () => {
    const enabled = toggleVideo();
    
    // ✅ FIX: Đợi toggleVideo complete trước khi emit
    setTimeout(() => {
      socketService.emit('toggle-video', { roomId, isVideoOff: !enabled });
      console.log(`📹 Emitted toggle-video: isVideoOff=${!enabled}`);
    }, 150); // Delay để ensure track state đã sync
    
    console.log(`📹 Bạn đã ${enabled ? 'bật' : 'tắt'} camera`);
  };

  const handleScreenShare = async () => {
    try {
      if (isScreenSharing) {
        stopScreenShare();
      } else {
        await startScreenShare();
      }
    } catch (error) {
      console.error('Screen share error:', error);
    }
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('File quá lớn! Kích thước tối đa là 10MB');
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('http://localhost:3001/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      
      socketService.emit('file-message', {
        roomId,
        username,
        fileData: data.file
      });

      console.log('✅ File uploaded:', data.file.originalName);
    } catch (error) {
      console.error('❌ File upload error:', error);
      alert('Không thể upload file. Vui lòng thử lại!');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handlePaperclipClick = () => {
    fileInputRef.current?.click();
  };

  const handleEmojiClick = (emojiObject) => {
    setMessage(prev => prev + emojiObject.emoji);
    setShowEmojiPicker(false);
  };

  const toggleEmojiPicker = () => {
    setShowEmojiPicker(!showEmojiPicker);
  };

  const leaveRoom = () => {
    setIsJoined(false);
    setMessages([]);
    setParticipants([]);
    setRoomId('');
    setConnectionStatus('disconnected');
  };

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black opacity-10"></div>
        
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute w-96 h-96 bg-white opacity-5 rounded-full -top-48 -left-48 animate-pulse"></div>
          <div className="absolute w-96 h-96 bg-white opacity-5 rounded-full -bottom-48 -right-48 animate-pulse" style={{ animationDelay: '1s' }}></div>
        </div>

        <div className="relative bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md backdrop-blur-sm bg-opacity-95">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl mb-4 shadow-lg">
              <Video className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Phòng Họp Trực Tuyến</h1>
            <p className="text-gray-600">Kết nối, Trò chuyện, Cộng tác</p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Tên của bạn
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nhập tên của bạn..."
                className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Mã phòng
              </label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Nhập hoặc tạo mã phòng..."
                className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
              />
            </div>

            <button
              onClick={handleJoinRoom}
              disabled={!roomId.trim() || !username.trim()}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-xl font-semibold hover:shadow-lg transform hover:scale-[1.02] transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Video className="w-5 h-5" />
              Tham gia phòng họp
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="flex items-center justify-center gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-indigo-600" />
                <span>Video HD</span>
              </div>
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-indigo-600" />
                <span>Audio rõ ràng</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                <span>Không giới hạn</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Video className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white font-semibold">Phòng: {roomId}</h2>
              <p className="text-gray-400 text-xs flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                }`}></span>
                {participants.length} người tham gia
                {connectionStatus === 'error' && <span className="text-red-400">(Lỗi kết nối)</span>}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-700 transition-colors">
            <Settings className="w-5 h-5" />
          </button>
          <button className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-700 transition-colors">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 h-full">
            {participants.length === 0 ? (
              <div className="col-span-full flex items-center justify-center h-full">
                <div className="text-center text-gray-400">
                  <Users className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">Đang chờ kết nối...</p>
                  <p className="text-sm mt-2">Kiểm tra Console (F12) để xem log</p>
                </div>
              </div>
            ) : (
              <>
                {(isScreenSharing || participants.some(p => p.isScreenSharing)) && (
                  <div className="col-span-full mb-4">
                    <div className="bg-gray-800 rounded-xl overflow-hidden border-2 border-indigo-500 shadow-2xl">
                      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 flex items-center gap-2">
                        <Monitor className="w-5 h-5 text-white" />
                        <span className="text-white font-semibold">
                          {isScreenSharing 
                            ? 'Bạn đang chia sẻ màn hình' 
                            : `${participants.find(p => p.isScreenSharing)?.username} đang chia sẻ màn hình`
                          }
                        </span>
                      </div>
                      <div className="aspect-video bg-black relative">
                        {(() => {
                          if (isScreenSharing) {
                            return (
                              <ScreenSharePlayer
                                stream={screenStream}
                                username={username}
                                isLocal={true}
                              />
                            );
                          } else {
                            const sharingPeer = participants.find(p => p.isScreenSharing && !p.isMe);
                            if (!sharingPeer) {
                              return (
                                <div className="flex items-center justify-center h-full text-white">
                                  <p className="text-sm">Không tìm thấy người chia sẻ</p>
                                </div>
                              );
                            }

                            const remoteStream = remoteStreams.get(sharingPeer.id);
                            
                            if (!remoteStream) {
                              return (
                                <div className="flex items-center justify-center h-full text-white">
                                  <div className="text-center">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                                    <p className="text-sm">Đang tải stream...</p>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <ScreenSharePlayer
                                stream={remoteStream}
                                username={sharingPeer.username}
                                isLocal={false}
                                streamVersion={streamVersion}
                              />
                            );
                          }
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {participants
                  .filter(p => !(p.isScreenSharing && !p.isMe))
                  .map((participant) => {
                    if (participant.isMe) {
                      return (
                        <VideoPlayer
                          key={participant.id}
                          stream={localStream}
                          username={participant.username}
                          isMuted={!isAudioEnabled}
                          isVideoOff={!isVideoEnabled}
                          isLocal={true}
                        />
                      );
                    }
                    
                    const remoteStream = remoteStreams.get(participant.id);
                    console.log(`🎬 Rendering VideoPlayer for ${participant.username}:`, {
                      hasStream: !!remoteStream,
                      streamVersion,
                      streamId: remoteStream?.id,
                      tracks: remoteStream?.getTracks().map(t => ({kind: t.kind, enabled: t.enabled}))
                    });
                    
                    return (
                      <VideoPlayer
                        key={`${participant.id}-${streamVersion}`}
                        stream={remoteStream}
                        username={participant.username}
                        isMuted={participant.isMuted}
                        isVideoOff={participant.isVideoOff}
                        isLocal={false}
                      />
                    );
                })}
              </>
            )}
          </div>
        </div>

        <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col relative">
          <div className="px-4 py-3 border-b border-gray-700">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <Users className="w-5 h-5" />
              Trò chuyện
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 mt-8">
                <p className="text-sm">Chưa có tin nhắn nào</p>
                <p className="text-xs mt-2">Hãy gửi tin nhắn đầu tiên! 👋</p>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div key={index}>
                  {msg.type === 'system' ? (
                    <div className="text-center">
                      <span className="text-xs bg-gray-700 text-gray-300 px-3 py-1 rounded-full">
                        {msg.message}
                      </span>
                    </div>
                  ) : msg.type === 'file' ? (
                    <div className={`flex flex-col ${msg.username === username ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-400">{msg.username}</span>
                        <span className="text-xs text-gray-500">{formatTime(msg.timestamp)}</span>
                      </div>
                      <FileMessage
                        fileData={msg.fileData}
                        isOwn={msg.username === username}
                      />
                    </div>
                  ) : (
                    <div className={`flex flex-col ${msg.username === username ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-400">{msg.username}</span>
                        <span className="text-xs text-gray-500">{formatTime(msg.timestamp)}</span>
                      </div>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                        msg.username === username
                          ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white'
                          : 'bg-gray-700 text-gray-100'
                      }`}>
                        <p className="text-sm">{msg.message}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-gray-700 relative">
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
            />
            
            {showEmojiPicker && (
              <div
                ref={emojiPickerRef}
                className="absolute bottom-full right-0 mb-2 shadow-2xl"
                style={{ zIndex: 1000 }}
              >
                <EmojiPicker
                  onEmojiClick={handleEmojiClick}
                  theme="dark"
                  width={280}
                  height={350}
                  searchPlaceholder="Tìm emoji..."
                  previewConfig={{ showPreview: false }}
                  skinTonesDisabled
                />
              </div>
            )}

            <div className="flex items-center gap-2 bg-gray-700 rounded-xl p-2">
              <button
                type="button"
                onClick={toggleEmojiPicker}
                className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                  showEmojiPicker
                    ? 'text-yellow-400 bg-gray-600'
                    : 'text-gray-400 hover:text-white hover:bg-gray-600'
                }`}
                title="Chọn emoji"
              >
                {showEmojiPicker ? <X className="w-5 h-5" /> : <Smile className="w-5 h-5" />}
              </button>
              <button
                type="button"
                onClick={handlePaperclipClick}
                disabled={isUploading}
                className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-600 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Gửi file"
              >
                {isUploading ? (
                  <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Paperclip className="w-5 h-5" />
                )}
              </button>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Nhập tin nhắn..."
                className="flex-1 bg-transparent text-white placeholder-gray-400 outline-none px-2 min-w-0"
              />
              <button
                onClick={handleSendMessage}
                disabled={!message.trim()}
                className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-2 rounded-lg hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex-shrink-0"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 border-t border-gray-700 px-6 py-4">
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={handleToggleMute}
            className={`p-4 rounded-xl transition-all ${
              !isAudioEnabled
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
            title={isAudioEnabled ? 'Tắt mic' : 'Bật mic'}
          >
            {!isAudioEnabled ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>

          <button
            onClick={handleToggleVideo}
            className={`p-4 rounded-xl transition-all ${
              !isVideoEnabled
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
            title={isVideoEnabled ? 'Tắt camera' : 'Bật camera'}
          >
            {!isVideoEnabled ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
          </button>

          <button
            onClick={handleScreenShare}
            className={`p-4 rounded-xl transition-all ${
              isScreenSharing
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white ring-2 ring-indigo-400'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
            title={isScreenSharing ? 'Dừng chia sẻ màn hình' : 'Chia sẻ màn hình'}
          >
            <Monitor className="w-6 h-6" />
          </button>

          <button
            onClick={leaveRoom}
            className="p-4 rounded-xl bg-red-600 hover:bg-red-700 text-white transition-all ml-4"
            title="Rời phòng"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;