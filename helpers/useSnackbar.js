import { faTimes } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useSnackbar as notistackUseSnackbar } from 'notistack'
import { useCallback, useMemo } from 'react'

const variants = ['default', 'error', 'success', 'warning', 'info']

const useSnackbar = () => {
  const { enqueueSnackbar, closeSnackbar } = notistackUseSnackbar()
  const makeHandler = useCallback(
    (variant) => (text, props = {}) => {
      const key = enqueueSnackbar(text, {
        open: true,
        variant,
        // onClick: () => {
        //   closeSnackbar(key)
        // },
        className: 'flex flex-nowrap',
        // autoHideDuration,
        action: (
          // <div className="w-8 -ml-2">
          <FontAwesomeIcon
            onClick={() => {
              closeSnackbar(key)
            }}
            icon={faTimes}
            className="w-6 h-6 cursor-pointer"
          />
          // </div>
        ),
        ...props,
      })
    },
    [closeSnackbar, enqueueSnackbar]
  )

  return useMemo(() => {
    const result = {}
    variants.forEach((variant) => {
      result[variant] = makeHandler(variant)
    })
    return result
  }, [makeHandler])
}

export default useSnackbar
