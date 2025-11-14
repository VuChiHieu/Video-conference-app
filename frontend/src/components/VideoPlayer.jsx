// frontend/src/components/VideoPlayer.jsx
import React, { useEffect, useRef } from 'react';
import { Video, MicOff } from 'lucide-react';

const VideoPlayer = ({ 
  stream, 
  username, 
  isMuted, 
  isVideoOff, 
  isLocal = false,
  className = '' 
}) => {
  const videoRef = useRef(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl && stream) {
      videoEl.srcObject = stream;
      const playPromise = videoEl.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => console.log(`🎬 Video playing for ${username}`))
          .catch((error) => console.warn(`⚠️ Autoplay prevented for ${username}:`, error));
      }
    }

    return () => {
      if (videoEl) videoEl.srcObject = null; // cleanup stream
    };
  }, [stream, username]);

  return (
    <div className={`relative bg-gray-800 rounded-xl overflow-hidden border-2 border-gray-700 hover:border-indigo-500 transition-all group ${className}`}>
      <div className="aspect-video bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center relative">
        {stream && !isVideoOff ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal} // Local video luôn muted để tránh echo
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            {isVideoOff ? (
              <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                {username.charAt(0).toUpperCase()}
              </div>
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-indigo-900 to-purple-900 flex items-center justify-center">
                <Video className="w-12 h-12 text-indigo-300 opacity-50" />
              </div>
            )}
          </div>
        )}
        
        {/* Overlay info */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-white font-medium">{username}</span>
              {isLocal && (
                <span className="text-xs bg-indigo-600 text-white px-2 py-1 rounded-full">
                  Bạn
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isMuted ? (
                <MicOff className="w-4 h-4 text-red-400" />
              ) : (
                <div className="flex items-center gap-1">
                  <div className="w-1 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  <div className="w-1 h-4 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-1 h-2 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Loading indicator khi chưa có stream */}
        {!stream && !isVideoOff && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoPlayer;