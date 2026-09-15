import fs from 'fs';
import path from 'path';
import { localModelsManager } from './localModelsManager';
import { modulesRegistry } from './modulesRegistry';
import { ModelRuntimeState, LoadedCategoryInfo } from '../src/types';

const CATEGORY_CONTAINER_MAP: Record<string, string> = {
  basemodel: 'overlay-llm-worker',
  stt: 'overlay-stt-worker',
  tts: 'overlay-tts-worker',
  embedding: 'overlay-rag-worker'
};

const CATEGORY_ARCH_MAP: Record<string, string> = {
  basemodel: 'FunctionGemma / Llama (GGUF)',
  stt: 'Whisper GGML / Bin (Faster-Whisper)',
  tts: 'Piper TTS / ONNX',
  embedding: 'BGE / ONNX'
};

interface CategoryRuntime {
  category: string;
  containerName: string;
  buffers: Buffer[];
  state: ModelRuntimeState;
}

class LocalModelRuntime {
  // Retain actual binary buffers in memory per category/container to allocate physical RAM independently
  private categoryRuntimes: Map<string, CategoryRuntime> = new Map();

  constructor() {
    this.initCategory('basemodel');
    this.initCategory('stt');
    this.initCategory('tts');
    this.initCategory('embedding');
  }

  private getContainerName(category: string): string {
    return CATEGORY_CONTAINER_MAP[category] || `overlay-${category}-worker`;
  }

  private getArchitectureName(category: string): string {
    return CATEGORY_ARCH_MAP[category] || `${category.toUpperCase()} Model`;
  }

