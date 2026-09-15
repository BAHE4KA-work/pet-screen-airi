import React, { useState, useEffect } from 'react';
import {
  Layers,
  RotateCw,
  FileCode,
  Sparkles,
  Mic,
  Volume2,
  Brain,
  FolderOpen,
  Check,
  Plus,
  Cpu,
  Zap,
  PowerOff,
  AlertTriangle,
  HardDrive,
  Activity,
  Server,
  Database,
  Radio
} from 'lucide-react';
import { LocalModelsOverview, LocalModelCategoryInfo, ModelRuntimeState, LoadedCategoryInfo } from '../../types';
import { soundEffects } from '../../utils/audioEffects';
import { useServerEvents } from '../../hooks/useServerEvents';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';

export const LocalModelsTab: React.FC = () => {
  const [overview, setOverview] = useState<LocalModelsOverview | null>(null);
  const [runtime, setRuntime] = useState<ModelRuntimeState | null>(null);
  const [allRuntimes, setAllRuntimes] = useState<Record<string, ModelRuntimeState>>({});
  const [loading, setLoading] = useState(false);
  const [loadingRam, setLoadingRam] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('basemodel');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [newModelFilename, setNewModelFilename] = useState('');
  const [newModelQuant, setNewModelQuant] = useState('Q4_K_M');
  const [newModelParams, setNewModelParams] = useState('7B');

  const { isConnected: isSSEConnected, services } = useServerEvents();

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const [resModels, resRuntime] = await Promise.all([
        fetch('/api/models/local'),
        fetch('/api/models/runtime')
      ]);

      if (resModels.ok) {
        const data = await resModels.json();
        setOverview(data);
      }
      if (resRuntime.ok) {
        const rt = await resRuntime.json();
        setRuntime(rt);
        if (rt.allRuntimes) {
          setAllRuntimes(rt.allRuntimes);
        }
      }
    } catch (e) {
      console.error('Failed to load local models overview:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const handleRescan = async () => {
    setLoading(true);
    setRuntimeError(null);
    try {
      const res = await fetch('/api/models/local/scan', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setOverview(data);
        soundEffects.playCompletionPing();
      }
      const resRuntime = await fetch('/api/models/runtime');
      if (resRuntime.ok) {
        const rt = await resRuntime.json();
        setRuntime(rt);
        if (rt.allRuntimes) {
          setAllRuntimes(rt.allRuntimes);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectModel = async (category: string, modelId: string) => {
    setRuntimeError(null);
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
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLoadToRam = async (category?: string, filename?: string) => {
    setLoadingRam(true);
    setRuntimeError(null);
    try {
      const cat = category || activeCategory;
      const targetFilename = filename || overview?.categories[cat]?.activeModel;
      
      const res = await fetch('/api/models/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat, filename: targetFilename })
      });
      const data = await res.json();
      if (data.success) {
        if (data.runtime) {
          setRuntime(data.runtime);
        }
        if (data.allRuntimes) {
          setAllRuntimes(data.allRuntimes);
        }
        soundEffects.playCompletionPing();
      } else {
        const msg = data.error || 'Ошибка выделения оперативной памяти под модель';
        setRuntimeError(msg);
        soundEffects.playWarningCue();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Сетевая ошибка при загрузке в ОЗУ';
      setRuntimeError(msg);
      soundEffects.playWarningCue();
    } finally {
      setLoadingRam(false);
    }
  };

  const handleUnloadFromRam = async (category?: string) => {
    setLoadingRam(true);
    setRuntimeError(null);
    try {
      const cat = category || activeCategory;
      const res = await fetch('/api/models/unload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat })
      });
      const data = await res.json();
      if (data.success) {
        if (data.runtime) {
          setRuntime(data.runtime);
        }
        if (data.allRuntimes) {
          setAllRuntimes(data.allRuntimes);
        }
        soundEffects.playCompletionPing();
      }
    } catch (e) {
      console.error('Unload from RAM error:', e);
    } finally {
      setLoadingRam(false);
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
            description: 'Пользовательская локальная модель',
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

  const currentCategoryRuntime = allRuntimes[activeCategory] || (runtime?.activeCategory === activeCategory ? runtime : null);
  const isCategoryLoaded = Boolean(currentCategoryRuntime?.isLoaded || currentCategoryRuntime?.loaded);
  const loadedCategoriesEntries = Object.entries(runtime?.loadedCategories || {}) as [string, LoadedCategoryInfo][];
  const totalLoadedCount = loadedCategoriesEntries.length;

  return (
    <div className="space-y-4">
      {/* Microservices Architecture Live Status (FastAPI, LLM Worker, STT Worker, RabbitMQ, Postgres) */}
      <div
        className="p-3 rounded-xl border text-xs space-y-2.5"
        style={{
          backgroundColor: 'var(--c-bg-secondary)',
          borderColor: 'var(--c-border)'
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-[var(--c-peach)]" />
            <span className="font-semibold text-[var(--c-text)]">
              Параллельные контейнеры микросервисов (LLM Worker + Voice Worker)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--c-text-muted)]">
              <Radio className={`w-3.5 h-3.5 ${isSSEConnected ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`} />
              SSE: {isSSEConnected ? 'Live Stream' : 'Polling'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 border-t border-[var(--c-border)]">
          <div className="p-2 rounded-lg bg-[var(--c-bg-primary)] border border-[var(--c-border)] space-y-1">
            <div className="text-[10px] text-[var(--c-text-dim)] uppercase tracking-wider font-semibold">API Gateway</div>
            <div className="flex items-center gap-1.5 font-medium text-[11px] text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              FastAPI :3000
            </div>
          </div>

          <div className="p-2 rounded-lg bg-[var(--c-bg-primary)] border border-[var(--c-border)] space-y-1">
            <div className="text-[10px] text-[var(--c-text-dim)] uppercase tracking-wider font-semibold">LLM Worker</div>
            <div className="flex items-center gap-1.5 font-medium text-[11px] text-[var(--c-peach-light)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--c-peach)]"></span>
              overlay-llm-worker
            </div>
          </div>

          <div className="p-2 rounded-lg bg-[var(--c-bg-primary)] border border-[var(--c-border)] space-y-1">
            <div className="text-[10px] text-[var(--c-text-dim)] uppercase tracking-wider font-semibold">Voice Worker</div>
            <div className="flex items-center gap-1.5 font-medium text-[11px] text-sky-400">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
              overlay-stt-worker
            </div>
          </div>

          <div className="p-2 rounded-lg bg-[var(--c-bg-primary)] border border-[var(--c-border)] space-y-1">
            <div className="text-[10px] text-[var(--c-text-dim)] uppercase tracking-wider font-semibold">Message Broker</div>
            <div className="flex items-center gap-1.5 font-medium text-[11px] text-orange-400">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span>
              RabbitMQ :5672
            </div>
          </div>

          <div className="p-2 rounded-lg bg-[var(--c-bg-primary)] border border-[var(--c-border)] space-y-1">
            <div className="text-[10px] text-[var(--c-text-dim)] uppercase tracking-wider font-semibold">Database</div>
            <div className="flex items-center gap-1.5 font-medium text-[11px] text-purple-400">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
              PG16 + pgvector
            </div>
          </div>
        </div>
      </div>

      {/* RAM Runtime State Banner - Per-category container allocation & Parallel state */}
      <div
        className="p-3.5 rounded-xl border flex flex-col gap-3 transition-all"
        style={{
          backgroundColor: isCategoryLoaded ? 'var(--c-peach-surface)' : 'var(--c-bg-secondary)',
          borderColor: isCategoryLoaded ? 'var(--c-peach-border)' : 'var(--c-border)'
        }}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border transition-all"
              style={{
                backgroundColor: isCategoryLoaded ? 'var(--c-bg-primary)' : 'var(--c-bg-tertiary)',
                borderColor: isCategoryLoaded ? 'var(--c-peach-border)' : 'var(--c-border)',
                color: isCategoryLoaded ? 'var(--c-peach-light)' : 'var(--c-text-muted)'
              }}
            >
              <Cpu className="w-5 h-5" />
            </div>

            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>
                  {isCategoryLoaded
                    ? `Модель [${currentCategoryInfo?.name || activeCategory}] в ОЗУ`
                    : `Модель [${currentCategoryInfo?.name || activeCategory}] не загружена в ОЗУ`}
                </span>
                <Badge variant={isCategoryLoaded ? 'peach' : 'neutral'} size="sm">
                  {isCategoryLoaded ? `${currentCategoryRuntime?.ramUsageFormatted || currentCategoryRuntime?.sizeFormatted} (Контейнер: ${currentCategoryRuntime?.containerName})` : '0 MB'}
                </Badge>
              </div>
              <div className="text-[11px] font-mono text-[var(--c-text-muted)]">
                {isCategoryLoaded
                  ? `${currentCategoryRuntime?.loadedModel || currentCategoryRuntime?.activeFilename}`
                  : 'Загружается независимо в собственный контейнер без конкуренции за ОЗУ'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {isCategoryLoaded ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleUnloadFromRam(activeCategory)}
                disabled={loadingRam}
                icon={<PowerOff className="w-3.5 h-3.5 text-rose-400" />}
              >
                {loadingRam ? 'Выгрузка...' : 'Выгрузить из ОЗУ'}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="primary"
                onClick={() => handleLoadToRam(activeCategory)}
                disabled={loadingRam || !overview?.categories[activeCategory]?.activeModel}
                icon={<Zap className={`w-3.5 h-3.5 ${loadingRam ? 'animate-spin' : ''}`} />}
              >
                {loadingRam ? 'Загрузка весов в ОЗУ...' : 'Загрузить в ОЗУ'}
              </Button>
            )}
          </div>
        </div>

        {/* Multi-container parallel loaded overview */}
        {totalLoadedCount > 0 && (
          <div className="pt-2 border-t border-[var(--c-border)]/60 flex items-center gap-2 flex-wrap text-[11px]">
            <span className="text-[var(--c-text-dim)] font-medium">Активно в параллельных контейнерах:</span>
            {loadedCategoriesEntries.map(([cat, info]) => (
              <span
                key={cat}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--c-bg-primary)] border border-[var(--c-border)] font-mono text-[10px]"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <strong className="text-[var(--c-text)]">{info.containerName}</strong>:
                <span className="text-[var(--c-peach)] truncate max-w-[140px]">{info.loadedModel}</span>
                <span className="text-[var(--c-text-dim)]">({info.sizeFormatted})</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Runtime Error Notification */}
      {runtimeError && (
        <Card className="p-3 border-amber-500/30 bg-amber-500/10 space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{runtimeError}</span>
          </div>
          <p className="text-[11px] text-amber-200/70 pl-6">
            Для использования локальной модели скопируйте GGUF/бин файл весов в каталог <code>models/{activeCategory}/</code> на хосте или в Docker volume.
          </p>
        </Card>
      )}

      {/* Action Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[var(--c-border)]">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
            Каталог моделей
          </h3>
          <Badge variant="neutral">models/</Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRescan}
            disabled={loading}
            icon={<RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Пересканировать
          </Button>

          <Button
            size="sm"
            variant="primary"
            onClick={() => setShowAddModal(true)}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Добавить
          </Button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {overview && Object.entries(overview.categories).map(([key, rawCat]) => {
          const cat = rawCat as LocalModelCategoryInfo;
          const Icon = categoryIcons[key] || FolderOpen;
          const isSelected = activeCategory === key;

          return (
            <button
              key={key}
              onClick={() => {
                setActiveCategory(key);
                setRuntimeError(null);
              }}
              className="p-2.5 rounded-xl border text-left transition-all flex items-center justify-between"
              style={{
                backgroundColor: isSelected ? 'var(--c-peach-surface)' : 'var(--c-bg-secondary)',
                borderColor: isSelected ? 'var(--c-peach-border)' : 'var(--c-border)',
                color: isSelected ? 'var(--c-peach-light)' : 'var(--c-text)'
              }}
            >
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="text-xs font-medium">{cat.name.split('(')[0].trim()}</span>
              </div>
              <Badge variant={isSelected ? 'peach' : 'neutral'} size="sm">
                {cat.count}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* Models List for Selected Category */}
      {currentCategoryInfo && (
        <div className="space-y-2">
          {currentCategoryInfo.files.length === 0 ? (
            <div className="p-8 text-center rounded-xl border border-dashed border-[var(--c-border)] text-xs text-[var(--c-text-muted)] space-y-2">
              <HardDrive className="w-8 h-8 mx-auto text-[var(--c-text-dim)] opacity-50" />
              <div>
                Файлы моделей в каталоге <code>models/{currentCategoryInfo.key}/</code> не найдены.
              </div>
              <div className="text-[11px] text-[var(--c-text-dim)]">
                Поместите файлы моделей (например <code>functiongemma-7b.gguf</code>) в каталог <code>models/{currentCategoryInfo.key}/</code> и нажмите «Пересканировать».
              </div>
            </div>
          ) : (
            currentCategoryInfo.files.map(file => {
              const isActive = file.isActive;
              const categoryRuntime = allRuntimes[currentCategoryInfo.key];
              const isLoadedInRam = Boolean(
                (categoryRuntime?.isLoaded && categoryRuntime?.loadedModel === file.filename) ||
                (runtime?.loadedCategories?.[currentCategoryInfo.key]?.loadedModel === file.filename)
              );

              return (
                <div
                  key={file.id}
                  onClick={() => handleSelectModel(currentCategoryInfo.key, file.filename)}
                  className="p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer select-none"
                  style={{
                    backgroundColor: isActive ? 'var(--c-peach-surface)' : 'var(--c-bg-secondary)',
                    borderColor: isActive ? 'var(--c-peach-border)' : 'var(--c-border)'
                  }}
                >
                  <div className="flex items-center gap-3">
                    {/* Format Icon */}
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: isActive ? 'var(--c-peach-surface)' : 'var(--c-bg-tertiary)',
                        color: isActive ? 'var(--c-peach-light)' : 'var(--c-text-muted)',
                        border: '1px solid var(--c-border)'
                      }}
                    >
                      <FileCode className="w-4 h-4" />
                    </div>

                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium font-mono" style={{ color: 'var(--c-text)' }}>
                          {file.filename}
                        </span>
                        <Badge variant={isActive ? 'peach' : 'neutral'} size="sm">
                          {file.format}
                        </Badge>
                        {file.quantization && (
                          <Badge variant="outline" size="sm">
                            {file.quantization}
                          </Badge>
                        )}
                        {file.parameters && (
                          <Badge variant="outline" size="sm">
                            {file.parameters}
                          </Badge>
                        )}
                        {isLoadedInRam && (
                          <Badge variant="peach" size="sm" className="animate-pulse">
                            В ОЗУ ({categoryRuntime?.containerName || runtime?.loadedCategories?.[currentCategoryInfo.key]?.containerName || 'Контейнер'})
                          </Badge>
                        )}
                      </div>

                      <div className="text-[11px] font-mono text-[var(--c-text-muted)]">
                        {file.sizeFormatted}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isActive && (
                      <Button
                        size="sm"
                        variant={isLoadedInRam ? 'outline' : 'primary'}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isLoadedInRam) {
                            handleUnloadFromRam(currentCategoryInfo.key);
                          } else {
                            handleLoadToRam(currentCategoryInfo.key, file.filename);
                          }
                        }}
                        disabled={loadingRam}
                      >
                        {isLoadedInRam ? 'Выгрузить' : 'В ОЗУ'}
                      </Button>
                    )}

                    {/* Selection Checkmark */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectModel(currentCategoryInfo.key, file.filename);
                      }}
                      className={`w-7 h-7 rounded-full flex items-center justify-center border transition-all ${
                        isActive
                          ? 'bg-[var(--c-peach-surface)] border-[var(--c-peach)] text-[var(--c-peach-light)]'
                          : 'border-[var(--c-border)] text-zinc-600 hover:text-zinc-400 hover:border-zinc-500'
                      }`}
                      title={isActive ? 'Модель активна' : 'Выбрать модель'}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Modal: Add model descriptor */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <Card className="w-full max-w-sm space-y-3" style={{ backgroundColor: 'var(--c-bg-secondary)' }}>
            <h4 className="text-xs font-semibold pb-1 border-b border-[var(--c-border)]" style={{ color: 'var(--c-text)' }}>
              Добавить дескриптор в models/{activeCategory}/
            </h4>

            <form onSubmit={handleCreateModelDescriptor} className="space-y-2.5 text-xs">
              <div>
                <label className="text-[11px] block mb-1 text-[var(--c-text-muted)]">Имя файла модели</label>
                <Input
                  placeholder="model.gguf"
                  value={newModelFilename}
                  onChange={e => setNewModelFilename(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-[11px] block mb-1 text-[var(--c-text-muted)]">Отображаемое название</label>
                <Input
                  placeholder="FunctionGemma 7B FineTuned"
                  value={newModelName}
                  onChange={e => setNewModelName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] block mb-1 text-[var(--c-text-muted)]">Квантование</label>
                  <Input
                    placeholder="Q4_K_M"
                    value={newModelQuant}
                    onChange={e => setNewModelQuant(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] block mb-1 text-[var(--c-text-muted)]">Параметры</label>
                  <Input
                    placeholder="7B"
                    value={newModelParams}
                    onChange={e => setNewModelParams(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
                <Button size="sm" variant="ghost" onClick={() => setShowAddModal(false)}>
                  Отмена
                </Button>
                <Button size="sm" variant="primary" type="submit">
                  Создать
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};
