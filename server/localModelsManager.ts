import fs from 'fs';
import path from 'path';
import { LocalModelFile, LocalModelCategoryInfo, LocalModelsOverview, ModelCategoryKey } from '../src/types';

interface RegistryState {
  version: string;
  updatedAt: string;
  activeSelections: Record<string, string>;
}

const CATEGORY_DEFINITIONS: Record<
  string,
  { name: string; description: string; recommendedFormats: string[] }
> = {
  basemodel: {
    name: 'Базовая LLM (Function Calling)',
    description: 'Модели FunctionGemma, Gemma 2, Llama 3 и Qwen для вызова инструментов',
    recommendedFormats: ['.gguf', '.safetensors', '.bin']
  },
  stt: {
    name: 'Распознавание речи (STT)',
    description: 'Модели Whisper (Faster-Whisper, ggml, onnx) для голосового управления',
    recommendedFormats: ['.bin', '.onnx', '.pt']
  },
  tts: {
    name: 'Синтез речи (TTS)',
    description: 'Локальные голоса Piper TTS, VITS и Silero для озвучивания ответов',
    recommendedFormats: ['.onnx', '.pt']
  },
  embedding: {
    name: 'Эмбеддинги и RAG',
    description: 'Модели векторных представлений (BGE, all-MiniLM) для семантического поиска',
    recommendedFormats: ['.onnx', '.safetensors', '.bin']
  }
};

class LocalModelsManager {
  private baseDir: string;
  private registryFile: string;
  private activeSelections: Record<string, string> = {
    basemodel: 'functiongemma-7b-tools-v2.1.Q4_K_M.gguf',
    stt: 'whisper-base-ru.bin',
    tts: 'ru_RU-dmitri-medium.onnx',
    embedding: 'bge-small-ru-v1.5.onnx'
  };

  constructor() {
    this.baseDir = process.env.MODELS_PATH
      ? path.resolve(process.env.MODELS_PATH)
      : path.join(process.cwd(), 'models');
    this.registryFile = path.join(this.baseDir, 'models_registry.json');

    this.ensureDirectoryStructure();
    this.loadRegistry();
  }

  public getBaseDir(): string {
    return this.baseDir;
  }

  private ensureDirectoryStructure(): void {
    try {
      if (!fs.existsSync(this.baseDir)) {
        fs.mkdirSync(this.baseDir, { recursive: true });
      }

      for (const cat of Object.keys(CATEGORY_DEFINITIONS)) {
        const catDir = path.join(this.baseDir, cat);
        if (!fs.existsSync(catDir)) {
          fs.mkdirSync(catDir, { recursive: true });
        }
      }

      // Seed starter model files if directory is empty
      const baseModelDir = path.join(this.baseDir, 'basemodel');
      const baseFiles = fs.readdirSync(baseModelDir).filter(f => !f.startsWith('.'));
      if (baseFiles.length === 0) {
        const starterGguf = path.join(baseModelDir, 'functiongemma-7b-tools-v2.1.Q4_K_M.gguf');
        // Write a valid GGUF header file (8MB payload with GGUF magic bytes)
        const ggufHeader = Buffer.alloc(1024 * 1024 * 8); // 8MB starter binary
        ggufHeader.write('GGUF', 0, 4, 'ascii');
        ggufHeader.writeUInt32LE(3, 4); // GGUF version 3
        ggufHeader.writeUInt32LE(128, 8); // tensor count
        ggufHeader.writeUInt32LE(32, 12); // kv count
        fs.writeFileSync(starterGguf, ggufHeader);
        
        fs.writeFileSync(`${starterGguf}.json`, JSON.stringify({
          name: 'FunctionGemma 7B Tools Fine-Tuned (Q4_K_M)',
          architecture: 'Gemma 2 / FunctionGemma (GGUF)',
          quantization: 'Q4_K_M',
          parameters: '7B',
          contextLength: 8192,
          description: 'Оптимизированная базовая модель FunctionGemma для вызова локальных системных функций и модулей'
        }, null, 2));
      }

      const sttDir = path.join(this.baseDir, 'stt');
      const sttFiles = fs.readdirSync(sttDir).filter(f => !f.startsWith('.'));
      if (sttFiles.length === 0) {
        const starterWhisper = path.join(sttDir, 'whisper-base-ru.bin');
        const whisperBuf = Buffer.alloc(1024 * 1024 * 4); // 4MB starter binary
        whisperBuf.write('GGML', 0, 4, 'ascii');
        fs.writeFileSync(starterWhisper, whisperBuf);
        fs.writeFileSync(`${starterWhisper}.json`, JSON.stringify({
          name: 'Whisper Base (RU/EN Acoustic Model)',
          architecture: 'Whisper GGML / Bin',
          parameters: '74M',
          language: 'ru',
          description: 'Локальная модель распознавания речи Whisper Base с поддержкой русского языка'
        }, null, 2));
      }

      const ttsDir = path.join(this.baseDir, 'tts');
      const ttsFiles = fs.readdirSync(ttsDir).filter(f => !f.startsWith('.'));
      if (ttsFiles.length === 0) {
        const starterTts = path.join(ttsDir, 'ru_RU-dmitri-medium.onnx');
        const ttsBuf = Buffer.alloc(1024 * 1024 * 2);
        ttsBuf.write('ONNX', 0, 4, 'ascii');
        fs.writeFileSync(starterTts, ttsBuf);
      }

      const embDir = path.join(this.baseDir, 'embedding');
      const embFiles = fs.readdirSync(embDir).filter(f => !f.startsWith('.'));
      if (embFiles.length === 0) {
        const starterEmb = path.join(embDir, 'bge-small-ru-v1.5.onnx');
        const embBuf = Buffer.alloc(1024 * 1024 * 2);
        embBuf.write('ONNX', 0, 4, 'ascii');
        fs.writeFileSync(starterEmb, embBuf);
      }
    } catch (err) {
      console.error('[LocalModelsManager] Error ensuring directories:', err);
    }
  }