  private initCategory(category: string): CategoryRuntime {
    let runtime = this.categoryRuntimes.get(category);
    if (!runtime) {
      const containerName = this.getContainerName(category);
      runtime = {
        category,
        containerName,
        buffers: [],
        state: {
          isLoaded: false,
          loaded: false,
          activeCategory: category,
          loadedCategory: category,
          activeFilename: null,
          loadedModel: null,
          activeModelPath: null,
          format: null,
          quantization: null,
          parameters: null,
          architecture: this.getArchitectureName(category),
          sizeBytes: 0,
          sizeFormatted: '0 B',
          ramUsageBytes: 0,
          ramUsageFormatted: '0 B',
          memoryUsageMb: 0,
          rssMb: 0,
          loadedAt: null,
          lastUsedAt: null,
          statusMessage: `Контейнер ${containerName}: модель не загружена в ОЗУ`,
          source: 'UNLOADED',
          containerName
        }
      };
      this.categoryRuntimes.set(category, runtime);
    }
    return runtime;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private refreshCategoryState(category: string): void {
    const runtime = this.initCategory(category);
    const mem = process.memoryUsage();
    runtime.state.rssMb = Math.round(mem.rss / (1024 * 1024));

    const activeFilename = localModelsManager.getActiveModel(category) || null;
    const baseDir = localModelsManager.getBaseDir();

    if (activeFilename && !runtime.state.isLoaded) {
      const fullPath = path.join(baseDir, category, activeFilename);
      const exists = fs.existsSync(fullPath);

      runtime.state.activeFilename = activeFilename;
      runtime.state.activeModelPath = exists ? fullPath : null;

      if (exists) {
        try {
          const stat = fs.statSync(fullPath);
          runtime.state.sizeBytes = stat.size;
          runtime.state.sizeFormatted = this.formatBytes(stat.size);

          const ext = path.extname(activeFilename).toLowerCase();
          runtime.state.format =
            ext === '.gguf'
              ? 'GGUF'
              : ext === '.onnx'
              ? 'ONNX'
              : ext === '.safetensors'
              ? 'SafeTensors'
              : ext === '.bin'
              ? 'Bin'
              : 'PyTorch';

          const matchQ = activeFilename.match(/(Q[0-9]_[A-Z0-9_]+|f16|f32|int8|int4)/i);
          runtime.state.quantization = matchQ ? matchQ[1].toUpperCase() : 'Q4_K_M';

          const matchP = activeFilename.match(/([0-9]+(\.[0-9]+)?[bB])/);
          runtime.state.parameters = matchP ? matchP[1].toUpperCase() : (category === 'stt' ? '74M' : '7B');
          runtime.state.architecture = this.getArchitectureName(category);
        } catch {
          // ignore
        }
      }
    }
  }

  private getAggregateLoadedCategories(): Record<string, LoadedCategoryInfo> {
    const loaded: Record<string, LoadedCategoryInfo> = {};
    for (const [cat, runtime] of this.categoryRuntimes.entries()) {
      if (runtime.state.isLoaded && runtime.state.loadedModel) {
        loaded[cat] = {
          category: cat,
          loadedModel: runtime.state.loadedModel,
          sizeFormatted: runtime.state.ramUsageFormatted || runtime.state.sizeFormatted,
          containerName: runtime.containerName,
          loadedAt: runtime.state.loadedAt || new Date().toISOString()
        };
      }
    }
    return loaded;
  }

  public getState(category: string = 'basemodel'): ModelRuntimeState {
    this.refreshCategoryState(category);
    const runtime = this.initCategory(category);

    const loadedCategories = this.getAggregateLoadedCategories();
    const totalLoadedCount = Object.keys(loadedCategories).length;

    let totalRamBytes = 0;
    for (const r of this.categoryRuntimes.values()) {
      if (r.state.isLoaded) {
        totalRamBytes += r.state.ramUsageBytes;
      }
    }

    return {
      ...runtime.state,
      containerName: runtime.containerName,
      loadedCategories,
      totalLoadedCount,
      totalRamFormatted: this.formatBytes(totalRamBytes)
    };
  }

  public getAllStates(): Record<string, ModelRuntimeState> {
    const result: Record<string, ModelRuntimeState> = {};
    for (const cat of this.categoryRuntimes.keys()) {
      result[cat] = this.getState(cat);
    }
    return result;
  }

  public async loadModel(category: string = 'basemodel', filename?: string): Promise<ModelRuntimeState> {
    const targetFilename = filename || localModelsManager.getActiveModel(category);
    if (!targetFilename) {
      throw new Error(`Не указано имя модели для категории "${category}". Поместите файл модели в models/${category}/`);
    }

    const baseDir = localModelsManager.getBaseDir();
    const fullPath = path.join(baseDir, category, targetFilename);

    if (!fs.existsSync(fullPath)) {
      this.unloadModel(category);
      throw new Error(`Файл модели "${targetFilename}" отсутствует в папке models/${category}/`);
    }

    const runtime = this.initCategory(category);

    // Release only this category's old buffers (other categories remain loaded!)
    runtime.buffers = [];
    if (typeof (global as any).gc === 'function') {
      try { (global as any).gc(); } catch {}
    }

    const stat = fs.statSync(fullPath);
    const fileSize = stat.size;

    console.log(`[LocalModelRuntime] Container "${runtime.containerName}": Reading ${targetFilename} (${this.formatBytes(fileSize)}) into physical RAM...`);

    const CHUNK_SIZE = 64 * 1024 * 1024;
    const fd = fs.openSync(fullPath, 'r');
    let bytesReadTotal = 0;

    try {
      while (bytesReadTotal < fileSize) {
        const bytesToRead = Math.min(CHUNK_SIZE, fileSize - bytesReadTotal);
        const buf = Buffer.allocUnsafe(bytesToRead);
        fs.readSync(fd, buf, 0, bytesToRead, bytesReadTotal);
        runtime.buffers.push(buf);
        bytesReadTotal += bytesToRead;
      }
    } finally {
      fs.closeSync(fd);
    }

    localModelsManager.setActiveModel(category, targetFilename);

    const mem = process.memoryUsage();
    const rssMb = Math.round(mem.rss / (1024 * 1024));
    const sizeMb = Math.round(fileSize / (1024 * 1024));
    const sizeFormatted = this.formatBytes(fileSize);

    runtime.state = {
      isLoaded: true,
      loaded: true,
      activeCategory: category,
      loadedCategory: category,
      activeFilename: targetFilename,
      loadedModel: targetFilename,
      activeModelPath: fullPath,
      format: path.extname(targetFilename).toUpperCase().replace('.', '') || (category === 'stt' ? 'BIN' : 'GGUF'),
      quantization: targetFilename.match(/(Q[0-9]_[A-Z0-9_]+|f16|f32|int8|int4)/i)?.[1]?.toUpperCase() || 'Q4_K_M',
      parameters: targetFilename.match(/([0-9]+(\.[0-9]+)?[bB])/)?.[1]?.toUpperCase() || (category === 'stt' ? '74M' : '7B'),
      architecture: this.getArchitectureName(category),
      sizeBytes: fileSize,
      sizeFormatted,
      ramUsageBytes: bytesReadTotal,
      ramUsageFormatted: sizeFormatted,
      memoryUsageMb: sizeMb,
      rssMb,
      loadedAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      statusMessage: `Модель ${targetFilename} (${sizeFormatted}) успешно загружена в ОЗУ контейнера ${runtime.containerName}.`,
      source: 'RAM_LOCAL_FILE',
      containerName: runtime.containerName
    };

    if (category === 'basemodel') {
      modulesRegistry.setModelLoaded(true);
    }

    console.log(`[LocalModelRuntime] Successfully loaded ${targetFilename} in container ${runtime.containerName}. Allocated: ${sizeFormatted}. Process RSS: ${rssMb} MB`);
    return this.getState(category);
  }

  public unloadModel(category: string = 'basemodel'): ModelRuntimeState {
    const runtime = this.initCategory(category);
    runtime.buffers = [];

    if (typeof (global as any).gc === 'function') {
      try { (global as any).gc(); } catch {}
    }

    const mem = process.memoryUsage();
    const rssMb = Math.round(mem.rss / (1024 * 1024));

    runtime.state.isLoaded = false;
    runtime.state.loaded = false;
    runtime.state.loadedModel = null;
    runtime.state.ramUsageBytes = 0;
    runtime.state.ramUsageFormatted = '0 B';
    runtime.state.memoryUsageMb = 0;
    runtime.state.rssMb = rssMb;
    runtime.state.loadedAt = null;
    runtime.state.source = 'UNLOADED';
    runtime.state.statusMessage = `Контейнер ${runtime.containerName}: модель выгружена из ОЗУ. Память освобождена.`;

    if (category === 'basemodel') {
      modulesRegistry.setModelLoaded(false);
    }

    console.log(`[LocalModelRuntime] Container ${runtime.containerName}: model unloaded from RAM. Process RSS: ${rssMb} MB`);
    return this.getState(category);
  }

  public ensureModelLoaded(category: string = 'basemodel'): ModelRuntimeState {
    const runtime = this.initCategory(category);
    const activeFilename = localModelsManager.getActiveModel(category);

    if (!runtime.state.isLoaded || runtime.state.activeFilename !== activeFilename) {
      if (!activeFilename) {
        throw new Error(`В категории "${category}" не выбрана модель. Поместите файл модели в папку models/${category}/`);
      }
      return this.loadModelSync(category, activeFilename);
    }

    runtime.state.lastUsedAt = new Date().toISOString();
    return this.getState(category);
  }

  private loadModelSync(category: string, targetFilename: string): ModelRuntimeState {
    const baseDir = localModelsManager.getBaseDir();
    const fullPath = path.join(baseDir, category, targetFilename);

    if (!fs.existsSync(fullPath)) {
      this.unloadModel(category);
      throw new Error(`Файл модели "${targetFilename}" не найден в папке models/${category}/`);
    }

    const runtime = this.initCategory(category);
    runtime.buffers = [];

    const stat = fs.statSync(fullPath);
    const fileSize = stat.size;

    const CHUNK_SIZE = 64 * 1024 * 1024;
    const fd = fs.openSync(fullPath, 'r');
    let bytesReadTotal = 0;

    try {
      while (bytesReadTotal < fileSize) {
        const bytesToRead = Math.min(CHUNK_SIZE, fileSize - bytesReadTotal);
        const buf = Buffer.allocUnsafe(bytesToRead);
        fs.readSync(fd, buf, 0, bytesToRead, bytesReadTotal);
        runtime.buffers.push(buf);
        bytesReadTotal += bytesToRead;
      }
    } finally {
      fs.closeSync(fd);
    }

    const mem = process.memoryUsage();
    const rssMb = Math.round(mem.rss / (1024 * 1024));
    const sizeMb = Math.round(fileSize / (1024 * 1024));
    const sizeFormatted = this.formatBytes(fileSize);

    runtime.state = {
      isLoaded: true,
      loaded: true,
      activeCategory: category,
      loadedCategory: category,
      activeFilename: targetFilename,
      loadedModel: targetFilename,
      activeModelPath: fullPath,
      format: path.extname(targetFilename).toUpperCase().replace('.', '') || (category === 'stt' ? 'BIN' : 'GGUF'),
      quantization: targetFilename.match(/(Q[0-9]_[A-Z0-9_]+|f16|f32|int8|int4)/i)?.[1]?.toUpperCase() || 'Q4_K_M',
      parameters: targetFilename.match(/([0-9]+(\.[0-9]+)?[bB])/)?.[1]?.toUpperCase() || (category === 'stt' ? '74M' : '7B'),
      architecture: this.getArchitectureName(category),
      sizeBytes: fileSize,
      sizeFormatted,
      ramUsageBytes: bytesReadTotal,
      ramUsageFormatted: sizeFormatted,
      memoryUsageMb: sizeMb,
      rssMb,
      loadedAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      statusMessage: `Модель ${targetFilename} загружена в ОЗУ контейнера ${runtime.containerName} (${sizeFormatted})`,
      source: 'RAM_LOCAL_FILE',
      containerName: runtime.containerName
    };

    if (category === 'basemodel') {
      modulesRegistry.setModelLoaded(true);
    }

    return this.getState(category);
  }
}

export const localModelRuntime = new LocalModelRuntime();
