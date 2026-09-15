import { sttService } from './sttService';

export interface StreamWindow {
  index: number;
  audioBuffer: Buffer;
  status: 'buffered' | 'processing' | 'completed' | 'failed';
  text: string;
  durationSec?: number;
  confidence?: number;
  receivedAt: number;
  processedAt?: number;
  error?: string;
  source?: string;
}

export interface StreamSession {
  streamId: string;
  language: string;
  modelFile?: string;
  createdAt: number;
  lastActivity: number;
  isClosed: boolean;
  isProcessing: boolean;
  windows: Map<number, StreamWindow>;
  queue: number[]; // Ordered list of window indices waiting to be decoded
  accumulatedContext: string[];
}

type BroadcasterFn = (event: string, data: any) => void;

/**
 * Calculates RMS volume of an audio buffer (WAV 16-bit PCM or raw)
 * to filter out pure silence before sending to Whisper.
 */
export function calculateAudioRms(buffer: Buffer): { rms: number; isSilent: boolean } {
  if (!buffer || buffer.length < 1500) {
    return { rms: 0, isSilent: true };
  }

  // RIFF WAV 16-bit PCM parser
  if (buffer.length >= 44 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE') {
    // Find data chunk
    let dataOffset = 44;
    for (let i = 12; i < Math.min(buffer.length - 8, 200); i++) {
      if (buffer.toString('ascii', i, i + 4) === 'data') {
        dataOffset = i + 8;
        break;
      }
    }

    let sum = 0;
    let count = 0;
    for (let i = dataOffset; i < buffer.length - 1; i += 2) {
      const sample = buffer.readInt16LE(i) / 32768.0;
      sum += sample * sample;
      count++;
    }
    const rms = count > 0 ? Math.sqrt(sum / count) : 0;
    return { rms, isSilent: rms < 0.015 };
  }

  // Fallback heuristic for arbitrary compressed audio / WebM
  let sum = 0;
  let count = 0;
  for (let i = 0; i < buffer.length; i += 4) {
    const val = (buffer[i] - 128) / 128.0;
    sum += val * val;
    count++;
  }
  const rms = count > 0 ? Math.sqrt(sum / count) : 0;
  return { rms, isSilent: rms < 0.015 };
}

class STTStreamBufferManager {
  private sessions = new Map<string, StreamSession>();
  private broadcaster: BroadcasterFn = () => {};

  constructor() {
    // Periodic session cleanup
    setInterval(() => this.cleanupStaleSessions(), 10 * 60 * 1000);
  }

  public setBroadcaster(fn: BroadcasterFn) {
    this.broadcaster = fn;
  }

  private broadcast(event: string, data: any) {
    try {
      this.broadcaster(event, data);
    } catch (err) {
      console.warn('[STTStreamBuffer] Broadcast failed:', err);
    }
  }

  public getOrCreateSession(streamId: string, language = 'ru', modelFile?: string): StreamSession {
    let session = this.sessions.get(streamId);
    if (!session) {
      session = {
        streamId,
        language,
        modelFile,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        isClosed: false,
        isProcessing: false,
        windows: new Map<number, StreamWindow>(),
        queue: [],
        accumulatedContext: []
      };
      this.sessions.set(streamId, session);
      console.log(`[STTStreamBuffer] Created new stream session: ${streamId}`);
    } else {
      session.lastActivity = Date.now();
      if (language) session.language = language;
      if (modelFile) session.modelFile = modelFile;
    }
    return session;
  }

  public async pushWindow(params: {
    streamId: string;
    windowIndex: number;
    audioBuffer: Buffer;
    isFinal: boolean;
    language?: string;
    modelFile?: string;
  }): Promise<{ windowIndex: number; text: string; status: string; queueLength: number }> {
    const { streamId, windowIndex, audioBuffer, isFinal, language = 'ru', modelFile } = params;
    const session = this.getOrCreateSession(streamId, language, modelFile);
    session.lastActivity = Date.now();

    if (isFinal) {
      session.isClosed = true;
    }

    // Check if window is pure silence before buffering or sending to Whisper
    if (audioBuffer && audioBuffer.length > 200) {
      const { rms, isSilent } = calculateAudioRms(audioBuffer);

      if (isSilent) {
        console.log(`[STTStreamBuffer] Session ${streamId}: Chunk detected as silence (RMS: ${rms.toFixed(4)}, size: ${audioBuffer.length}B), discarded immediately.`);

        if (session.isClosed && session.queue.length === 0 && !session.isProcessing) {
          this.finalizeSession(session);
        }

        return {
          windowIndex,
          text: '',
          status: 'discarded_silence',
          queueLength: session.queue.length
        };
      }

      const windowEntry: StreamWindow = {
        index: windowIndex,
        audioBuffer,
        status: 'buffered',
        text: '',
        receivedAt: Date.now()
      };
      session.windows.set(windowIndex, windowEntry);
      session.queue.push(windowIndex);

      console.log(`[STTStreamBuffer] Session ${streamId}: Window #${windowIndex} buffered (${audioBuffer.length} bytes, RMS: ${rms.toFixed(4)}). Queue length: ${session.queue.length}`);

      this.broadcast('stt_window_queued', {
        streamId,
        windowIndex,
        queueLength: session.queue.length,
        isFinal: session.isClosed
      });
    } else if (isFinal && session.queue.length === 0 && !session.isProcessing) {
      this.finalizeSession(session);
    }

    // Trigger queue worker asynchronously
    this.processNextInQueue(session).catch(err => {
      console.error(`[STTStreamBuffer] Error in queue processing for ${streamId}:`, err);
    });

    return {
      windowIndex,
      text: '',
      status: 'queued',
      queueLength: session.queue.length
    };
  }

