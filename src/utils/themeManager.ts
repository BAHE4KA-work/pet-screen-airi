export interface ColorPaletteItem {
  id: string;
  name: string;
  main: string;
  light: string;
  dark: string;
  surface: string;
  border: string;
}

export const AVAILABLE_PALETTES: ColorPaletteItem[] = [
  {
    id: 'peach',
    name: 'Персиковый',
    main: '#fb923c',
    light: '#fdba74',
    dark: '#ea580c',
    surface: 'rgba(251, 146, 60, 0.12)',
    border: 'rgba(251, 146, 60, 0.3)'
  },
  {
    id: 'mint',
    name: 'Мятный',
    main: '#14b8a6',
    light: '#5eead4',
    dark: '#0d9488',
    surface: 'rgba(20, 184, 166, 0.12)',
    border: 'rgba(20, 184, 166, 0.3)'
  },
  {
    id: 'emerald',
    name: 'Зеленый',
    main: '#22c55e',
    light: '#86efac',
    dark: '#16a34a',
    surface: 'rgba(34, 197, 94, 0.12)',
    border: 'rgba(34, 197, 94, 0.3)'
  },
  {
    id: 'red',
    name: 'Красный',
    main: '#ef4444',
    light: '#fca5a5',
    dark: '#dc2626',
    surface: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.3)'
  },
  {
    id: 'rose',
    name: 'Розовый',
    main: '#f43f5e',
    light: '#fda4af',
    dark: '#e11d48',
    surface: 'rgba(244, 63, 94, 0.12)',
    border: 'rgba(244, 63, 94, 0.3)'
  },
  {
    id: 'purple',
    name: 'Фиолетовый',
    main: '#a855f7',
    light: '#d8b4fe',
    dark: '#9333ea',
    surface: 'rgba(168, 85, 247, 0.12)',
    border: 'rgba(168, 85, 247, 0.3)'
  },
  {
    id: 'blue',
    name: 'Синий',
    main: '#3b82f6',
    light: '#93c5fd',
    dark: '#2563eb',
    surface: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.3)'
  }
];

class ThemeManager {
  private primaryId: string = 'peach';
  private secondaryId: string = 'mint';

  constructor() {
    if (typeof window !== 'undefined') {
      const savedPri = localStorage.getItem('theme_primary_palette');
      const savedSec = localStorage.getItem('theme_secondary_palette');
      if (savedPri && AVAILABLE_PALETTES.some(p => p.id === savedPri)) {
        this.primaryId = savedPri;
      }
      if (savedSec && AVAILABLE_PALETTES.some(p => p.id === savedSec)) {
        this.secondaryId = savedSec;
      }
      this.applyTheme();
    }
  }

  public getPrimaryId(): string {
    return this.primaryId;
  }

  public getSecondaryId(): string {
    return this.secondaryId;
  }

  public init(): void {
    this.applyTheme();
  }

  public setPrimaryPalette(id: string): void {
    const pal = AVAILABLE_PALETTES.find(p => p.id === id);
    if (!pal) return;
    this.primaryId = id;
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme_primary_palette', id);
      this.applyTheme();
    }
  }

  public setSecondaryPalette(id: string): void {
    const pal = AVAILABLE_PALETTES.find(p => p.id === id);
    if (!pal) return;
    this.secondaryId = id;
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme_secondary_palette', id);
      this.applyTheme();
    }
  }

  public applyTheme(): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    const pri = AVAILABLE_PALETTES.find(p => p.id === this.primaryId) || AVAILABLE_PALETTES[0];
    root.style.setProperty('--c-peach', pri.main);
    root.style.setProperty('--c-peach-light', pri.light);
    root.style.setProperty('--c-peach-dark', pri.dark);
    root.style.setProperty('--c-peach-surface', pri.surface);
    root.style.setProperty('--c-peach-border', pri.border);

    const sec = AVAILABLE_PALETTES.find(p => p.id === this.secondaryId) || AVAILABLE_PALETTES[1];
    root.style.setProperty('--c-mint', sec.main);
    root.style.setProperty('--c-mint-light', sec.light);
    root.style.setProperty('--c-mint-dark', sec.dark);
    root.style.setProperty('--c-mint-surface', sec.surface);
    root.style.setProperty('--c-mint-border', sec.border);
  }
}

export const themeManager = new ThemeManager();
