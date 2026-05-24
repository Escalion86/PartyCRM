'use client'

import PropTypes from 'prop-types'
import { useEffect } from 'react'

import styledEngineStyled from '@mui/styled-engine'
import { sendClientLog } from '@helpers/clientLog'

const MAX_LENGTH = 2000

const safeToString = (value) => {
  if (typeof value === 'string') return value
  if (value instanceof Error) return `${value.name}: ${value.message}`
  try {
    return JSON.stringify(value)
  } catch (error) {
    return String(value)
  }
}

const truncate = (value) => {
  const text = safeToString(value)
  if (!text || text.length <= MAX_LENGTH) return text
  return `${text.slice(0, MAX_LENGTH)}...`
}

const getStyledEngineInfo = () => {
  try {
    const source = styledEngineStyled?.toString?.()
    return {
      type: typeof styledEngineStyled,
      name: styledEngineStyled?.name,
      source: source ? truncate(source) : undefined,
    }
  } catch (error) {
    return { error: String(error) }
  }
}

const ClientErrorLogger = ({ enabled }) => {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined

    const handleError = (event) => {
      try {
        const error = event?.error
        sendClientLog({
          type: 'error',
          name: error?.name,
          message: truncate(event?.message || error?.message),
          stack: truncate(error?.stack),
          source: event?.filename,
          line: event?.lineno,
          column: event?.colno,
          url: window.location.href,
          userAgent: navigator.userAgent,
          styledEngine: getStyledEngineInfo(),
        })
      } catch (error) {
        return undefined
      }
    }

    const handleRejection = (event) => {
      try {
        const reason = event?.reason
        sendClientLog({
          type: 'unhandledrejection',
          name: reason?.name,
          message: truncate(reason?.message || reason),
          stack: truncate(reason?.stack),
          url: window.location.href,
          userAgent: navigator.userAgent,
          styledEngine: getStyledEngineInfo(),
        })
      } catch (error) {
        return undefined
      }
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [enabled])

  return null
}

ClientErrorLogger.propTypes = {
  enabled: PropTypes.bool,
}

ClientErrorLogger.defaultProps = {
  enabled: false,
}

export default ClientErrorLogger
