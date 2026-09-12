import React, { useState, useEffect } from 'react';
import {
  Layers,
  HardDrive,
  RotateCw,
  CheckCircle2,
  FileCode,
  Sparkles,
  Mic,
  Volume2,
  Brain,
  FolderOpen,
  Info,
  Check,
  ExternalLink,
  Plus
} from 'lucide-react';
import { LocalModelsOverview, LocalModelFile, LocalModelCategoryInfo } from '../../types';
import { soundEffects } from '../../utils/audioEffects';

export const LocalModelsTab: React.FC = () => {
  const [overview, setOverview] = useState<LocalModelsOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('basemodel');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [newModelFilename, setNewModelFilename] = useState('');
  const [newModelQuant, setNewModelQuant] = useState('Q4_K_M');
  const [newModelParams, setNewModelParams] = useState('7B');
  const [newModelDesc, setNewModelDesc] = useState('');

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/models/local');
      if (res.ok) {
        const data = await res.json();
        setOverview(data);
      }
    } catch (e) {
      console.error('Failed to load local models:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const handleRescan = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/models/local/scan', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setOverview(data);
        soundEffects.playCompletionPing();
        setStatusMessage('Папки models/ успешно пересканированы');
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectModel = async (category: string, modelId: string) => {
    try {
      const res = await fetch('/api/models/local/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, model: modelId })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.overview) {
          setOverview(data.overview);
        }
        soundEffects.playCompletionPing();
        setStatusMessage(`Модель активна для категории ${category}`);
        setTimeout(() => setStatusMessage(null), 2500);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateModelDescriptor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModelFilename.trim()) return;

    try {
      const res = await fetch('/api/models/local/descriptor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: activeCategory,
          filename: newModelFilename.trim(),
          descriptor: {
            name: newModelName.trim() || newModelFilename.trim(),
            filename: newModelFilename.trim(),
            category: activeCategory,
            quantization: newModelQuant,
            parameters: newModelParams,
            description: newModelDesc || 'Пользовательская локальная модель',
            createdAt: new Date().toISOString()
          }
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.overview) {
          setOverview(data.overview);
        }
        setShowAddModal(false);
        setNewModelName('');
        setNewModelFilename('');
        setNewModelDesc('');
        soundEffects.playCompletionPing();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const categoryIcons: Record<string, React.ElementType> = {
    basemodel: Brain,
    stt: Mic,
    tts: Volume2,
    embedding: Sparkles
  };

  const currentCategoryInfo: LocalModelCategoryInfo | undefined =
    overview?.categories[activeCategory];

  return (
    <div className="space-y-6">
      {/* Top Banner & Stats */}
      <div
        className="p-5 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
        style={{
          backgroundColor: '#161922',
          borderColor: 'var(--c-border)'
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-violet-500/10 text-violet-400 border border-violet-500/20">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-100">Локальный каталог моделей (`/models`)</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
                Офлайн файлы
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Модели хранятся в корневой папке проекта как файлы весов, разделенные по типам задач
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          <div className="text-right hidden sm:block">
            <div className="text-xs text-zinc-400 font-mono">
              Файлов: <span className="text-zinc-200 font-medium">{overview?.totalFiles ?? 0}</span>
            </div>
            <div className="text-[11px] text-zinc-500">
              Объем: <span className="text-zinc-300">{overview?.totalSizeFormatted ?? '0 B'}</span>
            </div>
          </div>

          <button
            id="rescan-local-models-btn"
            onClick={handleRescan}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-zinc-200 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-all cursor-pointer disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Пересканировать папку</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="p-3 rounded-lg text-xs flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Category Tabs Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {overview && Object.entries(overview.categories).map(([key, rawCat]) => {
          const cat = rawCat as LocalModelCategoryInfo;
          const Icon = categoryIcons[key] || FolderOpen;
          const isSelected = activeCategory === key;
          const activeFile = cat.files.find(f => f.isActive);

          return (
            <button
              key={key}
              id={`tab-cat-${key}`}
              onClick={() => setActiveCategory(key)}
              className="p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between"
              style={{
                backgroundColor: isSelected ? 'rgba(249, 115, 22, 0.08)' : 'rgba(22, 25, 34, 0.6)',
                borderColor: isSelected ? 'var(--c-peach)' : 'var(--c-border)'
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center"
                  style={{
                    backgroundColor: isSelected ? 'rgba(249, 115, 22, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                    color: isSelected ? 'var(--c-peach)' : 'var(--c-text-muted)'
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  {cat.count} шт
                </span>
              </div>

              <div>
                <div className="text-xs font-medium text-zinc-200 font-mono truncate">
                  models/{key}/
                </div>
                <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                  {cat.name.split('(')[0]}
                </div>
              </div>

              {activeFile && (
                <div className="mt-2 pt-2 border-t border-zinc-800/60 flex items-center gap-1.5 text-[10px] text-emerald-400 truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  <span className="truncate">{activeFile.filename}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Category Explorer */}
      {currentCategoryInfo && (
        <div
          className="p-5 rounded-xl border space-y-4"
          style={{
            backgroundColor: '#161922',
            borderColor: 'var(--c-border)'
          }}
        >
          {/* Header of category */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-800">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-zinc-100">{currentCategoryInfo.name}</h4>
                <code className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-orange-400 font-mono">
                  ./models/{currentCategoryInfo.key}/
                </code>
              </div>
              <p className="text-xs text-zinc-400 mt-1">{currentCategoryInfo.description}</p>
            </div>

            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors self-start sm:self-auto cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить дескриптор</span>
            </button>
          </div>

          {/* Recommended formats indicator */}
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span>Поддерживаемые форматы:</span>
            <div className="flex gap-1.5 flex-wrap">
              {currentCategoryInfo.recommendedFormats.map(fmt => (
                <span
                  key={fmt}
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700"
                >
                  {fmt}
                </span>
              ))}
            </div>
          </div>

          {/* Files List */}
          {currentCategoryInfo.files.length === 0 ? (
            <div className="p-8 text-center rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30">
              <FolderOpen className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
              <p className="text-xs text-zinc-300 font-medium">
                В папке models/{currentCategoryInfo.key}/ пока нет файлов моделей
              </p>
              <p className="text-[11px] text-zinc-500 mt-1 max-w-md mx-auto">
                Поместите файл модели (например, <code>.gguf</code>, <code>.onnx</code> или <code>.bin</code>) в
                папку <code>models/{currentCategoryInfo.key}/</code> и нажмите кнопку «Пересканировать».
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {currentCategoryInfo.files.map(file => {
                const isActive = file.isActive;

                return (
                  <div
                    key={file.id}
                    className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isActive
                        ? 'border-orange-500/40 bg-orange-500/5'
                        : 'border-zinc-800/80 bg-zinc-900/40 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          isActive
                            ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                            : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                        }`}
                      >
                        <FileCode className="w-4 h-4" />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-zinc-200 font-mono">
                            {file.filename}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
                            {file.format}
                          </span>
                          {file.quantization && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-violet-500/10 text-violet-400 border border-violet-500/20">
                              {file.quantization}
                            </span>
                          )}
                          {file.parameters && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              {file.parameters}
                            </span>
                          )}
                          {isActive && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                              Активна
                            </span>
                          )}
                        </div>

                        {file.description && (
                          <p className="text-xs text-zinc-400 line-clamp-1">{file.description}</p>
                        )}

                        <div className="flex items-center gap-3 text-[11px] text-zinc-500 font-mono">
                          <span>Путь: {file.relativePath}</span>
                          <span>•</span>
                          <span>Размер: {file.sizeFormatted}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      {!isActive ? (
                        <button
                          onClick={() => handleSelectModel(currentCategoryInfo.key, file.filename)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors cursor-pointer"
                        >
                          Сделать активной
                        </button>
                      ) : (
                        <div className="flex items-center gap-1 text-xs font-medium text-emerald-400 px-3 py-1.5">
                          <Check className="w-3.5 h-3.5" />
                          <span>Выбрана</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* How to use & Docker info box */}
          <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/50 text-xs space-y-2">
            <div className="flex items-center gap-2 text-zinc-200 font-medium">
              <Info className="w-4 h-4 text-orange-400" />
              <span>Связка с Docker и локальными рантаймами</span>
            </div>
            <p className="text-zinc-400 text-[11px] leading-relaxed">
              Вся папка <code>./models</code> автоматически монтируется в Docker контейнеры (Ollama,
              Faster-Whisper, Piper). Когда вы копируете реальный <code>.gguf</code> файл в{' '}
              <code>models/basemodel/</code>, он сразу становится доступен локальному инференсу без
              скачивания из интернета.
            </p>
          </div>
        </div>
      )}

      {/* Modal: Add model descriptor */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div
            className="w-full max-w-md p-5 rounded-2xl border shadow-2xl space-y-4"
            style={{
              backgroundColor: '#161922',
              borderColor: 'var(--c-border)'
            }}
          >
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <h4 className="text-sm font-semibold text-zinc-100">
                Добавить дескриптор в models/{activeCategory}/
              </h4>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-zinc-400 hover:text-zinc-200 text-xs"
              >
                Отмена
              </button>
            </div>

            <form onSubmit={handleCreateModelDescriptor} className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-300 mb-1">Имя файла модели на диске</label>
                <input
                  type="text"
                  placeholder="например, my-functiongemma-7b.Q4_K_M.gguf"
                  value={newModelFilename}
                  onChange={e => setNewModelFilename(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-orange-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-zinc-300 mb-1">Название модели</label>
                <input
                  type="text"
                  placeholder="FunctionGemma-7B FineTuned"
                  value={newModelName}
                  onChange={e => setNewModelName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-zinc-300 mb-1">Квантование</label>
                  <input
                    type="text"
                    value={newModelQuant}
                    onChange={e => setNewModelQuant(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-orange-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-zinc-300 mb-1">Параметры</label>
                  <input
                    type="text"
                    value={newModelParams}
                    onChange={e => setNewModelParams(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-orange-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-300 mb-1">Описание</label>
                <textarea
                  rows={2}
                  value={newModelDesc}
                  onChange={e => setNewModelDesc(e.target.value)}
                  placeholder="Краткое описание модели и задач..."
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-orange-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-medium"
                >
                  Создать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
