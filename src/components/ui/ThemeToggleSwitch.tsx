'use client';

import { useTheme } from '@/contexts/ThemeContext';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';

export function ThemeToggleSwitch() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  // For switch toggle, we'll use dark mode when theme is 'dark' or when system theme is dark
  const isDark = theme === 'dark' || (theme === 'system' && resolvedTheme === 'dark');

  const handleToggle = () => {
    // Toggle between light and dark (not system)
    setTheme(isDark ? 'light' : 'dark');
  };

  return (
    <button
      onClick={handleToggle}
      className="relative inline-flex h-8 w-14 items-center rounded-full bg-gray-300 dark:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "ダークモードをオフにする" : "ダークモードをオンにする"}
    >
      <span className="sr-only">{isDark ? "ダークモード" : "ライトモード"}</span>

      {/* Icons */}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-between px-1">
        <SunIcon className="h-4 w-4 text-yellow-500" />
        <MoonIcon className="h-4 w-4 text-blue-200" />
      </span>

      {/* Switch knob */}
      <span
        className={`${
          isDark ? 'translate-x-7' : 'translate-x-1'
        } pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out`}
      />
    </button>
  );
}