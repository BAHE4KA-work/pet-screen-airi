import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  ArrowRight,
  Loader2,
  Settings,
  X,
  Pin,
  CheckCircle2,
  AlertCircle,
  GripHorizontal,
  Mic,
  MicOff,
  History,
  CornerDownLeft,
  Cpu
} from 'lucide-react';
import { ModelStatus, ViewSpec } from '../types';
import { soundEffects } from '../utils/audioEffects';
import { getSmartQuerySuggestions, SuggestionMatch } from '../utils/fuzzySearch';
import { electronBridge } from '../utils/electronBridge';

interface FloatingHudProps {
  status: ModelStatus | null;
  history?: string[];
  isPinned?: boolean;
  onTogglePin?: () => void;
  onSpawnView?: (view: ViewSpec) => void;
  onExecuteQuery: (prompt: string) => Promise<any>;
  onOpenSettings: (tab?: string) => void;
  onClose: () => void;
}

interface ActiveToolInvocation {
  toolName: string;
  arguments?: Record<string, unknown>;
  message: string;
}

export const FloatingHud: React.FC<FloatingHudProps> = ({
  status,
  history = [],
  isPinned = false,
  onTogglePin,
  onSpawnView,
  onExecuteQuery,
  onOpenSettings,
  onClose
}) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeToolInvocation, setActiveToolInvocation] = useState<ActiveToolInvocation | null>(null);
  const [resultData, setResultData] = useState<any | null>(null);
  const [errorData, setErrorData] = useState<string | null>(null);

  // Auto-completion suggestions state
  const [suggestions, setSuggestions] = useState<SuggestionMatch[]>([]);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState<number>(-1);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Draggable positioning state
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    const initialX = Math.max(20, (window.innerWidth - 560) / 2);
    const initialY = Math.max(60, window.innerHeight * 0.18);
    return { x: initialX, y: initialY };
  });

  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const hudRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Update suggestions whenever prompt changes
  useEffect(() => {
    if (prompt.trim().length >= 2) {
      const matches = getSmartQuerySuggestions(prompt, history, 3);
      setSuggestions(matches);
      setSelectedSuggestionIdx(-1);
    } else {
      setSuggestions([]);
      setSelectedSuggestionIdx(-1);
    }
  }, [prompt, history]);

  // Handle Dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('input, button, pre, a')) return;

    isDraggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const newX = Math.max(10, Math.min(window.innerWidth - 300, moveEvent.clientX - dragOffsetRef.current.x));
      const newY = Math.max(10, Math.min(window.innerHeight - 150, moveEvent.clientY - dragOffsetRef.current.y));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleApplySuggestion = (text: string) => {
    setPrompt(text);
    setSuggestions([]);
    inputRef.current?.focus();
    soundEffects.playCompletionPing();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIdx(prev => (prev + 1 < suggestions.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIdx(prev => (prev - 1 >= 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const target = selectedSuggestionIdx >= 0 ? suggestions[selectedSuggestionIdx] : suggestions[0];
      if (target) {
        handleApplySuggestion(target.text);
      }
    } else if (e.key === 'Enter' && selectedSuggestionIdx >= 0) {
      e.preventDefault();
      const target = suggestions[selectedSuggestionIdx];
      if (target) {
        handleApplySuggestion(target.text);
      }
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setErrorData(null);
    setResultData(null);
    setActiveToolInvocation(null);
    setSuggestions([]);

    try {
      // Use SSE streaming for real-time tool execution notifications
      const res = await fetch('/api/query/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed })
      });

      if (!res.ok || !res.body) {
        const directRes = await onExecuteQuery(trimmed);
        setResultData(directRes);
        soundEffects.playCompletionPing();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let receivedFinal = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const block of parts) {
          const eventMatch = block.match(/event:\s*([^\n]+)/);
          const dataMatch = block.match(/data:\s*([^\n]+)/);
          if (eventMatch && dataMatch) {
            const event = eventMatch[1].trim();
            const data = JSON.parse(dataMatch[1].trim());

            if (event === 'tool_invoked') {
              setActiveToolInvocation({
                toolName: data.toolName,
                arguments: data.arguments,
                message: data.message || `Инструмент ${data.toolName} вызван...`
              });
              soundEffects.playToolCallCue();
            } else if (event === 'completed') {
              setResultData(data);
              receivedFinal = true;
              soundEffects.playCompletionPing();
              if (data.view && onSpawnView) {
                onSpawnView(data.view);
              }
              if (data.views && Array.isArray(data.views) && onSpawnView) {
                data.views.forEach((v: ViewSpec) => onSpawnView(v));
              }
            } else if (event === 'no_tool') {
              setResultData({ success: false, rawResponse: data.message });
              receivedFinal = true;
              soundEffects.playWarningCue();
            } else if (event === 'error') {
              setErrorData(data.error);
              receivedFinal = true;
              soundEffects.playWarningCue();
            }
          }
        }
      }

      if (!receivedFinal) {
        const fallbackRes = await onExecuteQuery(trimmed);
        setResultData(fallbackRes);
        soundEffects.playCompletionPing();
        if (fallbackRes?.view && onSpawnView) {
          onSpawnView(fallbackRes.view);
        }
        if (fallbackRes?.views && Array.isArray(fallbackRes.views) && onSpawnView) {
          fallbackRes.views.forEach((v: ViewSpec) => onSpawnView(v));
        }
      }
    } catch (err: any) {
      setErrorData(err.message || 'Ошибка выполнения');
      soundEffects.playWarningCue();
    } finally {
      setLoading(false);
      setActiveToolInvocation(null);
    }
  };

  const handleClear = () => {
    setPrompt('');
    setResultData(null);
    setErrorData(null);
    setActiveToolInvocation(null);
    setSuggestions([]);
    inputRef.current?.focus();
  };

  // Local Voice STT handler
  const handleToggleVoice = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = event => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach(track => track.stop());
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64 = (reader.result as string)?.split(',')[1] || '';
            try {
              const res = await fetch('/api/stt/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ base64Audio: base64, filename: 'voice.webm' })
              });
              const data = await res.json();
              if (data.text) {
                setPrompt(data.text);
                soundEffects.playCompletionPing();
                inputRef.current?.focus();
              }
            } catch (err) {
              console.error('STT error:', err);
              soundEffects.playWarningCue();
            }
          };
        };

        mediaRecorder.start();
        setIsRecording(true);
        soundEffects.playToolCallCue();
      } else {
        soundEffects.playWarningCue();
      }
    } catch (err) {
      setIsRecording(false);
      console.error('Audio capture error:', err);
      soundEffects.playWarningCue();
    }
  };

  const hasConflict = status?.conflict.hasConflict && !status.ignoreConflict;
  const isUnloaded = status && !status.loaded;

  return (
    <div
      ref={hudRef}
      id="floating-hud-window"
      data-interactive="true"
      onClick={e => e.stopPropagation()}
      onMouseDown={e => {
        electronBridge.setInteractive(true);
        e.stopPropagation();
      }}
      onMouseEnter={() => electronBridge.setInteractive(true)}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        maxWidth: '580px',
        width: 'calc(100vw - 32px)'
      }}
      className="fixed z-50 transition-shadow duration-300 interactive-ui"
    >
      <div
        className={`rounded-2xl border shadow-2xl backdrop-blur-2xl overflow-hidden transition-all ${
          isPinned ? 'ring-1 ring-[var(--c-peach)]/40' : ''
        }`}
        style={{
          backgroundColor: 'rgba(18, 21, 29, 0.92)',
          borderColor: isPinned ? 'rgba(251, 146, 60, 0.4)' : 'var(--c-border)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.06)'
        }}
      >
        {/* Apple-style window titlebar & drag handle */}
        <div
          onMouseDown={handleMouseDown}
          className="flex items-center justify-between px-3.5 py-2.5 cursor-grab active:cursor-grabbing border-b select-none"
          style={{
            borderColor: 'var(--c-border)',
            backgroundColor: 'rgba(26, 30, 40, 0.6)'
          }}
        >
          {/* Window control buttons */}
          <div className="flex items-center gap-1.5">
            <button
              id="hud-close-btn"
              onClick={onClose}
              title="Закрыть"
              className="w-3 h-3 rounded-full flex items-center justify-center transition-opacity hover:opacity-80"
              style={{ backgroundColor: 'var(--c-mint)' }}
            >
              <X className="w-2 h-2 opacity-0 hover:opacity-100 text-black stroke-[3]" />
            </button>
            <button
              id="hud-settings-btn"
              onClick={() => onOpenSettings()}
              title="Настройки"
              className="w-3 h-3 rounded-full flex items-center justify-center transition-opacity hover:opacity-80"
              style={{ backgroundColor: 'var(--c-peach)' }}
            >
              <Settings className="w-2 h-2 opacity-0 hover:opacity-100 text-black stroke-[3]" />
            </button>
            {isPinned && (
              <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded bg-[var(--c-peach)]/15 text-[var(--c-peach)] font-medium">
                Закреплено
              </span>
            )}
          </div>

          {/* Subtle drag handle */}
          <div className="flex items-center gap-1 text-[var(--c-text-dim)]">
            <GripHorizontal className="w-4 h-4 opacity-50" />
          </div>

          {/* Actions: Pin + Settings */}
          <div className="flex items-center gap-1">
            {onTogglePin && (
              <button
                id="hud-pin-btn"
                onClick={onTogglePin}
                className={`p-1 rounded-md transition-colors ${
                  isPinned
                    ? 'text-[var(--c-peach)] bg-[var(--c-peach)]/20 shadow-sm'
                    : 'text-[var(--c-text-muted)] hover:text-[var(--c-peach)] hover:bg-white/5'
                }`}
                title={
                  isPinned
                    ? 'Окно ввода закреплено (не закроется при клике на рабочий стол)'
                    : 'Закрепить окно ввода на экране'
                }
              >
                <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-[var(--c-peach)] rotate-45' : ''}`} />
              </button>
            )}

            <button
              onClick={() => onOpenSettings()}
              className="p-1 rounded-md transition-colors text-[var(--c-text-muted)] hover:text-[var(--c-peach)] hover:bg-white/5"
              title="Настройки"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Query Input Box */}
        <form onSubmit={handleSubmit} className="p-3 pb-2 relative">
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all"
            style={{
              backgroundColor: 'var(--c-bg-tertiary)',
              borderColor: loading ? 'var(--c-peach)' : 'var(--c-border)'
            }}
          >
            <Sparkles
              className="w-4 h-4 shrink-0 transition-colors"
              style={{ color: prompt ? 'var(--c-peach)' : 'var(--c-text-dim)' }}
            />

            <input
              ref={inputRef}
              id="hud-query-input"
              type="text"
              value={prompt}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setTimeout(() => setIsInputFocused(false), 200)}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Спросите что-нибудь или вызовите инструмент..."
              className="w-full bg-transparent text-sm focus:outline-hidden placeholder:text-[var(--c-text-dim)]"
              style={{ color: 'var(--c-text)' }}
              disabled={loading}
            />

            {prompt && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 rounded text-[var(--c-text-muted)] hover:text-[var(--c-text)] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Microphone STT button */}
            <button
              type="button"
              id="hud-voice-btn"
              onClick={handleToggleVoice}
              title={isRecording ? 'Остановить запись голоса' : 'Голосовой ввод'}
              className={`p-1.5 rounded-lg text-xs transition-all ${
                isRecording
                  ? 'bg-orange-500 text-white animate-pulse'
                  : 'text-[var(--c-text-muted)] hover:text-[var(--c-peach)] hover:bg-white/5'
              }`}
            >
              {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>

            {/* Submit arrow button */}
            <button
              type="submit"
              id="hud-submit-btn"
              disabled={!prompt.trim() || loading}
              className="p-1.5 rounded-lg text-xs transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                backgroundColor: prompt.trim() && !loading ? 'var(--c-peach)' : 'transparent',
                color: prompt.trim() && !loading ? '#0a0c10' : 'var(--c-text-dim)'
              }}
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--c-peach)' }} />
              ) : (
                <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
              )}
            </button>
          </div>

          {/* Autocomplete & Fuzzy History Suggestions (Item 4) */}
          {suggestions.length > 0 && isInputFocused && !loading && (
            <div
              id="query-suggestions-dropdown"
              className="mt-1.5 rounded-xl border overflow-hidden shadow-xl"
              style={{
                backgroundColor: '#181b24',
                borderColor: 'var(--c-border)'
              }}
            >
              <div className="px-3 py-1.5 text-[10px] text-zinc-500 uppercase tracking-wider flex items-center justify-between border-b border-zinc-800">
                <span>Подсказки и автопродление (Tab для выбора)</span>
                <CornerDownLeft className="w-2.5 h-2.5 opacity-60" />
              </div>
              <div className="divide-y divide-zinc-800/60">
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onMouseDown={() => handleApplySuggestion(s.text)}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between text-xs transition-colors ${
                      idx === selectedSuggestionIdx
                        ? 'bg-orange-500/20 text-orange-200'
                        : 'hover:bg-zinc-800/50 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {s.source === 'history' ? (
                        <History className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      )}
                      <span className="truncate">{s.text}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 shrink-0 ml-2">
                      {s.source === 'history' ? 'История' : 'Шаблон'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>

        {/* Real-time Tool Execution Indicator (Item 3) */}
        {loading && (
          <div className="px-3 pb-2">
            {activeToolInvocation ? (
              <div
                id="active-tool-indicator"
                className="p-2.5 rounded-xl border flex items-center justify-between text-xs animate-pulse"
                style={{
                  backgroundColor: 'rgba(251, 146, 60, 0.12)',
                  borderColor: 'rgba(251, 146, 60, 0.35)',
                  color: 'var(--c-peach-light)'
                }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-orange-400 animate-ping" />
                  <Cpu className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  <span>
                    Выполняется инструмент:{' '}
                    <strong className="font-mono text-orange-200">{activeToolInvocation.toolName}</strong>
                  </span>
                </div>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400 shrink-0" />
              </div>
            ) : (
              <div
                className="p-2 rounded-xl border flex items-center gap-2 text-xs"
                style={{
                  backgroundColor: 'rgba(26, 30, 40, 0.6)',
                  borderColor: 'var(--c-border)',
                  color: 'var(--c-text-muted)'
                }}
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400 shrink-0" />
                <span>FunctionGemma анализирует запрос и выбирает модуль...</span>
              </div>
            )}
          </div>
        )}

        {/* Warning / Conflict / Unloaded Banner */}
        {(hasConflict || isUnloaded) && (
          <div
            className="mx-3 mb-3 px-3 py-2 rounded-xl border flex items-center justify-between text-xs"
            style={{
              backgroundColor: 'var(--c-mint-surface)',
              borderColor: 'var(--c-mint-border)',
              color: 'var(--c-mint-light)'
            }}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--c-mint)' }} />
              <span>
                {isUnloaded
                  ? 'Модель выгружена из памяти'
                  : 'Конфликт контрольной суммы инструментов'}
              </span>
            </div>
            <button
              onClick={() => onOpenSettings('compatibility')}
              className="underline text-[11px] hover:opacity-80 transition-opacity"
              style={{ color: 'var(--c-mint-light)' }}
            >
              Настроить
            </button>
          </div>
        )}

        {/* Result Area */}
        {resultData && (
          <div className="px-3 pb-3">
            <div
              className="p-3 rounded-xl border space-y-2.5 max-h-72 overflow-y-auto text-xs"
              style={{
                backgroundColor: 'rgba(26, 30, 40, 0.7)',
                borderColor: 'var(--c-border)'
              }}
            >
              {/* Positive header tag */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--c-peach)' }} />
                  <span
                    className="font-mono text-[11px] font-medium px-2 py-0.5 rounded-md"
                    style={{
                      backgroundColor: 'var(--c-peach-surface)',
                      color: 'var(--c-peach-light)'
                    }}
                  >
                    {resultData.toolCalled || 'Выполнено'}
                  </span>
                </div>
                <span className="text-[10px]" style={{ color: 'var(--c-text-dim)' }}>
                  {resultData.durationMs ? `${resultData.durationMs}ms` : ''}
                </span>
              </div>

              {/* Formatted result content */}
              <pre
                className="p-2.5 rounded-lg font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-text"
                style={{
                  backgroundColor: 'var(--c-bg-primary)',
                  color: 'var(--c-text)'
                }}
              >
                {typeof resultData.result === 'object'
                  ? JSON.stringify(resultData.result, null, 2)
                  : String(resultData.result || resultData.rawResponse || 'Готово')}
              </pre>
            </div>
          </div>
        )}

        {/* Error Area */}
        {errorData && (
          <div className="px-3 pb-3">
            <div
              className="p-3 rounded-xl border flex items-start gap-2.5 text-xs"
              style={{
                backgroundColor: 'var(--c-mint-surface)',
                borderColor: 'var(--c-mint-border)',
                color: 'var(--c-mint-light)'
              }}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--c-mint)' }} />
              <div className="space-y-1">
                <div className="font-medium">Не удалось выполнить запрос</div>
                <div className="text-[11px] opacity-90">{errorData}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
