import React, { useState, useEffect } from 'react';
import { HardDrive, Folder, File, RefreshCw, Check, ArrowRight, AlertCircle } from 'lucide-react';
import { StorageInfo } from '../../types';
import { soundEffects } from '../../utils/audioEffects';

export const StorageSettingsTab: React.FC = () => {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchStorageInfo = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/storage');
      if (res.ok) {
        const data = await res.json();
        setInfo(data);
        setNewPath(data.storagePath);
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
        setStatusMsg({ text: 'Путь к хранилищу успешно обновлён!', type: 'success' });
        soundEffects.playSuccessChime();
      } else {
        setStatusMsg({ text: data.error || 'Ошибка изменения пути', type: 'error' });
        soundEffects.playWarningCue();
      }
    } catch {
      setStatusMsg({ text: 'Ошибка сети при смене пути', type: 'error' });
      soundEffects.playWarningCue();
    }
    setTimeout(() => setStatusMsg(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div
        className="p-5 rounded-xl border"
        style={{
          backgroundColor: '#161922',
          borderColor: 'var(--c-border)'
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-orange-500/10 text-orange-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-zinc-100">Локальное хранилище инструментов (Storage)</h3>
              <p className="text-xs text-zinc-400">
                Папка, используемая инструментами по умолчанию для чтения и записи файлов
              </p>
            </div>
          </div>
          <button
            id="refresh-storage-btn"
            onClick={fetchStorageInfo}
            disabled={loading}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Path configuration form */}
        <form onSubmit={handleUpdatePath} className="space-y-3 pt-2 border-t border-zinc-800/80">
          <label className="text-xs text-zinc-400 block">Путь к папке на сервере:</label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Folder className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                id="storage-path-input"
                type="text"
                value={newPath}
                onChange={e => setNewPath(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-orange-500 font-mono"
                placeholder="storage или /custom/path"
              />
            </div>
            <button
              id="save-storage-path-btn"
              type="submit"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 border border-orange-500/40 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Применить путь
            </button>
          </div>

          {statusMsg && (
            <div
              className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-2 ${
                statusMsg.type === 'success'
                  ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30'
                  : 'bg-teal-500/10 text-teal-400 border border-teal-500/30'
              }`}
            >
              {statusMsg.type === 'success' ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              {statusMsg.text}
            </div>
          )}
        </form>
      </div>

      {/* Storage metrics */}
      {info && (
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl border bg-zinc-900/60 border-zinc-800">
            <span className="text-[11px] text-zinc-400 block mb-1">Всего файлов</span>
            <span className="text-lg font-semibold text-zinc-100">{info.totalFiles}</span>
          </div>
          <div className="p-3.5 rounded-xl border bg-zinc-900/60 border-zinc-800">
            <span className="text-[11px] text-zinc-400 block mb-1">Занятый объём</span>
            <span className="text-lg font-semibold text-orange-400">{info.totalSizeFormatted}</span>
          </div>
          <div className="p-3.5 rounded-xl border bg-zinc-900/60 border-zinc-800">
            <span className="text-[11px] text-zinc-400 block mb-1">Состояние</span>
            <span className="text-xs font-medium text-emerald-400">
              {info.exists ? 'Активно и доступно' : 'Будет создано'}
            </span>
          </div>
        </div>
      )}

      {/* Files list */}
      <div className="rounded-xl border overflow-hidden border-zinc-800 bg-zinc-900/40">
        <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-300">Файлы в директории хранилища</span>
          <span className="text-[11px] text-zinc-500 font-mono">{info?.storagePath}</span>
        </div>

        <div className="divide-y divide-zinc-800/60 max-h-56 overflow-y-auto">
          {info?.files && info.files.length > 0 ? (
            info.files.map((file, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center justify-between hover:bg-zinc-800/40 text-xs">
                <div className="flex items-center gap-2.5">
                  <File className="w-4 h-4 text-orange-400" />
                  <span className="font-mono text-zinc-200">{file.name}</span>
                </div>
                <div className="flex items-center gap-4 text-zinc-500">
                  <span>{file.sizeFormatted}</span>
                  <span>{new Date(file.updatedAt).toLocaleTimeString()}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="p-6 text-center text-xs text-zinc-500">
              Хранилище пока пусто. Инструменты (например, manage_storage) могут сохранять сюда файлы.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
