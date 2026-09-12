import React, { useState } from 'react';
import {
  X,
  Wrench,
  ShieldCheck,
  History,
  Palette,
  Info,
  RotateCw,
  Power,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Download,
  Plus,
  Trash2,
  Save,
  FileCode,
  FileSpreadsheet,
  Layers,
  Sparkles,
  Command,
  HardDrive,
  Network,
  Mic,
  Box,
  Volume2
} from 'lucide-react';
import {
  ModelStatus,
  ModelTrainingManifest,
  ModuleGroup,
  ToolDefinition,
  ExecutionLog,
  AccuracyRating
} from '../types';
import { FineTuningExportModal } from './settings/FineTuningExportModal';
import { StorageSettingsTab } from './settings/StorageSettingsTab';
import { ModelRouterTab } from './settings/ModelRouterTab';
import { VoiceSTTTab } from './settings/VoiceSTTTab';
import { DockerDeployTab } from './settings/DockerDeployTab';
import { soundEffects } from '../utils/audioEffects';

interface SettingsModalProps {
  isOpen: boolean;
  initialTab?: string;
  onClose: () => void;
  status: ModelStatus | null;
  manifest: ModelTrainingManifest | null;
  modules: ModuleGroup[];
  tools: ToolDefinition[];
  currentChecksum: string;
  logs: ExecutionLog[];
  stats: {
    total: number;
    exact: number;
    hallucinated: number;
    wrongTool: number;
    failed: number;
    unrated: number;
    accuracyPercent: number;
  };
  onSaveTool: (tool: ToolDefinition) => Promise<void>;
  onDeleteTool: (id: string) => Promise<void>;
  onReloadModules: () => Promise<void>;
  onResetDefaults: () => Promise<void>;
  onIgnoreConflict: () => Promise<void>;
  onToggleModel: () => Promise<void>;
  onSyncManifest: () => Promise<void>;
  onRateAccuracy: (id: string, rating: AccuracyRating, note?: string) => Promise<void>;
  onExportLogs: (format: 'json' | 'jsonl') => void;
  desktopOpacity: number;
  setDesktopOpacity: (val: number) => void;
  showDesktop: boolean;
  setShowDesktop: (val: boolean) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  initialTab = 'tools',
  onClose,
  status,
  manifest,
  modules,
  tools,
  currentChecksum,
  logs,
  stats,
  onSaveTool,
  onDeleteTool,
  onReloadModules,
  onResetDefaults,
  onIgnoreConflict,
  onToggleModel,
  onSyncManifest,
  onRateAccuracy,
  onExportLogs,
  desktopOpacity,
  setDesktopOpacity,
  showDesktop,
  setShowDesktop
}) => {
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  // Tools editor state
  const [selectedToolId, setSelectedToolId] = useState<string>(tools[0]?.id || '');
  const [editingCode, setEditingCode] = useState<string>('');
  const [editingVersion, setEditingVersion] = useState<string>('');
  const [editingDesc, setEditingDesc] = useState<string>('');
  const [saveStatusMsg, setSaveStatusMsg] = useState<string | null>(null);

  // New tool modal state
  const [showNewToolModal, setShowNewToolModal] = useState(false);
  const [newToolName, setNewToolName] = useState('');
  const [newToolModule, setNewToolModule] = useState('system');
  const [newToolVersion, setNewToolVersion] = useState('1.0.0');
  const [newToolDesc, setNewToolDesc] = useState('');

  // Selected tool
  const currentTool = tools.find(t => t.id === selectedToolId) || tools[0];

  // Fine-tuning dataset modal state
  const [showDatasetModal, setShowDatasetModal] = useState(false);

  React.useEffect(() => {
    if (currentTool) {
      setEditingCode(currentTool.code);
      setEditingVersion(currentTool.version);
      setEditingDesc(currentTool.description);
    }
  }, [selectedToolId, tools]);

  if (!isOpen) return null;

  const conflict = status?.conflict;
  const hasConflict = Boolean(conflict?.hasConflict);
  const isIgnored = Boolean(status?.ignoreConflict);
  const isLoaded = Boolean(status?.loaded);

  const tabs = [
    { id: 'tools', label: 'Инструменты', icon: Wrench },
    { id: 'storage', label: 'Хранилище', icon: HardDrive },
    { id: 'routing', label: 'Маршрутизация', icon: Network },
    { id: 'voice', label: 'Голос (STT)', icon: Mic },
    { id: 'compatibility', label: 'Совместимость', icon: ShieldCheck, badge: hasConflict && !isIgnored },
    { id: 'history', label: 'История и аналитика', icon: History },
    { id: 'docker', label: 'Docker & Сеть', icon: Box },
    { id: 'appearance', label: 'Оформление & Звук', icon: Palette },
    { id: 'about', label: 'О приложении', icon: Info }
  ];

  const handleSaveToolChanges = async () => {
    if (!currentTool) return;
    try {
      await onSaveTool({
        ...currentTool,
        version: editingVersion,
        description: editingDesc,
        code: editingCode
      });
      setSaveStatusMsg('Сохранено');
      setTimeout(() => setSaveStatusMsg(null), 2500);
    } catch {
      setSaveStatusMsg('Ошибка сохранения');
    }
  };

  const handleCreateNewTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newToolName.trim()) return;
    const cleanName = newToolName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const id = `${newToolModule}.${cleanName}`;
    const initialCode = `// ${newToolDesc || cleanName}\nexport async function execute(params, context) {\n  return {\n    status: "ok",\n    executedAt: new Date().toISOString(),\n    message: "Инструмент ${cleanName} успешно вызван"\n  };\n}`;

    await onSaveTool({
      id,
      name: cleanName,
      module: newToolModule,
      version: newToolVersion,
      description: newToolDesc || 'Пользовательский инструмент',
      filePath: `modules/${newToolModule}/${cleanName}.js`,
      enabled: true,
      parameters: [],
      code: initialCode
    });

    setSelectedToolId(id);
    setShowNewToolModal(false);
    setNewToolName('');
    setNewToolDesc('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md animate-fade-in">
      {/* Settings Window Frame (Apple-inspired rounded-2xl with clean hierarchy) */}
      <div
        id="settings-modal-window"
        className="relative w-full max-w-4xl h-[640px] max-h-[90vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden text-sm"
        style={{
          backgroundColor: 'var(--c-bg-secondary)',
          borderColor: 'var(--c-border)',
          boxShadow: '0 30px 60px -15px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)'
        }}
      >
        {/* Titlebar */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b select-none shrink-0"
          style={{
            backgroundColor: 'var(--c-bg-tertiary)',
            borderColor: 'var(--c-border)'
          }}
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-xs tracking-wide" style={{ color: 'var(--c-text)' }}>
              Настройки
            </span>
          </div>

          {/* Close button with subtle neutral styling */}
          <button
            id="settings-close-x-btn"
            onClick={onClose}
            className="p-1 rounded-md transition-colors text-[var(--c-text-muted)] hover:text-[var(--c-text)] hover:bg-white/5"
            title="Закрыть (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Window Content: Sidebar + Tab View */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar Navigation */}
          <div
            className="w-48 sm:w-56 border-r p-2.5 flex flex-col gap-1 shrink-0 select-none overflow-y-auto"
            style={{
              backgroundColor: 'rgba(10, 12, 16, 0.4)',
              borderColor: 'var(--c-border)'
            }}
          >
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  id={`settings-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all text-left"
                  style={{
                    backgroundColor: isActive ? 'var(--c-peach-surface)' : 'transparent',
                    color: isActive ? 'var(--c-peach-light)' : 'var(--c-text-muted)'
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon
                      className="w-4 h-4 transition-colors shrink-0"
                      style={{
                        // Icon rule: strictly neutral text color when inactive, context shade ONLY when active
                        color: isActive ? 'var(--c-peach)' : 'var(--c-text-muted)'
                      }}
                    />
                    <span>{tab.label}</span>
                  </div>

                  {tab.badge && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: 'var(--c-mint)' }}
                      title="Требуется внимание"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab Main Viewport */}
          <div
            className="flex-1 p-5 overflow-y-auto"
            style={{ backgroundColor: 'var(--c-bg-primary)' }}
          >
            {/* 1. TOOLS TAB */}
            {activeTab === 'tools' && (
              <div className="space-y-4 max-w-3xl">
                <div className="flex items-center justify-between pb-3 border-b border-white/5">
                  <div>
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                      Инструменты и скрипты
                    </h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-muted)' }}>
                      Каждый инструмент привязан к файлу модуля. Любое изменение кода сразу обновляет сигнатуру.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      id="export-finetuning-dataset-btn"
                      onClick={() => setShowDatasetModal(true)}
                      className="px-3 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 transition-all font-medium"
                      style={{
                        backgroundColor: 'var(--c-peach-surface)',
                        color: 'var(--c-peach-light)',
                        border: '1px solid var(--c-peach-border)'
                      }}
                      title="Собрать JSON-объект всех инструментов для дообучения модели"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>JSON для дообучения</span>
                    </button>

                    <button
                      onClick={onReloadModules}
                      className="p-2 rounded-lg border text-xs flex items-center gap-1.5 transition-colors text-[var(--c-text-muted)] hover:text-[var(--c-text)]"
                      style={{
                        backgroundColor: 'var(--c-bg-secondary)',
                        borderColor: 'var(--c-border)'
                      }}
                      title="Перезагрузить скрипты"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => setShowNewToolModal(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all"
                      style={{
                        backgroundColor: 'var(--c-peach-surface)',
                        color: 'var(--c-peach-light)',
                        border: '1px solid var(--c-peach-border)'
                      }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Добавить</span>
                    </button>
                  </div>
                </div>

                {/* Master Detail Layout */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Left list of tools */}
                  <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                    {tools.map(tool => {
                      const isSelected = tool.id === selectedToolId;
                      return (
                        <button
                          key={tool.id}
                          onClick={() => setSelectedToolId(tool.id)}
                          className="w-full text-left p-2.5 rounded-xl border transition-all text-xs flex flex-col gap-0.5"
                          style={{
                            backgroundColor: isSelected ? 'var(--c-peach-surface)' : 'var(--c-bg-secondary)',
                            borderColor: isSelected ? 'var(--c-peach-border)' : 'var(--c-border)',
                            color: isSelected ? 'var(--c-peach-light)' : 'var(--c-text)'
                          }}
                        >
                          <div className="flex items-center justify-between font-mono">
                            <span className="font-semibold">{tool.name}</span>
                            <span className="text-[10px] opacity-75">v{tool.version}</span>
                          </div>
                          <span className="text-[11px] truncate" style={{ color: 'var(--c-text-muted)' }}>
                            {tool.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Right editor for selected tool */}
                  {currentTool && (
                    <div
                      className="md:col-span-2 p-3.5 rounded-xl border flex flex-col justify-between space-y-3"
                      style={{
                        backgroundColor: 'var(--c-bg-secondary)',
                        borderColor: 'var(--c-border)'
                      }}
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 font-mono text-xs">
                            <FileCode className="w-4 h-4 text-[var(--c-text-muted)]" />
                            <span className="font-semibold" style={{ color: 'var(--c-text)' }}>
                              {currentTool.filePath}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onDeleteTool(currentTool.id)}
                              className="p-1.5 rounded-lg text-xs hover:bg-white/5 transition-colors"
                              style={{ color: 'var(--c-mint-light)' }}
                              title="Удалить инструмент"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Version and Description */}
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <label className="text-[11px] block mb-1" style={{ color: 'var(--c-text-muted)' }}>
                              Версия
                            </label>
                            <input
                              type="text"
                              value={editingVersion}
                              onChange={e => setEditingVersion(e.target.value)}
                              className="w-full px-2.5 py-1 rounded-lg border font-mono text-xs bg-transparent"
                              style={{ borderColor: 'var(--c-border)', color: 'var(--c-text)' }}
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="text-[11px] block mb-1" style={{ color: 'var(--c-text-muted)' }}>
                              Описание для FunctionGemma
                            </label>
                            <input
                              type="text"
                              value={editingDesc}
                              onChange={e => setEditingDesc(e.target.value)}
                              className="w-full px-2.5 py-1 rounded-lg border text-xs bg-transparent"
                              style={{ borderColor: 'var(--c-border)', color: 'var(--c-text)' }}
                            />
                          </div>
                        </div>

                        {/* Code Editor */}
                        <div>
                          <label className="text-[11px] block mb-1 font-mono" style={{ color: 'var(--c-text-muted)' }}>
                            Код скрипта:
                          </label>
                          <textarea
                            value={editingCode}
                            onChange={e => setEditingCode(e.target.value)}
                            rows={8}
                            className="w-full p-2.5 rounded-lg border font-mono text-xs leading-relaxed resize-none bg-black/40"
                            style={{ borderColor: 'var(--c-border)', color: 'var(--c-text)' }}
                          />
                        </div>
                      </div>

                      {/* Bottom action bar */}
                      <div className="flex items-center justify-between pt-2 border-t border-white/5">
                        {saveStatusMsg ? (
                          <span
                            className="text-xs font-mono"
                            style={{
                              color: saveStatusMsg.includes('Ошибка')
                                ? 'var(--c-mint-light)'
                                : 'var(--c-peach-light)'
                            }}
                          >
                            {saveStatusMsg}
                          </span>
                        ) : (
                          <span className="text-[11px] font-mono text-[var(--c-text-dim)]">
                            Хэш: {currentTool.hash}
                          </span>
                        )}

                        <button
                          onClick={handleSaveToolChanges}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all"
                          style={{
                            backgroundColor: 'var(--c-peach)',
                            color: '#0a0c10'
                          }}
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Сохранить</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. COMPATIBILITY TAB */}
            {activeTab === 'compatibility' && (
              <div className="space-y-4 max-w-2xl">
                <div className="pb-3 border-b border-white/5">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                    Совместимость модели
                  </h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-muted)' }}>
                    Сравнение сигнатуры инструментов в коде с базой, на которой обучалась FunctionGemma.
                  </p>
                </div>

                {/* Main status alert */}
                <div
                  className="p-4 rounded-xl border flex items-start gap-3"
                  style={{
                    // Positive/Neutral = Peach; Negative = Mint (as requested)
                    backgroundColor: hasConflict && !isIgnored ? 'var(--c-mint-surface)' : 'var(--c-peach-surface)',
                    borderColor: hasConflict && !isIgnored ? 'var(--c-mint-border)' : 'var(--c-peach-border)',
                    color: hasConflict && !isIgnored ? 'var(--c-mint-light)' : 'var(--c-peach-light)'
                  }}
                >
                  {hasConflict && !isIgnored ? (
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--c-mint)' }} />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--c-peach)' }} />
                  )}

                  <div className="space-y-1">
                    <div className="font-semibold text-xs">
                      {hasConflict
                        ? isIgnored
                          ? 'Конфликт контрольной суммы проигнорирован пользователем'
                          : 'Конфликт контрольной суммы: инструменты отличаются от обучающего датасета'
                        : 'Полное соответствие: модель и скрипты синхронизированы'}
                    </div>
                    <div className="text-xs opacity-85">
                      {hasConflict
                        ? 'Код инструментов или их версии были изменены после обучения.'
                        : 'Контрольная сумма в коде точно совпадает с весами модели.'}
                    </div>
                  </div>
                </div>

                {/* Actions row */}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <button
                    onClick={onIgnoreConflict}
                    className="px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: isIgnored ? 'var(--c-peach-surface)' : 'var(--c-bg-secondary)',
                      borderColor: isIgnored ? 'var(--c-peach-border)' : 'var(--c-border)',
                      color: isIgnored ? 'var(--c-peach-light)' : 'var(--c-text)'
                    }}
                  >
                    {isIgnored ? 'Отключить игнорирование' : 'Игнорировать конфликт (Ctrl+I)'}
                  </button>

                  <button
                    onClick={onToggleModel}
                    className="px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: !isLoaded ? 'var(--c-mint-surface)' : 'var(--c-bg-secondary)',
                      borderColor: !isLoaded ? 'var(--c-mint-border)' : 'var(--c-border)',
                      color: !isLoaded ? 'var(--c-mint-light)' : 'var(--c-text)'
                    }}
                  >
                    <Power className="w-3.5 h-3.5 inline mr-1" />
                    {isLoaded ? 'Выгрузить модель (Ctrl+U)' : 'Загрузить модель'}
                  </button>

                  <button
                    onClick={onSyncManifest}
                    className="px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: 'var(--c-bg-secondary)',
                      borderColor: 'var(--c-border)',
                      color: 'var(--c-text)'
                    }}
                  >
                    Синхронизировать с кодом
                  </button>
                </div>

                {/* Checksums box */}
                <div
                  className="p-3 rounded-xl border space-y-2 text-xs font-mono"
                  style={{
                    backgroundColor: 'var(--c-bg-secondary)',
                    borderColor: 'var(--c-border)'
                  }}
                >
                  <div>
                    <span className="text-[11px] block" style={{ color: 'var(--c-text-muted)' }}>
                      Ожидаемая сумма модели:
                    </span>
                    <span className="break-all" style={{ color: 'var(--c-text)' }}>
                      {conflict?.expectedChecksum}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] block" style={{ color: 'var(--c-text-muted)' }}>
                      Фактическая сумма модулей:
                    </span>
                    <span
                      className="break-all"
                      style={{
                        color: hasConflict ? 'var(--c-mint-light)' : 'var(--c-peach-light)'
                      }}
                    >
                      {conflict?.actualChecksum}
                    </span>
                  </div>
                </div>

                {/* Diff items if conflict */}
                {hasConflict && conflict && (
                  <div className="space-y-2">
                    {conflict.alteredTools.length > 0 && (
                      <div
                        className="p-3 rounded-xl border space-y-1.5 text-xs"
                        style={{
                          backgroundColor: 'var(--c-mint-surface)',
                          borderColor: 'var(--c-mint-border)',
                          color: 'var(--c-mint-light)'
                        }}
                      >
                        <div className="font-semibold">Измененные инструменты:</div>
                        {conflict.alteredTools.map((t, idx) => (
                          <div key={idx} className="font-mono text-[11px] flex justify-between">
                            <span>{t.name}</span>
                            <span>v{t.expectedVersion} → v{t.actualVersion}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 3. HISTORY & ANALYTICS TAB */}
            {activeTab === 'history' && (
              <div className="space-y-4 max-w-3xl">
                <div className="flex items-center justify-between pb-3 border-b border-white/5">
                  <div>
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                      История и аналитика
                    </h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-muted)' }}>
                      Журнал запросов, статистика точности и разметка ответов для дообучения.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onExportLogs('json')}
                      className="px-2.5 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 text-[var(--c-text-muted)] hover:text-[var(--c-text)]"
                      style={{
                        backgroundColor: 'var(--c-bg-secondary)',
                        borderColor: 'var(--c-border)'
                      }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>JSON</span>
                    </button>

                    <button
                      onClick={() => onExportLogs('jsonl')}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all"
                      style={{
                        backgroundColor: 'var(--c-peach-surface)',
                        color: 'var(--c-peach-light)',
                        border: '1px solid var(--c-peach-border)'
                      }}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>JSONL датасет</span>
                    </button>
                  </div>
                </div>

                {/* Metrics Stats */}
                <div className="grid grid-cols-4 gap-2.5">
                  <div
                    className="p-3 rounded-xl border"
                    style={{
                      backgroundColor: 'var(--c-bg-secondary)',
                      borderColor: 'var(--c-border)'
                    }}
                  >
                    <span className="text-[11px] block" style={{ color: 'var(--c-text-muted)' }}>
                      Точность
                    </span>
                    <span className="text-lg font-bold font-mono" style={{ color: 'var(--c-peach-light)' }}>
                      {stats.accuracyPercent}%
                    </span>
                  </div>

                  <div
                    className="p-3 rounded-xl border"
                    style={{
                      backgroundColor: 'var(--c-bg-secondary)',
                      borderColor: 'var(--c-border)'
                    }}
                  >
                    <span className="text-[11px] block" style={{ color: 'var(--c-text-muted)' }}>
                      Точные вызовы
                    </span>
                    <span className="text-lg font-bold font-mono" style={{ color: 'var(--c-peach-light)' }}>
                      {stats.exact}
                    </span>
                  </div>

                  <div
                    className="p-3 rounded-xl border"
                    style={{
                      backgroundColor: 'var(--c-bg-secondary)',
                      borderColor: 'var(--c-border)'
                    }}
                  >
                    <span className="text-[11px] block" style={{ color: 'var(--c-text-muted)' }}>
                      Галлюцинации
                    </span>
                    <span className="text-lg font-bold font-mono" style={{ color: 'var(--c-mint-light)' }}>
                      {stats.hallucinated}
                    </span>
                  </div>

                  <div
                    className="p-3 rounded-xl border"
                    style={{
                      backgroundColor: 'var(--c-bg-secondary)',
                      borderColor: 'var(--c-border)'
                    }}
                  >
                    <span className="text-[11px] block" style={{ color: 'var(--c-text-muted)' }}>
                      Ошибки
                    </span>
                    <span className="text-lg font-bold font-mono" style={{ color: 'var(--c-mint-light)' }}>
                      {stats.failed}
                    </span>
                  </div>
                </div>

                {/* Logs list with quality rating */}
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {logs.length === 0 ? (
                    <div className="text-center py-10 text-xs text-[var(--c-text-muted)]">
                      История запросов пуста.
                    </div>
                  ) : (
                    logs.map(log => (
                      <div
                        key={log.id}
                        className="p-3 rounded-xl border text-xs space-y-2"
                        style={{
                          backgroundColor: 'var(--c-bg-secondary)',
                          borderColor: 'var(--c-border)'
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-[var(--c-text-muted)]">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                            <span
                              className="font-mono px-2 py-0.5 rounded-md text-[11px]"
                              style={{
                                backgroundColor: 'var(--c-peach-surface)',
                                color: 'var(--c-peach-light)'
                              }}
                            >
                              {log.toolCalled || 'нет вызова'}
                            </span>
                          </div>
                          <span className="text-[10px] text-[var(--c-text-dim)]">
                            {log.durationMs}ms
                          </span>
                        </div>

                        <div style={{ color: 'var(--c-text)' }}>"{log.prompt}"</div>

                        {/* Quality rating selector in history tab */}
                        <div className="flex items-center justify-between pt-1 border-t border-white/5">
                          <span className="text-[11px]" style={{ color: 'var(--c-text-muted)' }}>
                            Оценка ответа:
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => onRateAccuracy(log.id, 'EXACT')}
                              className="px-2 py-0.5 rounded text-[10px] font-mono border transition-colors"
                              style={{
                                backgroundColor: log.accuracyRating === 'EXACT' ? 'var(--c-peach-surface)' : 'transparent',
                                borderColor: log.accuracyRating === 'EXACT' ? 'var(--c-peach-border)' : 'var(--c-border)',
                                color: log.accuracyRating === 'EXACT' ? 'var(--c-peach-light)' : 'var(--c-text-muted)'
                              }}
                            >
                              Точно
                            </button>
                            <button
                              onClick={() => onRateAccuracy(log.id, 'HALLUCINATED_ARGS')}
                              className="px-2 py-0.5 rounded text-[10px] font-mono border transition-colors"
                              style={{
                                backgroundColor: log.accuracyRating === 'HALLUCINATED_ARGS' ? 'var(--c-mint-surface)' : 'transparent',
                                borderColor: log.accuracyRating === 'HALLUCINATED_ARGS' ? 'var(--c-mint-border)' : 'var(--c-border)',
                                color: log.accuracyRating === 'HALLUCINATED_ARGS' ? 'var(--c-mint-light)' : 'var(--c-text-muted)'
                              }}
                            >
                              Галлюцинация
                            </button>
                            <button
                              onClick={() => onRateAccuracy(log.id, 'WRONG_TOOL')}
                              className="px-2 py-0.5 rounded text-[10px] font-mono border transition-colors"
                              style={{
                                backgroundColor: log.accuracyRating === 'WRONG_TOOL' ? 'var(--c-mint-surface)' : 'transparent',
                                borderColor: log.accuracyRating === 'WRONG_TOOL' ? 'var(--c-mint-border)' : 'var(--c-border)',
                                color: log.accuracyRating === 'WRONG_TOOL' ? 'var(--c-mint-light)' : 'var(--c-text-muted)'
                              }}
                            >
                              Неверный инструмент
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* 4. APPEARANCE TAB */}
            {activeTab === 'appearance' && (
              <div className="space-y-4 max-w-2xl">
                <div className="pb-3 border-b border-white/5">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                    Оформление
                  </h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-muted)' }}>
                    Настройка цветовой палитры и прозрачности оверлея в дизайн-пайплайне Apple.
                  </p>
                </div>

                {/* Color Swatches Grid */}
                <div className="space-y-3">
                  <span className="text-xs font-medium" style={{ color: 'var(--c-text)' }}>
                    Палитра системы
                  </span>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {/* Peach Group */}
                    <div
                      className="p-3 rounded-xl border space-y-2"
                      style={{
                        backgroundColor: 'var(--c-bg-secondary)',
                        borderColor: 'var(--c-border)'
                      }}
                    >
                      <span className="font-semibold text-xs" style={{ color: 'var(--c-peach-light)' }}>
                        Персиковый (Положительный / Нейтральный)
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-6 h-6 rounded-lg border border-white/10 shadow-sm"
                          style={{ backgroundColor: 'var(--c-peach)' }}
                          title="Основной персиковый"
                        />
                        <span
                          className="w-6 h-6 rounded-lg border border-white/10 shadow-sm"
                          style={{ backgroundColor: 'var(--c-peach-light)' }}
                          title="Светлый оттенок"
                        />
                        <span
                          className="w-6 h-6 rounded-lg border border-white/10 shadow-sm"
                          style={{ backgroundColor: 'var(--c-peach-dark)' }}
                          title="Тёмный оттенок"
                        />
                      </div>
                    </div>

                    {/* Mint Group */}
                    <div
                      className="p-3 rounded-xl border space-y-2"
                      style={{
                        backgroundColor: 'var(--c-bg-secondary)',
                        borderColor: 'var(--c-border)'
                      }}
                    >
                      <span className="font-semibold text-xs" style={{ color: 'var(--c-mint-light)' }}>
                        Мятный (Отрицательный / Предупреждения)
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-6 h-6 rounded-lg border border-white/10 shadow-sm"
                          style={{ backgroundColor: 'var(--c-mint)' }}
                          title="Основной мятный"
                        />
                        <span
                          className="w-6 h-6 rounded-lg border border-white/10 shadow-sm"
                          style={{ backgroundColor: 'var(--c-mint-light)' }}
                          title="Светлый оттенок"
                        />
                        <span
                          className="w-6 h-6 rounded-lg border border-white/10 shadow-sm"
                          style={{ backgroundColor: 'var(--c-mint-dark)' }}
                          title="Тёмный оттенок"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Transparency slider */}
                <div
                  className="p-3 rounded-xl border space-y-2"
                  style={{
                    backgroundColor: 'var(--c-bg-secondary)',
                    borderColor: 'var(--c-border)'
                  }}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: 'var(--c-text)' }}>Прозрачность подложки рабочего стола</span>
                    <span className="font-mono" style={{ color: 'var(--c-peach-light)' }}>
                      {Math.round(desktopOpacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={desktopOpacity}
                    onChange={e => setDesktopOpacity(parseFloat(e.target.value))}
                    className="w-full accent-[var(--c-peach)]"
                  />
                </div>

                {/* Desktop background toggle */}
                <div
                  className="p-3 rounded-xl border flex items-center justify-between text-xs"
                  style={{
                    backgroundColor: 'var(--c-bg-secondary)',
                    borderColor: 'var(--c-border)'
                  }}
                >
                  <span style={{ color: 'var(--c-text)' }}>Фон рабочего стола для тестирования прозрачности</span>
                  <button
                    onClick={() => setShowDesktop(!showDesktop)}
                    className="px-3 py-1 rounded-lg border text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: showDesktop ? 'var(--c-peach-surface)' : 'transparent',
                      borderColor: showDesktop ? 'var(--c-peach-border)' : 'var(--c-border)',
                      color: showDesktop ? 'var(--c-peach-light)' : 'var(--c-text-muted)'
                    }}
                  >
                    {showDesktop ? 'Включен' : 'Отключен'}
                  </button>
                </div>

                {/* Sound effects controls */}
                <div
                  className="p-3.5 rounded-xl border space-y-3 text-xs"
                  style={{
                    backgroundColor: 'var(--c-bg-secondary)',
                    borderColor: 'var(--c-border)'
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-orange-400" />
                      <span className="font-medium" style={{ color: 'var(--c-text)' }}>
                        Звуковые сигналы действий
                      </span>
                    </div>
                    <button
                      id="toggle-sounds-btn"
                      onClick={() => {
                        const next = !soundEffects.isEnabled();
                        soundEffects.setEnabled(next);
                        if (next) soundEffects.playCompletionPing();
                        // trigger force update
                        setShowDesktop(prev => prev);
                      }}
                      className="px-3 py-1 rounded-lg border text-xs font-medium transition-colors"
                      style={{
                        backgroundColor: soundEffects.isEnabled() ? 'var(--c-peach-surface)' : 'transparent',
                        borderColor: soundEffects.isEnabled() ? 'var(--c-peach-border)' : 'var(--c-border)',
                        color: soundEffects.isEnabled() ? 'var(--c-peach-light)' : 'var(--c-text-muted)'
                      }}
                    >
                      {soundEffects.isEnabled() ? 'Включены' : 'Выключены'}
                    </button>
                  </div>

                  <p className="text-[11px]" style={{ color: 'var(--c-text-muted)' }}>
                    Ненавязчивые акустические отклики: завершение выполнения, вызов инструментов, успешный импорт модулей.
                  </p>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => soundEffects.playSuccessChime()}
                      className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] text-zinc-300 border border-zinc-700 transition-colors"
                    >
                      Тест: Успех модулей
                    </button>
                    <button
                      onClick={() => soundEffects.playCompletionPing()}
                      className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] text-zinc-300 border border-zinc-700 transition-colors"
                    >
                      Тест: Завершение запроса
                    </button>
                    <button
                      onClick={() => soundEffects.playToolCallCue()}
                      className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] text-zinc-300 border border-zinc-700 transition-colors"
                    >
                      Тест: Вызов инструмента
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STORAGE TAB */}
            {activeTab === 'storage' && <StorageSettingsTab />}

            {/* ROUTING TAB */}
            {activeTab === 'routing' && <ModelRouterTab />}

            {/* VOICE STT TAB */}
            {activeTab === 'voice' && <VoiceSTTTab />}

            {/* DOCKER DEPLOY TAB */}
            {activeTab === 'docker' && <DockerDeployTab />}

            {/* 5. ABOUT TAB (Hotkeys, technical details, system info) */}
            {activeTab === 'about' && (
              <div className="space-y-4 max-w-2xl">
                <div className="pb-3 border-b border-white/5">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                    О приложении и сочетания клавиш
                  </h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-muted)' }}>
                    Справочник горячих клавиш и технические параметры среды FunctionGemma.
                  </p>
                </div>

                {/* Hotkeys reference table */}
                <div
                  className="p-3 rounded-xl border space-y-2 text-xs"
                  style={{
                    backgroundColor: 'var(--c-bg-secondary)',
                    borderColor: 'var(--c-border)'
                  }}
                >
                  <div className="font-semibold pb-1 border-b border-white/5" style={{ color: 'var(--c-text)' }}>
                    Сочетания клавиш
                  </div>

                  <div className="space-y-1.5 text-[12px]">
                    <div className="flex items-center justify-between py-1">
                      <span style={{ color: 'var(--c-text)' }}>Вызов / скрытие HUD</span>
                      <kbd
                        className="px-2 py-0.5 rounded-md font-mono text-[11px] border"
                        style={{
                          backgroundColor: 'var(--c-bg-tertiary)',
                          borderColor: 'var(--c-border)',
                          color: 'var(--c-peach-light)'
                        }}
                      >
                        Alt + Space / Ctrl + K
                      </kbd>
                    </div>

                    <div className="flex items-center justify-between py-1">
                      <span style={{ color: 'var(--c-text)' }}>Открыть настройки</span>
                      <kbd
                        className="px-2 py-0.5 rounded-md font-mono text-[11px] border"
                        style={{
                          backgroundColor: 'var(--c-bg-tertiary)',
                          borderColor: 'var(--c-border)',
                          color: 'var(--c-peach-light)'
                        }}
                      >
                        Ctrl + ,
                      </kbd>
                    </div>

                    <div className="flex items-center justify-between py-1">
                      <span style={{ color: 'var(--c-text)' }}>Закрыть окно / оверлей</span>
                      <kbd
                        className="px-2 py-0.5 rounded-md font-mono text-[11px] border"
                        style={{
                          backgroundColor: 'var(--c-bg-tertiary)',
                          borderColor: 'var(--c-border)',
                          color: 'var(--c-text)'
                        }}
                      >
                        Escape
                      </kbd>
                    </div>

                    <div className="flex items-center justify-between py-1">
                      <span style={{ color: 'var(--c-text)' }}>Выгрузить / загрузить модель</span>
                      <kbd
                        className="px-2 py-0.5 rounded-md font-mono text-[11px] border"
                        style={{
                          backgroundColor: 'var(--c-bg-tertiary)',
                          borderColor: 'var(--c-border)',
                          color: 'var(--c-mint-light)'
                        }}
                      >
                        Ctrl + U
                      </kbd>
                    </div>

                    <div className="flex items-center justify-between py-1">
                      <span style={{ color: 'var(--c-text)' }}>Игнорировать конфликт сигнатуры</span>
                      <kbd
                        className="px-2 py-0.5 rounded-md font-mono text-[11px] border"
                        style={{
                          backgroundColor: 'var(--c-bg-tertiary)',
                          borderColor: 'var(--c-border)',
                          color: 'var(--c-peach-light)'
                        }}
                      >
                        Ctrl + I
                      </kbd>
                    </div>

                    <div className="flex items-center justify-between py-1">
                      <span style={{ color: 'var(--c-text)' }}>Перезагрузить модули скриптов</span>
                      <kbd
                        className="px-2 py-0.5 rounded-md font-mono text-[11px] border"
                        style={{
                          backgroundColor: 'var(--c-bg-tertiary)',
                          borderColor: 'var(--c-border)',
                          color: 'var(--c-text)'
                        }}
                      >
                        Ctrl + R
                      </kbd>
                    </div>
                  </div>
                </div>

                {/* Technical specs */}
                <div
                  className="p-3 rounded-xl border space-y-1.5 text-xs font-mono"
                  style={{
                    backgroundColor: 'var(--c-bg-secondary)',
                    borderColor: 'var(--c-border)'
                  }}
                >
                  <div className="font-sans font-semibold pb-1 border-b border-white/5" style={{ color: 'var(--c-text)' }}>
                    Сведения о системе
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--c-text-muted)' }}>Модель:</span>
                    <span style={{ color: 'var(--c-peach-light)' }}>{manifest?.modelName || 'FunctionGemma-7b'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--c-text-muted)' }}>Версия манифеста:</span>
                    <span style={{ color: 'var(--c-text)' }}>{manifest?.version}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--c-text-muted)' }}>Контрольная сумма:</span>
                    <span className="text-[11px] truncate max-w-xs" style={{ color: 'var(--c-text)' }}>
                      {currentChecksum}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal for adding new tool */}
      {showNewToolModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form
            onSubmit={handleCreateNewTool}
            className="w-full max-w-md p-4 rounded-2xl border shadow-2xl space-y-3 text-xs"
            style={{
              backgroundColor: 'var(--c-bg-secondary)',
              borderColor: 'var(--c-border)'
            }}
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <span className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>
                Новый инструмент
              </span>
              <button
                type="button"
                onClick={() => setShowNewToolModal(false)}
                className="text-[var(--c-text-muted)] hover:text-[var(--c-text)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block mb-1 text-[11px]" style={{ color: 'var(--c-text-muted)' }}>
                Имя функции (латиница)
              </label>
              <input
                type="text"
                required
                value={newToolName}
                onChange={e => setNewToolName(e.target.value)}
                placeholder="например: quick_notes"
                className="w-full px-2.5 py-1.5 rounded-lg border font-mono bg-transparent"
                style={{ borderColor: 'var(--c-border)', color: 'var(--c-text)' }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block mb-1 text-[11px]" style={{ color: 'var(--c-text-muted)' }}>
                  Модуль (папка)
                </label>
                <select
                  value={newToolModule}
                  onChange={e => setNewToolModule(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg border bg-[var(--c-bg-primary)]"
                  style={{ borderColor: 'var(--c-border)', color: 'var(--c-text)' }}
                >
                  <option value="system">system</option>
                  <option value="search">search</option>
                  <option value="files">files</option>
                  <option value="developer">developer</option>
                </select>
              </div>

              <div>
                <label className="block mb-1 text-[11px]" style={{ color: 'var(--c-text-muted)' }}>
                  Версия
                </label>
                <input
                  type="text"
                  value={newToolVersion}
                  onChange={e => setNewToolVersion(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border font-mono bg-transparent"
                  style={{ borderColor: 'var(--c-border)', color: 'var(--c-text)' }}
                />
              </div>
            </div>

            <div>
              <label className="block mb-1 text-[11px]" style={{ color: 'var(--c-text-muted)' }}>
                Описание назначения инструмента
              </label>
              <input
                type="text"
                value={newToolDesc}
                onChange={e => setNewToolDesc(e.target.value)}
                placeholder="Что делает инструмент"
                className="w-full px-2.5 py-1.5 rounded-lg border bg-transparent"
                style={{ borderColor: 'var(--c-border)', color: 'var(--c-text)' }}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={() => setShowNewToolModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{ color: 'var(--c-text-muted)' }}
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium"
                style={{
                  backgroundColor: 'var(--c-peach)',
                  color: '#0a0c10'
                }}
              >
                Создать
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Fine-Tuning Dataset Export Modal */}
      <FineTuningExportModal
        isOpen={showDatasetModal}
        onClose={() => setShowDatasetModal(false)}
        tools={tools}
        checksum={currentChecksum}
        manifest={manifest}
      />
    </div>
  );
};
