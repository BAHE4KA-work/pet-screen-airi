export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  default?: unknown;
}

export interface ToolDefinition {
  id: string; // e.g. "system.get_metrics"
  name: string; // e.g. "get_metrics"
  module: string; // e.g. "system"
  version: string; // e.g. "1.2.0"
  description: string;
  filePath: string; // e.g. "modules/system/metrics.js"
  parameters: ToolParameter[];
  code: string;
  hash: string; // SHA-256 of tool specification + code
  enabled: boolean;
}

export interface ModuleManifestCreds {
  author: string;
  email?: string;
  license?: string;
  homepage?: string;
}

export interface ModuleToolMeta {
  name: string;
  file: string;
  description: string;
}

export interface ModuleManifest {
  name: string;
  title: string;
  description: string;
  version: string;
  creds: ModuleManifestCreds;
  icon?: string;
  tools: (string | ModuleToolMeta)[];
}

export interface ModuleGroup {
  id: string;
  name: string;
  title?: string;
  description: string;
  folder: string;
  version?: string;
  creds?: ModuleManifestCreds;
  icon?: string;
  manifest?: ModuleManifest;
  configIniRaw?: string;
  configIni?: Record<string, Record<string, string>>;
  tools: ToolDefinition[];
}

export type ViewType = 'time' | 'metrics' | 'list' | 'key_value' | 'text' | 'custom';

export interface TimeViewData {
  time: string;
  date: string;
  dayOfWeek: string;
  timezone: string;
  format?: '24h' | '12h';
  showSeconds?: boolean;
  timestamp?: number;
  city?: string;
}

export interface MetricsViewData {
  cpuPercent: number;
  cpuModel?: string;
  cpuCores?: number;
  memUsedMb: number;
  memTotalMb: number;
  memPercent?: string | number;
  uptime?: string;
  loadAverage?: string[];
  platform?: string;
}

export interface ListViewItem {
  id?: string | number;
  title: string;
  subtitle?: string;
  badge?: string;
  value?: string;
  icon?: string;
}

export interface ListViewData {
  title?: string;
  items: ListViewItem[];
  emptyText?: string;
}

export interface KeyValueItem {
  label: string;
  value: string | number | boolean;
  highlight?: boolean;
}

export interface KeyValueViewData {
  title?: string;
  entries: KeyValueItem[];
}

export interface TextViewData {
  title?: string;
  content: string;
  contentType?: 'text' | 'markdown' | 'code';
}

export interface ViewSpec {
  id: string;
  type: ViewType;
  title: string;
  pinned: boolean;
  position: { x: number; y: number };
  width?: number;
  data: TimeViewData | MetricsViewData | ListViewData | KeyValueViewData | TextViewData | any;
  createdAt?: string;
}

export interface TrainedToolSignature {
  name: string;
  module: string;
  version: string;
  hash: string;
}

export interface ModelTrainingManifest {
  modelName: string;
  version: string;
  trainedAt: string;
  trainedChecksum: string; // Critical sum hash of all trained tools
  expectedToolsCount: number;
  trainedTools: TrainedToolSignature[];
}

export interface ChecksumConflict {
  hasConflict: boolean;
  expectedChecksum: string;
  actualChecksum: string;
  mismatchedCount: number;
  missingTools: string[]; // in trained manifest, missing in current code
  alteredTools: {
    name: string;
    expectedVersion: string;
    actualVersion: string;
    expectedHash: string;
    actualHash: string;
  }[];
  newUntrainedTools: string[]; // in current code, not in trained manifest
}

export interface ModelStatus {
  loaded: boolean;
  modelName: string;
  endpoint: string;
  endpointType: 'local_ollama' | 'local_vllm' | 'custom_endpoint' | 'builtin_simulator';
  isOnline: boolean;
  conflict: ChecksumConflict;
  ignoreConflict: boolean;
  activeToolsCount: number;
  totalToolsCount: number;
  lastVerifiedAt: string;
}

export type AccuracyRating = 'EXACT' | 'HALLUCINATED_ARGS' | 'WRONG_TOOL' | 'FAILED' | 'CORRECTED' | 'UNRATED';

export interface ExecutionLog {
  id: string;
  timestamp: string;
  prompt: string;
  modelName: string;
  toolCalled?: string;
  toolArguments?: Record<string, unknown>;
  toolResult?: unknown;
  status: 'SUCCESS' | 'ERROR' | 'BLOCKED_CONFLICT' | 'NO_TOOL_MATCH';
  errorMessage?: string;
  durationMs: number;
  accuracyRating: AccuracyRating;
  userFeedbackNote?: string;
  criticalSumMatched: boolean;
}

export interface StorageFileInfo {
  name: string;
  relativePath: string;
  sizeBytes: number;
  sizeFormatted: string;
  updatedAt: string;
  isDirectory: boolean;
}

export interface StorageInfo {
  storagePath: string;
  isAbsolute: boolean;
  exists: boolean;
  totalFiles: number;
  totalSizeBytes: number;
  totalSizeFormatted: string;
  files: StorageFileInfo[];
}

export interface STTConfig {
  endpoint: string;
  model: string;
  language: string;
  enabled: boolean;
  useWebSpeechFallback: boolean;
}

export interface ModelCluster {
  id: string;
  name: string;
  endpoint: string;
  endpointType: 'local_ollama' | 'local_vllm' | 'custom_endpoint' | 'builtin_simulator';
  description: string;
  moduleIds: string[];
  keywords: string[];
  isDefault: boolean;
  active: boolean;
}

export interface AppSettings {
  localEndpoint: string;
  endpointType: 'local_ollama' | 'local_vllm' | 'custom_endpoint' | 'builtin_simulator';
  overlayOpacity: number; // 0.1 to 1.0
  compactMode: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  showSimulatedDesktop: boolean;
  storagePath: string;
  sttConfig: STTConfig;
}

export type ModelCategoryKey = 'basemodel' | 'stt' | 'tts' | 'embedding' | string;

export interface LocalModelFile {
  id: string;
  filename: string;
  category: ModelCategoryKey;
  relativePath: string;
  format: 'GGUF' | 'ONNX' | 'SafeTensors' | 'PyTorch' | 'Bin' | 'Descriptor' | 'Other';
  sizeBytes: number;
  sizeFormatted: string;
  quantization?: string;
  parameters?: string;
  architecture?: string;
  description?: string;
  isActive: boolean;
  updatedAt: string;
}

export interface LocalModelCategoryInfo {
  name: string;
  key: ModelCategoryKey;
  description: string;
  recommendedFormats: string[];
  count: number;
  activeModelId?: string;
  files: LocalModelFile[];
}

export interface LocalModelsOverview {
  baseDir: string;
  exists: boolean;
  totalFiles: number;
  totalSizeBytes: number;
  totalSizeFormatted: string;
  categories: Record<string, LocalModelCategoryInfo>;
  activeSelections: Record<string, string>;
}

