import React, { useState, useEffect, useRef } from 'react';
import { Mic, Check, RotateCw, AlertCircle, Square, MicOff, Volume2 } from 'lucide-react';
import { STTConfig, LocalModelsOverview } from '../../types';
import { soundEffects } from '../../utils/audioEffects';
import { audioDevicesManager, AudioDeviceOption } from '../../utils/audioDevices';
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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

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

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setActiveStream(null);
        setIsRecording(false);
        setIsTranscribing(true);

        try {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = async () => {
            const base64 = (reader.result as string).split(',')[1] || '';
            const res = await fetch('/api/stt/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                base64Audio: base64,
                filename: 'test_voice.webm',
                modelFile: config.modelFile
              })
            });
            const data = await res.json();
            setIsTranscribing(false);
            if (data.text) {
              setTestTranscript(data.text);
              soundEffects.playCompletionPing();
            } else {
              setTestTranscript('(Речь не распознана. Проверьте правильность выбранного микрофона и громкость)');
            }
          };
        } catch {
          setIsTranscribing(false);
          setTestTranscript('(Ошибка распознавания аудио)');
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setTestTranscript(null);
      soundEffects.playToolCallCue();
    } catch (err) {
      setIsRecording(false);
      setActiveStream(null);
      soundEffects.playWarningCue();
      setTestTranscript('(Доступ к выбранному микрофону заблокирован или устройство недоступно)');
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
        <div className="min-h-[24px] max-w-md">
          {isRecording && (
            <span className="text-xs font-mono text-[var(--c-mint-light)] animate-pulse">
              Идет запись голоса... Нажмите кнопку для остановки
            </span>
          )}

          {isTranscribing && (
            <span className="text-xs font-mono text-[var(--c-peach-light)]">
              Распознавание аудио...
            </span>
          )}

          {!isRecording && !isTranscribing && testTranscript && (
            <div className="p-2.5 rounded-lg border text-xs font-mono" style={{ backgroundColor: 'var(--c-bg-tertiary)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }}>
              {testTranscript}
            </div>
          )}

          {!isRecording && !isTranscribing && !testTranscript && (
            <span className="text-[11px]" style={{ color: 'var(--c-text-muted)' }}>
              Нажмите кнопку микрофона для тестовой записи
            </span>
          )}
        </div>
      </Card>
    </div>
  );
};
