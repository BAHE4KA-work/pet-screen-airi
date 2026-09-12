import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Terminal,
  Cpu,
  CornerDownLeft,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Copy,
  Check,
  RotateCcw,
  Zap,
  ArrowRight
} from 'lucide-react';
import { ModelStatus, AccuracyRating } from '../types';

interface QueryExecutionResult {
  success: boolean;
  toolCalled?: string;
  toolArguments?: Record<string, unknown>;
  result?: unknown;
  durationMs: number;
  source?: string;
  logId?: string;
  rawResponse?: string;
  error?: string;
}

interface CommandOverlayProps {
  status: ModelStatus | null;
  onExecuteQuery: (prompt: string) => Promise<QueryExecutionResult>;
  onIgnoreConflict: () => void;
  onToggleModel: () => void;
  onRateAccuracy: (logId: string, rating: AccuracyRating, note?: string) => void;
  compactMode: boolean;
  setCompactMode: (v: boolean) => void;
  onClose: () => void;
}

export const CommandOverlay: React.FC<CommandOverlayProps> = ({
  status,
  onExecuteQuery,
  onIgnoreConflict,
  onToggleModel,
  onRateAccuracy,
  compactMode,
  setCompactMode,
  onClose
}) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<QueryExecutionResult | null>(null);
  const [lastPrompt, setLastPrompt] = useState('');
  const [copied, setCopied] = useState(false);
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [feedbackNote, setFeedbackNote] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus input on mount
    inputRef.current?.focus();
  }, []);

  const samplePrompts = [
    { text: 'Какая сейчас загрузка CPU и свободной памяти?', tool: 'get_metrics' },
    { text: 'Найди запущенные процессы chrome и редактора', tool: 'manage_processes' },
    { text: 'Прочитай текущее содержимое буфера обмена', tool: 'clipboard' },
    { text: 'Найди все файлы в проекте с расширением *.ts', tool: 'file_explorer' },
    { text: 'Поищи в заметках информацию о FunctionGemma', tool: 'find_notes' },
    { text: 'Выполни команду uname -a в консоли', tool: 'run_command' }
  ];

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || loading) return;

    const currentQuery = prompt.trim();
    setLoading(true);
    setLastPrompt(currentQuery);
    setFeedbackSaved(false);
    setFeedbackNote('');

    try {
      const res = await onExecuteQuery(currentQuery);
      setLastResult(res);
    } catch (err: unknown) {
      setLastResult({
        success: false,
        durationMs: 0,
        error: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyResult = () => {
    if (!lastResult) return;
    navigator.clipboard.writeText(JSON.stringify(lastResult.result || lastResult.error, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRate = (rating: AccuracyRating) => {
    if (!lastResult?.logId) return;
    onRateAccuracy(lastResult.logId, rating, feedbackNote || undefined);
    setFeedbackSaved(true);
  };

  const hasConflict = status?.conflict.hasConflict;
  const isBlocked = hasConflict && !status?.ignoreConflict;

  return (
    <div
      id="command-overlay-wrapper"
      className="relative z-20 w-full max-w-4xl mx-auto px-4 py-4 sm:py-8 flex flex-col items-center animate-fade-in"
    >
      {/* Translucent HUD Floating Card */}
      <div
        id="hud-floating-container"
        className="w-full bg-[#0a0d14]/85 backdrop-blur-2xl border border-teal-500/20 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] p-4 sm:p-6 text-slate-100 transition-all duration-300"
      >
        {/* Conflict Warning Banner if critical sum mismatch */}
        {hasConflict && (
          <div
            id="hud-checksum-conflict-banner"
            className={`mb-4 p-3 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs transition-colors ${
              isBlocked
                ? 'bg-orange-950/40 border-orange-500/50 text-orange-200'
                : 'bg-orange-950/20 border-orange-500/30 text-orange-300/80'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-orange-300">
                  {isBlocked ? 'Исполнение заблокировано: ' : 'Предупреждение: '}
                </span>
                Критическая сумма инструментов отличается от версии обучения модели (
                {status.conflict.mismatchedCount} несовпадений).
                {isBlocked && (
                  <p className="text-[11px] text-orange-300/80 mt-0.5">
                    Модель может ошибиться в сигнатурах. Вы можете проигнорировать несоответствие или выгрузить модель.
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              {isBlocked ? (
                <button
                  id="hud-ignore-conflict-btn"
                  onClick={onIgnoreConflict}
                  className="px-2.5 py-1 rounded bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-200 font-mono text-[11px] transition-colors"
                >
                  Игнорировать (Ctrl+I)
                </button>
              ) : (
                <span className="text-[11px] text-teal-400 font-mono px-2 py-0.5 rounded bg-teal-500/10 border border-teal-500/20">
                  Режим обхода активен
                </span>
              )}
              <button
                id="hud-unload-model-btn"
                onClick={onToggleModel}
                className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 font-mono text-[11px] transition-colors"
              >
                Выгрузить (Ctrl+U)
              </button>
            </div>
          </div>
        )}

        {/* Model Unloaded Alert */}
        {status && !status.loaded && (
          <div
            id="hud-model-unloaded-banner"
            className="mb-4 p-3 rounded-xl bg-rose-950/30 border border-rose-500/40 flex items-center justify-between text-xs text-rose-200"
          >
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Модель выгружена из памяти. Вызовы инструментов временно отключены.</span>
            </div>
            <button
              id="hud-reload-model-btn"
              onClick={onToggleModel}
              className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 font-mono text-[11px] transition-colors"
            >
              Загрузить модель (Ctrl+U)
            </button>
          </div>
        )}

        {/* Main Search / Query Input Bar */}
        <form onSubmit={handleSubmit} className="relative">
          <div className="relative flex items-center">
            <div className="absolute left-3.5 text-teal-400 pointer-events-none">
              <Search className="w-5 h-5" />
            </div>
            <input
              ref={inputRef}
              id="hud-query-input"
              type="text"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Введите системный запрос или команду для FunctionGemma..."
              disabled={loading || !status?.loaded}
              className="w-full pl-11 pr-24 py-3.5 bg-slate-900/90 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-hidden focus:border-teal-400/80 focus:ring-1 focus:ring-teal-400/40 transition-all font-sans"
            />
            <div className="absolute right-2 flex items-center gap-1.5">
              <button
                type="submit"
                id="hud-submit-query-btn"
                disabled={loading || !prompt.trim() || !status?.loaded}
                className="px-3 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-teal-200 text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                {loading ? (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-teal-400 border-t-transparent animate-spin" />
                ) : (
                  <>
                    <span>Выполнить</span>
                    <CornerDownLeft className="w-3 h-3 text-orange-300" />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Quick Sample Query Chips */}
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-[11px] text-slate-500 shrink-0 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-orange-400" />
            Примеры:
          </span>
          {samplePrompts.map((sp, idx) => (
            <button
              key={idx}
              type="button"
              id={`quick-chip-${idx}`}
              onClick={() => {
                setPrompt(sp.text);
                inputRef.current?.focus();
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 text-slate-300 text-[11px] whitespace-nowrap transition-colors flex items-center gap-1.5"
            >
              <span>{sp.text}</span>
              <span className="text-[9px] font-mono text-teal-400/80">({sp.tool})</span>
            </button>
          ))}
        </div>

        {/* Live Execution Result Container */}
        {lastResult && (
          <div
            id="hud-execution-result-card"
            className="mt-5 p-4 rounded-xl bg-slate-950/80 border border-teal-500/25 space-y-3"
          >
            {/* Top row: Status, Tool Name, Duration */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2">
                {lastResult.success ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-teal-300">
                    <CheckCircle2 className="w-4 h-4 text-teal-400" />
                    Успешно исполнено
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-semibold text-rose-300">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    {lastResult.error ? 'Ошибка вызова' : 'Инструмент не найден'}
                  </span>
                )}

                {lastResult.toolCalled && (
                  <span className="px-2 py-0.5 rounded bg-teal-500/10 border border-teal-500/30 text-teal-300 font-mono text-xs">
                    tool: {lastResult.toolCalled}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-orange-400" />
                  <span>{lastResult.durationMs} ms</span>
                </span>
                {lastResult.source && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                    {lastResult.source}
                  </span>
                )}
                <button
                  id="copy-result-json-btn"
                  onClick={handleCopyResult}
                  className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                  title="Скопировать JSON результат"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Gemma Token Calling Representation */}
            {lastResult.rawResponse && (
              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 font-mono text-xs">
                <div className="text-[10px] text-orange-300/80 mb-1 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-orange-400" />
                  Синтаксис FunctionGemma Token Call:
                </div>
                <div className="text-teal-300/90 overflow-x-auto whitespace-pre">
                  {lastResult.rawResponse}
                </div>
              </div>
            )}

            {/* Arguments Inferred */}
            {lastResult.toolArguments && Object.keys(lastResult.toolArguments).length > 0 && (
              <div className="text-xs">
                <span className="text-slate-400">Извлечённые аргументы модели: </span>
                <span className="font-mono text-amber-200">
                  {JSON.stringify(lastResult.toolArguments)}
                </span>
              </div>
            )}

            {/* Result payload formatted */}
            <div className="max-h-64 overflow-y-auto rounded-lg bg-slate-950 p-3 border border-slate-800/80 font-mono text-xs text-slate-300">
              <pre className="whitespace-pre-wrap leading-relaxed">
                {JSON.stringify(lastResult.result || lastResult.error || 'Нет данных', null, 2)}
              </pre>
            </div>

            {/* Accuracy Feedback & Model Tuning Controls */}
            {lastResult.logId && (
              <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Оценка точности ответа:</span>
                  <button
                    id="rate-exact-btn"
                    onClick={() => handleRate('EXACT')}
                    className="px-2 py-0.5 rounded bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-300 text-[11px] transition-colors"
                  >
                    Точно (Exact)
                  </button>
                  <button
                    id="rate-hallucinated-btn"
                    onClick={() => handleRate('HALLUCINATED_ARGS')}
                    className="px-2 py-0.5 rounded bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/30 text-orange-300 text-[11px] transition-colors"
                  >
                    Галлюцинация аргументов
                  </button>
                  <button
                    id="rate-wrong-tool-btn"
                    onClick={() => handleRate('WRONG_TOOL')}
                    className="px-2 py-0.5 rounded bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[11px] transition-colors"
                  >
                    Не тот инструмент
                  </button>
                </div>

                {feedbackSaved ? (
                  <span className="text-xs text-teal-400 flex items-center gap-1 font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Метка сохранена в датасет
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={feedbackNote}
                      onChange={e => setFeedbackNote(e.target.value)}
                      placeholder="Заметка для дообучения..."
                      className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-teal-400"
                    />
                    <button
                      id="save-feedback-note-btn"
                      onClick={() => handleRate('CORRECTED')}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition-colors"
                    >
                      Сохранить
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Bottom helper info */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-orange-300 font-mono text-[10px]">
                Enter
              </kbd>
              <span>выполнить</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-teal-300 font-mono text-[10px]">
                Alt+Space
              </kbd>
              <span>скрыть оверлей</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
            <span>Локальный парсер FunctionGemma активен</span>
          </div>
        </div>
      </div>
    </div>
  );
};
