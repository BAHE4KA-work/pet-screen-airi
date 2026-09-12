import React, { useState } from 'react';
import { X, Copy, Check, Download, Sparkles, FileJson } from 'lucide-react';
import { ToolDefinition, ModelTrainingManifest } from '../../types';
import { buildFineTuningDataset, FineTuningDataset } from '../../utils/datasetBuilder';
import { soundEffects } from '../../utils/audioEffects';

interface FineTuningExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tools: ToolDefinition[];
  checksum: string;
  manifest: ModelTrainingManifest | null;
}

export const FineTuningExportModal: React.FC<FineTuningExportModalProps> = ({
  isOpen,
  onClose,
  tools,
  checksum,
  manifest
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const dataset: FineTuningDataset = buildFineTuningDataset(tools, checksum, manifest);
  const jsonString = JSON.stringify(dataset, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    soundEffects.playCompletionPing();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `functiongemma_tools_finetuning_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    soundEffects.playCompletionPing();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div
        className="w-full max-w-3xl rounded-2xl border shadow-2xl flex flex-col max-h-[88vh] overflow-hidden"
        style={{
          backgroundColor: '#12151d',
          borderColor: 'var(--c-border)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b"
          style={{ borderColor: 'var(--c-border)', backgroundColor: '#181c26' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-orange-500/20 text-orange-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-zinc-100">
                JSON-датасет для дообучения FunctionGemma
              </h3>
              <p className="text-xs text-zinc-400">
                Собрано инструментов: {dataset.totalTools} • Хеш сигнатуры: {checksum.substring(0, 10)}...
              </p>
            </div>
          </div>
          <button
            id="close-dataset-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Preview */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Формат: OpenAI Function Calling / Gemma Tools Schema v2.1</span>
            <div className="flex items-center gap-2">
              <button
                id="copy-dataset-btn"
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 border border-orange-500/40 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Скопировано!' : 'Копировать JSON'}
              </button>
              <button
                id="download-dataset-btn"
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Скачать .json
              </button>
            </div>
          </div>

          <div className="relative rounded-xl border overflow-hidden" style={{ borderColor: 'var(--c-border)' }}>
            <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800 text-[11px] text-zinc-400">
              <div className="flex items-center gap-1.5">
                <FileJson className="w-3.5 h-3.5 text-orange-400" />
                <span>dataset_manifest.json</span>
              </div>
              <span>{(jsonString.length / 1024).toFixed(1)} KB</span>
            </div>
            <pre className="p-4 bg-zinc-950 text-xs font-mono text-zinc-300 overflow-x-auto max-h-[380px] leading-relaxed select-all">
              {jsonString}
            </pre>
          </div>

          <p className="text-xs text-zinc-500 leading-relaxed">
            Этот JSON-объект содержит полные параметры, описания схем и few-shot примеры вызовов. Вы можете передать его в скрипт SFT (Supervised Fine-Tuning) для адаптации весов локальной FunctionGemma.
          </p>
        </div>
      </div>
    </div>
  );
};
