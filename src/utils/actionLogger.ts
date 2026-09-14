export type ActionLogCategory = 'voice' | 'llm' | 'tool' | 'system' | 'hotkey' | 'ui';
export type ActionLogLevel = 'info' | 'success' | 'warning' | 'error' | 'debug';

export interface ActionLogItem {
  id: string;
  timestamp: number;
  category: ActionLogCategory;
  level: ActionLogLevel;
  title: string;
  details?: any;
}

type LogListener = (logs: ActionLogItem[], latest: ActionLogItem | null) => void;

class ActionLoggerStore {
  private logs: ActionLogItem[] = [];
  private listeners: Set<LogListener> = new Set();
  private maxLogs = 300;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('overlay_action_logs');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            this.logs = parsed.slice(-100);
          }
        }
      } catch {
        // ignore
      }

      // Initial system bootstrap log
      this.info('system', 'Система оверлея запущена', {
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
      });
    }
  }

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    listener(this.logs, this.logs[this.logs.length - 1] || null);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getLogs(): ActionLogItem[] {
    return [...this.logs];
  }

  public getLatest(): ActionLogItem | null {
    return this.logs[this.logs.length - 1] || null;
  }

  public log(category: ActionLogCategory, level: ActionLogLevel, title: string, details?: any): ActionLogItem {
    const item: ActionLogItem = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      category,
      level,
      title,
      details
    };

    this.logs.push(item);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Save subset to localStorage
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('overlay_action_logs', JSON.stringify(this.logs.slice(-60)));
      } catch {
        // ignore storage quota
      }
    }

    // Console mirror with pretty styling
    const colors: Record<ActionLogLevel, string> = {
      info: 'color: #38bdf8',
      success: 'color: #34d399',
      warning: 'color: #fbbf24',
      error: 'color: #f87171',
      debug: 'color: #94a3b8'
    };
    console.log(
      `%c[${category.toUpperCase()}] ${title}`,
      colors[level] || 'color: #ffffff',
      details !== undefined ? details : ''
    );

    // Notify listeners
    this.listeners.forEach(fn => {
      try {
        fn(this.logs, item);
      } catch (err) {
        console.error('ActionLogger subscriber error:', err);
      }
    });

    return item;
  }

  public info(category: ActionLogCategory, title: string, details?: any) {
    return this.log(category, 'info', title, details);
  }

  public success(category: ActionLogCategory, title: string, details?: any) {
    return this.log(category, 'success', title, details);
  }

  public warn(category: ActionLogCategory, title: string, details?: any) {
    return this.log(category, 'warning', title, details);
  }

  public error(category: ActionLogCategory, title: string, details?: any) {
    return this.log(category, 'error', title, details);
  }

  public clear() {
    this.logs = [];
    if (typeof window !== 'undefined') {
      localStorage.removeItem('overlay_action_logs');
    }
    this.info('system', 'Журнал действий очищен');
  }

  public exportJSON(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

export const actionLogger = new ActionLoggerStore();
