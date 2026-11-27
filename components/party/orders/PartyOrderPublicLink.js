'use client'

import { useRef, useState } from 'react'

export const partyOrderSecondaryButton =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-50'

export default function PartyOrderPublicLink({ path, label, openLabel }) {
  const input = useRef(null)
  const [notice, setNotice] = useState('')
  const url = typeof window === 'undefined' ? path : new URL(path, window.location.origin).href

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setNotice('Ссылка скопирована.')
    } catch {
      input.current?.focus()
      input.current?.select()
      setNotice('Скопируйте выделенную ссылку вручную.')
    }
  }

  return (
    <div className="grid min-w-0 gap-2">
      <input
        ref={input}
        type="text"
        aria-label={label}
        readOnly
        value={url}
        onFocus={(event) => event.currentTarget.select()}
        className="min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-800 focus-visible:outline-2 focus-visible:outline-sky-700 sm:text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className={partyOrderSecondaryButton}>
          Скопировать ссылку
        </button>
        <a href={path} target="_blank" rel="noreferrer" className={partyOrderSecondaryButton}>
          {openLabel}
        </a>
      </div>
      <p className={notice ? 'text-sm text-slate-700' : 'sr-only'} role="status">{notice}</p>
    </div>
  )
}
