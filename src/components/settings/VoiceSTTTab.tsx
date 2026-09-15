import React, { useState, useEffect, useRef } from 'react';
import { Mic, Check, RotateCw, AlertCircle, Square, MicOff, Volume2, Radio, Activity, CheckCircle2, Clock } from 'lucide-react';
import { STTConfig, LocalModelsOverview } from '../../types';
import { soundEffects } from '../../utils/audioEffects';
import { audioDevicesManager, AudioDeviceOption } from '../../utils/audioDevices';
import { actionLogger } from '../../utils/actionLogger';
import { AudioVolumeVisualizer } from '../ui/AudioVolumeVisualizer';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { VadAudioRecorder } from '../../utils/audioPcmRecorder';

interface WindowTestItem {
  index: number;
  text: string;
  durationSec?: number;
  rms?: number;
  status: 'recording' | 'processing' | 'completed' | 'skipped_silence';
}

export const VoiceSTTTab: React.FC = () => {
  const [config, setConfig] = useState<STTConfig>({
    endpoint: 'http://localhost:8000/v1/audio/transcriptions',
    model: 'whisper-base-ru.bin',
    modelFile: 'whisper-base-ru.bin',
    language: 'ru',
    enabled: true,
    useWebSpeechFallback: true,
    vadPauseMs: 300,
    vadMinSpeechMs: 350,
    vadThreshold: 0.025
  });
  const [availableFiles, setAvailableFiles] = useState<string[]>([]);
  const [audioDevices, setAudioDevices] = useState<AudioDeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(() => audioDevicesManager.getStoredDeviceId());
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const [saved, setSaved] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [testTranscript, setTestTranscript] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [streamChunksSent, setStreamChunksSent] = useState<number>(0);
  const [streamStatusText, setStreamStatusText] = useState<string>('');

  // VAD & Window test state
  const [testWindows, setTestWindows] = useState<WindowTestItem[]>([]);
  const [activeWindowIndex, setActiveWindowIndex] = useState<number>(0);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  const vadRecorderRef = useRef<VadAudioRecorder | null>(null);
  const streamIdRef = useRef<string>('');
  const receivedWindowsRef = useRef<Map<number, string>>(new Map());

  const loadAudioDevices = async () => {
    const devices = await audioDevicesManager.getAudioInputDevices();
    setAudioDevices(devices);
    const stored = audioDevicesManager.getStoredDeviceId();
    if (stored && devices.some(d => d.deviceId === stored)) {
      setSelectedDeviceId(stored);
    } else if (devices.length > 0 && !selectedDeviceId) {
      setSelectedDeviceId(devices[0].deviceId);
      audioDevicesManager.setStoredDeviceId(devices[0].deviceId);
    }
  };

  useEffect(() => {
    loadAudioDevices();

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', loadAudioDevices);
      return () => navigator.mediaDevices.removeEventListener('devicechange', loadAudioDevices);
    }
  }, []);

  const handleDeviceChange = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    audioDevicesManager.setStoredDeviceId(deviceId);
    soundEffects.playCompletionPing();
  };

  useEffect(() => {
    fetch('/api/stt/config')
      .then(r => r.json())
      .then(c => {
        if (c.endpoint) setConfig(c);
      })
      .catch(console.error);

    fetch('/api/models/local')
      .then(r => r.json())
      .then((data: LocalModelsOverview) => {
        const sttFiles = data?.categories?.stt?.files || [];
        const filenames = sttFiles.map(f => f.filename);
        setAvailableFiles(filenames);
        if (filenames.length > 0 && !filenames.includes(config.modelFile || '')) {
          setConfig(prev => ({ ...prev, modelFile: filenames[0], model: filenames[0] }));
        }
      })
      .catch(console.error);
  }, []);

  // SSE Listener for test window decoding events
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/events');
      es.addEventListener('stt_window_processing', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (data.streamId === streamIdRef.current) {
            setTestWindows(prev => prev.map(w => w.index === data.windowIndex ? { ...w, status: 'processing' } : w));
            setStreamStatusText(`whisper.cpp: декодирование окна #${data.windowIndex}...`);
          }
        } catch {}
      });

      es.addEventListener('stt_window_result', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (data.streamId === streamIdRef.current && data.text?.trim()) {
            const winText = data.text.trim();
            receivedWindowsRef.current.set(data.windowIndex, winText);
            setTestWindows(prev => prev.map(w => w.index === data.windowIndex ? {
              ...w,
              status: 'completed',
              text: winText,
              durationSec: data.duration_sec
            } : w));

            const fullText = Array.from(receivedWindowsRef.current.entries())
              .sort(([a], [b]) => a - b)
              .map(([, t]) => t)
              .join(' ');
            setTestTranscript(fullText);
            soundEffects.playCompletionPing();
          }
          if (data.isFinal) {
            setIsTranscribing(false);
            setStreamStatusText('');
          }
        } catch {}
      });

      es.addEventListener('stt_window_skipped', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (data.streamId === streamIdRef.current) {
            setTestWindows(prev => prev.map(w => w.index === data.windowIndex ? {
              ...w,
              status: 'skipped_silence',
              text: '(тишина пропущена)'
            } : w));
          }
        } catch {}
      });
    } catch {}

    return () => {
      es?.close();
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/stt/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        setSaved(true);
        soundEffects.playCompletionPing();
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const sendTestWindow = async (blob: Blob, winIdx: number, isFinal: boolean) => {
    setIsTranscribing(true);
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      const base64 = (reader.result as string)?.split(',')[1] || '';
      if (!base64) return;

      actionLogger.info('voice', `Тест микрофона: отправка окна #${winIdx} (${blob.size} байт, 16кГц WAV)...`, {
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
            language: config.language || 'ru',
            modelFile: config.modelFile
          })
        });
        const data = await res.json();
        if (data.status === 'skipped_silence') {
          setTestWindows(prev => prev.map(w => w.index === winIdx ? {
            ...w,
            status: 'skipped_silence',
            text: '(тишина пропущена — whisper сэкономлен)'
          } : w));
        } else if (data.text) {
          receivedWindowsRef.current.set(winIdx, data.text.trim());
          setTestWindows(prev => prev.map(w => w.index === winIdx ? {
            ...w,
            status: 'completed',
            text: data.text.trim(),
            durationSec: data.duration_sec
          } : w));

          const full = Array.from(receivedWindowsRef.current.entries())
            .sort(([a], [b]) => a - b)
            .map(([, t]) => t)
            .join(' ');
          setTestTranscript(full);
        }
      } catch (err: any) {
        console.warn(`[Test Window #${winIdx}] transmission error:`, err);
      } finally {
        if (isFinal) {
          setIsTranscribing(false);
          setStreamStatusText('');
        }
      }
    };
  };

  const startVoiceTest = async () => {
    if (isRecording) {
      // Stop recording
      if (vadRecorderRef.current) {
        const { finalBlob, finalWindowIndex } = vadRecorderRef.current.stop();
        if (finalBlob && finalWindowIndex !== undefined && finalBlob.size > 200) {
          sendTestWindow(finalBlob, finalWindowIndex, true);
        } else {
          fetch('/api/stt/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              streamId: streamIdRef.current,
              windowIndex: activeWindowIndex,
              isWindowEnd: true,
              base64Audio: 'AAAA',
              isFinal: true
            })
          }).catch(() => {});
        }
        vadRecorderRef.current = null;
      }
      if (activeStream) {
        activeStream.getTracks().forEach(t => t.stop());
        setActiveStream(null);
      }
      setIsRecording(false);
      setIsSpeaking(false);
      actionLogger.info('voice', 'Тест микрофона: запись завершена, завершение очереди whisper.cpp...');
      return;
    }

    try {
      const stream = await audioDevicesManager.getUserMediaWithDevice(selectedDeviceId);
      setActiveStream(stream);

      const streamId = `test_vad_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      streamIdRef.current = streamId;
      receivedWindowsRef.current.clear();
      setTestWindows([{ index: 0, text: '', status: 'recording' }]);
      setActiveWindowIndex(0);
      setStreamChunksSent(0);
      setTestTranscript(null);
      setStreamStatusText(`VAD стрим: пауза >${config.vadPauseMs ?? 300}мс отправляет окно...`);

      actionLogger.info('voice', 'Старт проверки микрофона в настройках (VAD-окна, 16кГц WAV)', {
        streamId,
        deviceId: selectedDeviceId || 'default'
      });

      const recorder = new VadAudioRecorder(
        {
          vadPauseMs: config.vadPauseMs ?? 300,
          vadMinSpeechMs: config.vadMinSpeechMs ?? 350,
          vadThreshold: config.vadThreshold ?? 0.025,
          targetSampleRate: 16000
        },
        {
          onVolumeLevel: (_rms, isVoice) => {
            setIsSpeaking(isVoice);
          },
          onSpeechStart: (winIdx) => {
            setActiveWindowIndex(winIdx);
            setTestWindows(prev => {
              if (prev.some(w => w.index === winIdx)) return prev;
              return [...prev, { index: winIdx, text: '', status: 'recording' }];
            });
            actionLogger.info('voice', `Тест микрофона: речь в окне #${winIdx}...`);
          },
          onSpeechPause: (winIdx, pauseMs) => {
            // Silence pause detected
          },
          onWindowReady: (wavBlob, winIdx, rms, durationSec) => {
            setStreamChunksSent(prev => prev + 1);
            setTestWindows(prev => prev.map(w => w.index === winIdx ? {
              ...w,
              status: 'processing',
              rms,
              durationSec
            } : w));
            sendTestWindow(wavBlob, winIdx, false);
          },
          onWindowSkipped: (winIdx, reason) => {
            setTestWindows(prev => {
              if (!prev.some(w => w.index === winIdx)) {
                return [...prev, { index: winIdx, text: '(тишина пропущена)', status: 'skipped_silence' }];
              }
              return prev.map(w => w.index === winIdx ? {
                ...w,
                status: 'skipped_silence',
                text: '(тишина пропущена)'
              } : w);
            });
            actionLogger.info('voice', `Тест микрофона: окно #${winIdx} пропущено (${reason === 'silence' ? 'тишина' : 'короткий звук'})`);
          }
        }
      );

      await recorder.start(stream);
      vadRecorderRef.current = recorder;

      setIsRecording(true);
      soundEffects.playToolCallCue();
    } catch (err: any) {
      setIsRecording(false);
      setActiveStream(null);
      soundEffects.playWarningCue();
      setTestTranscript('(Доступ к выбранному микрофону заблокирован или устройство недоступно)');
      actionLogger.error('voice', `Тест микрофона: ошибка доступа к устройству: ${err.message || err}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[var(--c-border)]">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-[var(--c-peach)]" />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
            Голосовой ввод (STT)
          </h3>
        </div>
      </div>

      {/* Configuration Form */}
      <Card className="space-y-3">
        <form onSubmit={handleSave} className="space-y-3 text-xs">
          <div>
            <label className="text-[11px] block mb-1" style={{ color: 'var(--c-text-muted)' }}>
              Эндпоинт STT API:
            </label>
            <Input
              id="stt-endpoint-input"
              value={config.endpoint}
              onChange={e => setConfig({ ...config, endpoint: e.target.value })}
              placeholder="http://localhost:8000/v1/audio/transcriptions"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] block mb-1" style={{ color: 'var(--c-text-muted)' }}>
                Файл модели из models/stt/:
              </label>
              <Select
                id="stt-model-select"
                value={config.modelFile || config.model}
                onChange={e => {
                  const val = e.target.value;
                  setConfig({ ...config, model: val, modelFile: val });
                }}
              >
                {availableFiles.length > 0 ? (
                  availableFiles.map(f => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="whisper-base.bin">whisper-base.bin</option>
                    <option value="ggml-whisper-tiny.bin">ggml-whisper-tiny.bin</option>
                  </>
                )}
              </Select>
            </div>

            <div>
              <label className="text-[11px] block mb-1" style={{ color: 'var(--c-text-muted)' }}>
                Язык:
              </label>
              <Select
                id="stt-lang-select"
                value={config.language}
                onChange={e => setConfig({ ...config, language: e.target.value })}
              >
                <option value="ru">Русский (ru)</option>
                <option value="en">English (en)</option>
                <option value="auto">Автоопределение</option>
              </Select>
            </div>
          </div>

          {/* Microphone Device Selection */}
          <div className="pt-1 border-t border-[var(--c-border)]">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] block" style={{ color: 'var(--c-text-muted)' }}>
                Устройство ввода (Микрофон):
              </label>
              <button
                type="button"
                onClick={loadAudioDevices}
                className="text-[10px] text-[var(--c-peach)] hover:underline flex items-center gap-1"
              >
                <RotateCw className="w-3 h-3" />
                Обновить список устройств
              </button>
            </div>

            <Select
              id="stt-device-select"
              value={selectedDeviceId}
              onChange={e => handleDeviceChange(e.target.value)}
            >
              {audioDevices.length > 0 ? (
                audioDevices.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))
              ) : (
                <option value="">Микрофон по умолчанию (Системный)</option>
              )}
            </Select>
            <span className="text-[10px] text-[var(--c-text-dim)] mt-1 block">
              Выберите физический микрофон, если звук не улавливается встроенным устройством.
            </span>
          </div>

          {/* VAD Sliding Pause Window Parameters */}
          <div className="pt-2 border-t border-[var(--c-border)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[var(--c-peach-light)]">
                VAD и стриминг окон по паузам:
              </span>
              <span className="text-[10px] text-[var(--c-text-dim)]">
                Сегментация без обрезки слов
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] block mb-1" style={{ color: 'var(--c-text-muted)' }}>
                  Пауза сброса окна (мс):
                </label>
                <Input
                  id="stt-vad-pause-input"
                  type="number"
                  min={150}
                  max={2000}
                  step={50}
                  value={config.vadPauseMs ?? 300}
                  onChange={e => setConfig({ ...config, vadPauseMs: Number(e.target.value) || 300 })}
                />
                <span className="text-[9px] text-[var(--c-text-dim)]">По умолч. 300мс</span>
              </div>

              <div>
                <label className="text-[10px] block mb-1" style={{ color: 'var(--c-text-muted)' }}>
                  Мин. речь фразы (мс):
                </label>
                <Input
                  id="stt-vad-speech-input"
                  type="number"
                  min={100}
                  max={2000}
                  step={50}
                  value={config.vadMinSpeechMs ?? 350}
                  onChange={e => setConfig({ ...config, vadMinSpeechMs: Number(e.target.value) || 350 })}
                />
                <span className="text-[9px] text-[var(--c-text-dim)]">Фильтр щелчков</span>
              </div>

              <div>
                <label className="text-[10px] block mb-1" style={{ color: 'var(--c-text-muted)' }}>
                  Порог VAD (RMS):
                </label>
                <Input
                  id="stt-vad-thresh-input"
                  type="number"
                  min={0.01}
                  max={0.2}
                  step={0.005}
                  value={config.vadThreshold ?? 0.03}
                  onChange={e => setConfig({ ...config, vadThreshold: Number(e.target.value) || 0.03 })}
                />
                <span className="text-[9px] text-[var(--c-text-dim)]">Чувствительность</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none text-[11px]" style={{ color: 'var(--c-text-muted)' }}>
              <input
                id="stt-fallback-checkbox"
                type="checkbox"
                checked={config.useWebSpeechFallback}
                onChange={e => setConfig({ ...config, useWebSpeechFallback: e.target.checked })}
                className="accent-[var(--c-peach)] rounded"
              />
              <span>Использовать браузерный Web Speech fallback</span>
            </label>

            <Button size="sm" variant="primary" type="submit" icon={saved ? <Check className="w-3.5 h-3.5" /> : undefined}>
              {saved ? 'Сохранено' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Test Recognition Block: centered record button, transcript below it */}
      <Card className="p-4 flex flex-col items-center justify-center space-y-3 text-center">
        <span className="text-xs font-medium" style={{ color: 'var(--c-text-muted)' }}>
          Проверить распознавание
        </span>

        {/* Centered Record Button */}
        <button
          type="button"
          onClick={startVoiceTest}
          disabled={isTranscribing}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all select-none shadow-md ${
            isRecording
              ? 'bg-[var(--c-mint)] text-white scale-105 animate-pulse'
              : 'bg-[var(--c-peach)] text-zinc-950 hover:opacity-90'
          }`}
          title={isRecording ? 'Остановить запись' : 'Начать запись голоса'}
        >
          {isRecording ? <Square className="w-5 h-5 fill-current" /> : <Mic className="w-6 h-6" />}
        </button>

        {/* Live Audio Visualizer Equalizer Bars */}
        {isRecording && (
          <div className="flex flex-col items-center gap-1.5 animate-fadeIn">
            <AudioVolumeVisualizer
              stream={activeStream}
              isActive={isRecording}
              barCount={8}
              showLevelText={true}
            />
            <span className="text-[11px] text-[var(--c-mint-light)]">
              Индикатор уровня громкости активен. Говорите в микрофон...
            </span>
          </div>
        )}

        {/* Status or Transcript Text Under the Button */}
        <div className="min-h-[24px] w-full max-w-lg space-y-3">
          {isRecording && (
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <div
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono border transition-colors ${
                    isSpeaking
                      ? 'bg-red-500/20 border-red-500/50 text-red-400 animate-pulse'
                      : 'bg-zinc-800/80 border-zinc-700 text-zinc-400'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-red-500 animate-ping' : 'bg-zinc-500'}`} />
                  <span>{isSpeaking ? 'Обнаружена речь' : 'Пауза (>300мс отправляет окно)'}</span>
                  <span className="opacity-75 font-semibold">Окно #{activeWindowIndex}</span>
                </div>

                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--c-mint)]/20 border border-[var(--c-mint)]/40 text-[11px] font-mono text-[var(--c-mint-light)]">
                  <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
                  <span>Окон отправлено: {streamChunksSent}</span>
                </div>
              </div>

              {streamStatusText && (
                <span className="text-[10px] font-mono text-[var(--c-text-muted)]">
                  {streamStatusText}
                </span>
              )}
            </div>
          )}

          {isTranscribing && !isRecording && (
            <div className="flex items-center justify-center gap-1.5 text-xs font-mono text-[var(--c-peach-light)]">
              <Activity className="w-3.5 h-3.5 animate-spin" />
              <span>{streamStatusText || 'Финальное распознавание аудио в whisper.cpp...'}</span>
            </div>
          )}

          {/* List of Decoded Windows in Real-time */}
          {testWindows.length > 0 && (
            <div className="space-y-1.5 text-left">
              <div className="flex items-center justify-between text-[11px] font-medium px-1 text-[var(--c-text-muted)]">
                <span>Сегменты речи (VAD-окна):</span>
                <span className="text-[10px] text-[var(--c-text-dim)]">
                  {testWindows.filter(w => w.status === 'completed').length} / {testWindows.length} распознано
                </span>
              </div>

              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {testWindows.map(win => (
                  <div
                    key={win.index}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-start justify-between gap-2 transition-all ${
                      win.status === 'completed'
                        ? 'bg-[var(--c-bg-tertiary)] border-[var(--c-border)] text-[var(--c-text)]'
                        : win.status === 'processing'
                        ? 'bg-[var(--c-peach)]/10 border-[var(--c-peach)]/40 text-[var(--c-peach-light)] animate-pulse'
                        : win.status === 'skipped_silence'
                        ? 'bg-zinc-800/40 border-zinc-800 text-zinc-500'
                        : 'bg-zinc-800/30 border-zinc-700/50 text-zinc-400'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-bold shrink-0">
                        #{win.index}
                      </span>
                      <span className="break-all">
                        {win.text || (win.status === 'processing' ? 'whisper.cpp обрабатывает...' : 'Запись сегмента...')}
                      </span>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5 text-[10px]">
                      {win.durationSec && (
                        <span className="text-zinc-500 font-mono">{win.durationSec.toFixed(1)}с</span>
                      )}
                      {win.status === 'completed' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : win.status === 'processing' ? (
                        <Activity className="w-3.5 h-3.5 text-[var(--c-peach)] animate-spin" />
                      ) : win.status === 'skipped_silence' ? (
                        <span className="text-[9px] text-zinc-500">тишина</span>
                      ) : (
                        <Clock className="w-3 h-3 text-zinc-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full concatenated transcript */}
          {testTranscript && (
            <div className="p-3 rounded-xl border text-xs font-mono text-left animate-fadeIn shadow-xs" style={{ backgroundColor: 'var(--c-bg-tertiary)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }}>
              <div className="flex items-center justify-between text-[10px] text-[var(--c-text-dim)] mb-1 pb-1 border-b border-[var(--c-border)]">
                <span className="font-semibold text-[var(--c-peach-light)]">Итоговый текст фразы:</span>
                <span className="text-emerald-400">whisper.cpp 16kHz</span>
              </div>
              <p className="whitespace-pre-wrap leading-relaxed">{testTranscript}</p>
            </div>
          )}

          {!isRecording && !isTranscribing && !testTranscript && testWindows.length === 0 && (
            <span className="text-[11px]" style={{ color: 'var(--c-text-muted)' }}>
              Нажмите кнопку микрофона для тестовой стрим-записи по VAD-окнам в whisper.cpp
            </span>
          )}
        </div>
      </Card>
    </div>
  );
};
