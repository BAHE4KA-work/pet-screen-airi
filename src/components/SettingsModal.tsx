import React, { useState, useEffect } from 'react';
import { electronBridge } from '../utils/electronBridge';
import {
  X,
  Wrench,
  ShieldCheck,
  History,
  Palette,
  Info,
  RotateCw,
  Plus,
  Trash2,
  Save,
  FileCode,
  Layers,
  Sparkles,
  HardDrive,
  Network,
  Mic,
  Globe,
  Volume2,
  CheckCircle2,
  Cpu,
  Keyboard,
  Check
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
import { NetworkSettingsTab } from './settings/NetworkSettingsTab';
import { LocalModelsTab } from './settings/LocalModelsTab';
import { HotkeysTab } from './settings/HotkeysTab';
import { soundEffects } from '../utils/audioEffects';
import { themeManager, AVAILABLE_PALETTES } from '../utils/themeManager';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Card } from './ui/Card';
import { Input } from './ui/Input';

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

  // Theme states
  const [primaryPalette, setPrimaryPaletteState] = useState<string>(() => themeManager.getPrimaryId());
  const [secondaryPalette, setSecondaryPaletteState] = useState<string>(() => themeManager.getSecondaryId());

  useEffect(() => {
    if (currentTool) {
      setEditingCode(currentTool.code);
      setEditingVersion(currentTool.version);
      setEditingDesc(currentTool.description);
    }
  }, [selectedToolId, tools]);

  useEffect(() => {
    if (isOpen) {
      electronBridge.setInteractive(true);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const conflict = status?.conflict;
  const hasConflict = Boolean(conflict?.hasConflict);
  const isIgnored = Boolean(status?.ignoreConflict);
  const isLoaded = Boolean(status?.loaded);

  const tabs = [
    { id: 'tools', label: 'Инструменты', icon: Wrench },
    { id: 'local_models', label: 'Каталог моделей', icon: Layers },
    { id: 'storage', label: 'Хранилище', icon: HardDrive },
    { id: 'routing', label: 'Маршрутизация', icon: Network },
    { id: 'voice', label: 'Голосовой ввод (STT)', icon: Mic },
    { id: 'compatibility', label: 'Совместимость', icon: ShieldCheck, badge: hasConflict && !isIgnored },
    { id: 'history', label: 'История', icon: History },
    { id: 'network', label: 'Сеть', icon: Globe },
    { id: 'appearance', label: 'Оформление', icon: Palette },
    { id: 'hotkeys', label: 'Горячие клавиши', icon: Keyboard },
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

  const handleSelectPrimaryPalette = (id: string) => {
    themeManager.setPrimaryPalette(id);
    setPrimaryPaletteState(id);
    soundEffects.playCompletionPing();
  };

  const handleSelectSecondaryPalette = (id: string) => {
    themeManager.setSecondaryPalette(id);
    setSecondaryPaletteState(id);
    soundEffects.playCompletionPing();
  };

  return (
    <div
      data-interactive="true"
      onMouseEnter={() => electronBridge.setInteractive(true)}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md animate-fade-in"
    >
      {/* Settings Window Frame */}
      <div
        id="settings-modal-window"
        data-interactive="true"
        onMouseEnter={() => electronBridge.setInteractive(true)}
        className="relative w-full max-w-4xl h-[640px] max-h-[90vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden text-sm"
        style={{
          backgroundColor: 'var(--c-bg-secondary)',
          borderColor: 'var(--c-border)'
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
          <span className="font-medium text-xs tracking-wide" style={{ color: 'var(--c-text)' }}>
            Настройки
          </span>

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
            className="w-48 sm:w-56 border-r p-2 flex flex-col gap-1 shrink-0 select-none overflow-y-auto"
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
                        color: isActive ? 'var(--c-peach)' : 'var(--c-text-muted)'
                      }}
                    />
                    <span className="truncate">{tab.label}</span>
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
                <div className="flex items-center justify-between pb-2 border-b border-[var(--c-border)]">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                    Инструменты
                  </h3>

                  <div className="flex items-center gap-2">
                    {/* Compact JSON Button with standard height */}
                    <Button
                      id="export-finetuning-dataset-btn"
                      size="md"
                      variant="secondary"
                      onClick={() => setShowDatasetModal(true)}
                      icon={<FileCode className="w-3.5 h-3.5" />}
                    >
                      JSON
                    </Button>

                    <Button
                      size="md"
                      variant="secondary"
                      onClick={onReloadModules}
                      icon={<RotateCw className="w-3.5 h-3.5" />}
                    >
                      Обновить
                    </Button>

                    <Button
                      size="md"
                      variant="primary"
                      onClick={() => setShowNewToolModal(true)}
                      icon={<Plus className="w-3.5 h-3.5" />}
                    >
                      Добавить
                    </Button>
                  </div>
                </div>

                {/* Vertical Layout for Tools */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Left: Vertical list of tools without description */}
                  <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                    {tools.map(tool => {
                      const isSelected = tool.id === selectedToolId;
                      return (
                        <button
                          key={tool.id}
                          onClick={() => setSelectedToolId(tool.id)}
                          className="w-full text-left px-3 py-2.5 rounded-xl border transition-all text-xs flex items-center justify-between"
                          style={{
                            backgroundColor: isSelected ? 'var(--c-peach-surface)' : 'var(--c-bg-secondary)',
                            borderColor: isSelected ? 'var(--c-peach-border)' : 'var(--c-border)',
                            color: isSelected ? 'var(--c-peach-light)' : 'var(--c-text)'
                          }}
                        >
                          <span className="font-mono font-medium truncate">{tool.name}</span>
                          <Badge variant={isSelected ? 'peach' : 'neutral'} size="sm">
                            v{tool.version}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>

                  {/* Right editor for selected tool */}
                  {currentTool && (
                    <Card className="md:col-span-2 flex flex-col justify-between space-y-3">
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 font-mono text-xs">
                            <FileCode className="w-4 h-4 text-[var(--c-text-muted)]" />
                            <span className="font-semibold" style={{ color: 'var(--c-text)' }}>
                              {currentTool.filePath}
                            </span>
                          </div>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onDeleteTool(currentTool.id)}
                            icon={<Trash2 className="w-3.5 h-3.5 text-[var(--c-mint-light)]" />}
                          />
                        </div>

                        {/* Version input */}
                        <div className="text-xs">
                          <label className="text-[11px] block mb-1" style={{ color: 'var(--c-text-muted)' }}>
                            Версия
                          </label>
                          <Input
                            value={editingVersion}
                            onChange={e => setEditingVersion(e.target.value)}
                          />
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
                            className="w-full p-2.5 rounded-lg border font-mono text-xs leading-relaxed resize-none bg-black/40 outline-none focus:border-[var(--c-peach)]"
                            style={{ borderColor: 'var(--c-border)', color: 'var(--c-text)' }}
                          />
                        </div>
                      </div>

                      {/* Bottom action bar */}
                      <div className="flex items-center justify-between pt-2 border-t border-white/5">
                        {saveStatusMsg ? (
                          <span className="text-xs font-mono text-[var(--c-peach-light)]">
                            {saveStatusMsg}
                          </span>
                        ) : (
                          <span className="text-[11px] font-mono text-[var(--c-text-muted)]">
                            Хэш: {currentTool.hash}
                          </span>
                        )}

                        <Button
                          size="sm"
                          variant="primary"
                          onClick={handleSaveToolChanges}
                          icon={<Save className="w-3.5 h-3.5" />}
                        >
                          Сохранить
                        </Button>
                      </div>
                    </Card>
                  )}
                </div>
              </div>
            )}

            {/* 2. COMPATIBILITY TAB */}
            {activeTab === 'compatibility' && (
              <div className="space-y-4 max-w-2xl">
                <div className="pb-2 border-b border-[var(--c-border)]">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                    Совместимость модели
                  </h3>
                </div>

                <div className="space-y-3">
                  <Card className="flex items-center justify-between p-3">
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>
                        Статус инференса
                      </div>
                      <div className="text-[11px]" style={{ color: 'var(--c-text-muted)' }}>
                        {isLoaded ? 'Модель готова к выполнению запросов' : 'Модель выгружена из памяти'}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={isLoaded ? 'secondary' : 'primary'}
                      onClick={onToggleModel}
                    >
                      {isLoaded ? 'Выгрузить' : 'Загрузить'}
                    </Button>
                  </Card>

                  <Card className="space-y-2 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span style={{ color: 'var(--c-text)' }}>Контрольная сумма модулей</span>
                      <Badge variant={hasConflict && !isIgnored ? 'mint' : 'peach'}>
                        {hasConflict && !isIgnored ? 'Конфликт сигнатур' : 'Совпадает'}
                      </Badge>
                    </div>
                    <div className="text-[11px] font-mono text-[var(--c-text-muted)]">
                      SHA256: {currentChecksum}
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <Button size="sm" variant="secondary" onClick={onSyncManifest}>
                        Синхронизировать
                      </Button>
                      {hasConflict && (
                        <Button size="sm" variant="outline" onClick={onIgnoreConflict}>
                          {isIgnored ? 'Учитывать расхождения' : 'Игнорировать конфликт'}
                        </Button>
                      )}
                    </div>
                  </Card>
                </div>
              </div>
            )}

            {/* 3. HISTORY TAB */}
            {activeTab === 'history' && (
              <div className="space-y-4 max-w-2xl">
                <div className="flex items-center justify-between pb-2 border-b border-[var(--c-border)]">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                    История
                  </h3>

                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => onExportLogs('json')}>
                      Экспорт JSON
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => onExportLogs('jsonl')}>
                      Экспорт JSONL
                    </Button>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <Card className="py-2 px-3">
                    <span className="text-[11px] block" style={{ color: 'var(--c-text-muted)' }}>Точные вызовы</span>
                    <span className="text-base font-bold font-mono text-[var(--c-peach-light)]">
                      {stats.exact}
                    </span>
                  </Card>
                  <Card className="py-2 px-3">
                    <span className="text-[11px] block" style={{ color: 'var(--c-text-muted)' }}>Галлюцинации</span>
                    <span className="text-base font-bold font-mono text-[var(--c-mint-light)]">
                      {stats.hallucinated}
                    </span>
                  </Card>
                  <Card className="py-2 px-3">
                    <span className="text-[11px] block" style={{ color: 'var(--c-text-muted)' }}>Ошибки</span>
                    <span className="text-base font-bold font-mono text-[var(--c-mint-light)]">
                      {stats.failed}
                    </span>
                  </Card>
                </div>

                {/* Logs list with icons for rating and model name display */}
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {logs.length === 0 ? (
                    <div className="text-center py-8 text-xs text-[var(--c-text-muted)]">
                      История пуста.
                    </div>
                  ) : (
                    logs.map(log => (
                      <Card key={log.id} className="p-3 text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-[var(--c-text-muted)]">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                            <Badge variant="peach" size="sm">
                              {log.toolCalled || 'нет вызова'}
                            </Badge>
                          </div>

                          {/* Responding Model Name */}
                          <div className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--c-text-muted)]">
                            <Cpu className="w-3 h-3 text-[var(--c-peach)]" />
                            <span>{log.modelName || 'FunctionGemma-7B'}</span>
                          </div>
                        </div>

                        <div className="font-medium" style={{ color: 'var(--c-text)' }}>
                          "{log.prompt}"
                        </div>

                        {/* Quality rating selector with meaningful ICONS */}
                        <div className="flex items-center justify-between pt-1 border-t border-white/5">
                          <span className="text-[11px]" style={{ color: 'var(--c-text-muted)' }}>
                            Оценка:
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onRateAccuracy(log.id, 'EXACT')}
                              title="Точно"
                              className={`p-1.5 rounded-lg border transition-all ${
                                log.accuracyRating === 'EXACT'
                                  ? 'bg-[var(--c-peach-surface)] border-[var(--c-peach-border)] text-[var(--c-peach-light)]'
                                  : 'border-[var(--c-border)] text-[var(--c-text-muted)] hover:text-[var(--c-text)]'
                              }`}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => onRateAccuracy(log.id, 'HALLUCINATED_ARGS')}
                              title="Галлюцинация параметров"
                              className={`p-1.5 rounded-lg border transition-all ${
                                log.accuracyRating === 'HALLUCINATED_ARGS'
                                  ? 'bg-[var(--c-mint-surface)] border-[var(--c-mint-border)] text-[var(--c-mint-light)]'
                                  : 'border-[var(--c-border)] text-[var(--c-text-muted)] hover:text-[var(--c-text)]'
                              }`}
                            >
                              <Sparkles className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => onRateAccuracy(log.id, 'WRONG_TOOL')}
                              title="Неверный инструмент"
                              className={`p-1.5 rounded-lg border transition-all ${
                                log.accuracyRating === 'WRONG_TOOL'
                                  ? 'bg-[var(--c-mint-surface)] border-[var(--c-mint-border)] text-[var(--c-mint-light)]'
                                  : 'border-[var(--c-border)] text-[var(--c-text-muted)] hover:text-[var(--c-text)]'
                              }`}
                            >
                              <Wrench className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* 4. APPEARANCE TAB */}
            {activeTab === 'appearance' && (
              <div className="space-y-4 max-w-2xl">
                <div className="pb-2 border-b border-[var(--c-border)]">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                    Оформление
                  </h3>
                </div>

                {/* Color Palettes Grid with 1 and 2 buttons */}
                <div className="space-y-2">
                  <span className="text-xs font-medium" style={{ color: 'var(--c-text)' }}>
                    Цветовые палитры:
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {AVAILABLE_PALETTES.map(pal => {
                      const isPrimary = primaryPalette === pal.id;
                      const isSecondary = secondaryPalette === pal.id;

                      return (
                        <Card
                          key={pal.id}
                          className="flex items-center justify-between p-2.5"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="flex items-center gap-1">
                              <span
                                className="w-4 h-4 rounded-md border border-white/10"
                                style={{ backgroundColor: pal.main }}
                              />
                              <span
                                className="w-4 h-4 rounded-md border border-white/10"
                                style={{ backgroundColor: pal.light }}
                              />
                              <span
                                className="w-4 h-4 rounded-md border border-white/10"
                                style={{ backgroundColor: pal.dark }}
                              />
                            </div>
                            <span className="font-medium" style={{ color: 'var(--c-text)' }}>
                              {pal.name}
                            </span>
                          </div>

                          {/* Buttons '1' and '2' */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleSelectPrimaryPalette(pal.id)}
                              className={`w-6 h-6 rounded-md font-mono text-xs font-bold transition-all ${
                                isPrimary
                                  ? 'bg-[var(--c-peach)] text-zinc-950 ring-1 ring-[var(--c-peach)]'
                                  : 'bg-[var(--c-bg-tertiary)] text-[var(--c-text-muted)] hover:text-[var(--c-text)] border border-[var(--c-border)]'
                              }`}
                              title="Выбрать как первичный цвет (1)"
                            >
                              1
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSelectSecondaryPalette(pal.id)}
                              className={`w-6 h-6 rounded-md font-mono text-xs font-bold transition-all ${
                                isSecondary
                                  ? 'bg-[var(--c-mint)] text-white ring-1 ring-[var(--c-mint)]'
                                  : 'bg-[var(--c-bg-tertiary)] text-[var(--c-text-muted)] hover:text-[var(--c-text)] border border-[var(--c-border)]'
                              }`}
                              title="Выбрать как вторичный цвет (2)"
                            >
                              2
                            </button>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>

                {/* Transparency slider - named simply "Прозрачность" */}
                <Card className="space-y-2 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: 'var(--c-text)' }}>Прозрачность</span>
                    <span className="font-mono text-[var(--c-peach-light)]">
                      {Math.round(desktopOpacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.05"
                    value={desktopOpacity}
                    onChange={e => setDesktopOpacity(parseFloat(e.target.value))}
                    className="w-full accent-[var(--c-peach)] cursor-pointer"
                  />
                </Card>

                {/* Sound effects controls - no redundant subtitle */}
                <Card className="space-y-3 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-[var(--c-peach)]" />
                      <span className="font-medium" style={{ color: 'var(--c-text)' }}>
                        Звуковые сигналы
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant={soundEffects.isEnabled() ? 'primary' : 'outline'}
                      onClick={() => {
                        const next = !soundEffects.isEnabled();
                        soundEffects.setEnabled(next);
                        if (next) soundEffects.playCompletionPing();
                        setShowDesktop(prev => prev);
                      }}
                    >
                      {soundEffects.isEnabled() ? 'Включены' : 'Выключены'}
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" variant="secondary" onClick={() => soundEffects.playSuccessChime()}>
                      Тест: Завершение
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => soundEffects.playToolCallCue()}>
                      Тест: Вызов
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {/* LOCAL MODELS CATALOG TAB */}
            {activeTab === 'local_models' && <LocalModelsTab />}

            {/* STORAGE TAB */}
            {activeTab === 'storage' && <StorageSettingsTab />}

            {/* ROUTING TAB */}
            {activeTab === 'routing' && <ModelRouterTab />}

            {/* VOICE STT TAB */}
            {activeTab === 'voice' && <VoiceSTTTab />}

            {/* NETWORK TAB */}
            {activeTab === 'network' && <NetworkSettingsTab />}

            {/* HOTKEYS TAB */}
            {activeTab === 'hotkeys' && <HotkeysTab />}

            {/* 5. ABOUT TAB - Technical information list */}
            {activeTab === 'about' && (
              <div className="space-y-4 max-w-2xl">
                <div className="pb-2 border-b border-[var(--c-border)]">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                    О приложении
                  </h3>
                </div>

                {/* Technical information formatted as a clean list */}
                <Card className="p-3">
                  <div className="divide-y divide-[var(--c-border)] text-xs">
                    <div className="py-2 flex items-center justify-between">
                      <span style={{ color: 'var(--c-text-muted)' }}>Версия оверлея</span>
                      <span className="font-mono font-medium" style={{ color: 'var(--c-text)' }}>2.4.0 (Electron / Web)</span>
                    </div>

                    <div className="py-2 flex items-center justify-between">
                      <span style={{ color: 'var(--c-text-muted)' }}>Базовая модель</span>
                      <span className="font-mono font-medium" style={{ color: 'var(--c-peach-light)' }}>FunctionGemma-7B (FineTuned)</span>
                    </div>

                    <div className="py-2 flex items-center justify-between">
                      <span style={{ color: 'var(--c-text-muted)' }}>Формат весов</span>
                      <span className="font-mono" style={{ color: 'var(--c-text)' }}>GGUF Q4_K_M (4-bit quant)</span>
                    </div>

                    <div className="py-2 flex items-center justify-between">
                      <span style={{ color: 'var(--c-text-muted)' }}>Контрольная сумма SHA-256</span>
                      <span className="font-mono text-[11px] truncate max-w-[200px]" style={{ color: 'var(--c-text)' }}>
                        {currentChecksum || '6c8fa8e...'}
                      </span>
                    </div>

                    <div className="py-2 flex items-center justify-between">
                      <span style={{ color: 'var(--c-text-muted)' }}>Рантайм</span>
                      <span className="font-mono" style={{ color: 'var(--c-text)' }}>Node.js / Express / Vite</span>
                    </div>

                    <div className="py-2 flex items-center justify-between">
                      <span style={{ color: 'var(--c-text-muted)' }}>Режим отображения</span>
                      <span className="font-mono" style={{ color: 'var(--c-text)' }}>Hardware-accelerated Transparent Overlay</span>
                    </div>

                    <div className="py-2 flex items-center justify-between">
                      <span style={{ color: 'var(--c-text-muted)' }}>Сетевой порт</span>
                      <span className="font-mono" style={{ color: 'var(--c-text)' }}>3000 (0.0.0.0)</span>
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dataset Fine-Tuning Modal */}
      <FineTuningExportModal
        isOpen={showDatasetModal}
        onClose={() => setShowDatasetModal(false)}
        tools={tools}
        manifest={manifest}
      />
    </div>
  );
};
