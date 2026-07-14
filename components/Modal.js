'use client'

import { useEffect, useRef, useCallback, useId, useState } from 'react'
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
  hasUnsavedChanges = false,
  unsavedChangesMessage = 'Есть несохранённые изменения. Закрыть окно без сохранения?',
}) => {
  const overlayRef = useRef(null)
  const previousFocusRef = useRef(null)
  const [showCloseConfirmation, setShowCloseConfirmation] = useState(false)
  const closeConfirmationTitleId = useId()
  const closeConfirmationDescriptionId = useId()

  const requestClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowCloseConfirmation(true)
      return
    }
    onClose?.()
  }, [hasUnsavedChanges, onClose])

  const confirmClose = useCallback(() => {
    setShowCloseConfirmation(false)
    onClose?.()
  }, [onClose])

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
        if (showCloseConfirmation) {
          setShowCloseConfirmation(false)
          return
        }
        requestClose()
      }
    },
    [requestClose, showCloseConfirmation]
  )

  // Backdrop click
  const handleBackdropClick = useCallback(
    (e) => {
      if (disableBackdropClick) return
      if (e.target === overlayRef.current) {
        requestClose()
      }
    },
    [disableBackdropClick, requestClose]
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

  const footerContent =
    typeof footer === 'function' ? footer({ requestClose }) : footer

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
              onClick={requestClose}
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
        {footerContent && (
          <div
            className={cn(
              'flex items-center justify-end gap-2 border-t px-4 py-3',
              isParty ? 'border-sky-100' : 'border-gray-200'
            )}
          >
            {footerContent}
          </div>
        )}
      </div>

      {showCloseConfirmation && hasUnsavedChanges ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/35 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={closeConfirmationTitleId}
            aria-describedby={closeConfirmationDescriptionId}
            className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-5 shadow-2xl"
          >
            <h2
              id={closeConfirmationTitleId}
              className="text-lg font-semibold text-slate-900"
            >
              Закрыть без сохранения?
            </h2>
            <p
              id={closeConfirmationDescriptionId}
              className="mt-2 text-sm leading-5 text-slate-600"
            >
              {unsavedChangesMessage}
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                autoFocus
                className="cursor-pointer rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={() => setShowCloseConfirmation(false)}
              >
                Продолжить редактирование
              </button>
              <button
                type="button"
                className="cursor-pointer rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                onClick={confirmClose}
              >
                Закрыть без сохранения
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )

  return createPortal(dialog, document.body)
}

Modal.displayName = 'Modal'

export default Modal