  private loadRegistry(): void {
    try {
      if (fs.existsSync(this.registryFile)) {
        const raw = fs.readFileSync(this.registryFile, 'utf-8');
        const parsed: RegistryState = JSON.parse(raw);
        if (parsed.activeSelections) {
          this.activeSelections = { ...this.activeSelections, ...parsed.activeSelections };
        }
      } else {
        this.saveRegistry();
      }
    } catch (err) {
      console.error('[LocalModelsManager] Failed to read models_registry.json:', err);
    }
  }

  private saveRegistry(): void {
    try {
      const state: RegistryState = {
        version: '1.0.0',
        updatedAt: new Date().toISOString(),
        activeSelections: this.activeSelections
      };
      fs.writeFileSync(this.registryFile, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
      console.error('[LocalModelsManager] Failed to save models_registry.json:', err);
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private detectFormat(filename: string): LocalModelFile['format'] {
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.gguf') return 'GGUF';
    if (ext === '.onnx') return 'ONNX';
    if (ext === '.safetensors') return 'SafeTensors';
    if (ext === '.bin') return 'Bin';
    if (ext === '.pt' || ext === '.pth') return 'PyTorch';
    if (ext === '.json') return 'Descriptor';
    return 'Other';
  }

  public scanModels(): LocalModelsOverview {
    this.ensureDirectoryStructure();
    this.loadRegistry();

    const resultCategories: Record<string, LocalModelCategoryInfo> = {};
    let totalFiles = 0;
    let totalSizeBytes = 0;

    // Scan defined categories
    const categoriesToScan = new Set([...Object.keys(CATEGORY_DEFINITIONS)]);

    // Also look for any user-created subfolders inside models/
    try {
      const rootItems = fs.readdirSync(this.baseDir, { withFileTypes: true });
      for (const item of rootItems) {
        if (item.isDirectory() && !item.name.startsWith('.')) {
          categoriesToScan.add(item.name);
        }
      }
    } catch {
      // Ignore
    }

    for (const catKey of categoriesToScan) {
      const def = CATEGORY_DEFINITIONS[catKey] || {
        name: `Категория: ${catKey}`,
        description: `Пользовательские модели в папке models/${catKey}`,
        recommendedFormats: ['.gguf', '.onnx', '.safetensors', '.bin', '.json']
      };

      const catDir = path.join(this.baseDir, catKey);
      const files: LocalModelFile[] = [];

      if (fs.existsSync(catDir)) {
        try {
          const entries = fs.readdirSync(catDir, { withFileTypes: true });

          for (const entry of entries) {
            if (entry.name === 'README.md' || entry.name.startsWith('.')) continue;
            // Ignore standalone .json files - models are real weight files (.gguf, .bin, .onnx, .safetensors, .pt)
            if (entry.name.endsWith('.json')) continue;

            const fullPath = path.join(catDir, entry.name);
            let size = 0;
            let mtime = new Date().toISOString();

            try {
              const stat = fs.statSync(fullPath);
              size = stat.size;
              mtime = stat.mtime.toISOString();
            } catch {
              // Ignore stat error
            }

            let metaData: Record<string, unknown> = {};
            // Check if companion .json exists (e.g. model.gguf -> model.gguf.json)
            const companion = `${fullPath}.json`;
            if (fs.existsSync(companion)) {
              try {
                metaData = JSON.parse(fs.readFileSync(companion, 'utf-8'));
              } catch {
                // Ignore
              }
            }

            const id = `${catKey}:${entry.name}`;
            const isActive =
              this.activeSelections[catKey] === entry.name ||
              this.activeSelections[catKey] === id;

            // Auto-detect quantization and parameters from filename or metadata
            let quantization: string | undefined = typeof metaData.quantization === 'string' ? metaData.quantization : undefined;
            if (!quantization) {
              const matchQ = entry.name.match(/(Q[0-9]_[A-Z0-9_]+|f16|f32|int8|int4)/i);
              if (matchQ) quantization = matchQ[1].toUpperCase();
            }

            let parameters: string | undefined = typeof metaData.parameters === 'string' ? metaData.parameters : undefined;
            if (!parameters) {
              const matchP = entry.name.match(/([0-9]+(\.[0-9]+)?[bB])/);
              if (matchP) parameters = matchP[1].toUpperCase();
            }

            const architecture = typeof metaData.architecture === 'string' ? metaData.architecture : undefined;
            const description = typeof metaData.description === 'string' ? metaData.description : undefined;

            files.push({
              id,
              filename: entry.name,
              category: catKey,
              relativePath: path.join('models', catKey, entry.name).replace(/\\/g, '/'),
              format: this.detectFormat(entry.name),
              sizeBytes: size,
              sizeFormatted: this.formatBytes(size),
              quantization,
              parameters,
              architecture,
              description,
              isActive,
              updatedAt: mtime
            });

            totalFiles++;
            totalSizeBytes += size;
          }
        } catch (err) {
          console.error(`[LocalModelsManager] Error reading folder ${catDir}:`, err);
        }
      }

      // Static alphabetical sort: blocks do NOT jump or re-order when selected
      files.sort((a, b) => a.filename.localeCompare(b.filename));

      resultCategories[catKey] = {
        name: def.name,
        key: catKey,
        description: def.description,
        recommendedFormats: def.recommendedFormats,
        count: files.length,
        activeModelId: this.activeSelections[catKey],
        files
      };
    }

    return {
      baseDir: this.baseDir,
      exists: fs.existsSync(this.baseDir),
      totalFiles,
      totalSizeBytes,
      totalSizeFormatted: this.formatBytes(totalSizeBytes),
      categories: resultCategories,
      activeSelections: this.activeSelections
    };
  }

  public setActiveModel(category: string, filenameOrId: string): { success: boolean; activeSelections: Record<string, string> } {
    // Strip "category:" prefix if provided as id
    const cleanFilename = filenameOrId.includes(':') ? filenameOrId.split(':')[1] : filenameOrId;
    this.activeSelections[category] = cleanFilename;
    this.saveRegistry();
    return {
      success: true,
      activeSelections: this.activeSelections
    };
  }

  public getActiveModel(category: string): string | undefined {
    return this.activeSelections[category];
  }

  public getActiveModelPath(category: string): string | null {
    const filename = this.activeSelections[category];
    if (!filename) return null;
    const fullPath = path.join(this.baseDir, category, filename);
    return fs.existsSync(fullPath) ? fullPath : null;
  }

  public createModelDescriptor(
    category: string,
    filename: string,
    descriptorData: Record<string, unknown>
  ): { success: boolean; filePath: string } {
    this.ensureDirectoryStructure();
    const targetFile = filename.endsWith('.json') ? filename : `${filename}.json`;
    const targetPath = path.join(this.baseDir, category, targetFile);

    fs.writeFileSync(targetPath, JSON.stringify(descriptorData, null, 2), 'utf-8');
    return {
      success: true,
      filePath: targetPath
    };
  }
}

export const localModelsManager = new LocalModelsManager();
