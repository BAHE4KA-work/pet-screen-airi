/**
 * Audio PCM & VAD Sliding Window Recorder
 * Captures microphone audio using Web Audio API, detects speech & pauses (VAD >= 300ms),
 * downsamples to 16kHz mono PCM and encodes valid WAV blobs for whisper.cpp.
 */

export interface VadRecorderConfig {
  vadPauseMs?: number;       // Pause duration before flushing speech window (default 300ms)
  vadMinSpeechMs?: number;   // Minimum speech duration to consider valid phrase (default 350ms)
  vadThreshold?: number;     // RMS threshold for voice activity (default 0.025)
  targetSampleRate?: number; // whisper.cpp strictly expects 16000Hz (default 16000)
}

export interface VadRecorderCallbacks {
  onVolumeLevel?: (rms: number, isSpeaking: boolean) => void;
  onSpeechStart?: (windowIndex: number) => void;
  onSpeechPause?: (windowIndex: number, pauseDurationMs: number) => void;
  onWindowReady?: (wavBlob: Blob, windowIndex: number, rms: number, durationSec: number) => void;
  onWindowSkipped?: (windowIndex: number, reason: string) => void;
  onError?: (err: Error) => void;
}

export function downsampleTo16k(input: Float32Array, inputSampleRate: number, targetRate = 16000): Float32Array {
  if (inputSampleRate === targetRate) return input;
  const ratio = inputSampleRate / targetRate;
  const newLength = Math.round(input.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const origIdx = Math.floor(i * ratio);
    result[i] = input[origIdx];
  }
  return result;
}

export function encodeWav(samples: Float32Array, sampleRate = 16000): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // 1. RIFF chunk descriptor
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true); // ChunkSize
  writeString(8, 'WAVE');

  // 2. fmt sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);       // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);        // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true);        // NumChannels (1 = Mono)
  view.setUint32(24, sampleRate, true); // SampleRate (16000)
  view.setUint32(28, sampleRate * 2, true); // ByteRate (sampleRate * numChannels * bitsPerSample/8)
  view.setUint16(32, 2, true);        // BlockAlign (numChannels * bitsPerSample/8)
  view.setUint16(34, 16, true);       // BitsPerSample (16-bit)

  // 3. data sub-chunk
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true); // Subchunk2Size

  // Write PCM 16-bit samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
}

export class VadAudioRecorder {
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;

  private isRunning = false;
  private config: Required<VadRecorderConfig>;
  private callbacks: VadRecorderCallbacks;

  private currentWindowIndex = 1;
  private pcmChunks: Float32Array[] = [];
  private hasSpokenInWindow = false;
  private speechStartTime = 0;
  private lastSpeechTime = 0;

  constructor(config: VadRecorderConfig = {}, callbacks: VadRecorderCallbacks = {}) {
    this.config = {
      vadPauseMs: config.vadPauseMs ?? 300,
      vadMinSpeechMs: config.vadMinSpeechMs ?? 350,
      vadThreshold: config.vadThreshold ?? 0.025,
      targetSampleRate: config.targetSampleRate ?? 16000
    };
    this.callbacks = callbacks;
  }

