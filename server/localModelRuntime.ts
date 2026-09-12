import fs from 'fs';
import path from 'path';
import { localModelsManager } from './localModelsManager';
import { modulesRegistry } from './modulesRegistry';

export interface ModelRuntimeState {
  isLoaded: boolean;
  loaded: boolean;
  activeCategory: string;
  loadedCategory: string;
  activeFilename: string | null;
  loadedModel: string | null;
  activeModelPath: string | null;
  format: string | null;
  quantization: string | null;
  parameters: string | null;
  architecture: string | null;
  sizeBytes: number;
  sizeFormatted: string;
  ramUsageBytes: number;
  ramUsageFormatted: string;
  memoryUsageMb: number;
  rssMb: number;
  loadedAt: string | null;
  lastUsedAt: string | null;
  statusMessage: string;
  source: 'RAM_LOCAL_FILE' | 'ENDPOINT' | 'UNLOADED';
}

class LocalModelRuntime {
  // Retain actual binary buffers in memory to allocate physical RAM in Node.js and Docker
  private modelBuffers: Buffer[] = [];
  
  private state: ModelRuntimeState = {
    isLoaded: false,
    loaded: false,
    activeCategory: 'basemodel',
    loadedCategory: 'basemodel',
    activeFilename: null,
    loadedModel: null,
    activeModelPath: null,
    format: null,
    quantization: null,
    parameters: null,
    architecture: null,
    sizeBytes: 0,
    sizeFormatted: '0 B',
    ramUsageBytes: 0,
    ramUsageFormatted: '0 B',
    memoryUsageMb: 0,
    rssMb: 0,
    loadedAt: null,
    lastUsedAt: null,
    statusMessage: 'Модель не загружена в ОЗУ',
    source: 'UNLOADED'
  };

  constructor() {
    this.refreshStatus();
  }

  public getState(): ModelRuntimeState {
    this.refreshStatus();
    return { ...this.state };
  }

