'use client'

import { useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons/faXmark'
import cn from 'classnames'

const Modal = ({
  open = false,
  onClose,
  title,
  children,
  footer,
  tone = 'default',
  size = 'md',
  disableBackdropClick = false,
}) => {
  const overlayRef = useRef(null)
  const previousFocusRef = useRef(null)

  // Focus trap & restore
  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement
    // Focus the overlay or first focusable element inside
    setTimeout(() => {
      const focusable = overlayRef.current?.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable) focusable.focus()
      else overlayRef.current?.focus()
    }, 0)
    return () => {
      if (previousFocusRef.current) previousFocusRef.current.focus?.()
    }
  }, [open])

  // ESC to close
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
      }
    },
    [onClose]
  )

  // Backdrop click
  const handleBackdropClick = useCallback(
    (e) => {
      if (disableBackdropClick) return
      if (e.target === overlayRef.current) {
        onClose?.()
      }
    },
    [onClose, disableBackdropClick]
  )

  if (typeof window === 'undefined') return null
  if (!open) return null

  const isParty = tone === 'party'

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    full: 'max-w-full md:max-w-[95vw] lg:max-w-[75vw]',
  }

  const dialog = (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 focus:outline-none md:items-center"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div
        className={cn(
          'relative z-10 flex w-full flex-col bg-white shadow-xl',
          // Mobile-first: fullscreen on <768px, centered with border-radius on >=768px
          'h-full max-h-full rounded-none',
          'md:m-4 md:h-auto md:max-h-[calc(100vh-32px)] md:rounded-2xl',
          sizeClasses[size] || sizeClasses.md,
          isParty ? 'border-sky-100 md:border' : 'border-gray-200 md:border'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {title && (
          <div
            className={cn(
              'relative flex items-center border-b px-4 py-3 text-lg font-semibold',
              isParty
                ? 'border-sky-100 text-sky-900'
                : 'border-gray-200 text-gray-900'
            )}
          >
            {title}
            <button
              type="button"
              aria-label="Закрыть"
              onClick={onClose}
              className={cn(
                'absolute right-2 grid h-8 w-8 place-items-center rounded-md transition-colors',
                isParty
                  ? 'text-sky-500 hover:bg-sky-50 hover:text-sky-700'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
              )}
            >
              <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>

        {/* Footer */}
        {footer && (
          <div
            className={cn(
              'flex items-center justify-end gap-2 border-t px-4 py-3',
              isParty ? 'border-sky-100' : 'border-gray-200'
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(dialog, document.body)
}

Modal.displayName = 'Modal'

export default Modal
