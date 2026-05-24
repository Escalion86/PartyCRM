'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMoon } from '@fortawesome/free-solid-svg-icons/faMoon'
import { faSun } from '@fortawesome/free-solid-svg-icons/faSun'
import cn from 'classnames'

const THEME_CHANGE_EVENT = 'artistcrm-theme-change'

const getThemeSnapshot = () =>
  typeof window !== 'undefined' && localStorage.getItem('theme') === 'dark'

const getServerThemeSnapshot = () => false

const subscribeTheme = (callback) => {
  if (typeof window === 'undefined') return () => {}

  window.addEventListener('storage', callback)
  window.addEventListener(THEME_CHANGE_EVENT, callback)

  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(THEME_CHANGE_EVENT, callback)
  }
}

const ThemeToggleButton = ({ className }) => {
  const isDark = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getServerThemeSnapshot
  )

  useEffect(() => {
    document.body.classList.toggle('theme-dark', isDark)
  }, [isDark])

  const toggleTheme = () => {
    const nextValue = !isDark
    localStorage.setItem('theme', nextValue ? 'dark' : 'light')
    document.body.classList.toggle('theme-dark', nextValue)
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
  }

  return (
    <button
      type="button"
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full border border-general/40 bg-white/80 text-general shadow-sm transition hover:bg-white cursor-pointer',
        isDark ? 'home-theme-toggle' : '',
        className
      )}
      onClick={toggleTheme}
      title="Сменить тему"
    >
      <FontAwesomeIcon icon={isDark ? faSun : faMoon} className="h-4 w-4" />
    </button>
  )
}

export default ThemeToggleButton
