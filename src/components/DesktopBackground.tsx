import React from 'react';
import { Terminal, Code, Cpu, Activity, Clock } from 'lucide-react';

interface DesktopBackgroundProps {
  opacity: number;
}

export const DesktopBackground: React.FC<DesktopBackgroundProps> = ({ opacity }) => {
  return (
    <div
      id="desktop-mockup-canvas"
      className="fixed inset-0 pointer-events-none select-none z-0 overflow-hidden"
      style={{ opacity }}
    >
      {/* Ambient background wallpaper */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at top right, #151924 0%, var(--c-bg-primary) 70%, #06070a 100%)'
        }}
      />

      {/* Simulated Code Editor Window in background */}
      <div
        className="absolute top-12 left-8 w-[520px] h-[320px] rounded-2xl border shadow-2xl p-4 flex flex-col font-mono text-xs"
        style={{
          backgroundColor: 'rgba(18, 21, 29, 0.65)',
          borderColor: 'var(--c-border)',
          color: 'var(--c-text-muted)'
        }}
      >
        <div className="flex items-center justify-between pb-2.5 border-b border-white/5 mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
            <span className="ml-2 flex items-center gap-1.5" style={{ color: 'var(--c-text-dim)' }}>
              <Code className="w-3.5 h-3.5" />
              <span>modules/system/system_metrics.js</span>
            </span>
          </div>
          <span className="text-[10px]" style={{ color: 'var(--c-text-dim)' }}>
            JavaScript
          </span>
        </div>
        <div className="space-y-1 leading-relaxed overflow-hidden text-[11px]" style={{ color: 'var(--c-text-muted)' }}>
          <p>
            <span style={{ color: 'var(--c-peach)' }}>export async function</span> execute(params, context) {'{'}
          </p>
          <p className="pl-4" style={{ color: 'var(--c-text-dim)' }}>
            // Module runtime telemetry
          </p>
          <p className="pl-4">
            <span style={{ color: 'var(--c-peach-light)' }}>const</span> totalMem = context.os.totalmem();
          </p>
          <p className="pl-4">
            <span style={{ color: 'var(--c-peach-light)' }}>const</span> freeMem = context.os.freemem();
          </p>
          <p className="pl-4">
            <span style={{ color: 'var(--c-peach)' }}>return</span> {'{'}
          </p>
          <p className="pl-8">status: 'online',</p>
          <p className="pl-8">usage: ((totalMem - freeMem) / totalMem * 100).toFixed(1) + '%'</p>
          <p className="pl-4">{'}'};</p>
          <p>{'}'}</p>
        </div>
      </div>

      {/* Simulated Terminal in background */}
      <div
        className="absolute bottom-16 right-10 w-[460px] h-[260px] rounded-2xl border shadow-2xl p-4 flex flex-col font-mono text-xs"
        style={{
          backgroundColor: 'rgba(18, 21, 29, 0.65)',
          borderColor: 'var(--c-border)',
          color: 'var(--c-text-muted)'
        }}
      >
        <div className="flex items-center justify-between pb-2.5 border-b border-white/5 mb-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5" style={{ color: 'var(--c-text-dim)' }} />
            <span style={{ color: 'var(--c-text)' }}>user@macbook: ~</span>
          </div>
          <span className="text-[10px] flex items-center gap-1.5" style={{ color: 'var(--c-text-dim)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--c-peach)' }} />
            daemon-active
          </span>
        </div>
        <div className="space-y-1.5 text-[11px]" style={{ color: 'var(--c-text-dim)' }}>
          <p>$ functiongemma --daemon</p>
          <p style={{ color: 'var(--c-peach-light)' }}>Weights ready: functiongemma-7b-tools-v2.1</p>
          <p>[info] Checksum verification: matching 7/7 modules</p>
          <p>[info] Hotkey registered: Alt+Space</p>
          <p>[ready] Listening for local queries...</p>
        </div>
      </div>

      {/* Subtle bottom taskbar */}
      <div
        className="absolute bottom-0 inset-x-0 h-9 border-t px-4 flex items-center justify-between text-xs"
        style={{
          backgroundColor: 'rgba(10, 12, 16, 0.85)',
          borderColor: 'var(--c-border)',
          color: 'var(--c-text-dim)'
        }}
      >
        <div className="flex items-center gap-3 text-[11px]">
          <span style={{ color: 'var(--c-text-muted)' }}>Рабочая область</span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Cpu className="w-3 h-3" />
            <span>12%</span>
          </span>
          <span className="flex items-center gap-1">
            <Activity className="w-3 h-3" />
            <span>4.2 GB</span>
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          <Clock className="w-3 h-3" />
          <span>Local Environment</span>
        </div>
      </div>
    </div>
  );
};
