import React, { useEffect, useRef, useState } from 'react';
import { Monitor, Video, VideoOff, Maximize2, ShieldCheck, Cpu, Activity } from 'lucide-react';
import { electronBridge } from '../utils/electronBridge';

interface DesktopBackgroundProps {
  opacity: number;
  showSimulatedMockup?: boolean;
}

export const DesktopBackground: React.FC<DesktopBackgroundProps> = ({
  opacity,
  showSimulatedMockup = false
}) => {
  const isOverlay = electronBridge.isElectron();
  const [isScreenMirroring, setIsScreenMirroring] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startScreenMirror = async () => {
    try {
      setStreamError(null);
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
          frameRate: { ideal: 60, max: 60 }
        } as any,
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsScreenMirroring(true);

      // Handle user stopping screen share from browser bar
      stream.getVideoTracks()[0].onended = () => {
        stopScreenMirror();
      };
    } catch (err: any) {
      console.warn('Screen capture declined or unavailable:', err);
      setStreamError('Доступ к захвату экрана не был предоставлен');
      setIsScreenMirroring(false);
    }
  };

  const stopScreenMirror = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScreenMirroring(false);
  };

  useEffect(() => {
    return () => {
      stopScreenMirror();
    };
  }, []);

  return (
    <div
      id="desktop-background-layer"
      className="fixed inset-0 pointer-events-none select-none z-0 overflow-hidden"
    >
      {/* 1. Live Screen Mirror (real desktop video stream beneath the HUD in browser) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 pointer-events-none ${
          isScreenMirroring ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* 2. Soft Ambient Dimmer (only in browser preview mode when not live mirroring) */}
      {!isScreenMirroring && !isOverlay && (
        <div
          className="absolute inset-0 transition-opacity duration-300 pointer-events-none"
          style={{
            opacity: opacity,
            background: 'radial-gradient(ellipse at center, rgba(14, 17, 24, 0.45) 0%, rgba(6, 8, 12, 0.75) 100%)'
          }}
        />
      )}

      {/* 3. Optional Simulated Mockup (strictly disabled by default, only shown if user turned it on in settings) */}
      {showSimulatedMockup && !isScreenMirroring && (
        <div className="absolute inset-0 pointer-events-none opacity-40">
          <div className="absolute top-16 left-12 w-96 p-4 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md text-xs font-mono text-white/50">
            <div className="flex items-center gap-2 mb-2 pb-1 border-b border-white/10">
              <span className="w-2 h-2 rounded-full bg-emerald-400/80" />
              <span>airi-daemon.log</span>
            </div>
            <p>[ready] Screen overlay active</p>
            <p>[ready] Hotkey registered: Alt+Space</p>
          </div>
        </div>
      )}
    </div>
  );
};
