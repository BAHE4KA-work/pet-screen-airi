import React, { useState } from 'react';
import { Network, Globe, Shield, Check, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { soundEffects } from '../../utils/audioEffects';

export const NetworkSettingsTab: React.FC = () => {
  const [proxyType, setProxyType] = useState<'none' | 'http' | 'socks5'>('none');
  const [proxyUrl, setProxyUrl] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    soundEffects.playCompletionPing();
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[var(--c-border)]">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-[var(--c-peach)]" />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
            Сеть
          </h3>
        </div>
      </div>

      {/* Network Configuration */}
      <Card className="space-y-3">
        <form onSubmit={handleSave} className="space-y-3 text-xs">
          <div>
            <label className="text-[11px] block mb-1" style={{ color: 'var(--c-text-muted)' }}>
              Тип сетевого подключения:
            </label>
            <Select
              value={proxyType}
              onChange={e => setProxyType(e.target.value as 'none' | 'http' | 'socks5')}
            >
              <option value="none">Прямое подключение (Direct / Без прокси)</option>
              <option value="http">HTTP / HTTPS Прокси</option>
              <option value="socks5">SOCKS5 Прокси</option>
            </Select>
          </div>

          {proxyType !== 'none' && (
            <div>
              <label className="text-[11px] block mb-1" style={{ color: 'var(--c-text-muted)' }}>
                Адрес и порт прокси:
              </label>
              <Input
                placeholder={proxyType === 'socks5' ? 'socks5://127.0.0.1:1080' : 'http://127.0.0.1:8080'}
                value={proxyUrl}
                onChange={e => setProxyUrl(e.target.value)}
              />
            </div>
          )}

          <div className="flex justify-end pt-1">
            <Button size="sm" variant="primary" type="submit" icon={saved ? <Check className="w-3.5 h-3.5" /> : undefined}>
              {saved ? 'Сохранено' : 'Применить'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Server & Port details */}
      <Card className="space-y-2">
        <span className="text-xs font-medium" style={{ color: 'var(--c-text-muted)' }}>
          Параметры сетевого интерфейса
        </span>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded-lg border" style={{ backgroundColor: 'var(--c-bg-tertiary)', borderColor: 'var(--c-border)' }}>
            <span className="text-[11px] block" style={{ color: 'var(--c-text-muted)' }}>Порт приложения</span>
            <span className="font-mono font-medium" style={{ color: 'var(--c-text)' }}>3000 (0.0.0.0)</span>
          </div>
          <div className="p-2 rounded-lg border" style={{ backgroundColor: 'var(--c-bg-tertiary)', borderColor: 'var(--c-border)' }}>
            <span className="text-[11px] block" style={{ color: 'var(--c-text-muted)' }}>Локальный адрес</span>
            <span className="font-mono font-medium" style={{ color: 'var(--c-peach-light)' }}>http://localhost:3000</span>
          </div>
        </div>
      </Card>
    </div>
  );
};
