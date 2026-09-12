import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { TextViewData } from '../../types';

interface TextCardViewProps {
  data: TextViewData;
}

export const TextCardView: React.FC<TextCardViewProps> = ({ data }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(data.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="p-3 rounded-xl bg-black/25 border border-white/5 text-xs font-mono text-[var(--c-text)] leading-relaxed whitespace-pre-wrap max-h-[260px] overflow-y-auto select-text">
        {data.content}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-[var(--c-text-muted)] hover:text-[var(--c-text)] transition-colors border border-white/5"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-[var(--c-mint)]" />
              <span>Скопировано!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Скопировать</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