  private async processNextInQueue(session: StreamSession): Promise<void> {
    if (session.isProcessing) {
      // Worker is currently busy with another window in this session
      return;
    }

    if (session.queue.length === 0) {
      // Check if session has finished all queued windows and is closed
      if (session.isClosed) {
        this.finalizeSession(session);
      }
      return;
    }

    session.isProcessing = true;
    const windowIndex = session.queue.shift()!;
    const windowItem = session.windows.get(windowIndex);

    if (!windowItem) {
      session.isProcessing = false;
      return this.processNextInQueue(session);
    }

    windowItem.status = 'processing';
    console.log(`[STTStreamBuffer] Session ${session.streamId}: Decoding window #${windowIndex} (${windowItem.audioBuffer.length} bytes)...`);

    this.broadcast('stt_window_processing', {
      streamId: session.streamId,
      windowIndex,
      queueRemaining: session.queue.length
    });

    try {
      const isWav = windowItem.audioBuffer.length >= 12 &&
        windowItem.audioBuffer.toString('ascii', 0, 4) === 'RIFF' &&
        windowItem.audioBuffer.toString('ascii', 8, 12) === 'WAVE';
      const filename = isWav ? `window_${windowIndex}.wav` : `window_${windowIndex}.webm`;

      const result = await sttService.transcribeAudio(
        windowItem.audioBuffer,
        filename
      );

      windowItem.status = 'completed';
      windowItem.text = result.text || '';
      windowItem.durationSec = result.duration_sec;
      windowItem.confidence = result.confidence;
      windowItem.processedAt = Date.now();
      windowItem.source = result.source;

      if (windowItem.text.trim()) {
        session.accumulatedContext.push(windowItem.text.trim());
      }

      console.log(`[STTStreamBuffer] Session ${session.streamId}: Window #${windowIndex} decoded: "${windowItem.text}" (${result.duration_sec ?? 0}s)`);

      const isSessionFinished = session.isClosed && session.queue.length === 0;

      // Broadcast real-time result for this specific speech window
      this.broadcast('stt_window_result', {
        streamId: session.streamId,
        windowIndex,
        text: windowItem.text,
        isFinal: isSessionFinished,
        fullText: this.getFullTranscript(session),
        source: result.source,
        duration_sec: result.duration_sec
      });

    } catch (err: any) {
      windowItem.status = 'failed';
      windowItem.error = err.message || String(err);
      console.error(`[STTStreamBuffer] Window #${windowIndex} decoding failed:`, err);

      this.broadcast('stt_window_error', {
        streamId: session.streamId,
        windowIndex,
        error: windowItem.error
      });
    } finally {
      session.isProcessing = false;
      // Continue with next window in queue
      setImmediate(() => {
        this.processNextInQueue(session).catch(() => {});
      });
    }
  }

  private finalizeSession(session: StreamSession) {
    const fullText = this.getFullTranscript(session);
    console.log(`[STTStreamBuffer] Session ${session.streamId} completely finished. Full transcript: "${fullText}"`);

    this.broadcast('stt_status', {
      streamId: session.streamId,
      status: 'completed',
      text: fullText,
      totalWindows: session.windows.size
    });

    this.broadcast('stt_result', {
      streamId: session.streamId,
      text: fullText,
      isFinal: true
    });
  }

  public getFullTranscript(session: StreamSession): string {
    const ordered = Array.from(session.windows.entries())
      .sort(([idxA], [idxB]) => idxA - idxB)
      .map(([, win]) => win.text?.trim())
      .filter(Boolean);
    return ordered.join(' ');
  }

  public getSessionState(streamId: string) {
    const session = this.sessions.get(streamId);
    if (!session) return null;
    return {
      streamId: session.streamId,
      isClosed: session.isClosed,
      isProcessing: session.isProcessing,
      queueLength: session.queue.length,
      windowsCount: session.windows.size,
      fullText: this.getFullTranscript(session)
    };
  }

  private cleanupStaleSessions() {
    const maxAgeMs = 15 * 60 * 1000;
    const now = Date.now();
    for (const [id, s] of this.sessions.entries()) {
      if (now - s.lastActivity > maxAgeMs) {
        this.sessions.delete(id);
      }
    }
  }
}

export const sttStreamBufferManager = new STTStreamBufferManager();
