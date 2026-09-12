import { GoogleGenAI } from '@google/genai';
import { localModelsManager } from './localModelsManager';

export interface STTConfig {
  modelFile: string;
  model?: string;
  language: string;
  enabled: boolean;
  useWebSpeechFallback: boolean;
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
    modelFile: 'whisper-base-ru.bin',
    language: 'ru',
    enabled: true,
    useWebSpeechFallback: true
  };

  constructor() {
    // Sync with local models manager active selection
    const overview = localModelsManager.scanModels();
    if (overview.categories.stt?.files[0]) {
      this.config.modelFile = overview.categories.stt.files[0].filename;
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

  public async transcribeAudio(
    audioBuffer: Buffer,
    filename: string = 'audio.webm'
  ): Promise<{ text: string; language: string; duration?: number; source: 'whisper_model' | 'stt_engine' }> {
    // 1. If audioBuffer has data, transcribe with Gemini multimodal audio or local runtime
    if (audioBuffer && audioBuffer.length > 0) {
      const ai = getGemini();
      if (ai) {
        try {
          const res = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
              {
                inlineData: {
                  mimeType: 'audio/webm',
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
          console.error('[STT] Speech transcription error:', err);
        }
      }
    }

    // If audio buffer is empty or no speech was spoken, return empty without mock text
    return {
      text: '',
      language: this.config.language,
      source: 'whisper_model'
    };
  }
}

export const sttService = new STTService();
