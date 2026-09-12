import React, { useState } from 'react';
import { Search, Layers } from 'lucide-react';
import { ListViewData } from '../../types';

interface ListCardViewProps {
  data: ListViewData;
}

export const ListCardView: React.FC<ListCardViewProps> = ({ data }) => {
  const [filter, setFilter] = useState('');
  const items = data.items || [];

  const filtered = filter.trim()
    ? items.filter(
        it =>
          it.title.toLowerCase().includes(filter.toLowerCase()) ||
          (it.subtitle && it.subtitle.toLowerCase().includes(filter.toLowerCase())) ||
          (it.badge && it.badge.toLowerCase().includes(filter.toLowerCase()))
      )
    : items;

  return (
    <div className="flex flex-col gap-2.5">
      {/* Search/filter if list is large */}
      {items.length > 4 && (
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-text-dim)]" />
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Фильтр элементов..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs bg-black/30 border border-white/5 text-[var(--c-text)] placeholder-[var(--c-text-dim)] focus:outline-none focus:border-[var(--c-peach)]/50"
          />
        </div>
      )}

      {/* Items list */}
      <div className="flex flex-col gap-1.5 max-h-[280px] overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <div className="py-6 text-center text-xs text-[var(--c-text-dim)]">
            {data.emptyText || 'Нет записей для отображения'}
          </div>
        ) : (
          filtered.map((item, idx) => (
            <div
              key={item.id ?? idx}
              className="p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 transition-colors flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-xs font-medium text-[var(--c-text)] truncate">{item.title}</div>
                {item.subtitle && (
                  <div className="text-[11px] text-[var(--c-text-dim)] truncate">{item.subtitle}</div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {item.badge && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-white/5 text-[var(--c-text-muted)] border border-white/5">
                    {item.badge}
                  </span>
                )}
                {item.value && (
                  <span className="text-xs font-mono font-semibold text-[var(--c-peach)]">
                    {item.value}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[11px] text-[var(--c-text-dim)]">
        <span>Всего: {items.length}</span>
        {filter && <span>Отфильтровано: {filtered.length}</span>}
      </div>
    </div>
  );
};
