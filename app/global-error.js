'use client'

import PropTypes from 'prop-types'
import { useEffect } from 'react'

import styledEngineStyled from '@mui/styled-engine'
import { sendClientLog } from '@helpers/clientLog'

const getStyledEngineInfo = () => {
  try {
    return {
      type: typeof styledEngineStyled,
      name: styledEngineStyled?.name,
    }
  } catch (error) {
    return { error: String(error) }
  }
}

const GlobalError = ({ error, reset }) => {
  useEffect(() => {
    sendClientLog({
      type: 'react-error',
      message: error?.message,
      stack: error?.stack,
      digest: error?.digest,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      styledEngine: getStyledEngineInfo(),
    })
  }, [error])

  return (
    <html lang="ru">
      <body>
        <h2>Произошла ошибка</h2>
        <button type="button" onClick={() => reset()}>
          Повторить
        </button>
      </body>
    </html>
  )
}

GlobalError.propTypes = {
  error: PropTypes.shape({
    digest: PropTypes.string,
    message: PropTypes.string,
    stack: PropTypes.string,
  }),
  reset: PropTypes.func.isRequired,
}

GlobalError.defaultProps = {
  error: null,
}

export default GlobalError
