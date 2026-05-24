import { faSearch, faTimes } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useDebounceEffect } from '@helpers/useDebounceEffect'
import cn from 'classnames'
import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

const Search = ({
  searchText,
  show,
  onChange,
  className,
  debounceDelay = 500,
}) => {
  const inputRef = useRef()

  const [text, setText] = useState(searchText)

  const debouncedSearchTerm = useDebounceEffect(text, debounceDelay)

  useEffect(
    () => onChange(debouncedSearchTerm),
    [debouncedSearchTerm, onChange]
  )

  useEffect(() => {
    if (show) inputRef?.current?.focus()
  }, [inputRef, show])

  return (
    <motion.div
      initial={{ height: 0, minHeight: 0 }}
      animate={{ height: show ? 38 : 0, minHeight: show ? 38 : 0 }}
      transition={{ type: 'just' }}
      className={cn(
        'relative flex flex-wrap justify-end overflow-hidden',
        className
      )}
    >
      <div className="absolute bottom-0 left-0 right-0 my-0.5 flex h-[34px] min-h-[34px] w-full items-center gap-1 rounded border border-gray-700 bg-white p-1">
        <input
          ref={inputRef}
          className="flex-1 bg-transparent outline-none"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <FontAwesomeIcon
          className={'h-6 w-6 cursor-pointer text-gray-700'}
          icon={text ? faTimes : faSearch}
          onClick={text ? () => setText('') : () => inputRef.current.focus()}
        />
      </div>
    </motion.div>
  )
}

export default Search
