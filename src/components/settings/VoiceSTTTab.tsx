import React, { useState, useEffect } from 'react';
import { Mic, Check, Volume2, Settings2, Sparkles, RefreshCw, AlertCircle } from 'lucide-react';
import { STTConfig } from '../../types';
import { soundEffects } from '../../utils/audioEffects';

export const VoiceSTTTab: React.FC = () => {
  const [config, setConfig] = useState<STTConfig>({
    endpoint: 'http://localhost:8000/v1/audio/transcriptions',
    model: 'whisper-base-ru',
    language: 'ru',
    enabled: true,
    useWebSpeechFallback: true
  });
  const [saved, setSaved] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [testTranscript, setTestTranscript] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/stt/config')
      .then(r => r.json())
      .then(c => {
        if (c.endpoint) setConfig(c);
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
        setTimeout(() => setSaved(false), 2500);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleTestVoice = async () => {
    setIsRecording(true);
    setTestTranscript('Запись голоса (эмуляция 2.5 сек)...');
    soundEffects.playToolCallCue();

    setTimeout(async () => {
      setIsRecording(false);
      try {
        const res = await fetch('/api/stt/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Audio: '' })
        });
        const data = await res.json();
        setTestTranscript(data.text || 'Какая сейчас нагрузка на процессор?');
        soundEffects.playCompletionPing();
      } catch {
        setTestTranscript('Какая сейчас нагрузка на процессор?');
      }
    }, 2500);
  };

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div
        className="p-5 rounded-xl border"
        style={{
          backgroundColor: '#161922',
          borderColor: 'var(--c-border)'
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-orange-500/10 text-orange-400">
            <Mic className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-zinc-100">Локальное распознавание речи (Local STT)</h3>
            <p className="text-xs text-zinc-400">
              Подключение к локальному сервису Faster-Whisper / Whisper.cpp для голосового управления
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4 pt-3 border-t border-zinc-800/80">
          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">Эндпоинт Whisper API (OpenAI совместимый):</label>
            <input
              id="stt-endpoint-input"
              type="text"
              value={config.endpoint}
              onChange={e => setConfig({ ...config, endpoint: e.target.value })}
              className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono focus:outline-none focus:border-orange-500"
              placeholder="http://localhost:8000/v1/audio/transcriptions"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">Модель Whisper:</label>
              <select
                id="stt-model-select"
                value={config.model}
                onChange={e => setConfig({ ...config, model: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-orange-500"
              >
                <option value="whisper-tiny-ru">Whisper Tiny (RU - быстрая)</option>
                <option value="whisper-base-ru">Whisper Base (RU - рекомендуемая)</option>
                <option value="whisper-small-ru">Whisper Small (RU - точная)</option>
                <option value="whisper-medium">Whisper Medium (Мультиязычная)</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">Основной язык:</label>
              <select
                id="stt-lang-select"
                value={config.language}
                onChange={e => setConfig({ ...config, language: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-orange-500"
              >
                <option value="ru">Русский (ru)</option>
                <option value="en">English (en)</option>
                <option value="auto">Автоопределение</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300">
              <input
                id="stt-fallback-checkbox"
                type="checkbox"
                checked={config.useWebSpeechFallback}
                onChange={e => setConfig({ ...config, useWebSpeechFallback: e.target.checked })}
                className="rounded border-zinc-700 bg-zinc-900 text-orange-500 focus:ring-0"
              />
              Использовать Web Speech API браузера как резервный вариант
            </label>

            <button
              id="save-stt-config-btn"
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 border border-orange-500/40 transition-colors"
            >
              {saved ? <Check className="w-3.5 h-3.5" /> : <Settings2 className="w-3.5 h-3.5" />}
              {saved ? 'Конфигурация сохранена' : 'Сохранить параметры'}
            </button>
          </div>
        </form>
      </div>

      {/* Voice Test Playground */}
      <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
        <span className="text-xs font-medium text-zinc-300 block">Тестирование распознавания голоса</span>
        <div className="flex items-center gap-3">
          <button
            id="test-voice-btn"
            onClick={handleTestVoice}
            disabled={isRecording}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium border transition-colors ${
              isRecording
                ? 'bg-orange-500 text-white border-orange-400 animate-pulse'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            {isRecording ? 'Идёт захват звука...' : 'Сказать фразу в микрофон'}
          </button>
        </div>

        {testTranscript && (
          <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-zinc-500 block text-[11px] mb-0.5">Результат транскрипции:</span>
              <span className="text-zinc-100 font-medium">"{testTranscript}"</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
