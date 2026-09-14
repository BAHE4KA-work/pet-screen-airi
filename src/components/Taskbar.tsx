import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Layers,
  Clock,
  Settings,
  Mic,
  MicOff,
  ChevronUp,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
  Server,
  Activity,
  Radio,
  FileText,
  Volume2,
  ChevronDown,
  Check,
  RotateCw
} from 'lucide-react';
import { ViewSpec } from '../types';
import { actionLogger, ActionLogItem } from '../utils/actionLogger';
import { audioDevicesManager, AudioDeviceOption } from '../utils/audioDevices';
import { soundEffects } from '../utils/audioEffects';

interface TaskbarProps {
  hudVisible: boolean;
  onToggleHud: () => void;
  views: ViewSpec[];
  onFocusView?: (id: string) => void;
  onCloseView?: (id: string) => void;
  onSpawnQuickTime: () => void;
  onOpenSettings: (tab?: string) => void;
  onOpenActionLogs: () => void;
  windowMode: 'borderless' | 'fullscreen';
  onToggleWindowMode: () => void;
  showDesktop: boolean;
  onToggleDesktop: () => void;
}

export const Taskbar: React.FC<TaskbarProps> = ({
  hudVisible,
  onToggleHud,
  views,
  onFocusView,
  onCloseView,
  onSpawnQuickTime,
  onOpenSettings,
  onOpenActionLogs,
  windowMode,
  onToggleWindowMode,
  showDesktop,
  onToggleDesktop
}) => {
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [latestLog, setLatestLog] = useState<ActionLogItem | null>(null);
  const [audioDevices, setAudioDevices] = useState<AudioDeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(() => audioDevicesManager.getStoredDeviceId());
  const [showMicDropdown, setShowMicDropdown] = useState(false);
  const [showStartMenu, setShowStartMenu] = useState(false);

  // Live Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setDateStr(now.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Action Logs subscription
  useEffect(() => {
    const unsubscribe = actionLogger.subscribe((_, latest) => {
      setLatestLog(latest);
    });
    return unsubscribe;
  }, []);

  // Load Audio Input Devices
  useEffect(() => {
    const loadMics = async () => {
      const devs = await audioDevicesManager.getAudioInputDevices();
      setAudioDevices(devs);
      const stored = audioDevicesManager.getStoredDeviceId();
      if (stored && devs.some(d => d.deviceId === stored)) {
        setSelectedDeviceId(stored);
      } else if (devs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(devs[0].deviceId);
        audioDevicesManager.setStoredDeviceId(devs[0].deviceId);
      }
    };
    loadMics();

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', loadMics);
      return () => navigator.mediaDevices.removeEventListener('devicechange', loadMics);
    }
  }, []);

  const handleSelectMic = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    audioDevicesManager.setStoredDeviceId(deviceId);
    setShowMicDropdown(false);
    const dev = audioDevices.find(d => d.deviceId === deviceId);
    actionLogger.info('voice', `Выбран микрофон: ${dev?.label || deviceId}`);
    soundEffects.playCompletionPing();
  };

  const selectedDeviceName =
    audioDevices.find(d => d.deviceId === selectedDeviceId)?.label || 'Микрофон по умолчанию';

  return (
    <footer
      id="overlay-taskbar-panel"
      data-interactive="true"
      onClick={e => e.stopPropagation()}
      className="fixed bottom-0 left-0 right-0 z-50 h-11 sm:h-12 border-t backdrop-blur-2xl px-2 sm:px-3 flex items-center justify-between select-none shadow-2xl transition-all"
      style={{
        backgroundColor: 'rgba(11, 14, 20, 0.92)',
        borderColor: 'var(--c-border)'
      }}
    >
      {/* LEFT SECTION: Start Button + HUD Toggle + Active View Tabs */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Start / Logo Button */}
        <div className="relative">
          <button
            id="taskbar-start-btn"
            onClick={() => setShowStartMenu(!showStartMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all hover:bg-white/5 active:scale-95"
            style={{
              backgroundColor: showStartMenu ? 'var(--c-peach-surface)' : 'transparent',
              borderColor: showStartMenu ? 'var(--c-peach)' : 'var(--c-border)',
              color: 'var(--c-text)'
            }}
            title="Главное меню оверлея Airi"
          >
            <div className="w-4 h-4 rounded-md bg-radial from-[var(--c-peach)] to-[var(--c-peach)]/60 flex items-center justify-center text-zinc-950 font-bold text-[9px]">
              A
            </div>
            <span className="text-xs font-semibold tracking-tight hidden md:inline">
              Airi
            </span>
            <ChevronUp className={`w-3 h-3 transition-transform ${showStartMenu ? 'rotate-180 text-[var(--c-peach)]' : 'text-[var(--c-text-dim)]'}`} />
          </button>

          {/* Start Menu Popup */}
          {showStartMenu && (
            <div
              className="absolute left-0 bottom-full mb-2 w-64 p-2 rounded-2xl border shadow-2xl z-50 animate-fadeIn text-xs space-y-1"
              style={{
                backgroundColor: 'var(--c-bg-secondary)',
                borderColor: 'var(--c-border)'
              }}
            >
              <div className="px-2.5 py-2 border-b border-[var(--c-border)] mb-1">
                <div className="font-semibold text-[var(--c-text)]">Airi Overlay System</div>
                <div className="text-[10px] text-[var(--c-text-muted)]">Управление окнами, моделью и микросервисами</div>
              </div>

              <button
                onClick={() => {
                  onToggleHud();
                  setShowStartMenu(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-white/5 text-[var(--c-text)] transition-colors text-left"
              >
                <Layers className="w-3.5 h-3.5 text-[var(--c-peach)]" />
                <span>{hudVisible ? 'Скрыть HUD' : 'Показать HUD'} (Alt+Space)</span>
              </button>

              <button
                onClick={() => {
                  onSpawnQuickTime();
                  setShowStartMenu(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-white/5 text-[var(--c-text)] transition-colors text-left"
              >
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span>Окно системного времени</span>
              </button>

              <button
                onClick={() => {
                  onOpenActionLogs();
                  setShowStartMenu(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-white/5 text-[var(--c-text)] transition-colors text-left"
              >
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>Журнал действий и логов</span>
              </button>

              <button
                onClick={() => {
                  onOpenSettings('models');
                  setShowStartMenu(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-white/5 text-[var(--c-text)] transition-colors text-left"
              >
                <Cpu className="w-3.5 h-3.5 text-purple-400" />
                <span>Управление локальными моделями</span>
              </button>

              <button
                onClick={() => {
                  onOpenSettings('stt');
                  setShowStartMenu(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-white/5 text-[var(--c-text)] transition-colors text-left"
              >
                <Mic className="w-3.5 h-3.5 text-sky-400" />
                <span>Настройки STT (whisper.cpp)</span>
              </button>

              <button
                onClick={() => {
                  onOpenSettings('tools');
                  setShowStartMenu(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-white/5 text-[var(--c-text)] transition-colors text-left border-t border-[var(--c-border)] mt-1 pt-2"
              >
                <Settings className="w-3.5 h-3.5 text-[var(--c-text-muted)]" />
                <span>Все настройки</span>
              </button>
            </div>
          )}
        </div>

        {/* HUD Overlay Switcher Button */}
        <button
          id="taskbar-hud-toggle-btn"
          onClick={onToggleHud}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all ${
            hudVisible
              ? 'border-[var(--c-peach)]/50 bg-[var(--c-peach-surface)] text-[var(--c-peach-light)] shadow-xs'
              : 'border-[var(--c-border)] text-[var(--c-text-muted)] hover:text-[var(--c-text)] hover:bg-white/5'
          }`}
          title="Переключить видимость HUD оверлея (Alt+Space)"
        >
          <Layers className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">HUD</span>
          <span className={`w-1.5 h-1.5 rounded-full ${hudVisible ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
        </button>

        {/* Vertical divider */}
        <div className="h-4 w-px bg-[var(--c-border)]" />

        {/* Open Views Tabs (Панель запущенных окон) */}
        <div className="flex items-center gap-1 overflow-x-auto max-w-xs sm:max-w-md">
          {views.map(view => (
            <div
              key={view.id}
              onClick={() => onFocusView?.(view.id)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-secondary)] hover:bg-[var(--c-bg-tertiary)] text-[11px] text-[var(--c-text)] cursor-pointer transition-colors shrink-0"
              title={`Окно: ${view.title || view.type}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--c-peach)]" />
              <span className="truncate max-w-[90px]">{view.title || view.type}</span>
              {onCloseView && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onCloseView(view.id);
                  }}
                  className="p-0.5 text-[var(--c-text-dim)] hover:text-rose-400 rounded"
                >
                  ×
                </button>
              )}
            </div>
          ))}

          {views.length === 0 && (
            <span className="text-[11px] text-[var(--c-text-dim)] italic hidden lg:inline pl-1">
              Окна не открыты
            </span>
          )}
        </div>
      </div>

      {/* CENTER SECTION: Live Action Ticker / Activity Feed */}
      <div
        onClick={onOpenActionLogs}
        className="hidden md:flex items-center gap-2 px-3 py-1 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-primary)] hover:border-[var(--c-peach)]/40 hover:bg-[var(--c-bg-secondary)] cursor-pointer transition-all max-w-sm lg:max-w-md truncate"
        title="Нажмите, чтобы открыть подробный журнал действий"
      >
        <div className="flex items-center gap-1.5 shrink-0">
          <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          <span className="text-[10px] font-mono text-[var(--c-text-dim)] uppercase tracking-wider">
            Действие:
          </span>
        </div>
        <span className="text-[11px] text-[var(--c-text-muted)] truncate font-mono">
          {latestLog ? latestLog.title : 'Ожидание команд пользователя...'}
        </span>
      </div>

      {/* RIGHT SECTION: Mic Device Switcher + Logs + Status + Clock + Tray */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Audio Input Device Selector Quick Menu */}
        <div className="relative">
          <button
            id="taskbar-mic-select-btn"
            onClick={() => setShowMicDropdown(!showMicDropdown)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-secondary)] hover:bg-[var(--c-bg-tertiary)] text-[11px] text-[var(--c-text)] transition-colors"
            title={`Текущий микрофон: ${selectedDeviceName}`}
          >
            <Mic className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden xl:inline max-w-[120px] truncate text-[11px]">
              {selectedDeviceName.split('(')[0]}
            </span>
            <ChevronDown className="w-3 h-3 text-[var(--c-text-dim)]" />
          </button>

          {showMicDropdown && (
            <div
              className="absolute right-0 bottom-full mb-2 w-72 p-2 rounded-2xl border shadow-2xl z-50 animate-fadeIn text-xs"
              style={{
                backgroundColor: 'var(--c-bg-secondary)',
                borderColor: 'var(--c-border)'
              }}
            >
              <div className="flex items-center justify-between mb-2 pb-1 border-b border-[var(--c-border)] px-1">
                <span className="font-semibold text-[var(--c-text)] text-[11px]">
                  Устройства ввода (Микрофоны)
                </span>
                <button
                  onClick={async () => {
                    const devs = await audioDevicesManager.getAudioInputDevices();
                    setAudioDevices(devs);
                  }}
                  className="text-[10px] text-[var(--c-peach)] hover:underline flex items-center gap-1"
                >
                  <RotateCw className="w-2.5 h-2.5" />
                  Обновить
                </button>
              </div>

              <div className="space-y-1 max-h-56 overflow-y-auto">
                {audioDevices.length > 0 ? (
                  audioDevices.map(d => {
                    const isSelected = selectedDeviceId === d.deviceId;
                    return (
                      <button
                        key={d.deviceId}
                        onClick={() => handleSelectMic(d.deviceId)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-[11px] transition-colors ${
                          isSelected
                            ? 'bg-[var(--c-peach-surface)] text-[var(--c-peach-light)] font-medium border border-[var(--c-peach)]/30'
                            : 'text-[var(--c-text-muted)] hover:bg-white/5 hover:text-[var(--c-text)]'
                        }`}
                      >
                        <span className="truncate pr-2">{d.label}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-[var(--c-peach)] shrink-0" />}
                      </button>
                    );
                  })
                ) : (
                  <div className="text-[11px] text-[var(--c-text-dim)] p-2 text-center">
                    Микрофоны не обнаружены
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Logs Drawer Trigger Button */}
        <button
          id="taskbar-action-logs-btn"
          onClick={onOpenActionLogs}
          className="p-1.5 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-secondary)] hover:bg-[var(--c-bg-tertiary)] text-[var(--c-text-muted)] hover:text-[var(--c-text)] transition-colors"
          title="Открыть журнал событий и логов"
        >
          <Activity className="w-4 h-4 text-emerald-400" />
        </button>

        {/* Window Mode Toggle */}
        <button
          id="taskbar-window-mode-btn"
          onClick={onToggleWindowMode}
          className="p-1.5 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-secondary)] hover:bg-[var(--c-bg-tertiary)] text-[var(--c-text-muted)] hover:text-[var(--c-peach)] transition-colors"
          title={
            windowMode === 'fullscreen'
              ? 'Полноэкранный режим. Кликните для перехода в безрамочный оверлей (сохраняет доступ к панели задач Windows)'
              : 'Безрамочный оверлей (панель задач доступна)'
          }
        >
          {windowMode === 'fullscreen' ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        {/* Desktop Mockup Toggle */}
        <button
          id="taskbar-desktop-toggle-btn"
          onClick={onToggleDesktop}
          className="p-1.5 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-secondary)] hover:bg-[var(--c-bg-tertiary)] text-[var(--c-text-muted)] hover:text-[var(--c-peach)] transition-colors hidden sm:flex"
          title="Переключить отображение фона рабочего стола"
        >
          {showDesktop ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>

        {/* Settings button */}
        <button
          id="taskbar-settings-btn"
          onClick={() => onOpenSettings('tools')}
          className="p-1.5 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-secondary)] hover:bg-[var(--c-bg-tertiary)] text-[var(--c-text-muted)] hover:text-[var(--c-text)] transition-colors"
          title="Открыть настройки"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* System Clock & Date */}
        <div className="hidden sm:flex flex-col items-end pl-1 text-[10px] font-mono leading-tight text-[var(--c-text)]">
          <span className="font-semibold">{timeStr}</span>
          <span className="text-[9px] text-[var(--c-text-dim)]">{dateStr}</span>
        </div>

        {/* Show Desktop Strip (Windows-style peek bar at far right) */}
        <div
          id="taskbar-show-desktop-strip"
          onClick={onToggleDesktop}
          className="w-1.5 sm:w-2 h-7 rounded-xs border-l border-[var(--c-border)] hover:bg-[var(--c-peach)]/40 cursor-pointer transition-colors ml-0.5"
          title="Свернуть все окна / Показать рабочий стол"
        />
      </div>
    </footer>
  );
};
