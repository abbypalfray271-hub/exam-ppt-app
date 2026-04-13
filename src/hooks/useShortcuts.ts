import { useEffect } from 'react';

type KeyHandler = (e: KeyboardEvent) => void;

interface ShortcutMap {
  [key: string]: KeyHandler;
}

export const useShortcuts = (shortcuts: ShortcutMap, active: boolean = true) => {
  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 忽略输入框/文本域的按键
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // 获取当前按键 (部分按键可以忽略大小写)
      const key = e.key;
      const lowerKey = e.key.toLowerCase();

      // 先匹配精确键值，再匹配小写键值
      if (shortcuts[key]) {
        shortcuts[key](e);
      } else if (shortcuts[lowerKey]) {
        shortcuts[lowerKey](e);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, active]);
};
