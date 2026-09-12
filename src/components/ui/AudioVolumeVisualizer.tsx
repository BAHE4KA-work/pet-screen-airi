import React, { useEffect, useRef, useState } from 'react';

interface AudioVolumeVisualizerProps {
  stream?: MediaStream | null;
  isActive: boolean;
  barCount?: number;
  className?: string;
  showLevelText?: boolean;
}

export const AudioVolumeVisualizer: React.FC<AudioVolumeVisualizerProps> = ({
  stream,
  isActive,
  barCount = 6,
  className = '',
  showLevelText = false
}) => {
  const [volumeLevels, setVolumeLevels] = useState<number[]>(() => new Array(barCount).fill(15));
  const [rmsVolume, setRmsVolume] = useState<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!isActive || !stream) {
      setVolumeLevels(new Array(barCount).fill(15));
      setRmsVolume(0);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.65;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        // Compute average & discrete frequencies for bars
        let sum = 0;
        const step = Math.max(1, Math.floor(bufferLength / barCount));
        const bars: number[] = [];

        for (let i = 0; i < barCount; i++) {
          const val = dataArray[i * step] || 0;
          sum += val;
          // Scale 0..255 to percentage (15% min height, 100% max)
          const normalized = Math.min(100, Math.max(15, (val / 255) * 100 * 1.6));
          bars.push(Math.round(normalized));
        }

        const avg = Math.round((sum / bufferLength / 255) * 100);
        setRmsVolume(avg);
        setVolumeLevels(bars);

        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };

      updateVolume();
    } catch (err) {
      console.warn('[AudioVolumeVisualizer] Web Audio API init error:', err);
      // Fallback pulse simulation if Web Audio is blocked
      const interval = setInterval(() => {
        setVolumeLevels(prev => prev.map(() => Math.round(20 + Math.random() * 60)));
      }, 120);
      return () => clearInterval(interval);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [isActive, stream, barCount]);

  if (!isActive) return null;

  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--c-peach-surface)] border border-[var(--c-peach-border)] select-none ${className}`}>
      {/* Equalizer Bars */}
      <div className="flex items-end gap-[3px] h-4.5 px-0.5">
        {volumeLevels.map((lvl, idx) => (
          <div
            key={idx}
            className="w-1 rounded-full transition-all duration-75"
            style={{
              height: `${lvl}%`,
              minHeight: '4px',
              maxHeight: '18px',
              backgroundColor: lvl > 45 ? 'var(--c-peach)' : 'var(--c-peach-light)',
              opacity: Math.max(0.4, lvl / 100)
            }}
          />
        ))}
      </div>

      {showLevelText && (
        <span className="text-[10px] font-mono text-[var(--c-peach-light)] pl-1">
          {rmsVolume > 5 ? `Громкость: ${rmsVolume}%` : 'Говорите...'}
        </span>
      )}
    </div>
  );
};
