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
  Plus
} from 'lucide-react';
import { LocalModelsOverview, LocalModelFile, LocalModelCategoryInfo } from '../../types';
import { soundEffects } from '../../utils/audioEffects';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';

export const LocalModelsTab: React.FC = () => {
  const [overview, setOverview] = useState<LocalModelsOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('basemodel');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [newModelFilename, setNewModelFilename] = useState('');
  const [newModelQuant, setNewModelQuant] = useState('Q4_K_M');
  const [newModelParams, setNewModelParams] = useState('7B');

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

  return (
    <div className="space-y-4">
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
              onClick={() => setActiveCategory(key)}
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
            <div className="p-8 text-center rounded-xl border border-dashed border-[var(--c-border)] text-xs text-[var(--c-text-muted)]">
              Файлы моделей в <code>models/{currentCategoryInfo.key}/</code> не найдены.
            </div>
          ) : (
            currentCategoryInfo.files.map(file => {
              const isActive = file.isActive;

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
                      <div className="flex items-center gap-2">
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
                      </div>

                      <div className="text-[11px] font-mono text-[var(--c-text-muted)]">
                        {file.sizeFormatted}
                      </div>
                    </div>
                  </div>

                  {/* Selection Checkmark: Green/Peach when selected, gray when not */}
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
                <label className="text-[11px] block mb-1 text-[var(--c-text-muted)]">Название</label>
                <Input
                  placeholder="FunctionGemma-7B"
                  value={newModelName}
                  onChange={e => setNewModelName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] block mb-1 text-[var(--c-text-muted)]">Квантование</label>
                  <Input
                    value={newModelQuant}
                    onChange={e => setNewModelQuant(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] block mb-1 text-[var(--c-text-muted)]">Параметры</label>
                  <Input
                    value={newModelParams}
                    onChange={e => setNewModelParams(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
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
