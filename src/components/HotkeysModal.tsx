import React from 'react';
import { X, Keyboard, Sparkles } from 'lucide-react';

interface HotkeysModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HotkeysModal: React.FC<HotkeysModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const hotkeysList = [
    {
      category: 'Навигация и Оверлей',
      keys: [
        { shortcut: 'Alt + Space', alt: 'Ctrl + K', desc: 'Показать / скрыть HUD оверлей' },
        { shortcut: 'Esc', desc: 'Закрыть оверлей, модальное окно или очистить строку' },
        { shortcut: 'Ctrl + 1', desc: 'Вкладка: Командная строка FunctionGemma' },
        { shortcut: 'Ctrl + 2', desc: 'Вкладка: Менеджер модулей и скриптов' },
        { shortcut: 'Ctrl + 3', desc: 'Вкладка: Логи исполнения и точности' },
        { shortcut: 'Ctrl + 4', desc: 'Вкладка: Проверка критической суммы и конфликтов' },
        { shortcut: 'Ctrl + 5 / ?', desc: 'Открыть этот справочник горячих клавиш' }
      ]
    },
    {
      category: 'Управление Моделью и Безопасностью',
      keys: [
        { shortcut: 'Enter', alt: 'Ctrl + Enter', desc: 'Исполнить запрос к модели' },
        { shortcut: 'Ctrl + U', desc: 'Выгрузить / загрузить модель (Model Load/Unload)' },
        { shortcut: 'Ctrl + I', desc: 'Игнорировать конфликт контрольной суммы' },
        { shortcut: 'Ctrl + R', desc: 'Перезагрузить модули и пересчитать хэши' }
      ]
    },
    {
      category: 'Отображение и Прозрачность',
      keys: [
        { shortcut: 'Ctrl + M', desc: 'Переключить компактный режим (Dock / Full)' },
        { shortcut: 'Ctrl + B', desc: 'Включить / отключить подложку рабочего стола' }
      ]
    }
  ];

  return (
    <div
      id="hotkeys-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        id="hotkeys-modal-container"
        className="w-full max-w-2xl bg-[#0e111a]/95 border border-teal-500/30 rounded-2xl p-6 shadow-2xl backdrop-blur-xl text-slate-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-300">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                Справочник горячих клавиш
                <span className="text-[11px] font-mono font-normal px-2 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-300">
                  Global Shortcuts
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Быстрое управление без мыши для минимизации нагрузки на глаза и кисти
              </p>
            </div>
          </div>
          <button
            id="close-hotkeys-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-2">
          {hotkeysList.map(sec => (
            <div key={sec.category}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-teal-400/90 mb-2.5 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                {sec.category}
              </h3>
              <div className="grid grid-cols-1 gap-2">
                {sec.keys.map(k => (
                  <div
                    key={k.shortcut}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60 hover:border-teal-500/25 transition-colors"
                  >
                    <span className="text-xs text-slate-300">{k.desc}</span>
                    <div className="flex items-center gap-1.5">
                      <kbd className="px-2.5 py-1 text-xs font-mono font-medium rounded-md bg-orange-500/10 border border-orange-500/30 text-orange-300 shadow-xs">
                        {k.shortcut}
                      </kbd>
                      {k.alt && (
                        <>
                          <span className="text-slate-500 text-xs">или</span>
                          <kbd className="px-2.5 py-1 text-xs font-mono font-medium rounded-md bg-teal-500/10 border border-teal-500/30 text-teal-300 shadow-xs">
                            {k.alt}
                          </kbd>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
            Все клавиши перехватываются глобально в интерфейсе
          </span>
          <button
            id="dismiss-hotkeys-bottom-btn"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-teal-200 text-xs font-medium transition-colors"
          >
            Понятно (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};
