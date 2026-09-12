import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { KeyValueViewData } from '../../types';

interface KeyValueCardViewProps {
  data: KeyValueViewData;
}

export const KeyValueCardView: React.FC<KeyValueCardViewProps> = ({ data }) => {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleCopy = (val: string, idx: number) => {
    navigator.clipboard.writeText(val);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const entries = data.entries || [];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col divide-y divide-white/5 rounded-xl border border-white/5 overflow-hidden bg-black/20">
        {entries.map((entry, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between p-2.5 text-xs hover:bg-white/[0.02] transition-colors"
          >
            <span className="text-[var(--c-text-muted)] font-medium">{entry.label}</span>

            <div className="flex items-center gap-2">
              <span
                className={`font-mono text-xs ${
                  entry.highlight ? 'font-bold text-[var(--c-peach)]' : 'text-[var(--c-text)]'
                }`}
              >
                {String(entry.value)}
              </span>

              <button
                onClick={() => handleCopy(String(entry.value), idx)}
                className="p-1 rounded hover:bg-white/10 text-[var(--c-text-dim)] hover:text-[var(--c-text)] transition-colors"
                title="Копировать значение"
              >
                {copiedIdx === idx ? (
                  <Check className="w-3 h-3 text-[var(--c-mint)]" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
