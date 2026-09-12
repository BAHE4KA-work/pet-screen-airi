import React, { useState, useEffect } from 'react';
import { Keyboard, RotateCcw, X, Check } from 'lucide-react';
import { hotkeyManager, HotkeyItem } from '../../utils/hotkeyManager';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { soundEffects } from '../../utils/audioEffects';

export const HotkeysTab: React.FC = () => {
  const [hotkeys, setHotkeys] = useState<HotkeyItem[]>(() => hotkeyManager.getHotkeys());
  const [recordingId, setRecordingId] = useState<string | null>(null);

  useEffect(() => {
    return hotkeyManager.subscribe(() => {
      setHotkeys(hotkeyManager.getHotkeys());
    });
  }, []);

  useEffect(() => {
    if (!recordingId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // If user pressed Escape, Backspace, or Delete -> unbind hotkey
      if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'Delete') {
        hotkeyManager.setHotkey(recordingId, '');
        setRecordingId(null);
        soundEffects.playToolCallCue();
        return;
      }

      // Ignore bare modifiers alone
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        return;
      }

      // Build key string
      const parts: string[] = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      if (e.metaKey) parts.push('Cmd');

      let keyName = e.key;
      if (e.code === 'Space' || e.key === ' ') keyName = 'Space';
      else if (keyName.length === 1) keyName = keyName.toUpperCase();

      parts.push(keyName);

      const combined = parts.join('+');
      hotkeyManager.setHotkey(recordingId, combined);
      setRecordingId(null);
      soundEffects.playCompletionPing();
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [recordingId]);

  const handleResetDefaults = () => {
    hotkeyManager.resetDefaults();
    soundEffects.playCompletionPing();
  };

  const handleUnbind = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    hotkeyManager.setHotkey(id, '');
    soundEffects.playToolCallCue();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-[var(--c-border)]">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
            Горячие клавиши
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-muted)' }}>
            Нажмите на клавишу для назначения. Нажмите Esc, Backspace или Delete в режиме ввода, чтобы отвязать.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleResetDefaults}
          icon={<RotateCcw className="w-3.5 h-3.5" />}
        >
          Сбросить
        </Button>
      </div>

      <div className="space-y-2">
        {hotkeys.map(item => {
          const isRecording = recordingId === item.id;

          return (
            <Card
              key={item.id}
              className="flex items-center justify-between py-2.5 px-3"
            >
              <div className="space-y-0.5">
                <div className="text-xs font-medium" style={{ color: 'var(--c-text)' }}>
                  {item.label}
                </div>
                {item.description && (
                  <div className="text-[11px]" style={{ color: 'var(--c-text-muted)' }}>
                    {item.description}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRecordingId(isRecording ? null : item.id)}
                  className="px-2.5 py-1 min-w-[90px] text-center rounded-lg border font-mono text-xs transition-all select-none"
                  style={{
                    backgroundColor: isRecording ? 'var(--c-peach-surface)' : 'var(--c-bg-tertiary)',
                    borderColor: isRecording ? 'var(--c-peach)' : 'var(--c-border)',
                    color: isRecording
                      ? 'var(--c-peach-light)'
                      : item.keys
                      ? 'var(--c-text)'
                      : 'var(--c-text-muted)'
                  }}
                >
                  {isRecording ? 'Нажмите клавиши...' : item.keys || 'Отвязано'}
                </button>

                {item.keys && (
                  <button
                    type="button"
                    onClick={e => handleUnbind(item.id, e)}
                    title="Отвязать клавишу"
                    className="p-1 rounded text-[var(--c-text-muted)] hover:text-[var(--c-mint-light)] hover:bg-[var(--c-bg-tertiary)] transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
