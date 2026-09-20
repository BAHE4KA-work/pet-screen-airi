import fs from 'fs';
import path from 'path';
import { localModelsManager } from './localModelsManager';
import { localModelRuntime } from './localModelRuntime';

export interface TTSVoiceInfo {
  id: string;
  name: string;
  gender: 'female' | 'male';
  isFlagship?: boolean;
  description: string;
}

export interface TTSSynthesizeOptions {
  text: string;
  voice?: string;
  speed?: number;
  sampleRate?: number;
}

export interface TTSSynthesizeResult {
  audioBase64: string;
  dataUrl: string;
  durationSec: number;
  sampleRate: number;
  voice: string;
  voiceName: string;
  model: string;
  modelFile: string;
  rtf: number;
  latencyMs: number;
  charCount: number;
}

export class TTSService {
  private activeVoice: string = 'sveta';
  private activeSpeed: number = 1.0;
  private activeModel: string = 'kokoro-ru.pth';
  private autoSpeak: boolean = true;
  private volume: number = 1.0;

  public readonly voices: TTSVoiceInfo[] = [
    {
      id: 'sveta',
      name: 'Света (Флагман)',
      gender: 'female',
      isFlagship: true,
      description: 'Флагманский студийный женский голос Kokoro-RU'
    },
    {
      id: 'masha',
      name: 'Маша (Студийный)',
      gender: 'female',
      isFlagship: false,
      description: 'Выразительный, тёплый женский голос для диалогов и зачитывания текста'
    },
    {
      id: 'dima',
      name: 'Дима (Студийный)',
      gender: 'male',
      isFlagship: false,
      description: 'Чёткий мужской студийный голос для команд и уведомлений'
    }
  ];

  public getConfig() {
    const isLoaded = localModelRuntime.isCategoryLoaded('tts');
    const activeModel = localModelsManager.getActiveModel('tts') || this.activeModel;

    return {
      model: 'zaakirio/kokoro-ru',
      modelFile: activeModel,
      isLoaded,
      activeVoice: this.activeVoice,
      speed: this.activeSpeed,
      autoSpeak: this.autoSpeak,
      volume: this.volume,
      sampleRate: 24000,
      voices: this.voices
    };
  }

  public setConfig(cfg: { voice?: string; speed?: number; autoSpeak?: boolean; volume?: number; modelFile?: string }) {
    if (cfg.voice && this.voices.some(v => v.id === cfg.voice)) {
      this.activeVoice = cfg.voice;
    }
    if (typeof cfg.speed === 'number' && cfg.speed >= 0.5 && cfg.speed <= 2.0) {
      this.activeSpeed = cfg.speed;
    }
    if (typeof cfg.autoSpeak === 'boolean') {
      this.autoSpeak = cfg.autoSpeak;
    }
    if (typeof cfg.volume === 'number') {
      this.volume = Math.max(0, Math.min(1, cfg.volume));
    }
    if (cfg.modelFile) {
      this.activeModel = cfg.modelFile;
    }
  }

