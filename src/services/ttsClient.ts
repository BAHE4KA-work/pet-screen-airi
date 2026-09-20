import { TTSVoiceOption, TTSConfig } from '../types';

export interface TTSState {
  isSpeaking: boolean;
  isPlaying: boolean;
  currentText: string;
  currentVoice: string;
  speed: number;
  autoSpeak: boolean;
  model: string;
  modelFile: string;
  lastRtf: number;
  lastDuration: number;
}

type TTSListener = (state: TTSState) => void;

class TTSClientService {
  private currentAudio: HTMLAudioElement | null = null;
  private listeners: Set<TTSListener> = new Set();
  private isSynthesizing: boolean = false;

  private state: TTSState = {
    isSpeaking: false,
    isPlaying: false,
    currentText: '',
    currentVoice: 'sveta',
    speed: 1.0,
    autoSpeak: true,
    model: 'zaakirio/kokoro-ru',
    modelFile: 'kokoro-ru-v0_19.onnx',
    lastRtf: 0.102,
    lastDuration: 0
  };

  public readonly defaultVoices: TTSVoiceOption[] = [
    {
      id: 'sveta',
      name: 'Света (Флагман)',
      gender: 'female',
      isFlagship: true,
      description: 'Флагманский женский студийный голос Kokoro-82M с чистой дикцией и просодией'
    },
    {
      id: 'masha',
      name: 'Маша (Студийный)',
      gender: 'female',
      isFlagship: false,
      description: 'Теплый эмоциональный женский голос для выразительных ответов'
    },
    {
      id: 'dima',
      name: 'Дима (Студийный)',
      gender: 'male',
      isFlagship: false,
      description: 'Уверенный и чёткий мужской голос студийного уровня'
    }
  ];

  constructor() {
    this.syncConfig();
  }

  public subscribe(fn: TTSListener): () => void {
    this.listeners.add(fn);
    fn({ ...this.state });
    return () => this.listeners.delete(fn);
  }

  private notify() {
    const copy = { ...this.state };
    for (const listener of this.listeners) {
      listener(copy);
    }
  }

  public async syncConfig(): Promise<void> {
    try {
      const res = await fetch('/api/tts/config');
      if (res.ok) {
        const data = await res.json();
        this.state = {
          ...this.state,
          currentVoice: data.activeVoice || this.state.currentVoice,
          speed: data.speed ?? this.state.speed,
          autoSpeak: data.autoSpeak ?? this.state.autoSpeak,
          modelFile: data.modelFile || this.state.modelFile
        };
        this.notify();
      }
    } catch {
      // Offline fallback
    }
  }

  public async updateConfig(partial: Partial<TTSConfig>): Promise<void> {
    this.state = {
      ...this.state,
      currentVoice: partial.voice || this.state.currentVoice,
      speed: partial.speed ?? this.state.speed,
      autoSpeak: partial.autoSpeak ?? this.state.autoSpeak,
      modelFile: partial.modelFile || this.state.modelFile
    };
    this.notify();

    try {
      await fetch('/api/tts/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice: this.state.currentVoice,
          speed: this.state.speed,
          autoSpeak: this.state.autoSpeak,
          modelFile: this.state.modelFile
        })
      });
    } catch (err) {
      console.warn('[TTSClient] Failed to persist config to server:', err);
    }
  }

  public stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    this.state.isSpeaking = false;
    this.state.isPlaying = false;
    this.state.currentText = '';
    this.notify();
  }

  public async speak(text: string, voiceOverride?: string): Promise<boolean> {
    const cleanText = text.trim();
    if (!cleanText) return false;

    this.stop();

    const voice = voiceOverride || this.state.currentVoice;
    this.state.isSpeaking = true;
    this.state.currentText = cleanText;
    this.notify();

    try {
      const res = await fetch('/api/tts/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanText,
          voice,
          speed: this.state.speed
        })
      });

      if (!res.ok) {
        throw new Error(`TTS HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!data.success || !data.dataUrl) {
        throw new Error(data.error || 'Синтез аудио не удался');
      }

      this.state.lastRtf = data.rtf || 0.102;
      this.state.lastDuration = data.durationSec || 1.0;
      this.state.isPlaying = true;
      this.notify();

      const audio = new Audio(data.dataUrl);
      audio.playbackRate = this.state.speed;
      this.currentAudio = audio;

      return new Promise<boolean>((resolve) => {
        audio.onended = () => {
          this.state.isSpeaking = false;
          this.state.isPlaying = false;
          this.currentAudio = null;
          this.notify();
          resolve(true);
        };

        audio.onerror = (e) => {
          console.warn('[TTS Audio Error]', e);
          this.state.isSpeaking = false;
          this.state.isPlaying = false;
          this.currentAudio = null;
          this.notify();
          resolve(false);
        };

        audio.play().catch((playErr) => {
          console.warn('[TTS Play Autoplay blocked or error]', playErr);
          this.state.isSpeaking = false;
          this.state.isPlaying = false;
          this.currentAudio = null;
          this.notify();
          resolve(false);
        });
      });
    } catch (err) {
      console.error('[TTSClient] Synthesize error:', err);
      this.state.isSpeaking = false;
      this.state.isPlaying = false;
      this.notify();
      return false;
    }
  }

  public getState(): TTSState {
    return { ...this.state };
  }
}

export const ttsClient = new TTSClientService();
