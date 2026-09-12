import React, { useState, useEffect } from 'react';
import { Network, Cpu, Check, Sparkles, CheckSquare, Square, Info } from 'lucide-react';
import { ModelCluster, LocalModelsOverview } from '../../types';
import { soundEffects } from '../../utils/audioEffects';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';

const ALL_AVAILABLE_MODULES = [
  'system',
  'time',
  'calc',
  'notes',
  'files',
  'storage',
  'search',
  'developer'
];

export const ModelRouterTab: React.FC = () => {
  const [clusters, setClusters] = useState<ModelCluster[]>([]);
  const [autoRouting, setAutoRouting] = useState(true);
  const [defaultModelId, setDefaultModelId] = useState('');
  const [loading, setLoading] = useState(false);
  const [testQuery, setTestQuery] = useState('');
  const [matchedCluster, setMatchedCluster] = useState<string | null>(null);
  const [localOverview, setLocalOverview] = useState<LocalModelsOverview | null>(null);

  const fetchClustersAndModels = async () => {
    setLoading(true);
    try {
      const [resClusters, resLocal] = await Promise.all([
        fetch('/api/models/clusters'),
        fetch('/api/models/local')
      ]);

      if (resClusters.ok) {
        const data = await resClusters.json();
        setClusters(data.clusters);
        setAutoRouting(data.autoRouting);
        setDefaultModelId(data.defaultModel?.id || '');
      }

      if (resLocal.ok) {
        const localData = await resLocal.json();
        setLocalOverview(localData);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClustersAndModels();
  }, []);

  const totalBaseModels = localOverview?.categories?.basemodel?.count ?? 0;
  const isSingleModel = totalBaseModels <= 1;
  const singleModelName = localOverview?.categories?.basemodel?.activeModel || 'Локальная модель';

  const handleToggleAutoRoute = async () => {
    if (isSingleModel) return;
    const next = !autoRouting;
    setAutoRouting(next);
    try {
      await fetch('/api/models/autoroute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next })
      });
      soundEffects.playCompletionPing();
    } catch {
      setAutoRouting(!next);
    }
  };

  const handleSetDefault = async (id: string) => {
    if (isSingleModel) return;
    setDefaultModelId(id);
    try {
      await fetch('/api/models/default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      soundEffects.playCompletionPing();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectAllModules = async (cluster: ModelCluster) => {
    if (isSingleModel) return;
    const updated = {
      ...cluster,
      moduleIds: [...ALL_AVAILABLE_MODULES]
    };
    try {
      const res = await fetch('/api/models/clusters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        const data = await res.json();
        setClusters(data.clusters || []);
        soundEffects.playCompletionPing();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeselectAllModules = async (cluster: ModelCluster) => {
    if (isSingleModel) return;
    const updated = {
      ...cluster,
      moduleIds: []
    };
    try {
      const res = await fetch('/api/models/clusters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        const data = await res.json();
        setClusters(data.clusters || []);
        soundEffects.playCompletionPing();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleModule = async (cluster: ModelCluster, modId: string) => {
    if (isSingleModel) return;
    const exists = cluster.moduleIds.includes(modId);
    const nextModules = exists
      ? cluster.moduleIds.filter(m => m !== modId)
      : [...cluster.moduleIds, modId];

    const updated = {
      ...cluster,
      moduleIds: nextModules
    };
    try {
      const res = await fetch('/api/models/clusters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        const data = await res.json();
        setClusters(data.clusters || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const testRouting = () => {
    if (!testQuery.trim()) return;
    if (isSingleModel) {
      setMatchedCluster(singleModelName);
      soundEffects.playCompletionPing();
      return;
    }
    const q = testQuery.toLowerCase();
    for (const c of clusters) {
      if (c.keywords.some(k => q.includes(k.toLowerCase()))) {
        setMatchedCluster(c.name);
        soundEffects.playCompletionPing();
        return;
      }
    }
    const def = clusters.find(c => c.id === defaultModelId) || clusters[0];
    setMatchedCluster(def ? def.name : 'Стандартная модель');
    soundEffects.playCompletionPing();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[var(--c-border)]">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-[var(--c-peach)]" />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
            Маршрутизация
          </h3>
        </div>

        {!isSingleModel && (
          <Button
            size="sm"
            variant={autoRouting ? 'primary' : 'outline'}
            onClick={handleToggleAutoRoute}
            icon={<span className={`w-2 h-2 rounded-full ${autoRouting ? 'bg-zinc-950' : 'bg-zinc-500'}`} />}
          >
            {autoRouting ? 'Авто-маршрутизация' : 'Фиксированная'}
          </Button>
        )}
      </div>

      {/* Single Model Detected Banner / Disabled State */}
      {isSingleModel ? (
        <Card className="p-4 space-y-3" style={{ backgroundColor: 'var(--c-bg-secondary)' }}>
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-[var(--c-peach-surface)] text-[var(--c-peach-light)]">
              <Info className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>
                Маршрутизация не требуется ({totalBaseModels === 1 ? '1 модель' : '0 моделей'})
              </h4>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-muted)' }}>
                В каталоге <code>models/basemodel/</code> обнаружена только одна базовая модель (<strong>{singleModelName}</strong>).
                Интерфейс маршрутизации отключен, так как все запросы автоматически направляются в активную модель без лишних накладных расходов.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--c-border)] flex items-center justify-between text-xs">
            <span style={{ color: 'var(--c-text-muted)' }}>Активная целевая модель:</span>
            <span className="font-mono font-medium text-[var(--c-peach-light)]">
              {singleModelName}
            </span>
          </div>
        </Card>
      ) : (
        <>
          {/* Multi-Model Clusters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {clusters.map(cluster => {
              const isDefault = cluster.id === defaultModelId;

              return (
                <Card
                  key={cluster.id}
                  variant={isDefault ? 'active' : 'default'}
                  className="space-y-2.5 p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5 text-[var(--c-peach)]" />
                      <span className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>
                        {cluster.name}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSetDefault(cluster.id)}
                      className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${
                        isDefault
                          ? 'bg-[var(--c-peach)] text-zinc-950'
                          : 'text-[var(--c-text-muted)] hover:text-[var(--c-text)] bg-[var(--c-bg-tertiary)]'
                      }`}
                    >
                      {isDefault ? 'Основная' : 'Сделать главной'}
                    </button>
                  </div>

                  <div className="pt-2 border-t border-[var(--c-border)] space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span style={{ color: 'var(--c-text-muted)' }}>Назначенные модули:</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSelectAllModules(cluster)}
                          className="text-[10px] text-[var(--c-peach-light)] hover:underline flex items-center gap-0.5"
                        >
                          <CheckSquare className="w-3 h-3" />
                          Выбрать всё
                        </button>
                        <span className="text-[var(--c-border)]">•</span>
                        <button
                          type="button"
                          onClick={() => handleDeselectAllModules(cluster)}
                          className="text-[10px] text-[var(--c-text-muted)] hover:underline flex items-center gap-0.5"
                        >
                          <Square className="w-3 h-3" />
                          Снять выбор
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {ALL_AVAILABLE_MODULES.map(mod => {
                        const isAssigned = cluster.moduleIds.includes(mod);
                        return (
                          <button
                            key={mod}
                            type="button"
                            onClick={() => handleToggleModule(cluster, mod)}
                            className={`text-[10px] px-1.5 py-0.5 rounded font-mono border transition-all ${
                              isAssigned
                                ? 'bg-[var(--c-peach-surface)] border-[var(--c-peach-border)] text-[var(--c-peach-light)]'
                                : 'bg-transparent border-[var(--c-border)] text-[var(--c-text-muted)] opacity-60 hover:opacity-100'
                            }`}
                          >
                            {mod}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Compact Query Test */}
          <Card className="p-3 space-y-2">
            <div className="text-xs font-medium" style={{ color: 'var(--c-text-muted)' }}>
              Проверка маршрутизации
            </div>

            <div className="flex items-center gap-2">
              <Input
                placeholder="Введите тестовый запрос..."
                value={testQuery}
                onChange={e => setTestQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && testRouting()}
              />
              <Button size="md" variant="secondary" onClick={testRouting}>
                Проверить
              </Button>
            </div>

            {matchedCluster && (
              <div className="text-xs flex items-center gap-1.5 pt-1 text-[var(--c-peach-light)]">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Направление: <strong>{matchedCluster}</strong></span>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};
