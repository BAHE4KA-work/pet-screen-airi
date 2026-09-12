import React from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Power,
  Sliders,
  Sparkles,
  ArrowRight,
  Fingerprint,
  FileDiff,
  Info
} from 'lucide-react';
import { ModelStatus, ModelTrainingManifest, ChecksumConflict } from '../types';

interface ChecksumVerifierProps {
  status: ModelStatus | null;
  manifest: ModelTrainingManifest | null;
  onIgnoreConflict: () => void;
  onToggleModel: () => void;
  onSyncManifest: () => void;
  onReload: () => void;
}

export const ChecksumVerifier: React.FC<ChecksumVerifierProps> = ({
  status,
  manifest,
  onIgnoreConflict,
  onToggleModel,
  onSyncManifest,
  onReload
}) => {
  if (!status) return null;

  const conflict = status.conflict;
  const hasConflict = conflict.hasConflict;
  const isIgnored = status.ignoreConflict;
  const isLoaded = status.loaded;

  return (
    <div
      id="checksum-verifier-container"
      className="relative z-20 w-full max-w-5xl mx-auto px-4 py-4 animate-fade-in text-slate-100"
    >
      <div className="bg-[#0b0e17]/85 backdrop-blur-2xl border border-teal-500/20 rounded-2xl shadow-2xl p-4 sm:p-6">
        {/* Title and High-Level Status */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Fingerprint className="w-5 h-5 text-teal-400" />
              <h2 className="text-base font-semibold text-slate-100">
                Верификация Критической Суммы Модели
              </h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-teal-500/10 border border-teal-500/30 text-teal-300">
                FunctionGemma Signature Gate
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Бэкенд сравнивает текущие модули и их версии с сигнатурой инструментов, на которых была обучена модель.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="checksum-reload-btn"
              onClick={onReload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-200 transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5 text-teal-400" />
              <span>Пересчитать хэши</span>
            </button>
          </div>
        </div>

        {/* Big Alert Banner */}
        <div
          id="checksum-main-status-banner"
          className={`p-4 rounded-xl border mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
            !hasConflict
              ? 'bg-teal-950/30 border-teal-500/40 text-teal-200'
              : !isLoaded
              ? 'bg-rose-950/30 border-rose-500/40 text-rose-200'
              : isIgnored
              ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
              : 'bg-orange-950/40 border-orange-500/50 text-orange-200'
          }`}
        >
          <div className="flex items-start gap-3">
            {!hasConflict ? (
              <ShieldCheck className="w-6 h-6 text-teal-400 shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert className="w-6 h-6 text-orange-400 shrink-0 mt-0.5" />
            )}
            <div>
              <h3 className="text-sm font-semibold mb-0.5">
                {!hasConflict
                  ? 'Критическая сумма совпадает: 100% совместимость'
                  : !isLoaded
                  ? 'Модель выгружена из-за несоответствия сигнатур'
                  : isIgnored
                  ? 'Обнаружен конфликт версий (Обход включен пользователем)'
                  : 'Конфликт критической суммы: исполнение заблокировано'}
              </h3>
              <p className="text-xs opacity-85">
                {!hasConflict
                  ? 'Все активные модули соответствуют обучающему датасету FunctionGemma.'
                  : 'Список доступных скриптов отличается от того, на чем обучалась модель. Возможны галлюцинации параметров.'}
              </p>
            </div>
          </div>

          {/* Conflict Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {hasConflict && (
              <button
                id="toggle-ignore-conflict-action-btn"
                onClick={onIgnoreConflict}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors border ${
                  isIgnored
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-200 hover:bg-amber-500/30'
                    : 'bg-orange-500/20 border-orange-500/40 text-orange-200 hover:bg-orange-500/30'
                }`}
              >
                {isIgnored ? 'Отключить игнорирование' : 'Игнорировать конфликт (Ctrl+I)'}
              </button>
            )}

            <button
              id="toggle-model-load-action-btn"
              onClick={onToggleModel}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors border ${
                !isLoaded
                  ? 'bg-teal-500/20 border-teal-500/40 text-teal-200 hover:bg-teal-500/30'
                  : 'bg-rose-500/20 border-rose-500/40 text-rose-200 hover:bg-rose-500/30'
              }`}
            >
              <Power className="w-3.5 h-3.5 inline mr-1" />
              {isLoaded ? 'Выгрузить модель (Ctrl+U)' : 'Загрузить модель'}
            </button>

            <button
              id="sync-manifest-action-btn"
              onClick={onSyncManifest}
              className="px-3 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-teal-200 text-xs font-mono transition-colors"
              title="Синхронизировать обучающий манифест с текущими версиями модулей"
            >
              Синхронизировать манифест
            </button>
          </div>
        </div>

        {/* Checksum Comparison Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Expected Checksum */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400">
                Ожидаемая сумма модели (Trained Manifest):
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-teal-300 border border-slate-800">
                {manifest?.modelName}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 font-mono text-xs text-amber-200 break-all border border-slate-800">
              {conflict.expectedChecksum}
            </div>
            <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
              <span>Обучено на: {manifest?.expectedToolsCount} инструментах</span>
              <span>Дата обучения: {manifest?.trainedAt ? new Date(manifest.trainedAt).toLocaleDateString() : 'N/A'}</span>
            </div>
          </div>

          {/* Actual Checksum */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400">
                Фактическая сумма модулей (Runtime Hashes):
              </span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                  !hasConflict
                    ? 'bg-teal-500/10 border-teal-500/30 text-teal-300'
                    : 'bg-orange-500/10 border-orange-500/30 text-orange-300'
                }`}
              >
                {!hasConflict ? 'MATCH' : 'MISMATCH'}
              </span>
            </div>
            <div
              className={`p-2.5 rounded-lg bg-slate-900 font-mono text-xs break-all border ${
                !hasConflict
                  ? 'text-teal-300 border-teal-500/30'
                  : 'text-orange-300 border-orange-500/40'
              }`}
            >
              {conflict.actualChecksum}
            </div>
            <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
              <span>Текущих активных инструментов: {status.activeToolsCount}</span>
              <span>Последняя проверка: {new Date(status.lastVerifiedAt).toLocaleTimeString()}</span>
            </div>
          </div>
        </div>

        {/* Detailed Diff of Discrepancies */}
        {hasConflict ? (
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-orange-400 flex items-center gap-1.5">
              <FileDiff className="w-4 h-4" />
              Детализация различий между кодом модулей и моделью
            </h3>

            {/* Altered tools */}
            {conflict.alteredTools.length > 0 && (
              <div className="p-3 rounded-xl bg-orange-950/20 border border-orange-500/30">
                <div className="text-xs font-medium text-orange-300 mb-2">
                  Измененные инструменты или версии ({conflict.alteredTools.length}):
                </div>
                <div className="space-y-2">
                  {conflict.alteredTools.map((t, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono"
                    >
                      <span className="text-slate-200 font-semibold">{t.name}</span>
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-slate-400">
                          обучен: <span className="text-teal-300">v{t.expectedVersion}</span> [{t.expectedHash}]
                        </span>
                        <ArrowRight className="w-3 h-3 text-orange-400" />
                        <span className="text-orange-300">
                          в коде: <span className="text-orange-200 font-bold">v{t.actualVersion}</span> [{t.actualHash}]
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Missing tools */}
            {conflict.missingTools.length > 0 && (
              <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30">
                <div className="text-xs font-medium text-rose-300 mb-2">
                  Отсутствуют в коде (модель обучена на них, но скрипты не найдены) ({conflict.missingTools.length}):
                </div>
                <div className="flex flex-wrap gap-2">
                  {conflict.missingTools.map((t, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-rose-950/50 border border-rose-500/40 text-rose-200 font-mono text-xs"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* New untrained tools */}
            {conflict.newUntrainedTools.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30">
                <div className="text-xs font-medium text-amber-300 mb-2">
                  Новые необученные инструменты (добавлены в код, но отсутствуют в весах) ({conflict.newUntrainedTools.length}):
                </div>
                <div className="flex flex-wrap gap-2">
                  {conflict.newUntrainedTools.map((t, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-amber-950/50 border border-amber-500/40 text-amber-200 font-mono text-xs"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 rounded-xl bg-teal-950/15 border border-teal-500/20 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-teal-400 mx-auto" />
            <div className="text-sm font-semibold text-teal-200">
              Полное соответствие обучающего датасета и модулей
            </div>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Все хэши инструментов и контрольная сумма совпадают с точностью до бита. Модель FunctionGemma может безопасно вызывать зарегистрированные функции.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
