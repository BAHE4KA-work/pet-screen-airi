import React, { useState, useEffect } from 'react';
import { HardDrive, Folder, File, RefreshCw, Check, AlertCircle } from 'lucide-react';
import { StorageInfo } from '../../types';
import { soundEffects } from '../../utils/audioEffects';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';

export const StorageSettingsTab: React.FC = () => {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [newPath, setNewPath] = useState('./storage');
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchStorageInfo = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/storage');
      if (res.ok) {
        const data = await res.json();
        setInfo(data);
        setNewPath('./storage');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStorageInfo();
  }, []);

  const handleUpdatePath = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPath.trim()) return;

    try {
      const res = await fetch('/api/storage/path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newPath.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setInfo(data.info);
        setStatusMsg({ text: 'Путь обновлён', type: 'success' });
        soundEffects.playSuccessChime();
      } else {
        setStatusMsg({ text: data.error || 'Ошибка изменения пути', type: 'error' });
        soundEffects.playWarningCue();
      }
    } catch {
      setStatusMsg({ text: 'Ошибка сети', type: 'error' });
      soundEffects.playWarningCue();
    }
    setTimeout(() => setStatusMsg(null), 2500);
  };

  return (
    <div className="space-y-4">
      {/* Header and Path Configuration */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--c-border)]">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-[var(--c-peach)]" />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
              Хранилище
            </h3>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchStorageInfo}
            disabled={loading}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Обновить
          </Button>
        </div>

        {/* Path block in Peach context color */}
        <form onSubmit={handleUpdatePath} className="space-y-2">
          <div className="text-xs" style={{ color: 'var(--c-text-muted)' }}>
            Путь к директории хранения файлов:
          </div>

          <div
            className="p-3 rounded-xl border flex items-center gap-2"
            style={{
              backgroundColor: 'var(--c-peach-surface)',
              borderColor: 'var(--c-peach-border)'
            }}
          >
            <Folder className="w-4 h-4 shrink-0 text-[var(--c-peach-light)]" />
            <input
              id="storage-path-input"
              type="text"
              value={newPath}
              onChange={e => setNewPath(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none font-mono text-xs text-[var(--c-peach-light)] placeholder:text-[var(--c-peach)]/50"
              placeholder="./storage"
            />
            <Button
              id="save-storage-path-btn"
              type="submit"
              size="sm"
              variant="primary"
              icon={<Check className="w-3.5 h-3.5" />}
            >
              Сохранить
            </Button>
          </div>

          {statusMsg && (
            <div
              className={`text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 ${
                statusMsg.type === 'success'
                  ? 'text-[var(--c-peach-light)] bg-[var(--c-peach-surface)]'
                  : 'text-[var(--c-mint-light)] bg-[var(--c-mint-surface)]'
              }`}
            >
              {statusMsg.type === 'success' ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              <span>{statusMsg.text}</span>
            </div>
          )}
        </form>
      </Card>

      {/* Storage Metrics */}
      {info && (
        <div className="grid grid-cols-3 gap-2">
          <Card className="py-2 px-3">
            <span className="text-[11px] block" style={{ color: 'var(--c-text-muted)' }}>Файлов</span>
            <span className="text-sm font-semibold font-mono" style={{ color: 'var(--c-text)' }}>
              {info.totalFiles}
            </span>
          </Card>
          <Card className="py-2 px-3">
            <span className="text-[11px] block" style={{ color: 'var(--c-text-muted)' }}>Объём</span>
            <span className="text-sm font-semibold font-mono" style={{ color: 'var(--c-peach-light)' }}>
              {info.totalSizeFormatted}
            </span>
          </Card>
          <Card className="py-2 px-3">
            <span className="text-[11px] block" style={{ color: 'var(--c-text-muted)' }}>Состояние</span>
            <Badge variant="peach" size="sm" className="mt-0.5">
              {info.exists ? 'Доступно' : 'Не создано'}
            </Badge>
          </Card>
        </div>
      )}

      {/* Files List */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs px-1" style={{ color: 'var(--c-text-muted)' }}>
          <span>Файлы в ./storage</span>
          <span className="font-mono text-[11px]">{info?.files?.length || 0} шт</span>
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="divide-y divide-[var(--c-border)] max-h-56 overflow-y-auto">
            {info?.files && info.files.length > 0 ? (
              info.files.map((file, i) => (
                <div key={i} className="px-3 py-2 flex items-center justify-between text-xs hover:bg-white/[0.02]">
                  <div className="flex items-center gap-2">
                    <File className="w-3.5 h-3.5 text-[var(--c-peach-light)]" />
                    <span className="font-mono" style={{ color: 'var(--c-text)' }}>{file.name}</span>
                  </div>
                  <span className="font-mono text-[11px]" style={{ color: 'var(--c-text-muted)' }}>
                    {file.sizeFormatted}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-xs" style={{ color: 'var(--c-text-muted)' }}>
                Хранилище пусто
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};
