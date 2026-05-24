'use client'

import { faLink } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useAtomValue } from 'jotai'
import cn from 'classnames'
import { modalsFuncAtom } from '@state/atoms'

const ClientContactMergeButton = ({
  clientId,
  className,
  size = 'sm',
  withTitle = false,
}) => {
  const modalsFunc = useAtomValue(modalsFuncAtom)
  if (!clientId) return null

  const openMerge = (event) => {
    event.stopPropagation()
    modalsFunc.client?.contactMerge(clientId)
  }

  if (withTitle) {
    return (
      <button
        type="button"
        className={cn(
          'group flex cursor-pointer items-center gap-x-2 text-left',
          className
        )}
        onClick={openMerge}
      >
        <div className="flex w-6 items-center justify-center">
          <FontAwesomeIcon
            icon={faLink}
            className="h-5 text-gray-600 duration-300 group-hover:scale-115 group-hover:text-toxic"
            size={size}
          />
        </div>
        <span className="group-hover:text-toxic">Объединить контакты</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      className={cn(
        'inline-flex cursor-pointer items-center gap-2 rounded border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50',
        className
      )}
      onClick={openMerge}
      title="Объединить контакты клиента"
    >
      <FontAwesomeIcon icon={faLink} size={size} />
      <span>Объединить</span>
    </button>
  )
}

export default ClientContactMergeButton
