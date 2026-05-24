import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import cn from 'classnames'

const DropDown = ({
  trigger,
  children,
  menuPadding = 'md',
  menuClassName,
  openOnHover = false,
  turnOffAutoClose = false,
  strategyAbsolute = true,
  className,
  placement,
  renderInPortal = false,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)
  const menuRef = useRef(null)
  const closeTimeoutRef = useRef(null)
  const [menuPosition, setMenuPosition] = useState(null)

  const padding = useMemo(() => {
    switch (menuPadding) {
      case 'md':
        return 'p-2'
      case 'sm':
        return 'p-1'
      case 'lg':
        return 'p-3'
      default:
        return ''
    }
  }, [menuPadding])

  const placementClassName = useMemo(() => {
    if (placement === 'right') {
      return 'right-0'
    }
    if (placement === 'left') {
      return 'left-0'
    }
    return ''
  }, [placement])

  const handleToggle = useCallback(() => {
    if (openOnHover) return
    setIsOpen((prev) => !prev)
  }, [openOnHover])

  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }, [])

  const closeWithDelay = useCallback(() => {
    clearCloseTimeout()
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false)
      closeTimeoutRef.current = null
    }, 120)
  }, [clearCloseTimeout])

  const updateMenuPosition = useCallback(() => {
    if (!renderInPortal) return
    const element = containerRef.current
    const menuElement = menuRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const gap = openOnHover ? 0 : 8
    const viewportPadding = 8
    const menuHeight = menuElement?.offsetHeight || 0
    const menuWidth = menuElement?.offsetWidth || 0

    let top = rect.bottom + gap
    if (
      menuHeight > 0 &&
      top + menuHeight > window.innerHeight - viewportPadding
    ) {
      top = rect.top - gap - menuHeight
    }
    top = Math.max(viewportPadding, top)

    if (placement === 'right') {
      let right = Math.max(viewportPadding, window.innerWidth - rect.right)
      if (menuWidth > 0) {
        const maxRight = window.innerWidth - menuWidth - viewportPadding
        if (Number.isFinite(maxRight)) {
          right = Math.min(right, Math.max(viewportPadding, maxRight))
        }
      }
      setMenuPosition({ top, right })
      return
    }

    let left = rect.left
    if (menuWidth > 0) {
      const maxLeft = window.innerWidth - menuWidth - viewportPadding
      left = Math.min(
        Math.max(viewportPadding, left),
        Math.max(viewportPadding, maxLeft)
      )
    } else {
      left = Math.max(viewportPadding, left)
    }

    setMenuPosition({
      top,
      left,
    })
  }, [openOnHover, placement, renderInPortal])

  useEffect(() => {
    if (!isOpen) return
    const rafId = requestAnimationFrame(() => {
      updateMenuPosition()
    })

    const handleClick = (event) => {
      const element = containerRef.current
      const menuElement = menuRef.current
      if (!element) return

      const isInsideTrigger = element.contains(event.target)
      const isInsideMenu =
        renderInPortal && menuElement ? menuElement.contains(event.target) : false
      const isInside = isInsideTrigger || isInsideMenu

      if (isInside) {
        if (turnOffAutoClose !== 'inside') {
          setIsOpen(false)
        }
        return
      }

      if (turnOffAutoClose !== 'outside') {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    if (renderInPortal) {
      window.addEventListener('scroll', updateMenuPosition, true)
      window.addEventListener('resize', updateMenuPosition)
    }

    return () => {
      cancelAnimationFrame(rafId)
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
      if (renderInPortal) {
        window.removeEventListener('scroll', updateMenuPosition, true)
        window.removeEventListener('resize', updateMenuPosition)
      }
    }
  }, [isOpen, renderInPortal, turnOffAutoClose, updateMenuPosition])

  useEffect(() => {
    return () => clearCloseTimeout()
  }, [clearCloseTimeout])

  const hoverHandlers = openOnHover
    ? {
        onMouseEnter: () => {
          clearCloseTimeout()
          setIsOpen(true)
        },
        onMouseLeave: (event) => {
          const element = containerRef.current
          const menuElement = menuRef.current
          if (!element) {
            closeWithDelay()
            return
          }
          const relatedTarget = event.relatedTarget
          if (
            relatedTarget instanceof Node &&
            (element.contains(relatedTarget) ||
              (menuElement && menuElement.contains(relatedTarget)))
          )
            return
          closeWithDelay()
        },
      }
    : {}

  const menuHoverHandlers = openOnHover
    ? {
        onMouseEnter: () => {
          clearCloseTimeout()
          setIsOpen(true)
        },
        onMouseLeave: () => closeWithDelay(),
      }
    : {}

  const menuContent = isOpen ? (
    <div
      ref={menuRef}
      className={cn(
        'z-[80] flex items-center justify-center rounded-lg border border-gray-400 bg-white shadow-md dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800',
        strategyAbsolute && !renderInPortal
          ? cn(
              `absolute top-full ${openOnHover ? 'mt-0' : 'mt-2'}`,
              placementClassName || 'left-0'
            )
          : !renderInPortal
          ? 'mt-2 w-full'
          : '',
        padding,
        menuClassName
      )}
      style={
        renderInPortal && menuPosition
          ? {
              position: 'fixed',
              top: menuPosition.top,
              left: menuPosition.left,
              right: menuPosition.right,
              maxWidth: 'calc(100vw - 16px)',
              maxHeight: 'calc(100vh - 16px)',
              overflowY: 'auto',
            }
          : undefined
      }
      aria-hidden={!isOpen}
      role="menu"
      onClickCapture={() => {
        if (turnOffAutoClose === 'inside') return
        requestAnimationFrame(() => setIsOpen(false))
      }}
      onClick={() => {
        if (turnOffAutoClose !== 'inside') setIsOpen(false)
      }}
      {...menuHoverHandlers}
    >
      {children}
    </div>
  ) : null

  return (
    <div
      ref={containerRef}
      className={cn('relative inline-flex', isOpen ? 'z-[70]' : '', className)}
      data-prevent-parent-click
      {...hoverHandlers}
    >
      <div className="w-full" onClick={handleToggle}>
        {trigger}
      </div>
      {renderInPortal && isOpen
        ? createPortal(menuContent, document.body)
        : menuContent}
    </div>
  )
}

export default DropDown
