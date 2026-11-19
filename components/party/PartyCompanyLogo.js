'use client'

import { useState } from 'react'

export default function PartyCompanyLogo({ src, title, compact = false }) {
  const [failedUrl, setFailedUrl] = useState(null)
  if (!src || failedUrl === src) {
    return compact ? null : <span className="text-lg font-semibold text-sky-200">PartyCRM</span>
  }
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white p-1 ${compact ? 'h-9 w-9' : 'h-11 max-w-40'}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`Логотип ${title || 'компании'}`}
        className={`block h-full object-contain ${compact ? 'w-full' : 'max-w-36'}`}
        referrerPolicy="no-referrer"
        decoding="async"
        onError={() => setFailedUrl(src)}
      />
    </span>
  )
}
