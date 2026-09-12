/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Settings, Eye, EyeOff, Sparkles, Clock, Activity, Maximize2, Minimize2, Monitor } from 'lucide-react';
import { FloatingHud } from './components/FloatingHud';
import { SettingsModal } from './components/SettingsModal';
import { DesktopBackground } from './components/DesktopBackground';
import { ViewRenderer } from './components/views/ViewRenderer';
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

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('tools');

  // Fullscreen and Real Overlay Preferences
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [desktopOpacity, setDesktopOpacity] = useState(0.4);
  const [showDesktop, setShowDesktop] = useState(true);
  const [showSimulatedMockup, setShowSimulatedMockup] = useState(false);

  // Fullscreen tracking
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
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

      return [...prev, positionedView];
    });
  }, []);

  const handleTogglePinView = useCallback((id: string) => {
    setViews(prev =>
      prev.map(v => (v.id === id ? { ...v, pinned: !v.pinned } : v))
    );
  }, []);

  const handleCloseView = useCallback((id: string) => {
    setViews(prev => prev.filter(v => v.id !== id));
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
    } catch (err) {
      console.error('Failed to load initial data:', err);
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

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Toggle HUD: Alt+Space or Ctrl+K / Cmd+K
      if ((e.altKey && e.code === 'Space') || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        setHudVisible(prev => !prev);
        return;
      }

      // 2. Open Settings: Ctrl+, or Cmd+,
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(prev => !prev);
        return;
      }

      // 3. Escape: Close settings modal or hide HUD
      if (e.key === 'Escape') {
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (hudVisible) {
          setHudVisible(false);
          return;
        }
      }

      // 4. Quick toggles
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        if (e.key.toLowerCase() === 'u') {
          e.preventDefault();
          handleToggleModel();
        } else if (e.key.toLowerCase() === 'i') {
          e.preventDefault();
          handleIgnoreConflict();
        } else if (e.key.toLowerCase() === 'r') {
          e.preventDefault();
          handleReloadModules();
        }
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
          onMouseEnter={() => electronBridge.setInteractive(true)}
          onMouseLeave={() => electronBridge.setInteractive(false)}
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
        onMouseEnter={() => electronBridge.setInteractive(true)}
        onMouseLeave={() => electronBridge.setInteractive(false)}
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

      {/* When HUD is hidden, subtle crossed-eye icon trigger to summon it (NO excess text) */}
      {!hudVisible && (
        <div className="fixed inset-0 z-30 flex items-center justify-center pointer-events-none">
          <button
            id="summon-hud-eye-btn"
            onMouseEnter={() => electronBridge.setInteractive(true)}
            onMouseLeave={() => electronBridge.setInteractive(false)}
            onClick={() => setHudVisible(true)}
            className="pointer-events-auto p-4 rounded-2xl border shadow-xl backdrop-blur-xl transition-all duration-300 hover:scale-105"
            style={{
              backgroundColor: 'rgba(18, 21, 29, 0.75)',
              borderColor: 'var(--c-border)',
              color: 'var(--c-text-muted)'
            }}
            title="Alt + Space"
          >
            <EyeOff className="w-6 h-6 hover:text-[var(--c-peach)] transition-colors" />
          </button>
        </div>
      )}

      {/* Discrete Corner Control Bar (Minimal Apple-style dock) */}
      <aside
        id="corner-dock-controls"
        onClick={e => e.stopPropagation()}
        onMouseEnter={() => electronBridge.setInteractive(true)}
        onMouseLeave={() => electronBridge.setInteractive(false)}
        className="fixed top-4 right-4 z-40 flex items-center gap-1.5 p-1.5 rounded-xl border shadow-lg backdrop-blur-xl transition-all"
        style={{
          backgroundColor: 'rgba(18, 21, 29, 0.8)',
          borderColor: 'var(--c-border)'
        }}
      >
        {/* Fullscreen Toggle */}
        <button
          id="dock-fullscreen-btn"
          onClick={toggleFullscreen}
          className="p-2 rounded-lg text-[var(--c-text-muted)] hover:text-[var(--c-peach)] transition-colors"
          title={isFullscreen ? 'Выйти из полноэкранного режима' : 'Развернуть оверлей на весь экран (F11)'}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
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

        <button
          onClick={() => setHudVisible(!hudVisible)}
          className="p-2 rounded-lg text-[var(--c-text-muted)] hover:text-[var(--c-peach)] transition-colors"
          title={hudVisible ? 'Скрыть HUD' : 'Показать HUD'}
        >
          {hudVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>

        <button
          onClick={() => openSettings('tools')}
          className="p-2 rounded-lg text-[var(--c-text-muted)] hover:text-[var(--c-peach)] transition-colors"
          title="Настройки"
        >
          <Settings className="w-4 h-4" />
        </button>
      </aside>

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
      />
    </div>
  );
}
