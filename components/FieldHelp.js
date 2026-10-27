'use client'

import { useState } from 'react'
import ClickAwayListener from '@mui/material/ClickAwayListener'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons/faCircleInfo'
import Tooltip from './Tooltip'

export default function FieldHelp({ text, label = 'поле' }) {
  const [open, setOpen] = useState(false)
  if (!text) return null

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <span className="pointer-events-auto relative inline-flex h-[1em] w-6 shrink-0 self-center align-middle">
        <Tooltip
          title={text}
          open={open}
          onClose={() => setOpen(false)}
          disableFocusListener
          disableHoverListener
          disableTouchListener
          disableInteractive={false}
          PopperProps={{
            sx: {
              '& .MuiTooltip-tooltip': {
                maxWidth: 'min(360px, calc(100vw - 32px))',
                fontSize: 13,
                lineHeight: 1.5,
                padding: '10px 12px',
              },
            },
          }}
        >
          <button
            type="button"
            aria-label={`Подсказка: ${label}`}
            aria-expanded={open}
            className="absolute top-1/2 left-0 inline-flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setOpen((value) => !value)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && open) {
                event.stopPropagation()
                setOpen(false)
              }
            }}
            onBlur={() => setOpen(false)}
          >
            <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
          </button>
        </Tooltip>
      </span>
    </ClickAwayListener>
  )
}
