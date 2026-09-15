import React, { useState, useEffect, useRef } from 'react';
import { Mic, Check, RotateCw, AlertCircle, Square, MicOff, Volume2, Radio, Activity } from 'lucide-react';
import { STTConfig, LocalModelsOverview } from '../../types';
import { soundEffects } from '../../utils/audioEffects';
import { audioDevicesManager, AudioDeviceOption } from '../../utils/audioDevices';
import { actionLogger } from '../../utils/actionLogger';
import { AudioVolumeVisualizer } from '../ui/AudioVolumeVisualizer';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';

export const VoiceSTTTab: React.FC = () => {
  const [config, setConfig] = useState<STTConfig>({
    endpoint: 'http://localhost:8000/v1/audio/transcriptions',
    model: 'whisper-base-ru.bin',
    modelFile: 'whisper-base-ru.bin',
    language: 'ru',
    enabled: true,
    useWebSpeechFallback: true
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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamIdRef = useRef<string>('');
  const chunkIndexRef = useRef<number>(0);

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

    // Listen for device changes (plugging in new USB mic, headsets)
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
    // Load config
    fetch('/api/stt/config')
      .then(r => r.json())
      .then(c => {
        if (c.endpoint) setConfig(c);
      })
      .catch(console.error);

    // Load available files from models/stt
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

  const startVoiceTest = async () => {
    if (isRecording) {
      // Stop recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    try {
      audioChunksRef.current = [];
      const stream = await audioDevicesManager.getUserMediaWithDevice(selectedDeviceId);
      setActiveStream(stream);

      const streamId = `test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      streamIdRef.current = streamId;
      chunkIndexRef.current = 0;
      setStreamChunksSent(0);
      setStreamStatusText('Инициализация аудиопотока...');

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      actionLogger.info('voice', 'Старт проверки микрофона в настройках (режим стриминга)', {
        streamId,
        deviceId: selectedDeviceId || 'default'
      });

      mediaRecorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          const currentChunkIdx = chunkIndexRef.current++;
          setStreamChunksSent(currentChunkIdx + 1);

          // Progressive slice with valid container headers
          const cumulativeBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(cumulativeBlob);
          reader.onloadend = async () => {
            const base64 = (reader.result as string).split(',')[1] || '';
            if (!base64) return;

            actionLogger.info('voice', `Тест микрофона: отправка чанка #${currentChunkIdx} в whisper.cpp...`, {
              streamId,
              chunkIndex: currentChunkIdx,
              sizeBytes: cumulativeBlob.size
            });

            setStreamStatusText(`Стрим активен: отправлен чанк #${currentChunkIdx + 1}`);

            try {
              const res = await fetch('/api/stt/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  streamId,
                  chunkIndex: currentChunkIdx,
                  base64Audio: base64,
                  isFinal: false,
                  language: config.language || 'ru',
                  modelFile: config.modelFile
                })
              });
              const data = await res.json();
              if (data.text) {
                setTestTranscript(data.text);
                actionLogger.info('voice', `Тест микрофона: промежуточный текст [чанк #${currentChunkIdx}]: "${data.text}"`);
              }
            } catch (err: any) {
              console.warn('[VoiceSTTTab] Chunk error:', err);
            }
          };
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setActiveStream(null);
        setIsRecording(false);
        setIsTranscribing(true);
        setStreamStatusText('Обработка финального аудиосегмента в whisper.cpp...');
        actionLogger.info('voice', 'Тест микрофона: запись завершена, отправка финального стрим-запроса...', {
          streamId: streamIdRef.current
        });

        try {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = async () => {
            try {
              const base64 = (reader.result as string).split(',')[1] || '';
              const res = await fetch('/api/stt/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  streamId: streamIdRef.current,
                  chunkIndex: chunkIndexRef.current++,
                  base64Audio: base64,
                  isFinal: true,
                  language: config.language || 'ru',
                  modelFile: config.modelFile
                })
              });
              const data = await res.json();
              setIsTranscribing(false);
              setStreamStatusText('');
              if (data.text) {
                setTestTranscript(data.text);
                actionLogger.success('voice', `Тест микрофона: whisper.cpp успешно распознал речь: "${data.text}"`, {
                  duration_sec: data.duration_sec,
                  confidence: data.confidence,
                  source: data.source
                });
                soundEffects.playCompletionPing();
              } else {
                setTestTranscript('(Речь не распознана. Проверьте правильность выбранного микрофона и громкость)');
                actionLogger.warn('voice', 'Тест микрофона: речь не распознана или была слишком тихой');
              }
            } catch (err: any) {
              setIsTranscribing(false);
              setStreamStatusText('');
              setTestTranscript('(Ошибка вызова распознавания аудио)');
              actionLogger.error('voice', `Тест микрофона: ошибка ответа бэкенда: ${err.message || err}`);
            }
          };
        } catch (err: any) {
          setIsTranscribing(false);
          setStreamStatusText('');
          setTestTranscript('(Ошибка распознавания аудио)');
          actionLogger.error('voice', `Тест микрофона: ошибка ответа бэкенда: ${err.message || err}`);
        }
      };

      // Start recording with 1000ms chunk intervals
      mediaRecorder.start(1000);
      setIsRecording(true);
      setTestTranscript(null);
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
        <div className="min-h-[24px] max-w-md space-y-2">
          {isRecording && (
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--c-mint)]/20 border border-[var(--c-mint)]/40 text-[11px] font-mono text-[var(--c-mint-light)]">
                <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
                <span>Стрим в whisper.cpp: чанков отправлено {streamChunksSent}</span>
              </div>
              {streamStatusText && (
                <span className="text-[10px] font-mono text-[var(--c-text-muted)]">
                  {streamStatusText}
                </span>
              )}
            </div>
          )}

          {isTranscribing && (
            <div className="flex items-center justify-center gap-1.5 text-xs font-mono text-[var(--c-peach-light)]">
              <Activity className="w-3.5 h-3.5 animate-spin" />
              <span>{streamStatusText || 'Финальное распознавание аудио в whisper.cpp...'}</span>
            </div>
          )}

          {testTranscript && (
            <div className="p-2.5 rounded-lg border text-xs font-mono text-left animate-fadeIn" style={{ backgroundColor: 'var(--c-bg-tertiary)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }}>
              <div className="flex items-center justify-between text-[10px] text-[var(--c-text-dim)] mb-1 pb-1 border-b border-[var(--c-border)]">
                <span>Результат STT:</span>
                <span className="text-emerald-400">whisper.cpp</span>
              </div>
              <p className="whitespace-pre-wrap">{testTranscript}</p>
            </div>
          )}

          {!isRecording && !isTranscribing && !testTranscript && (
            <span className="text-[11px]" style={{ color: 'var(--c-text-muted)' }}>
              Нажмите кнопку микрофона для тестовой стрим-записи в whisper.cpp
            </span>
          )}
        </div>
      </Card>
    </div>
  );
};
