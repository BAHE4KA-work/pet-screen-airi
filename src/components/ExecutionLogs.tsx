import React, { useState } from 'react';
import {
  ListFilter,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Clock,
  Search,
  Zap,
  TrendingUp,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  Sparkles
} from 'lucide-react';
import { ExecutionLog, AccuracyRating } from '../types';

interface ExecutionLogsProps {
  logs: ExecutionLog[];
  stats: {
    total: number;
    exact: number;
    hallucinated: number;
    wrongTool: number;
    failed: number;
    unrated: number;
    accuracyPercent: number;
  };
  onRateAccuracy: (id: string, rating: AccuracyRating, note?: string) => void;
  onExport: (format: 'json' | 'jsonl') => void;
}

export const ExecutionLogs: React.FC<ExecutionLogsProps> = ({
  logs,
  stats,
  onRateAccuracy,
  onExport
}) => {
  const [filterRating, setFilterRating] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  const filteredLogs = logs.filter(log => {
    if (filterRating !== 'ALL' && log.accuracyRating !== filterRating) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        log.prompt.toLowerCase().includes(q) ||
        (log.toolCalled && log.toolCalled.toLowerCase().includes(q)) ||
        (log.userFeedbackNote && log.userFeedbackNote.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleSaveNote = (id: string, currentRating: AccuracyRating) => {
    onRateAccuracy(id, currentRating, noteText);
    setEditingNoteId(null);
    setNoteText('');
  };

  const getRatingBadge = (rating: AccuracyRating) => {
    switch (rating) {
      case 'EXACT':
        return (
          <span className="px-2 py-0.5 rounded-full bg-teal-500/15 border border-teal-500/30 text-teal-300 font-mono text-[10px] flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-teal-400" />
            Точно (Exact)
          </span>
        );
      case 'HALLUCINATED_ARGS':
        return (
          <span className="px-2 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-300 font-mono text-[10px] flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-orange-400" />
            Галлюцинация аргументов
          </span>
        );
      case 'WRONG_TOOL':
        return (
          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-[10px] flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            Неверный инструмент
          </span>
        );
      case 'FAILED':
        return (
          <span className="px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 font-mono text-[10px] flex items-center gap-1">
            <XCircle className="w-3 h-3 text-rose-400" />
            Ошибка
          </span>
        );
      case 'CORRECTED':
        return (
          <span className="px-2 py-0.5 rounded-full bg-teal-500/20 border border-teal-400/40 text-teal-200 font-mono text-[10px] flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-teal-300" />
            Скорректировано
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 font-mono text-[10px] flex items-center gap-1">
            <HelpCircle className="w-3 h-3" />
            Не оценено
          </span>
        );
    }
  };

  return (
    <div
      id="execution-logs-container"
      className="relative z-20 w-full max-w-5xl mx-auto px-4 py-4 animate-fade-in text-slate-100"
    >
      <div className="bg-[#0b0e17]/85 backdrop-blur-2xl border border-teal-500/20 rounded-2xl shadow-2xl p-4 sm:p-6">
        {/* Top bar with Export */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <ListFilter className="w-5 h-5 text-teal-400" />
              <h2 className="text-base font-semibold text-slate-100">
                Логирование Выполнения и Анализ Точности
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Анализ точности выбора инструментов и генерации аргументов для последующей корректировки весов модели.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="export-logs-json-btn"
              onClick={() => onExport('json')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-200 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-teal-400" />
              <span>Экспорт JSON</span>
            </button>

            <button
              id="export-logs-jsonl-btn"
              onClick={() => onExport('jsonl')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-xs text-teal-200 font-medium transition-colors"
              title="Экспорт в формате диалогов FunctionGemma для дообучения"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-teal-300" />
              <span>Датасет для Fine-Tuning (JSONL)</span>
            </button>
          </div>
        </div>

        {/* Stats Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between">
            <span className="text-[11px] text-slate-400 font-mono">Точность модели</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-bold text-teal-300 font-mono">{stats.accuracyPercent}%</span>
              <span className="text-[10px] text-teal-400/80 font-mono">({stats.exact}/{stats.total - stats.unrated})</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between">
            <span className="text-[11px] text-slate-400 font-mono">Точные вызовы</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-bold text-teal-400 font-mono">{stats.exact}</span>
              <span className="text-[10px] text-slate-500 font-mono">из {stats.total}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between">
            <span className="text-[11px] text-slate-400 font-mono">Галлюцинации</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-bold text-orange-300 font-mono">{stats.hallucinated}</span>
              <span className="text-[10px] text-orange-400/80 font-mono">args/params</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between">
            <span className="text-[11px] text-slate-400 font-mono">Неверный инструмент</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-bold text-amber-300 font-mono">{stats.wrongTool}</span>
              <span className="text-[10px] text-amber-400/80 font-mono">mismatches</span>
            </div>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Поиск по тексту запроса или инструменту..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-teal-400"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400 text-[11px] mr-1">Фильтр:</span>
            {['ALL', 'EXACT', 'HALLUCINATED_ARGS', 'WRONG_TOOL', 'FAILED'].map(r => (
              <button
                key={r}
                id={`filter-rating-${r}`}
                onClick={() => setFilterRating(r)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-colors ${
                  filterRating === r
                    ? 'bg-teal-500/20 text-teal-200 border border-teal-500/40'
                    : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
                }`}
              >
                {r === 'ALL'
                  ? 'Все'
                  : r === 'EXACT'
                  ? 'Точные'
                  : r === 'HALLUCINATED_ARGS'
                  ? 'Галлюцинации'
                  : r === 'WRONG_TOOL'
                  ? 'Не тот тул'
                  : 'Ошибки'}
              </button>
            ))}
          </div>
        </div>

        {/* Logs Table / List */}
        <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              Записи в журнале не найдены по указанным критериям.
            </div>
          ) : (
            filteredLogs.map(log => {
              const isExpanded = expandedLogId === log.id;
              return (
                <div
                  key={log.id}
                  id={`log-entry-${log.id}`}
                  className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/90 hover:border-slate-700 transition-all text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-slate-500">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      {log.toolCalled ? (
                        <span className="font-mono text-teal-300 font-semibold px-2 py-0.5 rounded bg-teal-500/10 border border-teal-500/30">
                          {log.toolCalled}
                        </span>
                      ) : (
                        <span className="font-mono text-rose-300 px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/30">
                          no_tool
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3 text-orange-400" />
                        {log.durationMs}ms
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {getRatingBadge(log.accuracyRating)}
                      <button
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className="p-1 rounded text-slate-400 hover:text-slate-200"
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* User query text */}
                  <div className="text-slate-200 font-sans mb-1.5 pl-0.5">
                    <span className="text-slate-500 text-[11px] font-mono mr-1">Запрос:</span>
                    "{log.prompt}"
                  </div>

                  {/* Arguments or error note */}
                  {log.toolArguments && Object.keys(log.toolArguments).length > 0 && (
                    <div className="text-[11px] text-slate-400 font-mono mb-2">
                      <span className="text-slate-500">Аргументы: </span>
                      <span className="text-amber-200">{JSON.stringify(log.toolArguments)}</span>
                    </div>
                  )}

                  {/* Feedback Note if present */}
                  {log.userFeedbackNote && (
                    <div className="p-2 rounded bg-slate-900/90 border border-slate-800 text-[11px] text-teal-300/90 mb-2 font-mono flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                      <span>{log.userFeedbackNote}</span>
                    </div>
                  )}

                  {/* Expanded Result Payload and Feedback Adjustment */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-3">
                      <div>
                        <div className="text-[11px] text-slate-400 font-mono mb-1">
                          Результат вызова инструмента:
                        </div>
                        <pre className="p-2.5 rounded-lg bg-slate-900 font-mono text-[11px] text-slate-300 max-h-48 overflow-y-auto whitespace-pre-wrap">
                          {JSON.stringify(log.toolResult || log.errorMessage || 'Пустой ответ', null, 2)}
                        </pre>
                      </div>

                      {/* Interactive Rating Picker for this log */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-400">Скорректировать оценку:</span>
                          <button
                            onClick={() => onRateAccuracy(log.id, 'EXACT')}
                            className="px-2 py-0.5 rounded bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 text-[10px] font-mono border border-teal-500/30"
                          >
                            Точно
                          </button>
                          <button
                            onClick={() => onRateAccuracy(log.id, 'HALLUCINATED_ARGS')}
                            className="px-2 py-0.5 rounded bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 text-[10px] font-mono border border-orange-500/30"
                          >
                            Галлюцинация
                          </button>
                          <button
                            onClick={() => onRateAccuracy(log.id, 'WRONG_TOOL')}
                            className="px-2 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-[10px] font-mono border border-amber-500/30"
                          >
                            Не тот инструмент
                          </button>
                        </div>

                        {editingNoteId === log.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={noteText}
                              onChange={e => setNoteText(e.target.value)}
                              placeholder="Заметка для обучения..."
                              className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100"
                            />
                            <button
                              onClick={() => handleSaveNote(log.id, log.accuracyRating)}
                              className="px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 text-[10px]"
                            >
                              OK
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingNoteId(log.id);
                              setNoteText(log.userFeedbackNote || '');
                            }}
                            className="text-[11px] text-slate-400 hover:text-teal-300 underline"
                          >
                            {log.userFeedbackNote ? 'Редактировать заметку' : '+ Добавить заметку для дообучения'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
