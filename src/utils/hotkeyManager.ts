export interface HotkeyItem {
  id: string;
  label: string;
  keys: string; // e.g. "Alt+Space", or "" if unbound
  description?: string;
}

export const DEFAULT_HOTKEYS: HotkeyItem[] = [
  {
    id: 'toggle_hud',
    label: 'Вызов / скрытие HUD',
    keys: 'Alt+Space',
    description: 'Отображает или полностью скрывает весь оверлей и поисковую строку'
  },
  {
    id: 'open_settings',
    label: 'Открыть настройки',
    keys: 'Ctrl+,',
    description: 'Панель управления инструментами, моделями и оформлением'
  },
  {
    id: 'toggle_model',
    label: 'Выгрузить / загрузить модель',
    keys: 'Ctrl+U',
    description: 'Освобождение видеопамяти или повторная инициализация'
  },
  {
    id: 'ignore_conflict',
    label: 'Игнорировать конфликт',
    keys: 'Ctrl+I',
    description: 'Пропуск проверки расхождения сигнатур'
  },
  {
    id: 'reload_modules',
    label: 'Перезагрузить модули',
    keys: 'Ctrl+R',
    description: 'Повторное сканирование файлов инструментов в storage'
  },
  {
    id: 'voice_dictation',
    label: 'Голосовой ввод (STT)',
    keys: 'Ctrl+Space',
    description: 'Включение распознавания речи с микрофона'
  }
];

class HotkeyManager {
  private hotkeys: HotkeyItem[] = [...DEFAULT_HOTKEYS];
  private listeners: Array<() => void> = [];

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('app_hotkeys_config');
        if (saved) {
          const parsed = JSON.parse(saved) as Record<string, string>;
          this.hotkeys = this.hotkeys.map(item => ({
            ...item,
            keys: parsed[item.id] !== undefined ? parsed[item.id] : item.keys
          }));
        }
      } catch {
        // use default
      }
    }
  }

  public getHotkeys(): HotkeyItem[] {
    return [...this.hotkeys];
  }

  public getHotkey(id: string): string {
    return this.hotkeys.find(h => h.id === id)?.keys || '';
  }

  public setHotkey(id: string, keys: string): void {
    this.hotkeys = this.hotkeys.map(h => (h.id === id ? { ...h, keys } : h));
    this.persist();
    this.notify();
  }

  public resetDefaults(): void {
    this.hotkeys = [...DEFAULT_HOTKEYS];
    this.persist();
    this.notify();
  }

  private persist(): void {
    if (typeof window !== 'undefined') {
      const map: Record<string, string> = {};
      for (const h of this.hotkeys) {
        map[h.id] = h.keys;
      }
      localStorage.setItem('app_hotkeys_config', JSON.stringify(map));
    }
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb);
    };
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  public matchesEvent(e: KeyboardEvent, hotkeyId: string): boolean {
    const keyString = this.getHotkey(hotkeyId);
    if (!keyString) return false;

    const parts = keyString.toLowerCase().split('+').map(p => p.trim());
    const needsCtrl = parts.includes('ctrl') || parts.includes('control');
    const needsAlt = parts.includes('alt');
    const needsShift = parts.includes('shift');
    const needsMeta = parts.includes('meta') || parts.includes('cmd') || parts.includes('command');

    if (e.ctrlKey !== needsCtrl) return false;
    if (e.altKey !== needsAlt) return false;
    if (e.shiftKey !== needsShift) return false;
    if (e.metaKey !== needsMeta) return false;

    const mainKey = parts.filter(p => !['ctrl', 'control', 'alt', 'shift', 'meta', 'cmd', 'command'].includes(p))[0];
    if (!mainKey) return false;

    if (mainKey === 'space' && (e.code === 'Space' || e.key === ' ')) return true;
    if (mainKey === ',' && e.key === ',') return true;
    if (e.key.toLowerCase() === mainKey) return true;
    if (e.code.toLowerCase() === mainKey) return true;

    return false;
  }

  public matches(hotkeyId: string, e: KeyboardEvent): boolean {
    return this.matchesEvent(e, hotkeyId);
  }
}

export const hotkeyManager = new HotkeyManager();
