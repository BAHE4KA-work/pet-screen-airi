import React, { useState, useEffect } from 'react';
import { Network, Cpu, Check, Sliders, ToggleLeft, ToggleRight, Sparkles } from 'lucide-react';
import { ModelCluster } from '../../types';
import { soundEffects } from '../../utils/audioEffects';

export const ModelRouterTab: React.FC = () => {
  const [clusters, setClusters] = useState<ModelCluster[]>([]);
  const [autoRouting, setAutoRouting] = useState(true);
  const [defaultModelId, setDefaultModelId] = useState('');
  const [loading, setLoading] = useState(false);
  const [testQuery, setTestQuery] = useState('какая нагрузка на процессор');
  const [matchedCluster, setMatchedCluster] = useState<string | null>(null);

  const fetchClusters = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/models/clusters');
      if (res.ok) {
        const data = await res.json();
        setClusters(data.clusters);
        setAutoRouting(data.autoRouting);
        setDefaultModelId(data.defaultModel?.id || '');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClusters();
  }, []);

  const handleToggleAutoRoute = async () => {
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

  const testRouting = () => {
    const q = testQuery.toLowerCase();
    for (const c of clusters) {
      if (c.keywords.some(k => q.includes(k.toLowerCase()))) {
        setMatchedCluster(c.name);
        soundEffects.playCompletionPing();
        return;
      }
    }
    const def = clusters.find(c => c.id === defaultModelId) || clusters[0];
    setMatchedCluster(def ? def.name + ' (Fallback)' : 'Стандартная модель');
    soundEffects.playCompletionPing();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div
        className="p-5 rounded-xl border"
        style={{
          backgroundColor: '#161922',
          borderColor: 'var(--c-border)'
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-orange-500/10 text-orange-400">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-zinc-100">Маршрутизация между LLM моделями</h3>
              <p className="text-xs text-zinc-400">
                Автоматическое распределение запросов к специализированным моделям по ключевым словам и семантике
              </p>
            </div>
          </div>

          <button
            id="toggle-auto-routing-btn"
            onClick={handleToggleAutoRoute}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors bg-zinc-900 border-zinc-700 text-zinc-200"
          >
            {autoRouting ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>Авто-маршрутизация включена</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-zinc-500"></span>
                <span>Фиксированная модель</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Model Clusters Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {clusters.map(cluster => {
          const isDefault = cluster.id === defaultModelId;
          return (
            <div
              key={cluster.id}
              className={`p-4 rounded-xl border transition-all ${
                isDefault
                  ? 'border-orange-500/50 bg-orange-500/[0.04]'
                  : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-orange-400" />
                  <span className="text-xs font-semibold text-zinc-200">{cluster.name}</span>
                </div>
                <button
                  id={`set-default-model-${cluster.id}`}
                  onClick={() => handleSetDefault(cluster.id)}
                  className={`text-[11px] px-2 py-0.5 rounded transition-colors ${
                    isDefault
                      ? 'bg-orange-500/20 text-orange-300 font-medium'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {isDefault ? 'По умолчанию' : 'Сделать главной'}
                </button>
              </div>

              <p className="text-xs text-zinc-400 mb-3">{cluster.description}</p>

              <div className="space-y-2 pt-2 border-t border-zinc-800/80 text-[11px]">
                <div className="flex items-center justify-between text-zinc-400">
                  <span>Модули инструментов:</span>
                  <span className="font-mono text-zinc-300">{cluster.moduleIds.join(', ')}</span>
                </div>
                <div className="flex items-center justify-between text-zinc-400">
                  <span>Эндпоинт:</span>
                  <span className="font-mono text-zinc-400 truncate max-w-[170px]">{cluster.endpoint}</span>
                </div>
                <div className="flex items-wrap gap-1 mt-1">
                  {cluster.keywords.slice(0, 4).map((kw, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-400">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Routing Test Playground */}
      <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
        <span className="text-xs font-medium text-zinc-300 block">Проверка маршрутизации запроса</span>
        <div className="flex items-center gap-2">
          <input
            id="test-routing-input"
            type="text"
            value={testQuery}
            onChange={e => setTestQuery(e.target.value)}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-orange-500"
            placeholder="Введите проверочный запрос..."
          />
          <button
            id="test-routing-btn"
            onClick={testRouting}
            className="px-3.5 py-2 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors"
          >
            Маршрутизировать
          </button>
        </div>
        {matchedCluster && (
          <div className="text-xs text-zinc-300 flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/30">
            <Sparkles className="w-3.5 h-3.5 text-orange-400" />
            <span>Запрос будет направлен в кластер:</span>
            <strong className="text-orange-400">{matchedCluster}</strong>
          </div>
        )}
      </div>
    </div>
  );
};
