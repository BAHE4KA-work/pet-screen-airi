import amqp from 'amqplib';
import { GoogleGenAI } from '@google/genai';
import { localModelsManager } from './localModelsManager';

export interface STTConfig {
  modelFile: string;
  model?: string;
  language: string;
  enabled: boolean;
  useWebSpeechFallback: boolean;
  endpoint?: string;
}

let geminiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return geminiClient;
}

class STTService {
  private config: STTConfig = {
    modelFile: 'ggml-medium-q8_0.bin',
    language: 'ru',
    enabled: true,
    useWebSpeechFallback: true
  };

  private rabbitConnection: any = null;
  private rabbitChannel: any = null;
  private rabbitInitializing: boolean = false;
  public isBusy: boolean = false;

  constructor() {
    // Sync with local models manager active selection
    const overview = localModelsManager.scanModels();
    if (overview.categories.stt?.files[0]) {
      this.config.modelFile = overview.categories.stt.files[0].filename;
    }
    // Attempt non-blocking connection to RabbitMQ
    this.initRabbitMQ().catch(() => {});
  }

  private async initRabbitMQ(): Promise<boolean> {
    if (this.rabbitConnection && this.rabbitChannel) return true;
    if (this.rabbitInitializing) return false;
    this.rabbitInitializing = true;

    const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672/';
    try {
      const conn = await amqp.connect(rabbitUrl);
      const ch = await conn.createChannel();
      conn.on('error', () => {
        this.rabbitConnection = null;
        this.rabbitChannel = null;
      });
      conn.on('close', () => {
        this.rabbitConnection = null;
        this.rabbitChannel = null;
      });
      this.rabbitConnection = conn;
      this.rabbitChannel = ch;
      this.rabbitInitializing = false;
      console.log(`[STTService] Connected to RabbitMQ at ${rabbitUrl}`);
      return true;
    } catch (err: any) {
      this.rabbitInitializing = false;
      // In dev or non-docker env, this is expected
      return false;
    }
  }

  public getConfig(): STTConfig {
    return this.config;
  }

  public setConfig(newConfig: Partial<STTConfig>): STTConfig {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.modelFile) {
      localModelsManager.setActiveModel('stt', newConfig.modelFile);
    }
    return this.config;
  }

  private async transcribeViaRabbitMQ(
    audioBuffer: Buffer,
    filename: string = 'audio.webm'
  ): Promise<{ text: string; language: string; duration_sec?: number; confidence?: number; source: 'whisper_cpp' } | null> {
    try {
      const isConnected = await this.initRabbitMQ();
      if (!isConnected || !this.rabbitChannel) return null;

      const ch = this.rabbitChannel;
      const replyQueue = await ch.assertQueue('', { exclusive: true, autoDelete: true });
      const corrId = `stt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const requestPayload = {
        request_id: corrId,
        timestamp: new Date().toISOString(),
        audio_base64: audioBuffer.toString('base64'),
        audio_format: filename.endsWith('.wav') ? 'wav' : 'webm',
        language: this.config.language || 'ru',
        model_file: this.config.modelFile
      };

      this.isBusy = true;
      return await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          cleanup();
          this.isBusy = false;
          console.warn(`[STTService] Request ${corrId} timed out after 120s waiting for whisper.cpp`);
          resolve(null);
        }, 120000);

        let consumerTag: string | null = null;

        const cleanup = () => {
          clearTimeout(timeout);
          this.isBusy = false;
          if (consumerTag) {
            ch.cancel(consumerTag).catch(() => {});
          }
          ch.deleteQueue(replyQueue.queue).catch(() => {});
        };

        ch.consume(
          replyQueue.queue,
          (msg: any) => {
            if (!msg) return;
            if (msg.properties.correlationId === corrId) {
              cleanup();
              try {
                const response = JSON.parse(msg.content.toString());
                console.log(`[STTService] whisper.cpp response for ${corrId}: "${response.text || ''}" (${response.duration_sec ?? 0}s)`);
                resolve({
                  text: response.text || '',
                  language: response.language || 'ru',
                  duration_sec: response.duration_sec,
                  confidence: response.confidence,
                  source: 'whisper_cpp'
                });
              } catch (err: any) {
                console.error(`[STTService] Failed to parse whisper.cpp response:`, err);
                resolve(null);
              }
            }
          },
          { noAck: true }
        ).then((sub: any) => {
          consumerTag = sub.consumerTag;
          console.log(`[STTService] Dispatched ${corrId} (${audioBuffer.length} bytes) to overlay.tasks.stt.inbound`);
          ch.sendToQueue(
            'overlay.tasks.stt.inbound',
            Buffer.from(JSON.stringify(requestPayload)),
            {
              correlationId: corrId,
              replyTo: replyQueue.queue,
              persistent: false
            }
          );
        }).catch((err: any) => {
          console.error(`[STTService] Failed to setup queue consumer:`, err);
          cleanup();
          resolve(null);
        });
      });
    } catch (err: any) {
      console.warn('[STTService] RabbitMQ transcription error:', err.message);
      return null;
    }
  }

  public async transcribeAudio(
    audioBuffer: Buffer,
    filename: string = 'audio.webm'
  ): Promise<{ text: string; language: string; duration_sec?: number; confidence?: number; source: 'whisper_cpp' | 'whisper_model' | 'stt_engine' }> {
    if (!audioBuffer || audioBuffer.length < 50) {
      return {
        text: '',
        language: this.config.language,
        source: 'whisper_cpp'
      };
    }

    // 1. Try dedicated whisper.cpp worker via RabbitMQ
    const rabbitRes = await this.transcribeViaRabbitMQ(audioBuffer, filename);
    if (rabbitRes && rabbitRes.text) {
      return rabbitRes;
    }

    // 2. Fallback to Gemini multimodal audio if Gemini API Key is available
    const ai = getGemini();
    if (ai) {
      try {
        const res = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              inlineData: {
                mimeType: filename.endsWith('.wav') ? 'audio/wav' : 'audio/webm',
                data: audioBuffer.toString('base64')
              }
            },
            {
              text: `You are an acoustic speech transcription engine using model ${this.config.modelFile}. Transcribe the speech accurately in ${this.config.language}. Return ONLY the transcribed text. Do NOT add commentary, do NOT use quotes.`
            }
          ]
        });
        const text = res.text?.trim() || '';
        if (text) {
          return {
            text,
            language: this.config.language,
            source: 'whisper_model'
          };
        }
      } catch (err) {
        console.error('[STT] Speech transcription fallback error:', err);
      }
    }

    return {
      text: '',
      language: this.config.language,
      source: 'whisper_cpp'
    };
  }
}

export const sttService = new STTService();
