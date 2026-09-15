import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  ArrowRight,
  Loader2,
  Settings,
  X,
  Pin,
  CheckCircle2,
  AlertCircle,
  GripHorizontal,
  Mic,
  MicOff,
  History,
  CornerDownLeft,
  Cpu,
  ChevronDown,
  Activity
} from 'lucide-react';
import { ModelStatus, ViewSpec, STTConfig } from '../types';
import { soundEffects } from '../utils/audioEffects';
import { getSmartQuerySuggestions, SuggestionMatch } from '../utils/fuzzySearch';
import { electronBridge } from '../utils/electronBridge';
import { audioDevicesManager, AudioDeviceOption } from '../utils/audioDevices';
import { actionLogger } from '../utils/actionLogger';
import { AudioVolumeVisualizer } from './ui/AudioVolumeVisualizer';

interface FloatingHudProps {
  status: ModelStatus | null;
  history?: string[];
  isPinned?: boolean;
  onTogglePin?: () => void;
  onSpawnView?: (view: ViewSpec) => void;
  onExecuteQuery: (prompt: string) => Promise<any>;
  onOpenSettings: (tab?: string) => void;
  onClose: () => void;
}

interface ActiveToolInvocation {
  toolName: string;
  arguments?: Record<string, unknown>;
  message: string;
}

