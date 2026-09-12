import React from 'react';
import {
  Terminal,
  Cpu,
  Layers,
  FileCode,
  ListFilter,
  ShieldCheck,
  ShieldAlert,
  Power,
  Sliders,
  Keyboard,
  Eye,
  EyeOff
} from 'lucide-react';
import { ModelStatus } from '../types';

interface HeaderBarProps {
  status: ModelStatus | null;
  activeTab: 'command' | 'modules' | 'logs' | 'checksum';
  setActiveTab: (tab: 'command' | 'modules' | 'logs' | 'checksum') => void;
  overlayVisible: boolean;
  setOverlayVisible: (v: boolean) => void;
  compactMode: boolean;
  setCompactMode: (v: boolean) => void;
  showDesktop: boolean;
  setShowDesktop: (v: boolean) => void;
  opacity: number;
  setOpacity: (n: number) => void;
  onToggleModel: () => void;
  onOpenHotkeys: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  status,
  activeTab,
  setActiveTab,
  overlayVisible,
  setOverlayVisible,
  compactMode,
  setCompactMode,
  showDesktop,
  setShowDesktop,
  opacity,
  setOpacity,
  onToggleModel,
  onOpenHotkeys
}) => {
  const hasConflict = status?.conflict.hasConflict;
  const isLoaded = status?.loaded;

  return (
    <header
      id="main-app-header"
      className="relative z-30 w-full px-4 py-3 bg-[#0a0d14]/80 backdrop-blur-xl border-b border-slate-800/80 shadow-md"
    >
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Left: Brand + Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-radial from-teal-400/20 to-teal-500/5 border border-teal-400/30 flex items-center justify-center text-teal-300 shadow-[0_0_15px_rgba(94,234,212,0.15)]">
              <Cpu className="w-4 h-4 text-teal-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-tight text-slate-100 font-mono">
                  FunctionGemma
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500/10 border border-teal-500/30 text-teal-300 font-mono">
                  HUD v2.4
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Модульный контроллер инструментов и оверлей
              </p>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-800 hidden sm:block" />

          {/* Model Status Badge */}
          {status && (
            <div className="flex items-center gap-2">
              <button
                id="model-load-toggle-btn"
                onClick={onToggleModel}
                title="Нажмите для загрузки/выгрузки модели (Ctrl+U)"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono transition-all border ${
                  !isLoaded
                    ? 'bg-rose-500/15 border-rose-500/30 text-rose-300 hover:bg-rose-500/25'
                    : hasConflict && !status.ignoreConflict
                    ? 'bg-orange-500/15 border-orange-500/30 text-orange-300 hover:bg-orange-500/25'
                    : 'bg-teal-500/10 border-teal-500/30 text-teal-300 hover:bg-teal-500/20'
                }`}
              >
                <Power className={`w-3.5 h-3.5 ${isLoaded ? 'text-teal-400' : 'text-rose-400'}`} />
                <span>
                  {!isLoaded
                    ? 'Модель выгружена'
                    : hasConflict && !status.ignoreConflict
                    ? 'Конфликт сумм (!)'
                    : 'FunctionGemma Ready'}
                </span>
                <span className="text-[10px] opacity-70 ml-0.5">Ctrl+U</span>
              </button>

              {hasConflict && !status.ignoreConflict && (
                <button
                  id="header-conflict-alert-btn"
                  onClick={() => setActiveTab('checksum')}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-orange-500/20 border border-orange-500/40 text-orange-300 text-[11px] hover:bg-orange-500/30 transition-colors"
                >
                  <ShieldAlert className="w-3 h-3 text-orange-400" />
                  <span>Проверить ({status.conflict.mismatchedCount})</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Center: Tabs */}
        <nav className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800/90 text-xs">
          <button
            id="tab-command-btn"
            onClick={() => setActiveTab('command')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all font-medium ${
              activeTab === 'command'
                ? 'bg-teal-500/20 text-teal-200 border border-teal-500/40 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-teal-400" />
            <span>Оверлей (HUD)</span>
            <kbd className="hidden md:inline text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400">
              ^1
            </kbd>
          </button>

          <button
            id="tab-modules-btn"
            onClick={() => setActiveTab('modules')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all font-medium ${
              activeTab === 'modules'
                ? 'bg-teal-500/20 text-teal-200 border border-teal-500/40 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <FileCode className="w-3.5 h-3.5 text-amber-300" />
            <span>Модули и Скрипты</span>
            <kbd className="hidden md:inline text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400">
              ^2
            </kbd>
          </button>

          <button
            id="tab-logs-btn"
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all font-medium ${
              activeTab === 'logs'
                ? 'bg-teal-500/20 text-teal-200 border border-teal-500/40 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <ListFilter className="w-3.5 h-3.5 text-teal-400" />
            <span>Логи и Анализ</span>
            <kbd className="hidden md:inline text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400">
              ^3
            </kbd>
          </button>

          <button
            id="tab-checksum-btn"
            onClick={() => setActiveTab('checksum')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all font-medium ${
              activeTab === 'checksum'
                ? 'bg-orange-500/20 text-orange-200 border border-orange-500/40 shadow-xs'
                : hasConflict
                ? 'text-orange-300 hover:bg-orange-500/15'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            {hasConflict ? (
              <ShieldAlert className="w-3.5 h-3.5 text-orange-400 animate-pulse" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
            )}
            <span>Сумма и Конфликты</span>
            <kbd className="hidden md:inline text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400">
              ^4
            </kbd>
          </button>
        </nav>

        {/* Right: Overlay controls & Hotkeys guide */}
        <div className="flex items-center gap-2">
          {/* HUD overlay trigger button */}
          <button
            id="toggle-overlay-visibility-btn"
            onClick={() => setOverlayVisible(!overlayVisible)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all border ${
              overlayVisible
                ? 'bg-teal-500/20 border-teal-500/40 text-teal-200'
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Переключить видимость HUD оверлея (Alt+Space)"
          >
            <Layers className="w-3.5 h-3.5 text-teal-400" />
            <span>HUD</span>
            <kbd className="px-1 py-0.2 text-[10px] bg-slate-900 border border-slate-700 text-orange-300 rounded">
              Alt+Space
            </kbd>
          </button>

          {/* Desktop background toggle */}
          <button
            id="toggle-desktop-mockup-btn"
            onClick={() => setShowDesktop(!showDesktop)}
            className={`p-2 rounded-lg border text-xs transition-colors ${
              showDesktop
                ? 'bg-teal-500/15 border-teal-500/30 text-teal-300'
                : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
            }`}
            title="Вкл/выкл фон рабочего стола для проверки прозрачности (Ctrl+B)"
          >
            {showDesktop ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>

          {/* Hotkeys helper button */}
          <button
            id="open-hotkeys-guide-btn"
            onClick={onOpenHotkeys}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-300 hover:bg-orange-500/20 text-xs font-mono transition-colors"
            title="Справочник горячих клавиш (Ctrl+5)"
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Клавиши</span>
            <span className="text-[10px] opacity-70">?</span>
          </button>
        </div>
      </div>
    </header>
  );
};
