import React from 'react';
import { Cpu, HardDrive, Activity, Server } from 'lucide-react';
import { MetricsViewData } from '../../types';

interface MetricsCardViewProps {
  data: MetricsViewData;
}

export const MetricsCardView: React.FC<MetricsCardViewProps> = ({ data }) => {
  const cpuVal = Math.min(100, Math.max(0, data.cpuPercent || 0));
  const memTotal = data.memTotalMb || 1;
  const memUsed = data.memUsedMb || 0;
  const memPercent = Math.min(100, Math.round((memUsed / memTotal) * 100));

  return (
    <div className="flex flex-col gap-3 py-1">
      {/* CPU Usage Block */}
      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <div className="flex items-center gap-1.5 text-[var(--c-text-muted)] font-medium">
            <Cpu className="w-3.5 h-3.5 text-[var(--c-peach)]" />
            <span>Нагрузка процессора</span>
          </div>
          <span className="font-mono font-semibold text-[var(--c-peach)]">{cpuVal}%</span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${cpuVal}%`,
              backgroundColor: cpuVal > 80 ? '#ef4444' : cpuVal > 50 ? 'var(--c-peach)' : 'var(--c-mint)'
            }}
          />
        </div>

        {data.cpuModel && (
          <div className="text-[10px] text-[var(--c-text-dim)] mt-1.5 truncate">
            {data.cpuModel} ({data.cpuCores || 4} cores)
          </div>
        )}
      </div>

      {/* RAM Memory Block */}
      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <div className="flex items-center gap-1.5 text-[var(--c-text-muted)] font-medium">
            <HardDrive className="w-3.5 h-3.5 text-[var(--c-mint)]" />
            <span>Оперативная память</span>
          </div>
          <span className="font-mono font-semibold text-[var(--c-mint)]">
            {data.memPercent || `${memPercent}%`}
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 bg-[var(--c-mint)]"
            style={{ width: `${memPercent}%` }}
          />
        </div>

        <div className="flex justify-between text-[10px] text-[var(--c-text-dim)] mt-1.5">
          <span>Выделено: {memUsed} MB</span>
          <span>Всего: {memTotal} MB</span>
        </div>
      </div>

      {/* System info pills */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {data.uptime && (
          <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-[var(--c-peach)] shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] text-[var(--c-text-dim)] uppercase">Время работы</div>
              <div className="font-mono text-xs text-[var(--c-text)] truncate">{data.uptime}</div>
            </div>
          </div>
        )}

        {data.platform && (
          <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5 flex items-center gap-2">
            <Server className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] text-[var(--c-text-dim)] uppercase">ОС Хоста</div>
              <div className="text-xs text-[var(--c-text)] truncate">{data.platform}</div>
            </div>
          </div>
        )}
      </div>

      {data.loadAverage && data.loadAverage.length > 0 && (
        <div className="text-[11px] text-[var(--c-text-dim)] px-1 flex items-center justify-between">
          <span>Средняя нагрузка (1m / 5m / 15m):</span>
          <span className="font-mono text-[var(--c-text-muted)]">{data.loadAverage.join(' / ')}</span>
        </div>
      )}
    </div>
  );
};