export const FloatingHud: React.FC<FloatingHudProps> = ({
  status,
  history = [],
  isPinned = false,
  onTogglePin,
  onSpawnView,
  onExecuteQuery,
  onOpenSettings,
  onClose
}) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeToolInvocation, setActiveToolInvocation] = useState<ActiveToolInvocation | null>(null);
  const [resultData, setResultData] = useState<any | null>(null);
  const [errorData, setErrorData] = useState<string | null>(null);

  // Auto-completion suggestions state
  const [suggestions, setSuggestions] = useState<SuggestionMatch[]>([]);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState<number>(-1);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Voice recording & microphone state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribingStatus, setTranscribingStatus] = useState<string>('');
  const [transcribingSeconds, setTranscribingSeconds] = useState(0);
  const [activeAudioStream, setActiveAudioStream] = useState<MediaStream | null>(null);
  const [audioDevices, setAudioDevices] = useState<AudioDeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(() => audioDevicesManager.getStoredDeviceId());
  const [showMicMenu, setShowMicMenu] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeWindowsCount, setActiveWindowsCount] = useState(0);
  const [currentProcessingWindow, setCurrentProcessingWindow] = useState<number | null>(null);
  const [activeWindowIndex, setActiveWindowIndex] = useState(0);
  const [sttConfig, setSttConfig] = useState<STTConfig>({
    endpoint: 'http://localhost:8000/v1/audio/transcriptions',
    model: 'whisper-base-ru.bin',
    modelFile: 'whisper-base-ru.bin',
    language: 'ru',
    enabled: true,
    vadPauseMs: 300,
    vadMinSpeechMs: 350,
    vadThreshold: 0.03
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechRecognitionRef = useRef<any>(null);
  const streamIdRef = useRef<string>('');
  const chunkIndexRef = useRef<number>(0);
  const windowIndexRef = useRef<number>(0);
  const streamActiveRef = useRef<boolean>(false);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const hasSpokenInWindowRef = useRef<boolean>(false);
  const speechStartTimeRef = useRef<number>(0);
  const lastSpeechTimeRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadIntervalRef = useRef<any>(null);
  const receivedWindowsRef = useRef<Map<number, string>>(new Map());
  const activeWindowChunksRef = useRef<Blob[]>([]);

  // Draggable positioning state
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    const initialX = Math.max(20, (window.innerWidth - 560) / 2);
    const initialY = Math.max(60, window.innerHeight * 0.18);
    return { x: initialX, y: initialY };
  });

  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const hudRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Transcribing seconds counter
  useEffect(() => {
    let timer: any;
    if (isTranscribing) {
      setTranscribingSeconds(0);
      timer = setInterval(() => {
        setTranscribingSeconds(prev => prev + 1);
      }, 1000);
    } else {
      setTranscribingSeconds(0);
    }
    return () => clearInterval(timer);
  }, [isTranscribing]);

  // Listen to Server-Sent Events for real-time STT updates
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/events');

      es.addEventListener('stt_window_queued', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          setActiveWindowsCount(data.queueLength ?? 1);
        } catch {}
      });

      es.addEventListener('stt_window_processing', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          setCurrentProcessingWindow(data.windowIndex);
          setIsTranscribing(true);
          setTranscribingStatus(`whisper.cpp: декодирование окна #${data.windowIndex}...`);
        } catch {}
      });

      es.addEventListener('stt_window_result', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const winText = data.text?.trim();
          if (winText) {
            receivedWindowsRef.current.set(data.windowIndex, winText);
            const ordered = Array.from(receivedWindowsRef.current.entries())
              .sort(([a], [b]) => a - b)
              .map(([, t]) => t)
              .join(' ');
            setPrompt(ordered);
            soundEffects.playCompletionPing();
            inputRef.current?.focus();
            actionLogger.success('voice', `whisper.cpp [окно #${data.windowIndex}]: "${winText}"`, {
              duration_sec: data.duration_sec,
              source: data.source
            });
          }
          setActiveWindowsCount(prev => Math.max(0, prev - 1));
          if (data.isFinal) {
            setIsTranscribing(false);
            setTranscribingStatus('');
            setCurrentProcessingWindow(null);
          }
        } catch {}
      });

      es.addEventListener('stt_status', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (data.status === 'transcribing') {
            setIsTranscribing(true);
            setTranscribingStatus(data.message || 'whisper.cpp распознаёт речь...');
          } else if (data.status === 'completed') {
            setIsTranscribing(false);
            setTranscribingStatus('');
            setActiveWindowsCount(0);
            setCurrentProcessingWindow(null);
            if (data.text && !prompt.trim()) {
              setPrompt(data.text);
            }
          }
        } catch {
          // ignore
        }
      });

      es.addEventListener('stt_result', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (data.text) {
            setPrompt(data.text);
            setIsTranscribing(false);
            setTranscribingStatus('');
            setActiveWindowsCount(0);
            setCurrentProcessingWindow(null);
            soundEffects.playCompletionPing();
            inputRef.current?.focus();
            actionLogger.success('voice', `whisper.cpp завершил распознавание: "${data.text}"`);
          }
        } catch {
          // ignore
        }
      });
    } catch (err) {
      console.warn('[FloatingHud] SSE setup error:', err);
    }

    return () => {
      es?.close();
    };
  }, []);

  // Load available microphones
  useEffect(() => {
    const loadMics = async () => {
      const devs = await audioDevicesManager.getAudioInputDevices();
      setAudioDevices(devs);
      const stored = audioDevicesManager.getStoredDeviceId();
      if (stored && devs.some(d => d.deviceId === stored)) {
        setSelectedDeviceId(stored);
      } else if (devs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(devs[0].deviceId);
        audioDevicesManager.setStoredDeviceId(devs[0].deviceId);
      }
    };
    loadMics();
  }, []);

  // Fetch STT configuration including VAD parameters
  useEffect(() => {
    fetch('/api/stt/config')
      .then(r => r.json())
      .then(c => {
        if (c && c.endpoint) {
          setSttConfig(prev => ({ ...prev, ...c }));
        }
      })
      .catch(() => {});
  }, []);

  // Update suggestions whenever prompt changes
  useEffect(() => {
    if (prompt.trim().length >= 2) {
      const matches = getSmartQuerySuggestions(prompt, history, 3);
      setSuggestions(matches);
      setSelectedSuggestionIdx(-1);
    } else {
      setSuggestions([]);
      setSelectedSuggestionIdx(-1);
    }
  }, [prompt, history]);

  // Handle Dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('input, button, pre, a')) return;

    isDraggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const newX = Math.max(10, Math.min(window.innerWidth - 300, moveEvent.clientX - dragOffsetRef.current.x));
      const newY = Math.max(10, Math.min(window.innerHeight - 150, moveEvent.clientY - dragOffsetRef.current.y));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleApplySuggestion = (text: string) => {
    setPrompt(text);
    setSuggestions([]);
    inputRef.current?.focus();
    soundEffects.playCompletionPing();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIdx(prev => (prev + 1 < suggestions.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIdx(prev => (prev - 1 >= 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const target = selectedSuggestionIdx >= 0 ? suggestions[selectedSuggestionIdx] : suggestions[0];
      if (target) {
        handleApplySuggestion(target.text);
      }
    } else if (e.key === 'Enter' && selectedSuggestionIdx >= 0) {
      e.preventDefault();
      const target = suggestions[selectedSuggestionIdx];
      if (target) {
        handleApplySuggestion(target.text);
      }
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setErrorData(null);
    setResultData(null);
    setActiveToolInvocation(null);
    setSuggestions([]);
    actionLogger.info('llm', `Пользовательский запрос: "${trimmed}"`);

    try {
      // Use SSE streaming for real-time tool execution notifications
      const res = await fetch('/api/query/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed })
      });

      if (!res.ok || !res.body) {
        const directRes = await onExecuteQuery(trimmed);
        setResultData(directRes);
        actionLogger.success('llm', 'Запрос выполнен успешно', directRes);
        soundEffects.playCompletionPing();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let receivedFinal = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const block of parts) {
          const eventMatch = block.match(/event:\s*([^\n]+)/);
          const dataMatch = block.match(/data:\s*([^\n]+)/);
          if (eventMatch && dataMatch) {
            const event = eventMatch[1].trim();
            const data = JSON.parse(dataMatch[1].trim());

            if (event === 'tool_invoked') {
              actionLogger.info('tool', `Вызов инструмента: ${data.toolName}`, data.arguments);
              setActiveToolInvocation({
                toolName: data.toolName,
                arguments: data.arguments,
                message: data.message || `Инструмент ${data.toolName} вызван...`
              });
              soundEffects.playToolCallCue();
            } else if (event === 'completed') {
              receivedFinal = true;
              actionLogger.success('tool', `Инструмент завершил работу`, data);
              soundEffects.playCompletionPing();
              if (data.view && onSpawnView) {
                onSpawnView(data.view);
              }
              if (data.views && Array.isArray(data.views) && onSpawnView) {
                data.views.forEach((v: ViewSpec) => onSpawnView(v));
              }
              // Clear prompt on successful tool execution into view
              setPrompt('');
            } else if (event === 'no_tool') {
              actionLogger.warn('llm', 'Модель не нашла подходящего инструмента для запроса', data);
              setErrorData(data.message || 'Модель не смогла подобрать инструмент для этого запроса.');
              receivedFinal = true;
              soundEffects.playWarningCue();
            } else if (event === 'error') {
              actionLogger.error('llm', `Ошибка выполнения: ${data.error}`, data);
              setErrorData(data.error);
              receivedFinal = true;
              soundEffects.playWarningCue();
            }
          }
        }
      }

      if (!receivedFinal) {
        const fallbackRes = await onExecuteQuery(trimmed);
        soundEffects.playCompletionPing();
        actionLogger.success('llm', 'Запрос успешно обработан через фолбэк', fallbackRes);
        if (fallbackRes?.view && onSpawnView) {
          onSpawnView(fallbackRes.view);
          setPrompt('');
        }
        if (fallbackRes?.views && Array.isArray(fallbackRes.views) && onSpawnView) {
          fallbackRes.views.forEach((v: ViewSpec) => onSpawnView(v));
          setPrompt('');
        }
      }
    } catch (err: any) {
      actionLogger.error('llm', `Сбой обработки запроса: ${err.message || 'Ошибка выполнения'}`);
      setErrorData(err.message || 'Ошибка выполнения');
      soundEffects.playWarningCue();
    } finally {
      setLoading(false);
      setActiveToolInvocation(null);
    }
  };

  const handleClear = () => {
    setPrompt('');
    receivedWindowsRef.current.clear();
    setActiveWindowsCount(0);
    setCurrentProcessingWindow(null);
    setResultData(null);
    setErrorData(null);
    setActiveToolInvocation(null);
    setSuggestions([]);
    inputRef.current?.focus();
  };

  // Helper to send a completed speech window (bounded by VAD silence >= 300ms)
  const sendWindowAudio = async (blob: Blob, winIdx: number, isFinal: boolean) => {
    if (blob.size < 150) {
      if (isFinal) {
        try {
          await fetch('/api/stt/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              streamId: streamIdRef.current,
              windowIndex: winIdx,
              isWindowEnd: true,
              base64Audio: 'AAAA',
              isFinal: true,
              language: sttConfig.language || 'ru',
              modelFile: sttConfig.modelFile
            })
          });
        } catch {}
      }
      return;
    }

    setActiveWindowsCount(prev => prev + 1);
    setIsTranscribing(true);

    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      const base64 = (reader.result as string)?.split(',')[1] || '';
      if (!base64) return;

      actionLogger.info('voice', `VAD: Окно #${winIdx} отправлено в очередь декодирования (${blob.size} байт, пауза >300мс)...`, {
        streamId: streamIdRef.current,
        windowIndex: winIdx,
        isFinal
      });

      try {
        const res = await fetch('/api/stt/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            streamId: streamIdRef.current,
            windowIndex: winIdx,
            isWindowEnd: true,
            base64Audio: base64,
            isFinal,
            language: sttConfig.language || 'ru',
            modelFile: sttConfig.modelFile
          })
        });
        const data = await res.json();
        if (data.text) {
          receivedWindowsRef.current.set(winIdx, data.text);
          const ordered = Array.from(receivedWindowsRef.current.entries())
            .sort(([a], [b]) => a - b)
            .map(([, t]) => t)
            .join(' ');
          setPrompt(ordered);
        }
      } catch (err: any) {
        console.warn(`[STT Window #${winIdx}] Transmission error:`, err);
      }
    };
  };

  const startWindowRecorder = (stream: MediaStream, winIdx: number) => {
    if (!stream || !stream.active) return;
    activeWindowChunksRef.current = [];
    try {
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          activeWindowChunksRef.current.push(e.data);
        }
      };
      recorder.onstop = () => {
        if (activeWindowChunksRef.current.length > 0) {
          const blob = new Blob(activeWindowChunksRef.current, { type: 'audio/webm' });
          sendWindowAudio(blob, winIdx, !streamActiveRef.current);
        }
      };
      recorder.start(100);
      mediaRecorderRef.current = recorder;
    } catch (err) {
      console.warn('[startWindowRecorder] Recorder initialization failed:', err);
    }
  };

  // Local Voice STT handler with VAD-based sliding pause windows
  const handleToggleVoice = async () => {
    if (isRecording) {
      streamActiveRef.current = false;
      if (vadIntervalRef.current) {
        clearInterval(vadIntervalRef.current);
        vadIntervalRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch {}
        speechRecognitionRef.current = null;
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(t => t.stop());
        audioStreamRef.current = null;
      }
      setActiveAudioStream(null);
      setIsRecording(false);
      setIsSpeaking(false);
      actionLogger.info('voice', 'Запись микрофона остановлена. Ожидание завершения очереди декодирования whisper.cpp...');
      return;
    }

    try {
      const stream = await audioDevicesManager.getUserMediaWithDevice(selectedDeviceId);
      setActiveAudioStream(stream);
      audioStreamRef.current = stream;
      streamActiveRef.current = true;

      const streamId = `hud_vad_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      streamIdRef.current = streamId;
      windowIndexRef.current = 0;
      setActiveWindowIndex(0);
      hasSpokenInWindowRef.current = false;
      speechStartTimeRef.current = 0;
      lastSpeechTimeRef.current = 0;
      setActiveWindowsCount(0);
      setCurrentProcessingWindow(null);
      receivedWindowsRef.current.clear();

      // Setup Web Audio API Analyser for real-time VAD silence detection
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.2;
      source.connect(analyser);
      analyserRef.current = analyser;

      const vadPauseMs = sttConfig.vadPauseMs ?? 300;
      const vadMinSpeechMs = sttConfig.vadMinSpeechMs ?? 350;
      const vadThreshold = sttConfig.vadThreshold ?? 0.03;

      // Start recorder for first speech window (#0)
      startWindowRecorder(stream, 0);

      // Real-time VAD Monitoring Loop (samples every 35ms)
      const vadBuffer = new Uint8Array(analyser.frequencyBinCount);
      vadIntervalRef.current = setInterval(() => {
        if (!streamActiveRef.current || !analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(vadBuffer);

        let sum = 0;
        const len = vadBuffer.length;
        for (let i = 0; i < len; i++) {
          const norm = (vadBuffer[i] - 128) / 128;
          sum += norm * norm;
        }
        const rms = Math.sqrt(sum / len);
        const isVoice = rms > vadThreshold;
        const now = Date.now();

        if (isVoice) {
          if (!hasSpokenInWindowRef.current) {
            hasSpokenInWindowRef.current = true;
            speechStartTimeRef.current = now;
          }
          lastSpeechTimeRef.current = now;
          setIsSpeaking(true);
        } else {
          setIsSpeaking(false);
          // Check if speech was detected and now a silence pause >= vadPauseMs occurred
          if (hasSpokenInWindowRef.current && lastSpeechTimeRef.current > 0) {
            const silenceDuration = now - lastSpeechTimeRef.current;
            const speechDuration = lastSpeechTimeRef.current - speechStartTimeRef.current;

            if (silenceDuration >= vadPauseMs && speechDuration >= vadMinSpeechMs) {
              // VAD Pause Threshold reached (>300ms)!
              const finishedIdx = windowIndexRef.current;
              windowIndexRef.current += 1;
              setActiveWindowIndex(windowIndexRef.current);
              hasSpokenInWindowRef.current = false;
              lastSpeechTimeRef.current = 0;
              speechStartTimeRef.current = 0;

              actionLogger.info('voice', `VAD: Пауза ${silenceDuration}мс (>300мс). Окно #${finishedIdx} уходит на декодирование в whisper.cpp. Начинается окно #${windowIndexRef.current}`);

              // Stop current window recorder to flush its audio to sendWindowAudio
              if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
              }

              // Instantly start recorder for next window, keeping audio capture seamless
              if (streamActiveRef.current) {
                startWindowRecorder(stream, windowIndexRef.current);
              }
            }
          }
        }
      }, 35);

      setIsRecording(true);
      actionLogger.info('voice', `Голосовой стрим с VAD-окнами активен (пауза: ${vadPauseMs}мс, окно #0)...`);
      soundEffects.playToolCallCue();
    } catch (err: any) {
      setIsRecording(false);
      setActiveAudioStream(null);
      actionLogger.error('voice', `Не удалось получить доступ к микрофону: ${err.message || err}`);
      console.error('Audio capture error:', err);
      soundEffects.playWarningCue();
    }
  };

  const hasConflict = status?.conflict.hasConflict && !status.ignoreConflict;
  const isUnloaded = status && !status.loaded;

  return (
    <div
      ref={hudRef}
      id="floating-hud-window"
      data-interactive="true"
      onClick={e => e.stopPropagation()}
      onMouseDown={e => {
        electronBridge.setInteractive(true);
        e.stopPropagation();
      }}
      onMouseEnter={() => electronBridge.setInteractive(true)}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        maxWidth: '580px',
        width: 'calc(100vw - 32px)'
      }}
      className="fixed z-50 transition-shadow duration-300 interactive-ui"
    >
      <div
        className={`rounded-2xl border shadow-2xl backdrop-blur-2xl overflow-hidden transition-all ${
          isPinned ? 'ring-1 ring-[var(--c-peach)]/40' : ''
        }`}
        style={{
          backgroundColor: 'rgba(18, 21, 29, 0.92)',
          borderColor: isPinned ? 'rgba(251, 146, 60, 0.4)' : 'var(--c-border)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.06)'
        }}
      >
        {/* Apple-style window titlebar & drag handle */}
        <div
          onMouseDown={handleMouseDown}
          className="flex items-center justify-between px-3.5 py-2.5 cursor-grab active:cursor-grabbing border-b select-none"
          style={{
            borderColor: 'var(--c-border)',
            backgroundColor: 'rgba(26, 30, 40, 0.6)'
          }}
        >
          {/* Window control buttons */}
          <div className="flex items-center gap-1.5">
            <button
              id="hud-close-btn"
              onClick={onClose}
              title="Закрыть"
              className="w-3 h-3 rounded-full flex items-center justify-center transition-opacity hover:opacity-80"
              style={{ backgroundColor: 'var(--c-mint)' }}
            >
              <X className="w-2 h-2 opacity-0 hover:opacity-100 text-black stroke-[3]" />
            </button>
            <button
              id="hud-settings-btn"
              onClick={() => onOpenSettings()}
              title="Настройки"
              className="w-3 h-3 rounded-full flex items-center justify-center transition-opacity hover:opacity-80"
              style={{ backgroundColor: 'var(--c-peach)' }}
            >
              <Settings className="w-2 h-2 opacity-0 hover:opacity-100 text-black stroke-[3]" />
            </button>
            {isPinned && (
              <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded bg-[var(--c-peach)]/15 text-[var(--c-peach)] font-medium">
                Закреплено
              </span>
            )}
          </div>

          {/* Subtle drag handle */}
          <div className="flex items-center gap-1 text-[var(--c-text-dim)]">
            <GripHorizontal className="w-4 h-4 opacity-50" />
          </div>

          {/* Actions: Pin + Settings */}
          <div className="flex items-center gap-1">
            {onTogglePin && (
              <button
                id="hud-pin-btn"
                onClick={onTogglePin}
                className={`p-1 rounded-md transition-colors ${
                  isPinned
                    ? 'text-[var(--c-peach)] bg-[var(--c-peach)]/20 shadow-sm'
                    : 'text-[var(--c-text-muted)] hover:text-[var(--c-peach)] hover:bg-white/5'
                }`}
                title={
                  isPinned
                    ? 'Окно ввода закреплено (не закроется при клике на рабочий стол)'
                    : 'Закрепить окно ввода на экране'
                }
              >
                <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-[var(--c-peach)] rotate-45' : ''}`} />
              </button>
            )}

            <button
              onClick={() => onOpenSettings()}
              className="p-1 rounded-md transition-colors text-[var(--c-text-muted)] hover:text-[var(--c-peach)] hover:bg-white/5"
              title="Настройки"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Query Input Box */}
        <form onSubmit={handleSubmit} className="p-3 pb-2 relative">
          <div
            id="hud-input-row"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all relative overflow-hidden"
            style={{
              backgroundColor: 'var(--c-bg-tertiary)',
              borderColor: isTranscribing
                ? 'var(--c-peach)'
                : loading
                ? 'var(--c-peach)'
                : isRecording
                ? '#f97316'
                : 'var(--c-border)',
              boxShadow: isTranscribing
                ? '0 0 16px rgba(255, 140, 66, 0.35)'
                : isRecording
                ? '0 0 16px rgba(249, 115, 22, 0.3)'
                : 'none'
            }}
          >
            {isTranscribing ? (
              <Loader2 className="w-4 h-4 shrink-0 animate-spin text-[var(--c-peach)]" />
            ) : isRecording ? (
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
            ) : (
              <Sparkles
                className="w-4 h-4 shrink-0 transition-colors"
                style={{ color: prompt ? 'var(--c-peach)' : 'var(--c-text-dim)' }}
              />
            )}

            <input
              ref={inputRef}
              id="hud-query-input"
              type="text"
              value={prompt}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setTimeout(() => setIsInputFocused(false), 200)}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isRecording
                  ? `Говорите свободно... Окно #${activeWindowIndex} (пауза > 300мс отправляет фразу)`
                  : activeWindowsCount > 0
                  ? `whisper.cpp декодирует (${activeWindowsCount} в очереди)...`
                  : isTranscribing
                  ? `Распознавание речи whisper.cpp... (${transcribingSeconds}с)`
                  : 'Спросите что-нибудь или вызовите инструмент...'
              }
              className="w-full bg-transparent text-sm focus:outline-hidden placeholder:text-[var(--c-text-dim)]"
              style={{ color: 'var(--c-text)' }}
              disabled={loading}
            />

            {/* Active Windows Queue / Transcribing Indicator Badge */}
            {(isTranscribing || activeWindowsCount > 0) && (
              <div
                id="hud-stt-recognizing-badge"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--c-peach)]/20 border border-[var(--c-peach)]/50 text-[var(--c-peach)] text-xs shrink-0 animate-pulse font-medium select-none shadow-xs"
                title="Очередь декодирования окон whisper.cpp"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--c-peach)]" />
                <span className="font-semibold">
                  {currentProcessingWindow !== null ? `Окно #${currentProcessingWindow}` : 'Очередь'}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-[var(--c-peach)]/30 text-[var(--c-peach-light)]">
                  {activeWindowsCount > 0 ? `${activeWindowsCount} в очереди` : `${transcribingSeconds}с`}
                </span>
              </div>
            )}

            {/* Recording Active Badge with VAD state */}
            {isRecording && (
              <div
                id="hud-stt-recording-badge"
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] shrink-0 font-medium select-none transition-colors ${
                  isSpeaking
                    ? 'bg-red-500/20 border-red-500/50 text-red-400 animate-pulse'
                    : 'bg-zinc-800/80 border-zinc-700 text-zinc-400'
                }`}
                title={`Окно #${activeWindowIndex} (VAD: пауза >300мс отправляет фразу)`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isSpeaking ? 'bg-red-500 animate-ping' : 'bg-zinc-500'}`} />
                <span>{isSpeaking ? 'Говорю' : 'Пауза'}</span>
                <span className="text-[9px] font-mono opacity-80">#{activeWindowIndex}</span>
              </div>
            )}

            {prompt && !isTranscribing && activeWindowsCount === 0 && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 rounded text-[var(--c-text-muted)] hover:text-[var(--c-text)] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Live Audio Visualizer Equalizer Bars while recording */}
            {isRecording && (
              <AudioVolumeVisualizer
                stream={activeAudioStream}
                isActive={isRecording}
                barCount={5}
                showLevelText={false}
              />
            )}

            {/* Microphone STT button with device quick switcher */}
            <div className="relative flex items-center">
              <button
                type="button"
                id="hud-voice-btn"
                onClick={handleToggleVoice}
                title={
                  isRecording
                    ? 'Остановить запись микрофона'
                    : activeWindowsCount > 0
                    ? 'whisper.cpp декодирует речь...'
                    : 'Голосовой ввод'
                }
                className={`p-1.5 rounded-lg text-xs transition-all flex items-center gap-1 ${
                  isRecording
                    ? 'bg-orange-500 text-white animate-pulse'
                    : isTranscribing || activeWindowsCount > 0
                    ? 'bg-[var(--c-peach)]/20 text-[var(--c-peach)] cursor-wait'
                    : 'text-[var(--c-text-muted)] hover:text-[var(--c-peach)] hover:bg-white/5'
                }`}
              >
                {isRecording ? (
                  <MicOff className="w-3.5 h-3.5" />
                ) : isTranscribing || activeWindowsCount > 0 ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--c-peach)]" />
                ) : (
                  <Mic className="w-3.5 h-3.5" />
                )}
              </button>

              {audioDevices.length > 1 && !isRecording && !isTranscribing && (
                <button
                  type="button"
                  onClick={() => setShowMicMenu(!showMicMenu)}
                  title="Выбрать микрофон"
                  className="p-1 -ml-1 text-[var(--c-text-dim)] hover:text-[var(--c-peach)]"
                >
                  <ChevronDown className="w-2.5 h-2.5" />
                </button>
              )}

              {/* Bottom scan line animation during transcription */}
              {isTranscribing && (
                <div className="absolute -bottom-2.5 -left-96 -right-96 h-0.5 bg-[var(--c-peach)]/30 overflow-hidden pointer-events-none">
                  <div className="h-full bg-[var(--c-peach)] animate-pulse w-full" />
                </div>
              )}

              {/* Mic Device Selector Dropdown */}
              {showMicMenu && (
                <div
                  className="absolute right-0 top-full mt-2 w-64 p-2 rounded-xl border shadow-2xl z-50 animate-fadeIn text-xs"
                  style={{
                    backgroundColor: 'var(--c-bg-secondary)',
                    borderColor: 'var(--c-border)'
                  }}
                >
                  <div className="text-[10px] font-semibold text-[var(--c-text-dim)] uppercase tracking-wider mb-1 px-1">
                    Устройство ввода микрофона
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {audioDevices.map(dev => {
                      const isSelected = selectedDeviceId === dev.deviceId;
                      return (
                        <button
                          key={dev.deviceId}
                          type="button"
                          onClick={() => {
                            setSelectedDeviceId(dev.deviceId);
                            audioDevicesManager.setStoredDeviceId(dev.deviceId);
                            setShowMicMenu(false);
                            soundEffects.playCompletionPing();
                          }}
                          className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center justify-between text-[11px] transition-colors ${
                            isSelected
                              ? 'bg-[var(--c-peach-surface)] text-[var(--c-peach-light)] font-medium'
                              : 'hover:bg-white/5 text-[var(--c-text-muted)]'
                          }`}
                        >
                          <span className="truncate pr-1">{dev.label}</span>
                          {isSelected && <CheckCircle2 className="w-3 h-3 shrink-0 text-[var(--c-peach)]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Submit arrow button */}
            <button
              type="submit"
              id="hud-submit-btn"
              disabled={!prompt.trim() || loading}
              className="p-1.5 rounded-lg text-xs transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                backgroundColor: prompt.trim() && !loading ? 'var(--c-peach)' : 'transparent',
                color: prompt.trim() && !loading ? '#0a0c10' : 'var(--c-text-dim)'
              }}
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--c-peach)' }} />
              ) : (
                <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
              )}
            </button>
          </div>

          {/* Recognition & VAD live status indicator row */}
          {(isRecording || isTranscribing || activeWindowsCount > 0) && (
            <div
              id="hud-transcribing-status-bar"
              className="flex items-center justify-between px-2 pt-1.5 text-[11px] font-mono text-[var(--c-peach)]"
            >
              <div className="flex items-center gap-1.5">
                {activeWindowsCount > 0 ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-[var(--c-peach)]" />
                    <span>
                      whisper.cpp: декодирование {currentProcessingWindow !== null ? `окна #${currentProcessingWindow}` : 'аудио'} ({activeWindowsCount} в очереди)
                    </span>
                  </>
                ) : isRecording ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-emerald-400">
                      Стрим активен (окно #{activeWindowIndex}). Пауза &gt; 300мс отправляет фразу в whisper.cpp.
                    </span>
                  </>
                ) : (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>{transcribingStatus || 'whisper.cpp: декодирование аудио...'}</span>
                  </>
                )}
              </div>
              <span className="text-[10px] text-[var(--c-text-dim)]">
                {isRecording ? `Окно #${activeWindowIndex}` : `Прошло: ${transcribingSeconds}с`}
              </span>
            </div>
          )}

          {/* Autocomplete & Fuzzy History Suggestions (Item 4) */}
          {suggestions.length > 0 && isInputFocused && !loading && (
            <div
              id="query-suggestions-dropdown"
              className="mt-1.5 rounded-xl border overflow-hidden shadow-xl"
              style={{
                backgroundColor: '#181b24',
                borderColor: 'var(--c-border)'
              }}
            >
              <div className="px-3 py-1.5 text-[10px] text-zinc-500 uppercase tracking-wider flex items-center justify-between border-b border-zinc-800">
                <span>Подсказки и автопродление (Tab для выбора)</span>
                <CornerDownLeft className="w-2.5 h-2.5 opacity-60" />
              </div>
              <div className="divide-y divide-zinc-800/60">
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onMouseDown={() => handleApplySuggestion(s.text)}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between text-xs transition-colors ${
                      idx === selectedSuggestionIdx
                        ? 'bg-orange-500/20 text-orange-200'
                        : 'hover:bg-zinc-800/50 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {s.source === 'history' ? (
                        <History className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      )}
                      <span className="truncate">{s.text}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 shrink-0 ml-2">
                      {s.source === 'history' ? 'История' : 'Шаблон'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>

        {/* Real-time Tool Execution Indicator (Item 3) */}
        {loading && (
          <div className="px-3 pb-2">
            {activeToolInvocation ? (
              <div
                id="active-tool-indicator"
                className="p-2.5 rounded-xl border flex items-center justify-between text-xs animate-pulse"
                style={{
                  backgroundColor: 'rgba(251, 146, 60, 0.12)',
                  borderColor: 'rgba(251, 146, 60, 0.35)',
                  color: 'var(--c-peach-light)'
                }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-orange-400 animate-ping" />
                  <Cpu className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  <span>
                    Выполняется инструмент:{' '}
                    <strong className="font-mono text-orange-200">{activeToolInvocation.toolName}</strong>
                  </span>
                </div>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400 shrink-0" />
              </div>
            ) : (
              <div
                className="p-2 rounded-xl border flex items-center gap-2 text-xs"
                style={{
                  backgroundColor: 'rgba(26, 30, 40, 0.6)',
                  borderColor: 'var(--c-border)',
                  color: 'var(--c-text-muted)'
                }}
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400 shrink-0" />
                <span>FunctionGemma анализирует запрос и выбирает модуль...</span>
              </div>
            )}
          </div>
        )}

        {/* Warning / Conflict / Unloaded Banner */}
        {(hasConflict || isUnloaded) && (
          <div
            className="mx-3 mb-3 px-3 py-2 rounded-xl border flex items-center justify-between text-xs"
            style={{
              backgroundColor: 'var(--c-mint-surface)',
              borderColor: 'var(--c-mint-border)',
              color: 'var(--c-mint-light)'
            }}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--c-mint)' }} />
              <span>
                {isUnloaded
                  ? 'Модель выгружена из памяти'
                  : 'Конфликт контрольной суммы инструментов'}
              </span>
            </div>
            <button
              onClick={() => onOpenSettings('compatibility')}
              className="underline text-[11px] hover:opacity-80 transition-opacity"
              style={{ color: 'var(--c-mint-light)' }}
            >
              Настроить
            </button>
          </div>
        )}

        {/* Error Area */}
        {errorData && (
          <div className="px-3 pb-3">
            <div
              className="p-3 rounded-xl border flex items-start gap-2.5 text-xs"
              style={{
                backgroundColor: 'var(--c-mint-surface)',
                borderColor: 'var(--c-mint-border)',
                color: 'var(--c-mint-light)'
              }}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--c-mint)' }} />
              <div className="space-y-1">
                <div className="font-medium">Не удалось выполнить запрос</div>
                <div className="text-[11px] opacity-90">{errorData}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