  private refreshStatus(): void {
    const mem = process.memoryUsage();
    this.state.rssMb = Math.round(mem.rss / (1024 * 1024));

    const activeFilename = localModelsManager.getActiveModel(this.state.activeCategory || 'basemodel') || null;
    const baseDir = localModelsManager.getBaseDir();
    
    if (activeFilename && !this.state.isLoaded) {
      const fullPath = path.join(baseDir, this.state.activeCategory || 'basemodel', activeFilename);
      const exists = fs.existsSync(fullPath);
      
      this.state.activeFilename = activeFilename;
      this.state.loadedModel = activeFilename;
      this.state.activeModelPath = exists ? fullPath : null;
      
      if (exists) {
        try {
          const stat = fs.statSync(fullPath);
          this.state.sizeBytes = stat.size;
          this.state.sizeFormatted = this.formatBytes(stat.size);
          
          const ext = path.extname(activeFilename).toLowerCase();
          this.state.format = ext === '.gguf' ? 'GGUF' : ext === '.onnx' ? 'ONNX' : ext === '.safetensors' ? 'SafeTensors' : ext === '.bin' ? 'Bin' : 'PyTorch';
          
          const matchQ = activeFilename.match(/(Q[0-9]_[A-Z0-9_]+|f16|f32|int8|int4)/i);
          this.state.quantization = matchQ ? matchQ[1].toUpperCase() : 'FP16';
          
          const matchP = activeFilename.match(/([0-9]+(\.[0-9]+)?[bB])/);
          this.state.parameters = matchP ? matchP[1].toUpperCase() : '7B';
          this.state.architecture = 'FunctionGemma (GGUF)';
        } catch {
          // ignore
        }
      }
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  public async loadModel(category: string = 'basemodel', filename?: string): Promise<ModelRuntimeState> {
    const targetFilename = filename || localModelsManager.getActiveModel(category);
    if (!targetFilename) {
      throw new Error(`Не указано имя модели для категории "${category}". Поместите файл модели в models/${category}/`);
    }

    const baseDir = localModelsManager.getBaseDir();
    const fullPath = path.join(baseDir, category, targetFilename);

    if (!fs.existsSync(fullPath)) {
      this.unloadModel();
      this.state.statusMessage = `Файл модели "${targetFilename}" не найден в ${fullPath}`;
      throw new Error(`Файл модели "${targetFilename}" отсутствует в папке models/${category}/`);
    }

    // Release old buffers
    this.modelBuffers = [];
    if (typeof (global as any).gc === 'function') {
      try { (global as any).gc(); } catch {}
    }

    const stat = fs.statSync(fullPath);
    const fileSize = stat.size;

    console.log(`[LocalModelRuntime] Reading ${targetFilename} (${this.formatBytes(fileSize)}) into physical RAM...`);

    // Actually load file data into Node.js Buffer memory (allocated in 64MB chunks)
    const CHUNK_SIZE = 64 * 1024 * 1024;
    const fd = fs.openSync(fullPath, 'r');
    let bytesReadTotal = 0;

    try {
      while (bytesReadTotal < fileSize) {
        const bytesToRead = Math.min(CHUNK_SIZE, fileSize - bytesReadTotal);
        const buf = Buffer.allocUnsafe(bytesToRead);
        fs.readSync(fd, buf, 0, bytesToRead, bytesReadTotal);
        this.modelBuffers.push(buf);
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

    this.state = {
      isLoaded: true,
      loaded: true,
      activeCategory: category,
      loadedCategory: category,
      activeFilename: targetFilename,
      loadedModel: targetFilename,
      activeModelPath: fullPath,
      format: path.extname(targetFilename).toUpperCase().replace('.', '') || 'GGUF',
      quantization: targetFilename.match(/(Q[0-9]_[A-Z0-9_]+|f16|f32|int8|int4)/i)?.[1]?.toUpperCase() || 'Q4_K_M',
      parameters: targetFilename.match(/([0-9]+(\.[0-9]+)?[bB])/)?.[1]?.toUpperCase() || '7B',
      architecture: 'FunctionGemma (GGUF)',
      sizeBytes: fileSize,
      sizeFormatted,
      ramUsageBytes: bytesReadTotal,
      ramUsageFormatted: sizeFormatted,
      memoryUsageMb: sizeMb,
      rssMb,
      loadedAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      statusMessage: `Модель ${targetFilename} (${sizeFormatted}) успешно загружена в ОЗУ. Процесс выделения: ${rssMb} МБ RSS.`,
      source: 'RAM_LOCAL_FILE'
    };

    modulesRegistry.setModelLoaded(true);
    console.log(`[LocalModelRuntime] Successfully loaded into RAM: ${targetFilename}, total allocated: ${sizeFormatted}, process RSS: ${rssMb} MB`);
    return this.getState();
  }

  public unloadModel(): ModelRuntimeState {
    this.modelBuffers = [];
    if (typeof (global as any).gc === 'function') {
      try { (global as any).gc(); } catch {}
    }

    const mem = process.memoryUsage();
    const rssMb = Math.round(mem.rss / (1024 * 1024));

    this.state.isLoaded = false;
    this.state.loaded = false;
    this.state.loadedModel = null;
    this.state.ramUsageBytes = 0;
    this.state.ramUsageFormatted = '0 B';
    this.state.memoryUsageMb = 0;
    this.state.rssMb = rssMb;
    this.state.loadedAt = null;
    this.state.source = 'UNLOADED';
    this.state.statusMessage = 'Модель выгружена из ОЗУ. Память освобождена.';
    modulesRegistry.setModelLoaded(false);
    console.log(`[LocalModelRuntime] Model unloaded from RAM. Process RSS: ${rssMb} MB`);
    return this.getState();
  }

  public ensureModelLoaded(category: string = 'basemodel'): ModelRuntimeState {
    const activeFilename = localModelsManager.getActiveModel(category);
    
    // If not loaded or different model is selected, attempt to load
    if (!this.state.isLoaded || this.state.activeFilename !== activeFilename) {
      if (!activeFilename) {
        throw new Error(`В категории "${category}" не выбрана модель. Поместите файл модели в папку models/${category}/`);
      }
      return this.loadModelSync(category, activeFilename);
    }

    this.state.lastUsedAt = new Date().toISOString();
    return this.getState();
  }

  private loadModelSync(category: string, targetFilename: string): ModelRuntimeState {
    const baseDir = localModelsManager.getBaseDir();
    const fullPath = path.join(baseDir, category, targetFilename);

    if (!fs.existsSync(fullPath)) {
      this.unloadModel();
      this.state.statusMessage = `Файл модели "${targetFilename}" не найден на диске в ${fullPath}`;
      throw new Error(`Файл модели "${targetFilename}" не найден в папке models/${category}/`);
    }

    this.modelBuffers = [];
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
        this.modelBuffers.push(buf);
        bytesReadTotal += bytesToRead;
      }
    } finally {
      fs.closeSync(fd);
    }

    const mem = process.memoryUsage();
    const rssMb = Math.round(mem.rss / (1024 * 1024));
    const sizeMb = Math.round(fileSize / (1024 * 1024));
    const sizeFormatted = this.formatBytes(fileSize);

    this.state = {
      isLoaded: true,
      loaded: true,
      activeCategory: category,
      loadedCategory: category,
      activeFilename: targetFilename,
      loadedModel: targetFilename,
      activeModelPath: fullPath,
      format: path.extname(targetFilename).toUpperCase().replace('.', '') || 'GGUF',
      quantization: targetFilename.match(/(Q[0-9]_[A-Z0-9_]+|f16|f32|int8|int4)/i)?.[1]?.toUpperCase() || 'Q4_K_M',
      parameters: targetFilename.match(/([0-9]+(\.[0-9]+)?[bB])/)?.[1]?.toUpperCase() || '7B',
      architecture: 'FunctionGemma (GGUF)',
      sizeBytes: fileSize,
      sizeFormatted,
      ramUsageBytes: bytesReadTotal,
      ramUsageFormatted: sizeFormatted,
      memoryUsageMb: sizeMb,
      rssMb,
      loadedAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      statusMessage: `Модель ${targetFilename} загружена в ОЗУ (${sizeFormatted})`,
      source: 'RAM_LOCAL_FILE'
    };

    modulesRegistry.setModelLoaded(true);
    return this.getState();
  }
}

export const localModelRuntime = new LocalModelRuntime();
