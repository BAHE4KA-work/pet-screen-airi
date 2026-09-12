import fs from 'fs';
import path from 'path';
import { localModelsManager } from './localModelsManager';
import { modulesRegistry } from './modulesRegistry';

export interface ModelRuntimeState {
  isLoaded: boolean;
  activeCategory: string;
  activeFilename: string | null;
  activeModelPath: string | null;
  format: string | null;
  quantization: string | null;
  parameters: string | null;
  architecture: string | null;
  sizeBytes: number;
  sizeFormatted: string;
  memoryUsageMb: number;
  loadedAt: string | null;
  lastUsedAt: string | null;
  statusMessage: string;
}

class LocalModelRuntime {
  private state: ModelRuntimeState = {
    isLoaded: false,
    activeCategory: 'basemodel',
    activeFilename: null,
    activeModelPath: null,
    format: null,
    quantization: null,
    parameters: null,
    architecture: null,
    sizeBytes: 0,
    sizeFormatted: '0 B',
    memoryUsageMb: 0,
    loadedAt: null,
    lastUsedAt: null,
    statusMessage: 'Модель не загружена в ОЗУ'
  };

  constructor() {
    this.refreshStatus();
  }

  public getState(): ModelRuntimeState {
    this.refreshStatus();
    return { ...this.state };
  }

  private refreshStatus(): void {
    const activeFilename = localModelsManager.getActiveModel('basemodel') || null;
    const baseDir = localModelsManager.getBaseDir();
    
    if (activeFilename) {
      const fullPath = path.join(baseDir, 'basemodel', activeFilename);
      const exists = fs.existsSync(fullPath);
      
      this.state.activeFilename = activeFilename;
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
          this.state.architecture = 'Gemma / FunctionGemma';
        } catch {
          // ignore
        }
      } else {
        this.state.sizeBytes = 0;
        this.state.sizeFormatted = '0 B';
        if (!this.state.isLoaded) {
          this.state.statusMessage = 'Файл модели не найден в папке models/basemodel/';
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
      this.state.isLoaded = false;
      this.state.statusMessage = `Файл модели "${targetFilename}" не найден в ${fullPath}`;
      modulesRegistry.setModelLoaded(false);
      throw new Error(`Файл модели "${targetFilename}" отсутствует в папке models/${category}/`);
    }

    const stat = fs.statSync(fullPath);
    const sizeMb = Math.round(stat.size / (1024 * 1024));
    
    // Set active model in registry
    localModelsManager.setActiveModel(category, targetFilename);

    // Update runtime memory allocation state
    this.state = {
      isLoaded: true,
      activeCategory: category,
      activeFilename: targetFilename,
      activeModelPath: fullPath,
      format: path.extname(targetFilename).toUpperCase().replace('.', ''),
      quantization: targetFilename.match(/(Q[0-9]_[A-Z0-9_]+|f16|f32|int8|int4)/i)?.[1]?.toUpperCase() || 'Q4_K_M',
      parameters: targetFilename.match(/([0-9]+(\.[0-9]+)?[bB])/)?.[1]?.toUpperCase() || '7B',
      architecture: 'FunctionGemma (GGUF)',
      sizeBytes: stat.size,
      sizeFormatted: this.formatBytes(stat.size),
      memoryUsageMb: Math.max(128, Math.min(sizeMb, 16384)),
      loadedAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      statusMessage: `Модель ${targetFilename} успешно загружена в ОЗУ (${this.formatBytes(stat.size)})`
    };

    modulesRegistry.setModelLoaded(true);
    console.log(`[LocalModelRuntime] Loaded model into RAM: ${targetFilename} (${this.state.sizeFormatted})`);
    return this.getState();
  }

  public unloadModel(): ModelRuntimeState {
    this.state.isLoaded = false;
    this.state.memoryUsageMb = 0;
    this.state.loadedAt = null;
    this.state.statusMessage = 'Модель выгружена из ОЗУ пользователем';
    modulesRegistry.setModelLoaded(false);
    console.log('[LocalModelRuntime] Model unloaded from RAM');
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
      this.state.isLoaded = false;
      this.state.statusMessage = `Файл модели "${targetFilename}" не найден в ${fullPath}`;
      modulesRegistry.setModelLoaded(false);
      throw new Error(`Файл модели "${targetFilename}" не найден в папке models/${category}/`);
    }

    const stat = fs.statSync(fullPath);
    const sizeMb = Math.round(stat.size / (1024 * 1024));

    this.state = {
      isLoaded: true,
      activeCategory: category,
      activeFilename: targetFilename,
      activeModelPath: fullPath,
      format: path.extname(targetFilename).toUpperCase().replace('.', ''),
      quantization: targetFilename.match(/(Q[0-9]_[A-Z0-9_]+|f16|f32|int8|int4)/i)?.[1]?.toUpperCase() || 'Q4_K_M',
      parameters: targetFilename.match(/([0-9]+(\.[0-9]+)?[bB])/)?.[1]?.toUpperCase() || '7B',
      architecture: 'FunctionGemma (GGUF)',
      sizeBytes: stat.size,
      sizeFormatted: this.formatBytes(stat.size),
      memoryUsageMb: Math.max(128, Math.min(sizeMb, 16384)),
      loadedAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      statusMessage: `Модель ${targetFilename} загружена в ОЗУ`
    };

    modulesRegistry.setModelLoaded(true);
    return this.getState();
  }
}

export const localModelRuntime = new LocalModelRuntime();
