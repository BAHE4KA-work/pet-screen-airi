import crypto from 'crypto';
import os from 'os';
import fs from 'fs';
import path from 'path';
import {
  ToolDefinition,
  ModelTrainingManifest,
  ChecksumConflict,
  ModelStatus,
  ModuleManifest,
  ModuleGroup,
  ViewSpec,
  TimeViewData,
  MetricsViewData,
  ListViewData,
  KeyValueViewData,
  TextViewData
} from '../src/types';
import { INITIAL_TOOLS } from './initialModules';
import { storageService } from './storageService';
import { parseIni, stringifyIni } from './iniHelper';

class ModulesRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private moduleConfigs: Map<string, Record<string, Record<string, string>>> = new Map();
  private moduleRawInis: Map<string, string> = new Map();
  private moduleManifests: Map<string, ModuleManifest> = new Map();

  private sharedState: Record<string, unknown> = {
    clipboard: 'https://github.com/google/gemma-models',
    customNotes: []
  };

  // The model's training manifest: defines what tools & versions the model was trained on
  private trainingManifest: ModelTrainingManifest;
  private modelLoaded: boolean = true;
  private ignoreConflict: boolean = false;
  private localEndpoint: string = 'http://localhost:11434';
  private endpointType: 'local_ollama' | 'local_vllm' | 'custom_endpoint' | 'builtin_simulator' = 'builtin_simulator';

  constructor() {
    this.initTools();
    this.loadModulesFromDisk();
    this.trainingManifest = this.generateBaselineManifest();
  }

  private hashString(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  private calculateToolHash(tool: Omit<ToolDefinition, 'hash'>): string {
    const raw = `${tool.name}:${tool.version}:${tool.filePath}:${JSON.stringify(tool.parameters)}:${tool.code.trim()}`;
    return this.hashString(raw).substring(0, 16);
  }

  public calculateCriticalChecksum(toolsList: ToolDefinition[]): string {
    // Sort tools deterministically by name and version
    const sorted = [...toolsList].sort((a, b) => a.id.localeCompare(b.id));
    const payload = sorted.map(t => `${t.id}@${t.version}:${t.hash}`).join('|');
    return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
  }

  private initTools() {
    this.tools.clear();
    for (const raw of INITIAL_TOOLS) {
      const hash = this.calculateToolHash(raw);
      this.tools.set(raw.id, {
        ...raw,
        hash
      });
    }
  }

  public loadModulesFromDisk() {
    const modulesDir = path.resolve(process.cwd(), 'modules');
    if (!fs.existsSync(modulesDir)) {
      try {
        fs.mkdirSync(modulesDir, { recursive: true });
      } catch (err) {
        console.error('Failed to create modules directory:', err);
      }
      return;
    }

    const entries = fs.readdirSync(modulesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const modName = entry.name;
      const modFolder = path.join(modulesDir, modName);

      // Load module.json
      const manifestPath = path.join(modFolder, 'module.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const raw = fs.readFileSync(manifestPath, 'utf8');
          const parsed = JSON.parse(raw) as ModuleManifest;
          this.moduleManifests.set(modName, parsed);
        } catch (e) {
          console.error(`Error reading ${manifestPath}:`, e);
        }
      }

      // Load config.ini
      const configPath = path.join(modFolder, 'config.ini');
      if (fs.existsSync(configPath)) {
        try {
          const raw = fs.readFileSync(configPath, 'utf8');
          this.moduleRawInis.set(modName, raw);
          this.moduleConfigs.set(modName, parseIni(raw));
        } catch (e) {
          console.error(`Error reading ${configPath}:`, e);
        }
      }
    }
  }

  public getModuleConfig(moduleName: string): Record<string, Record<string, string>> {
    if (this.moduleConfigs.has(moduleName)) {
      return this.moduleConfigs.get(moduleName)!;
    }

    // Try reading disk on demand
    const configPath = path.resolve(process.cwd(), 'modules', moduleName, 'config.ini');
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, 'utf8');
        const parsed = parseIni(raw);
        this.moduleRawInis.set(moduleName, raw);
        this.moduleConfigs.set(moduleName, parsed);
        return parsed;
      } catch (e) {
        console.error(e);
      }
    }

    return {};
  }

  public getModuleRawIni(moduleName: string): string {
    return this.moduleRawInis.get(moduleName) || '';
  }

  public saveModuleConfig(moduleName: string, rawIni: string): boolean {
    try {
      const parsed = parseIni(rawIni);
      this.moduleRawInis.set(moduleName, rawIni);
      this.moduleConfigs.set(moduleName, parsed);

      const modFolder = path.resolve(process.cwd(), 'modules', moduleName);
      if (!fs.existsSync(modFolder)) {
        fs.mkdirSync(modFolder, { recursive: true });
      }
      fs.writeFileSync(path.join(modFolder, 'config.ini'), rawIni, 'utf8');
      return true;
    } catch (e) {
      console.error('Error saving module config.ini:', e);
      return false;
    }
  }

  public saveModuleManifest(moduleName: string, manifest: ModuleManifest): boolean {
    try {
      this.moduleManifests.set(moduleName, manifest);
      const modFolder = path.resolve(process.cwd(), 'modules', moduleName);
      if (!fs.existsSync(modFolder)) {
        fs.mkdirSync(modFolder, { recursive: true });
      }
      fs.writeFileSync(
        path.join(modFolder, 'module.json'),
        JSON.stringify(manifest, null, 2),
        'utf8'
      );
      return true;
    } catch (e) {
      console.error('Error saving module.json:', e);
      return false;
    }
  }

  // Generates the initial training baseline (representing what the model weights were tuned on)
  private generateBaselineManifest(): ModelTrainingManifest {
    const activeTools = Array.from(this.tools.values()).filter(t => t.enabled);
    const trainedChecksum = this.calculateCriticalChecksum(activeTools);

    return {
      modelName: 'FunctionGemma-7b-Tools-v2.1',
      version: '2.1.0',
      trainedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      trainedChecksum,
      expectedToolsCount: activeTools.length,
      trainedTools: activeTools.map(t => ({
        name: t.name,
        module: t.module,
        version: t.version,
        hash: t.hash
      }))
    };
  }

  public resetToDefaults(): { total: number; actualChecksum: string } {
    this.initTools();
    this.loadModulesFromDisk();
    this.trainingManifest = this.generateBaselineManifest();
    this.ignoreConflict = false;
    this.modelLoaded = true;
    return {
      total: this.tools.size,
      actualChecksum: this.getCurrentChecksum()
    };
  }

  public getTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  public getTool(idOrName: string): ToolDefinition | undefined {
    if (this.tools.has(idOrName)) {
      return this.tools.get(idOrName);
    }
    for (const tool of this.tools.values()) {
      if (tool.name === idOrName) return tool;
    }
    return undefined;
  }

  public saveTool(toolData: Omit<ToolDefinition, 'hash'>): ToolDefinition {
    const hash = this.calculateToolHash(toolData);
    const updated: ToolDefinition = {
      ...toolData,
      hash
    };
    this.tools.set(updated.id, updated);
    return updated;
  }

  public deleteTool(id: string): boolean {
    return this.tools.delete(id);
  }

  public toggleTool(id: string, enabled?: boolean): ToolDefinition | undefined {
    const tool = this.getTool(id);
    if (!tool) return undefined;
    const nextEnabled = enabled !== undefined ? enabled : !tool.enabled;
    const updated: ToolDefinition = {
      ...tool,
      enabled: nextEnabled
    };
    this.tools.set(tool.id, updated);
    return updated;
  }

  public toggleModule(moduleName: string, enabled: boolean): ToolDefinition[] {
    const updatedTools: ToolDefinition[] = [];
    for (const [id, tool] of this.tools.entries()) {
      if (tool.module === moduleName) {
        const updated = { ...tool, enabled };
        this.tools.set(id, updated);
        updatedTools.push(updated);
      }
    }
    return updatedTools;
  }

  public reloadAll(): { total: number; actualChecksum: string } {
    this.loadModulesFromDisk();
    for (const [id, tool] of this.tools.entries()) {
      const hash = this.calculateToolHash(tool);
      this.tools.set(id, { ...tool, hash });
    }
    const actualChecksum = this.getCurrentChecksum();
    return { total: this.tools.size, actualChecksum };
  }

  public getCurrentChecksum(): string {
    const active = Array.from(this.tools.values()).filter(t => t.enabled);
    return this.calculateCriticalChecksum(active);
  }

  public checkConflict(): ChecksumConflict {
    const currentTools = Array.from(this.tools.values()).filter(t => t.enabled);
    const actualChecksum = this.calculateCriticalChecksum(currentTools);
    const expectedChecksum = this.trainingManifest.trainedChecksum;

    const trainedMap = new Map(this.trainingManifest.trainedTools.map(t => [t.name, t]));
    const currentMap = new Map(currentTools.map(t => [t.name, t]));

    const missingTools: string[] = [];
    const alteredTools: ChecksumConflict['alteredTools'] = [];
    const newUntrainedTools: string[] = [];

    // Find missing in current or altered
    for (const [name, trained] of trainedMap.entries()) {
      const current = currentMap.get(name);
      if (!current) {
        missingTools.push(`${trained.module}.${name} (v${trained.version})`);
      } else if (current.version !== trained.version || current.hash !== trained.hash) {
        alteredTools.push({
          name: `${trained.module}.${name}`,
          expectedVersion: trained.version,
          actualVersion: current.version,
          expectedHash: trained.hash,
          actualHash: current.hash
        });
      }
    }

    // Find new untrained in current
    for (const [name, current] of currentMap.entries()) {
      if (!trainedMap.has(name)) {
        newUntrainedTools.push(`${current.module}.${name} (v${current.version})`);
      }
    }

    const hasConflict =
      actualChecksum !== expectedChecksum ||
      missingTools.length > 0 ||
      alteredTools.length > 0 ||
      newUntrainedTools.length > 0;

    return {
      hasConflict,
      expectedChecksum,
      actualChecksum,
      mismatchedCount: missingTools.length + alteredTools.length + newUntrainedTools.length,
      missingTools,
      alteredTools,
      newUntrainedTools
    };
  }

  public getModelStatus(): ModelStatus {
    const conflict = this.checkConflict();
    const active = Array.from(this.tools.values()).filter(t => t.enabled);

    return {
      loaded: this.modelLoaded,
      modelName: this.trainingManifest.modelName,
      endpoint: this.localEndpoint,
      endpointType: this.endpointType,
      isOnline: this.modelLoaded,
      conflict,
      ignoreConflict: this.ignoreConflict,
      activeToolsCount: active.length,
      totalToolsCount: this.tools.size,
      lastVerifiedAt: new Date().toISOString()
    };
  }

  public setModelLoaded(loaded: boolean) {
    this.modelLoaded = loaded;
  }

  public setIgnoreConflict(ignore: boolean) {
    this.ignoreConflict = ignore;
  }

  public syncTrainingManifestToCurrent(): ModelTrainingManifest {
    this.trainingManifest = this.generateBaselineManifest();
    this.ignoreConflict = false;
    return this.trainingManifest;
  }

  public getTrainingManifest(): ModelTrainingManifest {
    return this.trainingManifest;
  }

  public setLocalEndpoint(
    url: string,
    type: 'local_ollama' | 'local_vllm' | 'custom_endpoint' | 'builtin_simulator'
  ) {
    this.localEndpoint = url;
    this.endpointType = type;
  }

  public getModuleGroups(): ModuleGroup[] {
    const tools = this.getTools();
    const map = new Map<string, ToolDefinition[]>();
    for (const t of tools) {
      const list = map.get(t.module) || [];
      list.push(t);
      map.set(t.module, list);
    }

    return Array.from(map.entries()).map(([moduleName, moduleTools]) => {
      const manifest = this.moduleManifests.get(moduleName);
      const configIni = this.getModuleConfig(moduleName);
      const configIniRaw = this.getModuleRawIni(moduleName);

      return {
        id: moduleName,
        name: moduleName,
        title: manifest?.title || moduleName.toUpperCase(),
        description: manifest?.description || `Модуль инструментов ${moduleName}`,
        folder: `modules/${moduleName}`,
        version: manifest?.version || '1.0.0',
        creds: manifest?.creds,
        icon: manifest?.icon,
        manifest,
        configIni,
        configIniRaw,
        tools: moduleTools
      };
    });
  }

  public async executeTool(
    toolName: string,
    params: Record<string, unknown> = {}
  ): Promise<{ result: unknown; durationMs: number; view?: ViewSpec; views?: ViewSpec[] }> {
    const tool = this.getTool(toolName);
    if (!tool) {
      throw new Error(`Инструмент "${toolName}" не найден в зарегистрированных модулях.`);
    }

    if (!tool.enabled) {
      throw new Error(`Инструмент "${toolName}" отключен в конфигурации модулей.`);
    }

    // Check conflict protection
    const conflict = this.checkConflict();
    if (conflict.hasConflict && !this.ignoreConflict) {
      throw new Error(
        `[BLOCKED_BY_CHECKSUM] Критическая сумма модулей не совпадает с сигнатурой обучения модели. Требуется подтверждение игнорирования или выгрузка модели.`
      );
    }

    const start = Date.now();
    try {
      const moduleConfig = this.getModuleConfig(tool.module);

      // Views factory methods conforming to Airi's Views system
      const viewsFactory = {
        createTimeView: (data: TimeViewData, options: { title?: string; pinned?: boolean } = {}): ViewSpec => ({
          id: `view-time-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'time',
          title: options.title || 'Системное время',
          pinned: options.pinned ?? false,
          position: { x: Math.max(30, windowPosOffset(1)), y: 140 },
          data,
          createdAt: new Date().toISOString()
        }),
        createMetricsView: (data: MetricsViewData, options: { title?: string; pinned?: boolean } = {}): ViewSpec => ({
          id: `view-metrics-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'metrics',
          title: options.title || 'Метрики системы',
          pinned: options.pinned ?? false,
          position: { x: Math.max(30, windowPosOffset(2)), y: 140 },
          data,
          createdAt: new Date().toISOString()
        }),
        createListView: (data: ListViewData, options: { title?: string; pinned?: boolean } = {}): ViewSpec => ({
          id: `view-list-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'list',
          title: options.title || data.title || 'Список элементов',
          pinned: options.pinned ?? false,
          position: { x: Math.max(30, windowPosOffset(3)), y: 140 },
          data,
          createdAt: new Date().toISOString()
        }),
        createKeyValueView: (data: KeyValueViewData, options: { title?: string; pinned?: boolean } = {}): ViewSpec => ({
          id: `view-kv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'key_value',
          title: options.title || data.title || 'Сводка',
          pinned: options.pinned ?? false,
          position: { x: Math.max(30, windowPosOffset(4)), y: 140 },
          data,
          createdAt: new Date().toISOString()
        }),
        createTextView: (data: TextViewData, options: { title?: string; pinned?: boolean } = {}): ViewSpec => ({
          id: `view-text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'text',
          title: options.title || data.title || 'Текстовый блок',
          pinned: options.pinned ?? false,
          position: { x: Math.max(30, windowPosOffset(5)), y: 140 },
          data,
          createdAt: new Date().toISOString()
        })
      };

      // Build clean execution context
      const context = {
        config: moduleConfig,
        views: viewsFactory,
        os: {
          platform: () => os.platform(),
          release: () => os.release(),
          totalmem: () => os.totalmem(),
          freemem: () => os.freemem(),
          cpus: () => os.cpus(),
          loadavg: () => os.loadavg(),
          uptime: () => os.uptime()
        },
        storage: {
          getPath: () => storageService.getPath(),
          getInfo: () => storageService.getStorageInfo(),
          readFile: (p: string) => storageService.readFile(p),
          writeFile: (p: string, data: string) => storageService.writeFile(p, data),
          appendFile: (p: string, data: string) => storageService.appendFile(p, data),
          deleteFile: (p: string) => storageService.deleteFile(p)
        },
        state: this.sharedState,
        env: {
          NODE_ENV: process.env.NODE_ENV || 'development'
        }
      };

      // Extract function body from code
      let cleanedCode = tool.code;
      if (cleanedCode.includes('export async function execute')) {
        cleanedCode = cleanedCode.replace(/export\s+async\s+function\s+execute\s*\([^)]*\)\s*\{/, '');
        cleanedCode = cleanedCode.replace(/\}\s*$/, '');
      } else if (cleanedCode.includes('async function execute')) {
        cleanedCode = cleanedCode.replace(/async\s+function\s+execute\s*\([^)]*\)\s*\{/, '');
        cleanedCode = cleanedCode.replace(/\}\s*$/, '');
      }

      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const fn = new AsyncFunction('params', 'context', cleanedCode);
      const result = await fn(params, context);
      const durationMs = Date.now() - start;

      // Detect if result provides a View or Views
      let view: ViewSpec | undefined = undefined;
      let views: ViewSpec[] | undefined = undefined;

      if (result && typeof result === 'object') {
        if ('view' in result && result.view) {
          view = result.view as ViewSpec;
        }
        if ('views' in result && Array.isArray(result.views)) {
          views = result.views as ViewSpec[];
        }
      }

      // If tool did not provide a view, create an automatic structured view window
      if (!view && (!views || views.length === 0)) {
        if (typeof result === 'object' && result !== null) {
          const entries = Object.entries(result as Record<string, unknown>).map(([k, v]) => ({
            label: k,
            value: typeof v === 'object' ? JSON.stringify(v) : String(v)
          }));
          view = viewsFactory.createKeyValueView({
            title: `Результат: ${tool.name}`,
            entries
          }, {
            title: tool.description || `Инструмент ${tool.name}`
          });
        } else {
          view = viewsFactory.createTextView({
            title: `Результат: ${tool.name}`,
            content: String(result),
            contentType: 'text'
          }, {
            title: tool.description || `Инструмент ${tool.name}`
          });
        }
      }

      return { result, durationMs, view, views };
    } catch (err: unknown) {
      const durationMs = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Ошибка выполнения инструмента ${tool.name}: ${msg} (${durationMs}ms)`);
    }
  }
}

function windowPosOffset(seed: number): number {
  return 80 + (seed * 40) % 200;
}

export const modulesRegistry = new ModulesRegistry();
