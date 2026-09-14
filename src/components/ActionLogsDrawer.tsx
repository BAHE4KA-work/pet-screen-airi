import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Trash2,
  Download,
  Copy,
  Check,
  Search,
  Mic,
  Brain,
  Wrench,
  Server,
  Keyboard,
  Sliders,
  AlertCircle,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronRight,
  Filter,
  ArrowDown
} from 'lucide-react';
import { actionLogger, ActionLogItem, ActionLogCategory } from '../utils/actionLogger';
import { soundEffects } from '../utils/audioEffects';

interface ActionLogsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ActionLogsDrawer: React.FC<ActionLogsDrawerProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<ActionLogItem[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = actionLogger.subscribe((allLogs) => {
      setLogs([...allLogs]);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  if (!isOpen) return null;

  const filteredLogs = logs.filter(item => {
    if (filterCategory !== 'all' && item.category !== filterCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchDetails = item.details ? JSON.stringify(item.details).toLowerCase().includes(q) : false;
      return matchTitle || matchDetails;
    }
    return true;
  });

  const getCategoryIcon = (category: ActionLogCategory) => {
    switch (category) {
      case 'voice':
        return <Mic className="w-3.5 h-3.5 text-sky-400" />;
      case 'llm':
        return <Brain className="w-3.5 h-3.5 text-[var(--c-peach)]" />;
      case 'tool':
        return <Wrench className="w-3.5 h-3.5 text-amber-400" />;
      case 'system':
        return <Server className="w-3.5 h-3.5 text-emerald-400" />;
      case 'hotkey':
        return <Keyboard className="w-3.5 h-3.5 text-purple-400" />;
      case 'ui':
        return <Sliders className="w-3.5 h-3.5 text-pink-400" />;
      default:
        return <Info className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'success':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'error':
        return <AlertCircle className="w-3.5 h-3.5 text-rose-400" />;
      case 'warning':
        return <AlertCircle className="w-3.5 h-3.5 text-amber-400" />;
      default:
        return <span className="w-2 h-2 rounded-full bg-sky-400" />;
    }
  };

  const handleCopyLogs = () => {
    const text = actionLogger.exportJSON();
    navigator.clipboard.writeText(text);
    setCopied(true);
    soundEffects.playCompletionPing();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadLogs = () => {
    const text = actionLogger.exportJSON();
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `overlay_actions_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    soundEffects.playCompletionPing();
  };

  return (
    <div
      id="action-logs-drawer-backdrop"
      data-interactive="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        id="action-logs-drawer-window"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden animate-fadeIn"
        style={{
          backgroundColor: 'var(--c-bg-secondary)',
          borderColor: 'var(--c-border)'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--c-border)] bg-[var(--c-bg-primary)]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[var(--c-peach-surface)] border border-[var(--c-peach)]/30 text-[var(--c-peach)]">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-[var(--c-text)]">
                  Журнал действий и событий системы
                </h3>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--c-bg-tertiary)] border border-[var(--c-border)] text-[var(--c-text-muted)]">
                  {logs.length} событий
                </span>
              </div>
              <p className="text-[11px] text-[var(--c-text-muted)]">
                Детальный мониторинг STT whisper.cpp, вызовов LLM, выполнения инструментов и RabbitMQ в реальном времени
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopyLogs}
              className="p-1.5 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-secondary)] hover:bg-[var(--c-bg-tertiary)] text-[var(--c-text-muted)] hover:text-[var(--c-text)] text-xs flex items-center gap-1 transition-colors"
              title="Скопировать журнал в буфер"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline text-[11px]">Копировать</span>
            </button>

            <button
              onClick={handleDownloadLogs}
              className="p-1.5 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-secondary)] hover:bg-[var(--c-bg-tertiary)] text-[var(--c-text-muted)] hover:text-[var(--c-text)] text-xs flex items-center gap-1 transition-colors"
              title="Экспортировать в JSON"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden sm:inline text-[11px]">Экспорт</span>
            </button>

            <button
              onClick={() => actionLogger.clear()}
              className="p-1.5 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-secondary)] hover:bg-rose-500/10 hover:border-rose-500/30 text-[var(--c-text-muted)] hover:text-rose-400 text-xs flex items-center gap-1 transition-colors"
              title="Очистить журнал"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px]">Очистить</span>
            </button>

            <div className="h-4 w-px bg-[var(--c-border)] mx-1" />

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--c-text-muted)] hover:text-[var(--c-text)] hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Toolbar: Category filters & Search */}
        <div className="px-4 py-2 border-b border-[var(--c-border)] bg-[var(--c-bg-secondary)] flex flex-wrap items-center justify-between gap-2">
          {/* Categories */}
          <div className="flex items-center gap-1 overflow-x-auto text-xs py-0.5">
            {[
              { id: 'all', label: 'Все' },
              { id: 'voice', label: 'Голос / STT' },
              { id: 'llm', label: 'LLM' },
              { id: 'tool', label: 'Инструменты' },
              { id: 'system', label: 'Система / SSE' },
              { id: 'hotkey', label: 'Клавиши' }
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => setFilterCategory(cat.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                  filterCategory === cat.id
                    ? 'bg-[var(--c-peach)] text-zinc-900 font-semibold shadow-xs'
                    : 'text-[var(--c-text-muted)] hover:text-[var(--c-text)] hover:bg-white/5'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Search bar & Auto-scroll */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3 h-3 text-[var(--c-text-dim)] absolute left-2.5 top-2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Поиск по событиям..."
                className="pl-7 pr-2.5 py-1 rounded-lg text-[11px] border border-[var(--c-border)] bg-[var(--c-bg-primary)] text-[var(--c-text)] placeholder-[var(--c-text-dim)] focus:outline-hidden focus:border-[var(--c-peach)] w-40 sm:w-56"
              />
            </div>

            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`p-1.5 rounded-lg border text-[11px] flex items-center gap-1 transition-colors ${
                autoScroll
                  ? 'border-[var(--c-peach)]/40 text-[var(--c-peach)] bg-[var(--c-peach-surface)]'
                  : 'border-[var(--c-border)] text-[var(--c-text-muted)]'
              }`}
              title="Автопрокрутка вниз к свежим событиям"
            >
              <ArrowDown className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Logs Feed */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-3 space-y-1.5 font-mono text-xs min-h-[350px] max-h-[500px]"
        >
          {filteredLogs.length === 0 ? (
            <div className="text-center py-16 text-[var(--c-text-dim)]">
              События отсутствуют по заданному фильтру.
            </div>
          ) : (
            filteredLogs.map(item => {
              const isExpanded = expandedLogId === item.id;
              const hasDetails = item.details !== undefined && item.details !== null;
              const timeStr = new Date(item.timestamp).toLocaleTimeString();

              return (
                <div
                  key={item.id}
                  className={`rounded-xl border transition-all text-xs ${
                    item.level === 'error'
                      ? 'border-rose-500/30 bg-rose-500/5'
                      : item.level === 'warning'
                      ? 'border-amber-500/30 bg-amber-500/5'
                      : item.level === 'success'
                      ? 'border-emerald-500/20 bg-emerald-500/5'
                      : 'border-[var(--c-border)] bg-[var(--c-bg-primary)]'
                  }`}
                >
                  <div
                    onClick={() => hasDetails && setExpandedLogId(isExpanded ? null : item.id)}
                    className={`flex items-center justify-between p-2.5 ${
                      hasDetails ? 'cursor-pointer hover:bg-white/5' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {getLevelBadge(item.level)}
                      <span className="text-[10px] text-[var(--c-text-dim)] shrink-0">{timeStr}</span>
                      <div className="flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded bg-[var(--c-bg-secondary)] border border-[var(--c-border)] text-[10px] font-semibold text-[var(--c-text-muted)]">
                        {getCategoryIcon(item.category)}
                        <span className="uppercase tracking-wider">{item.category}</span>
                      </div>
                      <span className="text-[11px] font-medium text-[var(--c-text)] truncate">{item.title}</span>
                    </div>

                    {hasDetails && (
                      <button className="p-1 text-[var(--c-text-dim)] hover:text-[var(--c-text)] ml-2">
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>

                  {/* Expanded JSON Details */}
                  {isExpanded && hasDetails && (
                    <div className="p-2.5 pt-0 border-t border-[var(--c-border)]/50 mt-1">
                      <pre className="p-2 rounded-lg bg-black/40 text-[10px] text-zinc-300 overflow-x-auto whitespace-pre-wrap max-h-48 border border-white/5">
                        {typeof item.details === 'string'
                          ? item.details
                          : JSON.stringify(item.details, null, 2)}
                      </pre>
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
