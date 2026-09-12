import React, { useRef } from 'react';
import { Pin, X, GripHorizontal } from 'lucide-react';
import { soundEffects } from '../../utils/audioEffects';
import { electronBridge } from '../../utils/electronBridge';

interface ViewContainerProps {
  id: string;
  title: string;
  pinned: boolean;
  position: { x: number; y: number };
  icon?: React.ReactNode;
  width?: number;
  onTogglePin: () => void;
  onClose: () => void;
  onPositionChange: (pos: { x: number; y: number }) => void;
  children: React.ReactNode;
}

export const ViewContainer: React.FC<ViewContainerProps> = ({
  id,
  title,
  pinned,
  position,
  icon,
  width = 380,
  onTogglePin,
  onClose,
  onPositionChange,
  children
}) => {
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, textarea, a, select')) return;

    isDraggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const newX = Math.max(10, Math.min(window.innerWidth - 120, moveEvent.clientX - dragOffsetRef.current.x));
      const newY = Math.max(10, Math.min(window.innerHeight - 80, moveEvent.clientY - dragOffsetRef.current.y));
      onPositionChange({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handlePinClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTogglePin();
    if (!pinned) {
      soundEffects.playCompletionPing();
    } else {
      soundEffects.playToolCallCue();
    }
  };

  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  return (
    <div
      id={`view-window-${id}`}
      data-interactive="true"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${width}px`,
        maxWidth: 'calc(100vw - 32px)'
      }}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => {
        electronBridge.setInteractive(true);
        e.stopPropagation();
      }}
      onMouseEnter={() => electronBridge.setInteractive(true)}
      className="view-window interactive-ui fixed z-40 transition-shadow duration-200 select-none animate-in fade-in zoom-in-95"
    >
      <div
        className={`rounded-2xl border backdrop-blur-2xl overflow-hidden shadow-2xl transition-all ${
          pinned ? 'ring-1 ring-[var(--c-peach)]/40' : ''
        }`}
        style={{
          backgroundColor: 'rgba(18, 21, 29, 0.94)',
          borderColor: pinned ? 'rgba(251, 146, 60, 0.4)' : 'var(--c-border)',
          boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05)'
        }}
      >
        {/* Titlebar */}
        <div
          onMouseDown={handleMouseDown}
          className="flex items-center justify-between px-3.5 py-2.5 cursor-grab active:cursor-grabbing border-b select-none"
          style={{
            borderColor: 'var(--c-border)',
            backgroundColor: 'rgba(26, 30, 40, 0.65)'
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {icon && <div className="text-[var(--c-peach)] shrink-0">{icon}</div>}
            <span className="text-xs font-semibold text-[var(--c-text)] truncate">{title}</span>
            {pinned && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--c-peach)]/15 text-[var(--c-peach)] font-medium shrink-0">
                Закреплено
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <GripHorizontal className="w-3.5 h-3.5 text-[var(--c-text-dim)] opacity-40 mr-1" />

            {/* Pin Button */}
            <button
              id={`view-pin-btn-${id}`}
              onClick={handlePinClick}
              className={`p-1 rounded-md transition-all ${
                pinned
                  ? 'text-[var(--c-peach)] bg-[var(--c-peach)]/20 shadow-sm'
                  : 'text-[var(--c-text-dim)] hover:text-[var(--c-text-muted)] hover:bg-white/5'
              }`}
              title={pinned ? 'Окно закреплено (не закроется при клике на стол)' : 'Закрепить окно'}
            >
              <Pin className={`w-3.5 h-3.5 ${pinned ? 'fill-[var(--c-peach)] rotate-45' : ''}`} />
            </button>

            {/* Close Button */}
            <button
              id={`view-close-btn-${id}`}
              onClick={handleCloseClick}
              className="p-1 rounded-md text-[var(--c-text-dim)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Закрыть окно"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* View Content Body */}
        <div className="p-3.5 max-h-[70vh] overflow-y-auto custom-scrollbar">{children}</div>
      </div>
    </div>
  );
};
