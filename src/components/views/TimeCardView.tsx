import React, { useState, useEffect } from 'react';
import { Clock, Globe, Calendar, RefreshCw } from 'lucide-react';
import { TimeViewData } from '../../types';

interface TimeCardViewProps {
  data: TimeViewData;
}

export const TimeCardView: React.FC<TimeCardViewProps> = ({ data }) => {
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date(data.timestamp || Date.now()));
  const [showSeconds, setShowSeconds] = useState(data.showSeconds ?? true);

  // Live ticking clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const format = data.format || '24h';
  const hours = currentTime.getHours();
  const displayHours = format === '12h' ? (hours % 12 || 12) : hours;
  const pad = (n: number) => n.toString().padStart(2, '0');

  const formattedHours = pad(displayHours);
  const formattedMinutes = pad(currentTime.getMinutes());
  const formattedSeconds = pad(currentTime.getSeconds());
  const ampm = format === '12h' ? (hours >= 12 ? ' PM' : ' AM') : '';

  const dateStr = currentTime.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const weekdayStr = currentTime.toLocaleDateString('ru-RU', { weekday: 'long' });
  const weekdayFormatted = weekdayStr.charAt(0).toUpperCase() + weekdayStr.slice(1);
  const timezoneStr = data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="flex flex-col items-center text-center select-none py-1">
      {/* Clock display */}
      <div className="relative py-2 px-4 rounded-xl border w-full flex flex-col items-center justify-center bg-black/20 border-white/5 shadow-inner">
        <div className="text-4xl sm:text-5xl font-mono font-bold tracking-tight text-[var(--c-text)] flex items-baseline justify-center">
          <span>{formattedHours}</span>
          <span className="text-[var(--c-peach)] animate-pulse mx-0.5">:</span>
          <span>{formattedMinutes}</span>
          {showSeconds && (
            <>
              <span className="text-[var(--c-peach)] opacity-60 text-2xl mx-0.5">:</span>
              <span className="text-2xl sm:text-3xl font-normal text-[var(--c-peach)] opacity-90">
                {formattedSeconds}
              </span>
            </>
          )}
          {ampm && <span className="text-xs font-semibold ml-1.5 text-[var(--c-text-muted)]">{ampm}</span>}
        </div>

        {/* Date and Day of Week */}
        <div className="flex items-center gap-2 mt-2 text-xs text-[var(--c-text-muted)]">
          <Calendar className="w-3.5 h-3.5 text-[var(--c-peach)]" />
          <span className="font-medium text-[var(--c-text)]">{weekdayFormatted}</span>
          <span>•</span>
          <span>{dateStr}</span>
        </div>
      </div>

      {/* Info Pills */}
      <div className="grid grid-cols-2 gap-2 mt-3 w-full text-left">
        <div className="p-2 rounded-xl bg-white/[0.03] border border-white/5 flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-[var(--c-peach)] shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-[var(--c-text-dim)] uppercase">Часовой пояс</div>
            <div className="text-xs font-medium text-[var(--c-text)] truncate" title={timezoneStr}>
              {timezoneStr}
            </div>
          </div>
        </div>

        <div className="p-2 rounded-xl bg-white/[0.03] border border-white/5 flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-[var(--c-mint)] shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-[var(--c-text-dim)] uppercase">Формат отображения</div>
            <button
              onClick={() => setShowSeconds(!showSeconds)}
              className="text-xs font-medium text-[var(--c-text)] hover:text-[var(--c-peach)] transition-colors"
              title="Нажмите для переключения секунд"
            >
              {format === '24h' ? '24-часовой' : '12-часовой'} {showSeconds ? '(сек: вкл)' : ''}
            </button>
          </div>
        </div>
      </div>

      {/* Footer hint */}
      <div className="flex items-center justify-between w-full mt-3 pt-2 border-t border-white/5 text-[11px] text-[var(--c-text-dim)]">
        <span>Стандартный модуль Views: Time</span>
        <button
          onClick={() => setCurrentTime(new Date())}
          className="flex items-center gap-1 hover:text-[var(--c-peach)] transition-colors"
          title="Синхронизировать время"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Синхронизировано</span>
        </button>
      </div>
    </div>
  );
};