  public updateConfig(newConfig: Partial<VadRecorderConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  public async start(stream: MediaStream) {
    if (this.isRunning) {
      this.stop();
    }

    this.stream = stream;
    this.isRunning = true;
    this.currentWindowIndex = 1;
    this.pcmChunks = [];
    this.hasSpokenInWindow = false;
    this.speechStartTime = 0;
    this.lastSpeechTime = 0;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioCtx = new AudioContextClass();
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    this.sourceNode = this.audioCtx.createMediaStreamSource(stream);

    // Buffer size 4096 samples (~85ms per callback at 48kHz)
    this.processorNode = this.audioCtx.createScriptProcessor(4096, 1, 1);
    const nativeSampleRate = this.audioCtx.sampleRate;

    this.processorNode.onaudioprocess = (e) => {
      if (!this.isRunning) return;
      const inputBuffer = e.inputBuffer.getChannelData(0);

      // Downsample buffer chunk to 16kHz
      const chunk16k = downsampleTo16k(inputBuffer, nativeSampleRate, this.config.targetSampleRate);

      // Calculate RMS for voice activity
      let sum = 0;
      for (let i = 0; i < chunk16k.length; i++) {
        sum += chunk16k[i] * chunk16k[i];
      }
      const rms = Math.sqrt(sum / chunk16k.length);
      const isVoice = rms > this.config.vadThreshold;
      const now = Date.now();

      this.callbacks.onVolumeLevel?.(rms, isVoice);

      if (isVoice) {
        if (!this.hasSpokenInWindow) {
          this.hasSpokenInWindow = true;
          this.speechStartTime = now;
          this.callbacks.onSpeechStart?.(this.currentWindowIndex);
        }
        this.lastSpeechTime = now;
        // Accumulate audio in current window
        this.pcmChunks.push(new Float32Array(chunk16k));
      } else {
        // Silence chunk
        if (this.hasSpokenInWindow) {
          // Still accumulate brief silence within window so words don't cut off sharply
          this.pcmChunks.push(new Float32Array(chunk16k));

          const pauseDuration = now - this.lastSpeechTime;
          this.callbacks.onSpeechPause?.(this.currentWindowIndex, pauseDuration);

          if (pauseDuration >= this.config.vadPauseMs) {
            // VAD pause threshold reached (> 300ms)!
            const speechDuration = this.lastSpeechTime - this.speechStartTime;
            if (speechDuration >= this.config.vadMinSpeechMs) {
              this.flushCurrentWindow();
            } else {
              // Too short (noise/click) -> discard completely, do not count as window
              this.pcmChunks = [];
              this.hasSpokenInWindow = false;
              this.speechStartTime = 0;
              this.lastSpeechTime = 0;
            }
          }
        }
      }
    };

    this.sourceNode.connect(this.processorNode);
    // Connect to destination to keep processor node alive in audio graph
    this.processorNode.connect(this.audioCtx.destination);
  }

  private flushCurrentWindow() {
    if (this.pcmChunks.length === 0) return;

    // Concatenate chunks
    let totalLength = 0;
    for (const c of this.pcmChunks) totalLength += c.length;
    const combined = new Float32Array(totalLength);
    let offset = 0;
    for (const c of this.pcmChunks) {
      combined.set(c, offset);
      offset += c.length;
    }

    // Measure combined window RMS
    let sum = 0;
    for (let i = 0; i < combined.length; i++) {
      sum += combined[i] * combined[i];
    }
    const windowRms = Math.sqrt(sum / combined.length);

    // Strict Silence Filtering: if overall window RMS is below threshold, discard without creating a window
    if (windowRms < this.config.vadThreshold * 0.7) {
      this.pcmChunks = [];
      this.hasSpokenInWindow = false;
      this.speechStartTime = 0;
      this.lastSpeechTime = 0;
      return;
    }

    // Speech is valid: assign window index and increment
    const winIdx = this.currentWindowIndex;
    this.currentWindowIndex += 1;
    this.pcmChunks = [];
    this.hasSpokenInWindow = false;
    this.speechStartTime = 0;
    this.lastSpeechTime = 0;

    const durationSec = Math.round((combined.length / this.config.targetSampleRate) * 100) / 100;
    const wavBlob = encodeWav(combined, this.config.targetSampleRate);

    this.callbacks.onWindowReady?.(wavBlob, winIdx, windowRms, durationSec);
  }

  public stop(): { finalBlob?: Blob; finalWindowIndex?: number } {
    this.isRunning = false;

    // If active speech in progress when stopped, flush as last window
    let finalBlob: Blob | undefined;
    let finalWindowIndex: number | undefined;

    if (this.hasSpokenInWindow && this.pcmChunks.length > 0) {
      let totalLength = 0;
      for (const c of this.pcmChunks) totalLength += c.length;
      const combined = new Float32Array(totalLength);
      let offset = 0;
      for (const c of this.pcmChunks) {
        combined.set(c, offset);
        offset += c.length;
      }

      let sum = 0;
      for (let i = 0; i < combined.length; i++) {
        sum += combined[i] * combined[i];
      }
      const windowRms = Math.sqrt(sum / combined.length);
      const speechDuration = (this.lastSpeechTime || Date.now()) - this.speechStartTime;

      if (windowRms >= this.config.vadThreshold * 0.7 && speechDuration >= this.config.vadMinSpeechMs) {
        finalWindowIndex = this.currentWindowIndex;
        this.currentWindowIndex += 1;
        finalBlob = encodeWav(combined, this.config.targetSampleRate);
      }
      this.pcmChunks = [];
      this.hasSpokenInWindow = false;
    }

    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
        this.processorNode.onaudioprocess = null;
      } catch {}
      this.processorNode = null;
    }

    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch {}
      this.sourceNode = null;
    }

    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch {}
      this.audioCtx = null;
    }

    this.pcmChunks = [];
    this.hasSpokenInWindow = false;

    return { finalBlob, finalWindowIndex };
  }

  public getCurrentWindowIndex(): number {
    return this.currentWindowIndex;
  }
}
