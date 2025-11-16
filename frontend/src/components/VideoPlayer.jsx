import React, { useEffect, useRef, useState } from 'react';
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
  const [actualVideoEnabled, setActualVideoEnabled] = useState(true);
  const trackRef = useRef(null); // ✅ THÊM: Track reference

  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl && stream) {
      console.log(`🔄 Setting srcObject for ${username}`, {
        isVideoOff,
        streamId: stream.id,
        tracks: stream.getTracks().map(t => ({
          kind: t.kind,
          enabled: t.enabled,
          readyState: t.readyState,
          label: t.label
        }))
      });
      
      videoEl.srcObject = stream;
      videoEl.load();
      
      const playPromise = videoEl.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => console.log(`🎬 Video playing for ${username}`))
          .catch((error) => {
            console.warn(`⚠️ Autoplay prevented for ${username}:`, error);
            videoEl.muted = true;
            videoEl.play().catch(e => console.error('Retry failed:', e));
          });
      }

      // ✅ IMPROVED: Better track state management
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        trackRef.current = videoTrack;
        
        // Set initial state from actual track
        setActualVideoEnabled(videoTrack.enabled);
        console.log(`📹 Initial video track state for ${username}: ${videoTrack.enabled}`);
        
        if (!isLocal) {
          // ✅ Listen to track events for remote streams
          const handleMute = () => {
            console.log(`📹 Remote video track MUTED for ${username}`);
            setActualVideoEnabled(false);
          };
          
          const handleUnmute = () => {
            console.log(`📹 Remote video track UNMUTED for ${username}`);
            setActualVideoEnabled(true);
          };
          
          const handleEnded = () => {
            console.log(`📹 Remote video track ENDED for ${username}`);
            setActualVideoEnabled(false);
          };

          // ✅ THÊM: Listen to track enabled changes
          const checkTrackState = () => {
            if (trackRef.current && trackRef.current.enabled !== actualVideoEnabled) {
              console.log(`📹 Track state changed for ${username}: ${trackRef.current.enabled}`);
              setActualVideoEnabled(trackRef.current.enabled);
            }
          };

          videoTrack.addEventListener('mute', handleMute);
          videoTrack.addEventListener('unmute', handleUnmute);
          videoTrack.addEventListener('ended', handleEnded);
          
          // ✅ THÊM: Fallback polling (chỉ khi cần, mỗi 1s)
          const pollInterval = setInterval(checkTrackState, 1000);

          return () => {
            videoTrack.removeEventListener('mute', handleMute);
            videoTrack.removeEventListener('unmute', handleUnmute);
            videoTrack.removeEventListener('ended', handleEnded);
            clearInterval(pollInterval);
            if (videoEl) {
              videoEl.srcObject = null;
            }
            trackRef.current = null;
          };
        }
      }
    } else {
      console.warn(`⚠️ Cannot set srcObject for ${username}:`, { 
        hasVideoEl: !!videoEl, 
        hasStream: !!stream,
        isVideoOff 
      });
    }

    return () => {
      if (videoEl) {
        videoEl.srcObject = null;
      }
      trackRef.current = null;
    };
  }, [stream, username, isLocal]);

  // ✅ IMPROVED: Sync với prop isVideoOff cho local
  useEffect(() => {
    if (isLocal && trackRef.current) {
      const currentEnabled = trackRef.current.enabled;
      const shouldBeEnabled = !isVideoOff;
      
      if (currentEnabled !== shouldBeEnabled) {
        console.log(`📹 Syncing local video state: ${shouldBeEnabled}`);
        setActualVideoEnabled(shouldBeEnabled);
      }
    }
  }, [isVideoOff, isLocal]);

  // ✅ Logic để quyết định hiển thị video hay placeholder
  const shouldShowVideo = isLocal 
    ? (stream && !isVideoOff) // Local: dùng isVideoOff prop
    : (stream && actualVideoEnabled); // Remote: dùng actual track state

  console.log(`🎨 Rendering ${username}:`, { 
    stream: !!stream, 
    isVideoOff, 
    shouldShowVideo,
    videoClassName: shouldShowVideo ? 'block' : 'hidden',
    isLocal,
    actualVideoEnabled,
    trackEnabled: trackRef.current?.enabled
  });

  return (
    <div className={`relative bg-gray-800 rounded-xl overflow-hidden border-2 border-gray-700 hover:border-indigo-500 transition-all group ${className}`}>
      <div className="aspect-video bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`w-full h-full object-cover ${
            shouldShowVideo ? 'block' : 'hidden'
          }`}
        />
        
        {!shouldShowVideo && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-lg">
              {username.charAt(0).toUpperCase()}
            </div>
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

        {/* Loading indicator */}
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