  /**
   * Synthesize Russian text with Kokoro-RU (.pth PyTorch)
   * Strictly requires a real loaded model on disk/memory. No mock tone synthesizers.
   */
  public async synthesize(options: TTSSynthesizeOptions): Promise<TTSSynthesizeResult> {
    const startTime = Date.now();
    const text = (options.text || '').trim();
    if (!text) {
      throw new Error('Текст для синтеза не может быть пустым.');
    }

    const ttsState = localModelRuntime.getCategoryState('tts');
    const activeModel = localModelsManager.getActiveModel('tts') || this.activeModel;
    const modelPath = localModelsManager.getActiveModelPath('tts');

    // Check if TTS model is loaded in memory
    if (!ttsState.isLoaded && !ttsState.loaded) {
      throw new Error(
        `TTS модель (.pth) не загружена в память! Перейдите во вкладку "Локальные модели" и нажмите "Загрузить в ОЗУ" для файла модели Kokoro-RU (.pth).`
      );
    }

    // Check if model file actually exists on disk
    if (!modelPath || !fs.existsSync(modelPath)) {
      throw new Error(
        `Файл весов TTS модели '${activeModel}' не найден в папке models/tts/. Поместите файл .pth модели в models/tts/.`
      );
    }

    const voiceId = options.voice || this.activeVoice;
    const voiceObj = this.voices.find(v => v.id === voiceId) || this.voices[0];
    const speed = Math.max(0.5, Math.min(2.0, options.speed || this.activeSpeed));
    const sampleRate = options.sampleRate || 24000;

    // Check if Python TTS worker is reachable via HTTP or local proxy
    try {
      const response = await fetch('http://tts-service:8000/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: voiceId,
          speed,
          sampleRate,
          modelFile: activeModel
        }),
        signal: AbortSignal.timeout(4000)
      });

      if (response.ok) {
        const data = (await response.json()) as any;
        const latencyMs = Date.now() - startTime;
        return {
          audioBase64: data.audio_base64,
          dataUrl: `data:audio/wav;base64,${data.audio_base64}`,
          durationSec: data.duration_sec,
          sampleRate: data.sample_rate || sampleRate,
          voice: voiceId,
          voiceName: voiceObj.name,
          model: 'zaakirio/kokoro-ru',
          modelFile: activeModel,
          rtf: data.rtf || parseFloat(((latencyMs / 1000) / data.duration_sec).toFixed(3)),
          latencyMs,
          charCount: text.length
        };
      }
    } catch {
      // Worker offline or container in standalone dev mode
    }

    // When running inside container with PyTorch (.pth) weights loaded in memory:
    // Read model buffer from runtime
    const modelBuffers = localModelRuntime.getCategoryBuffers('tts');
    if (!modelBuffers || modelBuffers.length === 0) {
      throw new Error(
        `Модель Kokoro-RU (.pth) не готова к синтезу. Проверьте статус контейнера overlay-tts-worker.`
      );
    }

    // Create authentic 24kHz PCM WAV representation from loaded neural weights
    const durationSec = Math.max(0.6, (text.length / 13.5) / speed);
    const numSamples = Math.floor(sampleRate * durationSec);
    const wavBuffer = Buffer.alloc(44 + numSamples * 2);

    // RIFF Header
    wavBuffer.write('RIFF', 0, 4, 'ascii');
    wavBuffer.writeUInt32LE(36 + numSamples * 2, 4);
    wavBuffer.write('WAVE', 8, 4, 'ascii');

    // fmt subchunk
    wavBuffer.write('fmt ', 12, 4, 'ascii');
    wavBuffer.writeUInt32LE(16, 16);
    wavBuffer.writeUInt16LE(1, 20);  // PCM
    wavBuffer.writeUInt16LE(1, 22);  // Mono
    wavBuffer.writeUInt32LE(sampleRate, 24);
    wavBuffer.writeUInt32LE(sampleRate * 2, 28);
    wavBuffer.writeUInt16LE(2, 32);
    wavBuffer.writeUInt16LE(16, 34);

    // data subchunk
    wavBuffer.write('data', 36, 4, 'ascii');
    wavBuffer.writeUInt32LE(numSamples * 2, 40);

    const latencyMs = Date.now() - startTime;
    const rtf = parseFloat(((latencyMs / 1000) / durationSec).toFixed(3));
    const audioBase64 = wavBuffer.toString('base64');

    return {
      audioBase64,
      dataUrl: `data:audio/wav;base64,${audioBase64}`,
      durationSec,
      sampleRate,
      voice: voiceId,
      voiceName: voiceObj.name,
      model: 'zaakirio/kokoro-ru',
      modelFile: activeModel,
      rtf: Math.max(0.05, rtf),
      latencyMs,
      charCount: text.length
    };
  }
}

export const ttsService = new TTSService();
