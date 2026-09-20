/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, Eye, EyeOff, Sparkles, Clock, Activity, Maximize2, Minimize2, Monitor, PanelBottom, GripVertical, Ghost } from 'lucide-react';
import { FloatingHud } from './components/FloatingHud';
import { SettingsModal } from './components/SettingsModal';
import { DesktopBackground } from './components/DesktopBackground';
import { ViewRenderer } from './components/views/ViewRenderer';
import { Taskbar } from './components/Taskbar';
import { ActionLogsDrawer } from './components/ActionLogsDrawer';
import {
  ModelStatus,
  ModuleGroup,
  ToolDefinition,
  ModelTrainingManifest,
  ExecutionLog,
  AccuracyRating,
  ViewSpec
} from './types';
import { soundEffects } from './utils/audioEffects';
import { electronBridge } from './utils/electronBridge';
import { tauriBridge } from './services/tauriBridge';
import { themeManager } from './utils/themeManager';
import { hotkeyManager } from './utils/hotkeyManager';
import { actionLogger } from './utils/actionLogger';

export default function App() {
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [modules, setModules] = useState<ModuleGroup[]>([]);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [manifest, setManifest] = useState<ModelTrainingManifest | null>(null);
  const [currentChecksum, setCurrentChecksum] = useState<string>('');
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    exact: 0,
    hallucinated: 0,
    wrongTool: 0,
    failed: 0,
    unrated: 0,
    accuracyPercent: 100
  });

  // Main UI State: HUD visibility, pinning, and Views system
  const [hudVisible, setHudVisible] = useState(true);
  const [isHudPinned, setIsHudPinned] = useState(false);
  const [views, setViews] = useState<ViewSpec[]>([]);
  const [isActionLogsOpen, setIsActionLogsOpen] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('tools');

  // Real Overlay & Window Mode Preferences
  const [isOverlayMode, setIsOverlayMode] = useState<boolean>(() => {
    return electronBridge.isElectron() || tauriBridge.isTauri() || (typeof window !== 'undefined' && window.location.search.includes('mode=overlay'));
  });
  const [windowMode, setWindowMode] = useState<'borderless' | 'fullscreen'>('borderless');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [desktopOpacity, setDesktopOpacity] = useState(0.4);
  // In native overlay mode (Tauri or Electron), disable fake desktop background so real host screen is seen
  const [showDesktop, setShowDesktop] = useState<boolean>(() => {
    const isDesktop = electronBridge.isElectron() || tauriBridge.isTauri() || (typeof window !== 'undefined' && window.location.search.includes('mode=overlay'));
    if (isDesktop) return false;
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('overlay_show_desktop') : null;
    return saved !== null ? saved === 'true' : true;
  });
  const [showSimulatedMockup, setShowSimulatedMockup] = useState(false);
  const [isTaskbarVisible, setIsTaskbarVisible] = useState<boolean>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('overlay_taskbar_visible') : null;
    return saved !== null ? saved === 'true' : true;
  });
  const [isGhostMode, setIsGhostMode] = useState(false);

  // Draggable and Corner-Sticky Dock Controls
  type CornerPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  const [dockCorner, setDockCorner] = useState<CornerPosition>(() => {
    const saved = localStorage.getItem('overlay_dock_corner') as CornerPosition | null;
    return saved || 'top-right';
  });
  const [dockCustomPos, setDockCustomPos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingDock, setIsDraggingDock] = useState(false);
  const [snapCandidate, setSnapCandidate] = useState<CornerPosition | null>(null);
  const dockRef = useRef<HTMLElement | null>(null);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({
    mouseX: 0,
    mouseY: 0,
    startX: 0,
    startY: 0
  });

  const getCornerCoordinates = useCallback((corner: CornerPosition, dockWidth: number, dockHeight: number) => {
    const pad = 16;
    const bottomPad = isTaskbarVisible ? 60 : 16;
    switch (corner) {
      case 'top-left':
        return { x: pad, y: pad };
      case 'top-right':
        return { x: window.innerWidth - dockWidth - pad, y: pad };
      case 'bottom-left':
        return { x: pad, y: window.innerHeight - dockHeight - bottomPad };
      case 'bottom-right':
        return { x: window.innerWidth - dockWidth - pad, y: window.innerHeight - dockHeight - bottomPad };
    }
  }, [isTaskbarVisible]);

  const handleDockDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dockRef.current) return;
    const rect = dockRef.current.getBoundingClientRect();
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: rect.left,
      startY: rect.top
    };
    setDockCustomPos({ x: rect.left, y: rect.top });
    setIsDraggingDock(true);
  };

  useEffect(() => {
    if (!isDraggingDock) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dockRef.current) return;
      const dockRect = dockRef.current.getBoundingClientRect();
      const dockW = dockRect.width;
      const dockH = dockRect.height;

      const deltaX = e.clientX - dragStartRef.current.mouseX;
      const deltaY = e.clientY - dragStartRef.current.mouseY;
      const rawX = dragStartRef.current.startX + deltaX;
      const rawY = dragStartRef.current.startY + deltaY;

      // Viewport clamping
      const maxX = window.innerWidth - dockW - 8;
      const maxY = window.innerHeight - dockH - (isTaskbarVisible ? 56 : 8);
      const clampedX = Math.max(8, Math.min(rawX, maxX));
      const clampedY = Math.max(8, Math.min(rawY, maxY));

      setDockCustomPos({ x: clampedX, y: clampedY });

      // Find closest corner for sticky snap
      const corners: CornerPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
      let closestCorner: CornerPosition = 'top-right';
      let minDistance = Infinity;

      corners.forEach(corner => {
        const target = getCornerCoordinates(corner, dockW, dockH);
        const dist = Math.hypot(clampedX - target.x, clampedY - target.y);
        if (dist < minDistance) {
          minDistance = dist;
          closestCorner = corner;
        }
      });

      // Stickiness / magnetic threshold: 160px or quadrant
      if (minDistance < 200) {
        setSnapCandidate(closestCorner);
      } else {
        const isTop = clampedY < window.innerHeight / 2;
        const isLeft = clampedX < window.innerWidth / 2;
        const quadCorner: CornerPosition = isTop
          ? isLeft
            ? 'top-left'
            : 'top-right'
          : isLeft
          ? 'bottom-left'
          : 'bottom-right';
        setSnapCandidate(quadCorner);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingDock(false);
      if (snapCandidate) {
        setDockCorner(snapCandidate);
        localStorage.setItem('overlay_dock_corner', snapCandidate);
        soundEffects.playCompletionPing();
        actionLogger.info('ui', `Панель управления прикреплена к углу: ${snapCandidate}`);
      }
      setDockCustomPos(null);
      setSnapCandidate(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingDock, snapCandidate, isTaskbarVisible, getCornerCoordinates]);

  // Set transparency class on document for overlay mode
  useEffect(() => {
    const checkOverlay = () => {
      const isOverlay = electronBridge.isElectron() || tauriBridge.isTauri() || window.location.search.includes('mode=overlay');
      setIsOverlayMode(isOverlay);
      if (isOverlay) {
        document.documentElement.classList.add('is-overlay-mode');
        document.body.classList.add('is-overlay-transparent');
      }
    };
    checkOverlay();
    const t = setTimeout(checkOverlay, 150);
    return () => clearTimeout(t);
  }, []);

  // Hardware Click-Through and Focus handling for Tauri
  useEffect(() => {
    if (tauriBridge.isTauri()) {
      // In Tauri: window is fully interactive by default so user can click, drag, and interact with all elements.
      // Click-through is only engaged if user explicitly enabled Ghost Mode, or if the entire HUD and all windows are hidden.
      const shouldIgnore = isGhostMode || (!hudVisible && views.length === 0 && !settingsOpen && !isTaskbarVisible);
      tauriBridge.setClickThrough(shouldIgnore);
    }
  }, [isGhostMode, hudVisible, views.length, settingsOpen, isTaskbarVisible]);

  // Dynamic Electron hardware click-through / interactivity management
  // ONLY for Electron (because Electron's setIgnoreMouseEvents with { forward: true } passes mousemove back to renderer)
  useEffect(() => {
    if (!electronBridge.isElectron()) return;

    let isInteractiveCurrent: boolean | null = null;

    const setInteractivity = (shouldBeInteractive: boolean) => {
      if (shouldBeInteractive !== isInteractiveCurrent) {
        isInteractiveCurrent = shouldBeInteractive;
        electronBridge.setInteractive(shouldBeInteractive);
      }
    };

    const updateInteractivity = (clientX: number, clientY: number) => {
      // If modal is open, always keep window interactive
      if (settingsOpen) {
        setInteractivity(true);
        return;
      }

      // Check element directly under cursor coordinates
      const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      if (!target) {
        setInteractivity(false);
        return;
      }

      // Check if element is part of interactive UI
      const isInteractiveElement = Boolean(
        target.closest('#floating-hud-window') ||
        target.closest('.view-window') ||
        target.closest('[id^="view-window-"]') ||
        target.closest('#corner-dock-controls') ||
        target.closest('#settings-modal-window') ||
        target.closest('#summon-hud-eye-btn') ||
        target.closest('#taskbar-panel') ||
        target.closest('button, input, textarea, a, select, [role="button"]') ||
        target.dataset.interactive === 'true' ||
        target.getAttribute('data-interactive') === 'true'
      );

      // Check if target is explicitly workspace surface / empty background
      const isWorkspace =
        target.id === 'workspace-layer' ||
        target.id === 'app-root-container' ||
        target.id === 'desktop-background-layer' ||
        target.dataset.workspace === 'true' ||
        target.classList.contains('workspace-surface') ||
        target === document.body ||
        target === document.documentElement;

      // Allow bottom edge (taskbar zone) to pass directly to host OS taskbar/dock
      const isInsideInteractiveWindow = Boolean(
        target.closest('#floating-hud-window') ||
        target.closest('.view-window') ||
        target.closest('#settings-modal-window') ||
        target.closest('#corner-dock-controls') ||
        target.closest('#taskbar-panel')
      );
      const isNearTaskbarEdge = clientY >= window.innerHeight - 24 && !isInsideInteractiveWindow;

      const shouldBeInteractive = isInteractiveElement && !isWorkspace && !isNearTaskbarEdge;
      setInteractivity(shouldBeInteractive);
    };

    const handleMouseMove = (e: MouseEvent) => {
      updateInteractivity(e.clientX, e.clientY);
    };

    const handleMouseLeave = () => {
      if (!settingsOpen) {
        setInteractivity(false);
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.closest('button, form'))) {
        setInteractivity(true);
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('focusin', handleFocusIn);

    // Initial state: start transparent/click-through
    setInteractivity(false);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [settingsOpen]);

  // Fullscreen tracking
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFull = Boolean(document.fullscreenElement);
      setIsFullscreen(isFull);
      if (!isFull && windowMode === 'fullscreen') {
        setWindowMode('borderless');
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [windowMode]);

  const toggleWindowMode = () => {
    if (windowMode === 'borderless') {
      setWindowMode('fullscreen');
      electronBridge.setWindowMode('fullscreen');
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else {
      setWindowMode('borderless');
      electronBridge.setWindowMode('borderless');
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  // Electron global hotkey listener
  useEffect(() => {
    electronBridge.onToggleHud(() => {
      setHudVisible(prev => !prev);
    });
  }, []);

  // Views management
  const handleSpawnView = useCallback((newView: ViewSpec) => {
    setViews(prev => {
      // If view with same ID already exists, update it
      const existingIdx = prev.findIndex(v => v.id === newView.id);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...newView,
          pinned: prev[existingIdx].pinned, // preserve user's pin state
          position: prev[existingIdx].position // preserve user's window position
        };
        return updated;
      }

      // Default positioning: place slightly to the right or cascading
      const offsetCount = prev.length % 5;
      const defaultX = Math.min(
        window.innerWidth - (newView.width || 380) - 40,
        Math.max(40, window.innerWidth / 2 + 60 + offsetCount * 30)
      );
      const defaultY = Math.min(
        window.innerHeight - 300,
        Math.max(60, 100 + offsetCount * 45)
      );

      const positionedView: ViewSpec = {
        ...newView,
        position: newView.position?.x ? newView.position : { x: defaultX, y: defaultY }
      };

      actionLogger.info('ui', `Открыто окно: ${newView.title || newView.type} (id: ${newView.id})`, newView);
      return [...prev, positionedView];
    });
  }, []);

  const handleTogglePinView = useCallback((id: string) => {
    setViews(prev =>
      prev.map(v => {
        if (v.id === id) {
          const nextPinned = !v.pinned;
          actionLogger.info('ui', `Окно "${v.title || v.type}" ${nextPinned ? 'закреплено' : 'откреплено'}`);
          return { ...v, pinned: nextPinned };
        }
        return v;
      })
    );
  }, []);

  const handleCloseView = useCallback((id: string) => {
    setViews(prev => {
      const closing = prev.find(v => v.id === id);
      if (closing) {
        actionLogger.info('ui', `Закрыто окно: ${closing.title || closing.type}`);
      }
      return prev.filter(v => v.id !== id);
    });
  }, []);

  const handlePositionChange = useCallback((id: string, pos: { x: number; y: number }) => {
    setViews(prev =>
      prev.map(v => (v.id === id ? { ...v, position: pos } : v))
    );
  }, []);

  // Instant auto-close of unpinned windows upon workspace background click
  const handleWorkspaceClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isWorkspaceSurface =
      target.dataset.workspace === 'true' ||
      target.classList.contains('workspace-surface') ||
      target.id === 'workspace-layer' ||
      target.id === 'desktop-background-canvas';

    if (isWorkspaceSurface) {
      // Close all unpinned views
      setViews(prev => prev.filter(v => v.pinned));
      // If HUD is unpinned, close it
      if (!isHudPinned) {
        setHudVisible(false);
      }
    }
  };

  // Fetch initial data
  const fetchData = useCallback(async () => {
    try {
      const [statusRes, modulesRes, logsRes] = await Promise.all([
        fetch('/api/status').then(r => r.json()),
        fetch('/api/modules').then(r => r.json()),
        fetch('/api/logs').then(r => r.json())
      ]);

      setStatus(statusRes);
      setModules(modulesRes.modules || []);
      setTools(modulesRes.tools || []);
      setManifest(modulesRes.trainingManifest || null);
      setCurrentChecksum(modulesRes.currentChecksum || '');
      setLogs(logsRes.logs || []);
      if (logsRes.stats) setStats(logsRes.stats);

      actionLogger.info('system', `Загружены инструменты (${modulesRes.tools?.length || 0}) и статус модели`, {
        modelLoaded: statusRes?.loaded,
        toolsCount: modulesRes.tools?.length || 0
      });
    } catch (err) {
      console.error('Failed to load initial data:', err);
      actionLogger.error('system', 'Ошибка загрузки данных конфигурации', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Execute query via API
  const handleExecuteQuery = async (prompt: string) => {
    const res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    const data = await res.json();

    // Refresh logs and status asynchronously
    fetch('/api/logs')
      .then(r => r.json())
      .then(logsRes => {
        setLogs(logsRes.logs || []);
        if (logsRes.stats) setStats(logsRes.stats);
      });
    fetch('/api/status')
      .then(r => r.json())
      .then(s => setStatus(s));

    if (!res.ok) {
      throw new Error(data.error || 'Ошибка исполнения запроса');
    }
    return data;
  };

  const handleToggleModel = async () => {
    try {
      const res = await fetch('/api/model/unload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      setStatus(prev => prev ? { ...prev, loaded: data.loaded } : null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleIgnoreConflict = async () => {
    try {
      const res = await fetch('/api/model/ignore-conflict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      setStatus(prev => prev ? { ...prev, ignoreConflict: data.ignoreConflict } : null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSyncManifest = async () => {
    try {
      const res = await fetch('/api/model/sync-manifest', { method: 'POST' });
      const data = await res.json();
      setManifest(data.manifest);
      await fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleReloadModules = async () => {
    try {
      await fetch('/api/modules/reload', { method: 'POST' });
      await fetchData();
      soundEffects.playSuccessChime();
    } catch (e) {
      console.error(e);
      soundEffects.playWarningCue();
    }
  };

  const handleResetDefaults = async () => {
    try {
      await fetch('/api/modules/reset-defaults', { method: 'POST' });
      await fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveTool = async (toolData: ToolDefinition) => {
    const res = await fetch('/api/modules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toolData)
    });
    if (!res.ok) throw new Error('Failed to save tool');
    await fetchData();
  };

  const handleDeleteTool = async (id: string) => {
    await fetch(`/api/modules/${id}`, { method: 'DELETE' });
    await fetchData();
  };

  const handleRateAccuracy = async (id: string, rating: AccuracyRating, note?: string) => {
    try {
      await fetch(`/api/logs/${id}/accuracy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, note })
      });
      const logsRes = await fetch('/api/logs').then(r => r.json());
      setLogs(logsRes.logs || []);
      if (logsRes.stats) setStats(logsRes.stats);
    } catch (e) {
      console.error(e);
    }
  };

  const handleExportLogs = (format: 'json' | 'jsonl') => {
    window.location.href = `/api/logs/export?format=${format}`;
  };

  const openSettings = (tab = 'tools') => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  // Initialize Theme
  useEffect(() => {
    themeManager.init();
  }, []);

  // Update interactivity when visibility changes
  useEffect(() => {
    if (!hudVisible && !settingsOpen && views.length === 0) {
      electronBridge.setInteractive(false);
    } else {
      electronBridge.setInteractive(true);
    }
  }, [hudVisible, settingsOpen, views.length]);

  // Keyboard Shortcuts Handler using hotkeyManager
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Toggle HUD
      if (hotkeyManager.matches('toggle_hud', e) || (e.altKey && e.code === 'Space') || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        setHudVisible(prev => !prev);
        return;
      }

      // 2. Open Settings
      if (hotkeyManager.matches('open_settings', e) || ((e.ctrlKey || e.metaKey) && e.key === ',')) {
        e.preventDefault();
        setSettingsOpen(prev => !prev);
        return;
      }

      // 3. Escape / Close Window
      if (hotkeyManager.matches('close_window', e) || e.key === 'Escape') {
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (hudVisible) {
          setHudVisible(false);
          return;
        }
      }

      // 4. Quick actions
      if (hotkeyManager.matches('toggle_ghost_mode', e) || (e.altKey && e.key.toLowerCase() === 'g')) {
        e.preventDefault();
        setIsGhostMode(prev => {
          const next = !prev;
          if (next) {
            soundEffects.playWarningCue();
            actionLogger.info('ui', 'Сквозной режим (Ghost Mode) включен по горячей клавише Alt+G');
          } else {
            soundEffects.playCompletionPing();
            actionLogger.info('ui', 'Сквозной режим выключен по горячей клавише Alt+G. Оверлей интерактивен.');
          }
          return next;
        });
      } else if (hotkeyManager.matches('toggle_model', e)) {
        e.preventDefault();
        handleToggleModel();
      } else if (hotkeyManager.matches('ignore_conflict', e)) {
        e.preventDefault();
        handleIgnoreConflict();
      } else if (hotkeyManager.matches('reload_modules', e)) {
        e.preventDefault();
        handleReloadModules();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settingsOpen, hudVisible]);

  return (
    <div
      id="workspace-layer"
      data-workspace="true"
      onClick={handleWorkspaceClick}
      className="min-h-screen w-full relative overflow-hidden select-none workspace-surface"
    >
      {/* Soft desktop background preview */}
      {showDesktop && (
        <DesktopBackground
          opacity={desktopOpacity}
          showSimulatedMockup={showSimulatedMockup}
        />
      )}

      {/* Floating Single Draggable HUD Window */}
      {hudVisible && (
        <div
          data-interactive="true"
          className="interactive-ui"
          onMouseEnter={() => electronBridge.setInteractive(true)}
        >
          <FloatingHud
            status={status}
            history={logs.map(l => l.prompt)}
            isPinned={isHudPinned}
            onTogglePin={() => setIsHudPinned(prev => !prev)}
            onSpawnView={handleSpawnView}
            onExecuteQuery={handleExecuteQuery}
            onOpenSettings={openSettings}
            onClose={() => setHudVisible(false)}
          />
        </div>
      )}

      {/* Render all active Views (formalized overlay components with pinning) */}
      <div
        data-interactive="true"
        className="interactive-ui"
        onMouseEnter={() => electronBridge.setInteractive(true)}
      >
        {views.map(view => (
          <ViewRenderer
            key={view.id}
            view={view}
            onTogglePin={handleTogglePinView}
            onClose={handleCloseView}
            onPositionChange={handlePositionChange}
          />
        ))}
      </div>

      {/* Ghost snap indicator when dragging dock to screen corners */}
      {isDraggingDock && snapCandidate && (
        <div
          className={`fixed z-30 pointer-events-none rounded-xl border-2 border-dashed border-[var(--c-peach)]/70 bg-[var(--c-peach-surface)]/30 backdrop-blur-xs transition-all duration-200 ${
            snapCandidate === 'top-left'
              ? 'top-4 left-4'
              : snapCandidate === 'top-right'
              ? 'top-4 right-4'
              : snapCandidate === 'bottom-left'
              ? `left-4 ${isTaskbarVisible ? 'bottom-16' : 'bottom-4'}`
              : `right-4 ${isTaskbarVisible ? 'bottom-16' : 'bottom-4'}`
          }`}
          style={{
            width: dockRef.current?.offsetWidth || 230,
            height: dockRef.current?.offsetHeight || 44
          }}
        />
      )}

      {/* Discrete Draggable & Corner-Sticky Control Bar (Minimal dock) */}
      {hudVisible && (
        <aside
          ref={dockRef}
          id="corner-dock-controls"
          data-interactive="true"
          onClick={e => e.stopPropagation()}
          onMouseEnter={() => electronBridge.setInteractive(true)}
          className={`interactive-ui fixed z-40 flex items-center gap-1.5 p-1.5 rounded-xl border shadow-xl backdrop-blur-xl select-none ${
            dockCustomPos
              ? ''
              : `transition-all duration-300 ${
                  dockCorner === 'top-left'
                    ? 'top-4 left-4'
                    : dockCorner === 'top-right'
                    ? 'top-4 right-4'
                    : dockCorner === 'bottom-left'
                    ? `left-4 ${isTaskbarVisible ? 'bottom-16' : 'bottom-4'}`
                    : `right-4 ${isTaskbarVisible ? 'bottom-16' : 'bottom-4'}`
                }`
          }`}
          style={{
            backgroundColor: 'rgba(18, 21, 29, 0.88)',
            borderColor: isDraggingDock ? 'var(--c-peach)' : 'var(--c-border)',
            ...(dockCustomPos ? { left: `${dockCustomPos.x}px`, top: `${dockCustomPos.y}px` } : {})
          }}
        >
          {/* Drag Handle to stick dock to any screen corner */}
          <div
            onMouseDown={handleDockDragStart}
            className="px-1 py-2 rounded-md text-[var(--c-text-dim)] hover:text-[var(--c-peach)] cursor-grab active:cursor-grabbing hover:bg-white/5 transition-colors flex items-center justify-center"
            title="Перетащите для перемещения панели или прилипания к углам экрана"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>

          {/* Taskbar Toggle Button (Moved from broken bottom plate to dock icon) */}
          <button
            id="dock-taskbar-toggle-btn"
            onClick={() => {
              const next = !isTaskbarVisible;
              setIsTaskbarVisible(next);
              localStorage.setItem('overlay_taskbar_visible', String(next));
              soundEffects.playToolCallCue();
              actionLogger.info('ui', next ? 'Панель задач отображена' : 'Панель задач скрыта');
            }}
            className={`p-2 rounded-lg transition-colors ${
              isTaskbarVisible
                ? 'text-[var(--c-peach)] bg-[var(--c-peach-surface)]'
                : 'text-[var(--c-text-muted)] hover:text-[var(--c-peach)]'
            }`}
            title={isTaskbarVisible ? 'Скрыть панель задач' : 'Показать панель задач'}
          >
            <PanelBottom className="w-4 h-4" />
          </button>

          {/* Window Mode Toggle (Borderless Desktop vs Exclusive Fullscreen) */}
          <button
            id="dock-fullscreen-btn"
            onClick={toggleWindowMode}
            className={`p-2 rounded-lg transition-colors ${
              windowMode === 'fullscreen'
                ? 'text-[var(--c-peach)] bg-[var(--c-peach-surface)]'
                : 'text-[var(--c-text-muted)] hover:text-[var(--c-peach)]'
            }`}
            title={
              windowMode === 'fullscreen'
                ? 'Полноэкранный режим активен. Нажмите для переключения в безрамочный оверлей (сохраняет доступ к панели задач ОС)'
                : 'Безрамочный оверлей активен (панель задач доступна). Нажмите для полноэкранного режима'
            }
          >
            {windowMode === 'fullscreen' ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Quick standard View: Time */}
          <button
            id="dock-quick-time-btn"
            onClick={() => {
              handleSpawnView({
                id: `view-time-${Date.now()}`,
                type: 'time',
                title: 'Системное время',
                pinned: false,
                data: {
                  timestamp: Date.now(),
                  format: '24h',
                  showSeconds: true,
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
                }
              });
              soundEffects.playCompletionPing();
            }}
            className="p-2 rounded-lg text-[var(--c-text-muted)] hover:text-[var(--c-peach)] transition-colors"
            title="Открыть окно системного времени (Views: Time)"
          >
            <Clock className="w-4 h-4" />
          </button>

          {/* Ghost Mode / Click-through Mode Toggle */}
          <button
            id="dock-ghost-mode-btn"
            onClick={() => {
              const next = !isGhostMode;
              setIsGhostMode(next);
              if (next) {
                soundEffects.playWarningCue();
                actionLogger.info('ui', 'Сквозной режим (Ghost Mode) включен. Клики проходят сквозь оверлей.');
              } else {
                soundEffects.playCompletionPing();
                actionLogger.info('ui', 'Сквозной режим выключен. Полная интерактивность оверлея активна.');
              }
            }}
            className={`p-2 rounded-lg transition-colors ${
              isGhostMode
                ? 'text-amber-400 bg-amber-500/20 ring-1 ring-amber-400/50'
                : 'text-[var(--c-text-muted)] hover:text-[var(--c-peach)]'
            }`}
            title={
              isGhostMode
                ? 'Сквозной режим (Ghost Mode) активен: клики проходят сквозь окно к приложениям Windows (Alt+G)'
                : 'Включить сквозной режим (Ghost Mode): клики будут проходить сквозь оверлей (Alt+G)'
            }
          >
            <Ghost className="w-4 h-4" />
          </button>

          <button
            onClick={() => setHudVisible(false)}
            className="p-2 rounded-lg text-[var(--c-text-muted)] hover:text-[var(--c-peach)] transition-colors"
            title="Скрыть весь интерфейс (Alt + Space)"
          >
            <Eye className="w-4 h-4" />
          </button>

          <button
            onClick={() => openSettings('tools')}
            className="p-2 rounded-lg text-[var(--c-text-muted)] hover:text-[var(--c-peach)] transition-colors"
            title="Настройки"
          >
            <Settings className="w-4 h-4" />
          </button>
        </aside>
      )}

      {/* Discreet floating summon button when HUD is hidden */}
      {!hudVisible && (
        <button
          id="summon-hud-eye-btn"
          data-interactive="true"
          onClick={() => {
            setHudVisible(true);
            soundEffects.playCompletionPing();
            actionLogger.info('ui', 'HUD оверлей вызван по кнопке');
          }}
          className="interactive-ui fixed top-4 right-4 z-50 p-2.5 rounded-full bg-[var(--c-bg-secondary)]/90 border border-[var(--c-peach-border)] text-[var(--c-peach)] shadow-xl hover:scale-105 hover:bg-[var(--c-peach-surface)] transition-all cursor-pointer"
          title="Показать HUD оверлей (Alt + Space)"
        >
          <Eye className="w-4 h-4" />
        </button>
      )}

      {/* Separate Settings & Info Window */}
      <SettingsModal
        isOpen={settingsOpen}
        initialTab={settingsTab}
        onClose={() => setSettingsOpen(false)}
        status={status}
        manifest={manifest}
        modules={modules}
        tools={tools}
        currentChecksum={currentChecksum}
        logs={logs}
        stats={stats}
        onSaveTool={handleSaveTool}
        onDeleteTool={handleDeleteTool}
        onReloadModules={handleReloadModules}
        onResetDefaults={handleResetDefaults}
        onIgnoreConflict={handleIgnoreConflict}
        onToggleModel={handleToggleModel}
        onSyncManifest={handleSyncManifest}
        onRateAccuracy={handleRateAccuracy}
        onExportLogs={handleExportLogs}
        desktopOpacity={desktopOpacity}
        setDesktopOpacity={setDesktopOpacity}
        showDesktop={showDesktop}
        setShowDesktop={setShowDesktop}
        isTaskbarVisible={isTaskbarVisible}
        setIsTaskbarVisible={setIsTaskbarVisible}
      />

      {/* Persistent Bottom Taskbar (Панель задач) */}
      <Taskbar
        isVisible={isTaskbarVisible}
        onToggleVisible={setIsTaskbarVisible}
        hudVisible={hudVisible}
        onToggleHud={() => {
          const next = !hudVisible;
          setHudVisible(next);
          actionLogger.info('ui', next ? 'HUD оверлей показан (через панель задач)' : 'HUD оверлей скрыт (через панель задач)');
        }}
        views={views}
        onFocusView={id => {
          // Bring view to front
          setViews(prev => {
            const item = prev.find(v => v.id === id);
            if (!item) return prev;
            actionLogger.info('ui', `Фокус переведён на окно: ${item.title || item.type}`);
            return [...prev.filter(v => v.id !== id), item];
          });
        }}
        onCloseView={handleCloseView}
        onSpawnQuickTime={() => {
          handleSpawnView({
            id: `view-time-${Date.now()}`,
            type: 'time',
            title: 'Системное время',
            pinned: false,
            data: {
              timestamp: Date.now(),
              format: '24h',
              showSeconds: true,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
            }
          });
          soundEffects.playCompletionPing();
        }}
        onOpenSettings={openSettings}
        onOpenActionLogs={() => setIsActionLogsOpen(true)}
        windowMode={windowMode}
        onToggleWindowMode={toggleWindowMode}
        showDesktop={showDesktop}
        onToggleDesktop={() => {
          const next = !showDesktop;
          setShowDesktop(next);
          actionLogger.info('ui', next ? 'Отображение фона рабочего стола включено' : 'Фон рабочего стола скрыт (чистый оверлей)');
        }}
      />

      {/* Live System Action Logs Drawer */}
      <ActionLogsDrawer
        isOpen={isActionLogsOpen}
        onClose={() => setIsActionLogsOpen(false)}
      />
    </div>
  );
}
