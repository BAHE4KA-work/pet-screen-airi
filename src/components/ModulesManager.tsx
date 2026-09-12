import React, { useState } from 'react';
import {
  Folder,
  FolderOpen,
  FileCode,
  Plus,
  Save,
  RotateCw,
  Hash,
  Sparkles,
  Layers,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Code
} from 'lucide-react';
import { ToolDefinition, ModuleGroup } from '../types';

interface ModulesManagerProps {
  modules: ModuleGroup[];
  tools: ToolDefinition[];
  currentChecksum: string;
  onSaveTool: (tool: ToolDefinition) => Promise<void>;
  onDeleteTool: (id: string) => Promise<void>;
  onReloadModules: () => Promise<void>;
  onResetDefaults: () => Promise<void>;
}

export const ModulesManager: React.FC<ModulesManagerProps> = ({
  modules,
  tools,
  currentChecksum,
  onSaveTool,
  onDeleteTool,
  onReloadModules,
  onResetDefaults
}) => {
  const [selectedToolId, setSelectedToolId] = useState<string>(tools[0]?.id || '');
  const [editingTool, setEditingTool] = useState<ToolDefinition | null>(
    tools.find(t => t.id === (tools[0]?.id || '')) || null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [showNewToolModal, setShowNewToolModal] = useState(false);

  // New Tool Form State
  const [newToolName, setNewToolName] = useState('');
  const [newToolModule, setNewToolModule] = useState('system');
  const [newToolVersion, setNewToolVersion] = useState('1.0.0');
  const [newToolDesc, setNewToolDesc] = useState('');

  const activeTool = tools.find(t => t.id === selectedToolId) || editingTool;

  const handleSelectTool = (tool: ToolDefinition) => {
    setSelectedToolId(tool.id);
    setEditingTool({ ...tool });
    setSaveMessage('');
  };

  const handleSaveCurrent = async () => {
    if (!editingTool) return;
    setIsSaving(true);
    setSaveMessage('');
    try {
      await onSaveTool(editingTool);
      setSaveMessage('Инструмент успешно сохранен. Хэш и критическая сумма обновлены!');
      setTimeout(() => setSaveMessage(''), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReload = async () => {
    setIsReloading(true);
    try {
      await onReloadModules();
      setSaveMessage('Все модули успешно перезагружены с диска.');
      setTimeout(() => setSaveMessage(''), 2500);
    } finally {
      setIsReloading(false);
    }
  };

  const handleCreateNewTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newToolName.trim() || !newToolModule.trim()) return;

    const id = `${newToolModule.toLowerCase()}.${newToolName.toLowerCase()}`;
    const newTool: ToolDefinition = {
      id,
      name: newToolName.toLowerCase(),
      module: newToolModule.toLowerCase(),
      version: newToolVersion || '1.0.0',
      description: newToolDesc || 'Пользовательский инструмент модуля',
      filePath: `modules/${newToolModule.toLowerCase()}/${newToolName.toLowerCase()}.js`,
      enabled: true,
      hash: '',
      parameters: [
        {
          name: 'input_param',
          type: 'string',
          description: 'Параметр запроса',
          required: true
        }
      ],
      code: `// modules/${newToolModule}/${newToolName}.js
export async function execute(params, context) {
  const input = params.input_param;
  return {
    status: 'success',
    executedAt: new Date().toISOString(),
    output: 'Hello from ' + '${newToolName}' + ': ' + input
  };
}`
    };

    await onSaveTool(newTool);
    setSelectedToolId(id);
    setEditingTool(newTool);
    setShowNewToolModal(false);
    setNewToolName('');
    setNewToolDesc('');
  };

  return (
    <div
      id="modules-manager-container"
      className="relative z-20 w-full max-w-6xl mx-auto px-4 py-4 animate-fade-in"
    >
      <div className="bg-[#0b0e17]/85 backdrop-blur-2xl border border-teal-500/20 rounded-2xl shadow-2xl p-4 sm:p-6 text-slate-100">
        {/* Top Header of Modules Explorer */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Code className="w-5 h-5 text-teal-400" />
              <h2 className="text-base font-semibold text-slate-100">
                Модули и Скрипты Инструментов
              </h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-teal-500/10 border border-teal-500/30 text-teal-300">
                {tools.length} active tools
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Скрипты импортируются из папок модулей. Изменение кода или версии мгновенно меняет критическую сумму.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="reload-modules-btn"
              onClick={handleReload}
              disabled={isReloading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-200 transition-colors"
              title="Перезагрузить все модули (Ctrl+R)"
            >
              <RotateCw className={`w-3.5 h-3.5 text-teal-400 ${isReloading ? 'animate-spin' : ''}`} />
              <span>Перезагрузить (Ctrl+R)</span>
            </button>

            <button
              id="reset-modules-btn"
              onClick={async () => {
                await onResetDefaults();
                setSaveMessage('Модули и контрольная сумма сброшены к исходному состоянию.');
                setTimeout(() => setSaveMessage(''), 2500);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-400 hover:text-slate-200 transition-colors"
              title="Сбросить все модули к исходному состоянию"
            >
              Сброс
            </button>

            <button
              id="open-new-tool-modal-btn"
              onClick={() => setShowNewToolModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-xs text-teal-200 font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-teal-300" />
              <span>Новый инструмент</span>
            </button>
          </div>
        </div>

        {/* Status / Save alert */}
        {saveMessage && (
          <div className="mb-4 p-2.5 rounded-lg bg-teal-950/30 border border-teal-500/40 text-teal-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-400" />
            <span>{saveMessage}</span>
          </div>
        )}

        {/* Master-Detail Split Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Left Column: Folders and Files Navigation */}
          <div className="md:col-span-4 bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 max-h-[600px] overflow-y-auto">
            <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2 px-1 flex items-center justify-between">
              <span>Папки и модули</span>
              <span className="text-[10px] text-teal-400/80">Checksum: {currentChecksum.substring(0, 8)}...</span>
            </div>

            <div className="space-y-3">
              {modules.map(mod => (
                <div key={mod.id} className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300/90 px-1.5 py-1 rounded hover:bg-slate-900">
                    <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                    <span>{mod.folder}</span>
                    <span className="text-[10px] text-slate-500 ml-auto font-mono">({mod.tools.length})</span>
                  </div>

                  <div className="pl-3 space-y-1 border-l border-slate-800/80 ml-2">
                    {mod.tools.map(tool => {
                      const isSelected = tool.id === selectedToolId;
                      return (
                        <button
                          key={tool.id}
                          id={`select-tool-${tool.id}`}
                          onClick={() => handleSelectTool(tool)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-all ${
                            isSelected
                              ? 'bg-teal-500/20 border border-teal-500/40 text-teal-200 shadow-xs'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileCode className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-teal-300' : 'text-slate-500'}`} />
                            <span className="truncate font-mono">{tool.name}.js</span>
                          </div>
                          <span className="text-[10px] font-mono text-orange-300/80 shrink-0 ml-1">
                            v{tool.version}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Script Code Inspector & Editor */}
          <div className="md:col-span-8 bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
            {editingTool ? (
              <div className="space-y-4">
                {/* Header row of selected tool */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-slate-100">
                        {editingTool.filePath}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-500/10 border border-teal-500/30 text-teal-300">
                        {editingTool.id}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{editingTool.description}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-[11px] font-mono bg-slate-900 px-2 py-1 rounded border border-slate-800 text-slate-400">
                      <Hash className="w-3 h-3 text-teal-400" />
                      <span>{editingTool.hash || 'calc...'}</span>
                    </div>

                    <button
                      id="save-tool-code-btn"
                      onClick={handleSaveCurrent}
                      disabled={isSaving}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-teal-200 text-xs font-medium transition-colors"
                    >
                      <Save className="w-3.5 h-3.5 text-teal-300" />
                      <span>{isSaving ? 'Сохранение...' : 'Сохранить'}</span>
                    </button>
                  </div>
                </div>

                {/* Parameters & Version Configuration */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs">
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Версия инструмента:</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={editingTool.version}
                        onChange={e => setEditingTool({ ...editingTool, version: e.target.value })}
                        className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-slate-200 font-mono text-xs focus:outline-hidden focus:border-teal-400"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const parts = editingTool.version.split('.');
                          const last = parseInt(parts[2] || '0', 10) + 1;
                          parts[2] = String(last);
                          setEditingTool({ ...editingTool, version: parts.join('.') });
                        }}
                        title="Поднять патч-версию (вызовет изменение хэша)"
                        className="px-1.5 py-1 rounded bg-orange-500/10 border border-orange-500/30 text-orange-300 text-[10px] hover:bg-orange-500/20"
                      >
                        +0.0.1
                      </button>
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-slate-400 text-[11px] mb-1">Описание для FunctionGemma:</label>
                    <input
                      type="text"
                      value={editingTool.description}
                      onChange={e => setEditingTool({ ...editingTool, description: e.target.value })}
                      className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-slate-200 text-xs focus:outline-hidden focus:border-teal-400"
                    />
                  </div>
                </div>

                {/* Parameters Schema Tags */}
                <div className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-800/80 text-xs">
                  <div className="text-[11px] text-slate-400 mb-1 font-mono">
                    Схема параметров (JSON Schema для FunctionGemma):
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editingTool.parameters.map((p, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px] border border-slate-700 flex items-center gap-1.5"
                      >
                        <span className="text-teal-400">{p.name}</span>:
                        <span className="text-amber-300">{p.type}</span>
                        {p.required && <span className="text-rose-400 text-[9px]">*req</span>}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Code Editor */}
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                    <span className="font-mono">JavaScript Module Implementation</span>
                    <span className="text-[11px] text-slate-500">Исполняется в песочнице бэкенда</span>
                  </div>
                  <textarea
                    rows={12}
                    value={editingTool.code}
                    onChange={e => setEditingTool({ ...editingTool, code: e.target.value })}
                    className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-200 leading-relaxed focus:outline-hidden focus:border-teal-400 focus:ring-1 focus:ring-teal-400/40"
                    spellCheck={false}
                  />
                </div>
              </div>
            ) : (
              <div className="py-16 text-center text-slate-500 text-sm">
                Выберите инструмент из списка слева для просмотра и редактирования
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal for adding a new tool */}
      {showNewToolModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#0e111a] border border-teal-500/30 rounded-2xl p-6 shadow-2xl text-slate-100">
            <h3 className="text-base font-semibold text-slate-100 mb-2">Создать новый инструмент</h3>
            <p className="text-xs text-slate-400 mb-4">
              Новый скрипт будет сохранен в модулях, а бэкенд пересчитает критическую сумму.
            </p>

            <form onSubmit={handleCreateNewTool} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">Имя инструмента (function name):</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. check_disk_space"
                  value={newToolName}
                  onChange={e => setNewToolName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono focus:border-teal-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Модуль (папка):</label>
                  <select
                    value={newToolModule}
                    onChange={e => setNewToolModule(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono focus:border-teal-400"
                  >
                    <option value="system">modules/system</option>
                    <option value="search">modules/search</option>
                    <option value="files">modules/files</option>
                    <option value="developer">modules/developer</option>
                    <option value="custom">modules/custom</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Версия:</label>
                  <input
                    type="text"
                    value={newToolVersion}
                    onChange={e => setNewToolVersion(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono focus:border-teal-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Описание назначения инструмента:</label>
                <input
                  type="text"
                  placeholder="e.g. Проверяет свободное место на дисках..."
                  value={newToolDesc}
                  onChange={e => setNewToolDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:border-teal-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewToolModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-teal-200 text-xs font-medium"
                >
                  Создать и вычислить хэш
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
