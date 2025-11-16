// frontend/src/components/ScreenSharePlayer.jsx
import React, { useEffect, useRef } from 'react';

const ScreenSharePlayer = ({ stream, username, isLocal, streamVersion = 0 }) => {
  const videoRef = useRef(null);
  const playAttempts = useRef(0);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !stream) return;

    console.log(`🎥 ScreenSharePlayer: Setting stream for ${username}`, {
      streamId: stream.id,
      isLocal,
      streamVersion,
      tracks: stream.getTracks().map(t => ({
        kind: t.kind,
        label: t.label,
        enabled: t.enabled
      }))
    });

    // Set srcObject
    videoEl.srcObject = stream;
    videoEl.muted = isLocal;
    playAttempts.current = 0;

    // Aggressive play strategy
    const tryPlay = async () => {
      try {
        await videoEl.play();
        console.log(`✅ Screen share playing for ${username}`);
      } catch (error) {
        console.warn(`⚠️ Play attempt ${playAttempts.current + 1} failed:`, error.message);
        
        if (playAttempts.current < 3) {
          playAttempts.current++;
          
          // Try muted
          if (!videoEl.muted) {
            console.log('🔇 Retrying with muted...');
            videoEl.muted = true;
            setTimeout(tryPlay, 200);
          } else {
            // Retry after delay
            setTimeout(tryPlay, 500);
          }
        } else {
          console.error(`❌ Failed to play after ${playAttempts.current} attempts`);
        }
      }
    };

    // Start playing
    tryPlay();

    // Cleanup
    return () => {
      if (videoEl) {
        videoEl.srcObject = null;
      }
    };
  }, [stream, username, isLocal, streamVersion]);

  // Click to unmute (if was auto-muted)
  const handleClick = () => {
    const videoEl = videoRef.current;
    if (videoEl && videoEl.muted && !isLocal) {
      videoEl.muted = false;
      videoEl.play().catch(e => console.error('Unmute play error:', e));
      console.log('🔊 Unmuted by user click');
    }
  };

  return (
    <div className="relative w-full h-full" onClick={handleClick}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className="w-full h-full object-contain cursor-pointer"
      />
      {!isLocal && (
        <div className="absolute bottom-4 right-4 bg-black bg-opacity-50 px-3 py-1 rounded text-white text-xs">
          Click để bật âm thanh
        </div>
      )}
    </div>
  );
};

export default ScreenSharePlayer;