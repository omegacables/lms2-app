'use client';

import { useTheme } from '@/contexts/ThemeContext';
import { SunIcon, MoonIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline';
import { useState, useRef, useEffect } from 'react';

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const themes = [
    { value: 'light' as const, label: 'ライト', icon: SunIcon },
    { value: 'dark' as const, label: 'ダーク', icon: MoonIcon },
    { value: 'system' as const, label: 'システム', icon: ComputerDesktopIcon },
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        aria-label="テーマを変更"
      >
        {theme === 'system' ? (
          <ComputerDesktopIcon className="h-5 w-5 text-gray-700 dark:text-gray-300" />
        ) : theme === 'dark' ? (
          <MoonIcon className="h-5 w-5 text-gray-700 dark:text-gray-300" />
        ) : (
          <SunIcon className="h-5 w-5 text-gray-700 dark:text-gray-300" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-36 rounded-lg shadow-lg dark:shadow-gray-900/50 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 py-1 z-50">
          {themes.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => {
                setTheme(value);
                setIsOpen(false);
              }}
              className={`w-full px-3 py-2 text-left flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                theme === value ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="text-sm">{label}</span>
              {theme === value && (
                <span className="ml-auto text-indigo-600 dark:text-indigo-400">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}