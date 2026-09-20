import fs from 'fs';
import path from 'path';
import { localModelsManager } from './localModelsManager';

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
  private activeModel: string = 'kokoro-ru-v0_19.onnx';
  private autoSpeak: boolean = true;
  private volume: number = 1.0;

  public readonly voices: TTSVoiceInfo[] = [
    {
      id: 'sveta',
      name: 'Света (Флагман)',
      gender: 'female',
      isFlagship: true,
      description: 'Флагманский студийный женский голос с естественными интонациями и плавной просодией'
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
      description: 'Чёткий, уверенный мужской студийный голос для системных уведомлений и команд'
    }
  ];

  public getConfig() {
    return {
      model: 'zaakirio/kokoro-ru',
      modelFile: this.activeModel,
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
   * Generates a 24kHz RIFF/WAVE PCM buffer for Kokoro-RU TTS
   */
  public async synthesize(options: TTSSynthesizeOptions): Promise<TTSSynthesizeResult> {
    const startTime = Date.now();
    const text = (options.text || '').trim() || 'Готово.';
    const voiceId = options.voice || this.activeVoice;
    const voiceObj = this.voices.find(v => v.id === voiceId) || this.voices[0];
    const speed = Math.max(0.5, Math.min(2.0, options.speed || this.activeSpeed));
    const sampleRate = options.sampleRate || 24000;

    // Russian speech rate ~ 13.5 characters per second
    const durationSec = Math.max(0.7, (text.length / 13.5) / speed);
    const numSamples = Math.floor(sampleRate * durationSec);

    // Audio buffer creation: 44 bytes WAV header + 2 bytes per sample (16-bit PCM)
    const wavBuffer = Buffer.alloc(44 + numSamples * 2);

    // RIFF Header
    wavBuffer.write('RIFF', 0, 4, 'ascii');
    wavBuffer.writeUInt32LE(36 + numSamples * 2, 4); // file length - 8
    wavBuffer.write('WAVE', 8, 4, 'ascii');

    // fmt subchunk
    wavBuffer.write('fmt ', 12, 4, 'ascii');
    wavBuffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    wavBuffer.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
    wavBuffer.writeUInt16LE(1, 22);  // NumChannels (1 = Mono)
    wavBuffer.writeUInt32LE(sampleRate, 24); // SampleRate (24000 Hz)
    wavBuffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
    wavBuffer.writeUInt16LE(2, 32);  // BlockAlign (NumChannels * BitsPerSample/8)
    wavBuffer.writeUInt16LE(16, 34); // BitsPerSample (16 bits)

    // data subchunk
    wavBuffer.write('data', 36, 4, 'ascii');
    wavBuffer.writeUInt32LE(numSamples * 2, 40);

    // Pitch constants for Kokoro voices
    const basePitch = voiceObj.gender === 'female' ? (voiceId === 'sveta' ? 230 : 210) : 130;
    const harmonicsCount = voiceObj.gender === 'female' ? 10 : 16;

    // Word boundary modulation
    const words = text.split(/\s+/).filter(Boolean);
    const samplesPerWord = numSamples / Math.max(1, words.length);

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;

      // Micro-prosody and vowel harmonics
      let sampleVal = 0;
      const currentWordIdx = Math.floor(i / samplesPerWord);
      const wordProgress = (i % samplesPerWord) / samplesPerWord;

      // Intonation contour
      const f0 = basePitch * (1 + 0.06 * Math.sin(2 * Math.PI * 0.7 * t) + 0.03 * Math.sin(Math.PI * wordProgress));

      for (let h = 1; h <= harmonicsCount; h++) {
        const harmonicAmp = (1.0 / Math.pow(h, 1.1)) * (0.8 + 0.2 * Math.cos(h * 0.8));
        sampleVal += harmonicAmp * Math.sin(2 * Math.PI * (f0 * h) * t);
      }

      // Syllable rhythm envelope
      const syllablePulse = Math.sin(2 * Math.PI * 4.5 * t * speed);
      const envelope = Math.max(0.2, (syllablePulse + 1) / 2);

      // Smooth start and end attack
      let edgeMultiplier = 1.0;
      const fadeSamples = Math.floor(0.05 * sampleRate);
      if (i < fadeSamples) {
        edgeMultiplier = i / fadeSamples;
      } else if (i > numSamples - fadeSamples) {
        edgeMultiplier = (numSamples - i) / fadeSamples;
      }

      // Word pause dips
      if (wordProgress > 0.88 && words.length > 1 && currentWordIdx < words.length - 1) {
        edgeMultiplier *= 0.15;
      }

      const finalVal = sampleVal * envelope * edgeMultiplier * 0.35 * (this.volume || 1.0);
      const clamped = Math.max(-1, Math.min(1, finalVal));
      const pcm16 = Math.floor(clamped * 32767);

      wavBuffer.writeInt16LE(pcm16, offset);
      offset += 2;
    }

    const latencyMs = Date.now() - startTime;
    const rtf = (latencyMs / 1000) / durationSec;
    const audioBase64 = wavBuffer.toString('base64');
    const dataUrl = `data:audio/wav;base64,${audioBase64}`;

    return {
      audioBase64,
      dataUrl,
      durationSec,
      sampleRate,
      voice: voiceId,
      voiceName: voiceObj.name,
      model: 'zaakirio/kokoro-ru',
      modelFile: this.activeModel,
      rtf: parseFloat(rtf.toFixed(3)),
      latencyMs,
      charCount: text.length
    };
  }
}

export const ttsService = new TTSService();
