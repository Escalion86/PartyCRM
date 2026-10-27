import cn from 'classnames'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import InputWrapper from './InputWrapper'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCopy } from '@fortawesome/free-solid-svg-icons/faCopy'
import { faPaste } from '@fortawesome/free-solid-svg-icons/faPaste'
import {
  countPhoneDigitsBefore,
  editPhoneDigits,
  formatPhoneLocalDigits,
  formatPhoneNumber,
  getPhoneLocalDigits,
  normalizePhoneNumber,
  phoneCaretAfterDigits,
  phoneLocalDigitsToValue,
  phoneNumbersFromText,
} from '@helpers/phoneInput'

// Shared by standalone fields, Input's phone branch and the login form.
export const PhoneNumberField = ({
  value,
  onChange,
  label = 'Телефон',
  disabled = false,
  readOnly = false,
  copyPasteButtons = true,
  inputClassName,
  autoComplete = 'tel',
  name,
  placeholder = '(999) 123-45-67',
  prefix = '+7',
  tone = 'default',
}) => {
  const [draft, setDraft] = useState(() => ({
    value,
    digits: getPhoneLocalDigits(value),
  }))
  const [choices, setChoices] = useState([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)
  const choiceRef = useRef(null)
  const caretRef = useRef(null)
  const pendingRef = useRef(false)
  const mountedRef = useRef(false)
  const latestRef = useRef({ onChange, disabled, readOnly })
  const descriptionId = useId()
  const choicesId = useId()
  const digits = Object.is(draft.value, value)
    ? draft.digits
    : getPhoneLocalDigits(value)
  const display = formatPhoneLocalDigits(digits)
  const editable = !disabled && !readOnly

  useLayoutEffect(() => {
    latestRef.current = { onChange, disabled, readOnly }
    if (caretRef.current !== null && inputRef.current) {
      inputRef.current.setSelectionRange(caretRef.current, caretRef.current)
      caretRef.current = null
    }
  })
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  useLayoutEffect(() => {
    if (choices.length) choiceRef.current?.focus()
  }, [choices])

  const commit = (nextDigits, caret) => {
    if (latestRef.current.disabled || latestRef.current.readOnly) return
    const nextValue = phoneLocalDigitsToValue(nextDigits)
    caretRef.current = caret ?? formatPhoneLocalDigits(nextDigits).length
    setDraft({ value: nextValue, digits: nextDigits })
    setChoices([])
    setMessage('')
    latestRef.current.onChange?.(nextValue)
  }
  const replacePhone = (phone) => {
    commit(phone.slice(1))
    inputRef.current?.focus()
  }
  const showPastedText = (text, allowPartial = false) => {
    const phones = phoneNumbersFromText(text)
    if (phones.length === 1) replacePhone(phones[0])
    else if (phones.length > 1) {
      setChoices(phones)
      setMessage('')
    } else if (allowPartial && /^\d{1,9}$/.test(text.trim())) {
      const input = inputRef.current
      const next = editPhoneDigits({
        digits,
        selectionStart: input?.selectionStart,
        selectionEnd: input?.selectionEnd,
        text,
      })
      commit(next.digits, next.caret)
    } else {
      setChoices([])
      setMessage(
        'Номер телефона не найден. Вставьте 10 цифр или номер с 7, +7 или 8.'
      )
    }
  }
  const pasteFromClipboard = async () => {
    if (pendingRef.current || !editable) return
    pendingRef.current = true
    setBusy(true)
    setChoices([])
    setMessage('')
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.readText)
        throw new Error('clipboard_unavailable')
      const text = await navigator.clipboard.readText()
      if (
        !mountedRef.current ||
        latestRef.current.disabled ||
        latestRef.current.readOnly
      )
        return
      showPastedText(text)
    } catch {
      if (mountedRef.current)
        setMessage(
          'Не удалось прочитать буфер обмена. Разрешите доступ или вставьте номер вручную.'
        )
    } finally {
      pendingRef.current = false
      if (mountedRef.current) setBusy(false)
    }
  }
  const copyPhone = async () => {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error('clipboard_unavailable')
      await navigator.clipboard.writeText('+7 ' + display)
      if (mountedRef.current) setMessage('Номер скопирован.')
    } catch {
      if (mountedRef.current)
        setMessage(
          'Не удалось скопировать номер. Выделите его и скопируйте вручную.'
        )
    }
  }
  const editSelection = (event, inputType, text = '') => {
    if (!editable) return
    event.preventDefault()
    const input = inputRef.current
    const next = editPhoneDigits({
      digits,
      selectionStart: input.selectionStart,
      selectionEnd: input.selectionEnd,
      inputType,
      text,
    })
    commit(next.digits, next.caret)
  }
  const buttonClassName = cn(
    'flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded border transition disabled:cursor-not-allowed disabled:opacity-50',
    tone === 'party'
      ? 'border-sky-200 text-sky-700 hover:bg-sky-50 focus-visible:outline-sky-500'
      : 'border-gray-300 text-gray-600 hover:bg-gray-50 focus-visible:outline-gray-500'
  )

  return (
    <div className="relative flex min-w-0 flex-1 flex-col">
      <div className="flex min-w-0 items-center gap-1">
        {prefix ? (
          <span className="shrink-0 text-gray-500">{prefix}</span>
        ) : null}
        <input
          ref={inputRef}
          aria-label={label}
          aria-describedby={message ? descriptionId : undefined}
          aria-controls={choices.length ? choicesId : undefined}
          type="tel"
          inputMode="tel"
          name={name}
          autoComplete={autoComplete}
          disabled={disabled}
          readOnly={readOnly}
          placeholder={placeholder}
          value={display}
          className={cn(
            'peer h-7 min-w-0 flex-1 bg-transparent px-1 outline-none',
            inputClassName
          )}
          onKeyDown={(event) => {
            if (event.key === 'Backspace')
              editSelection(event, 'deleteContentBackward')
            else if (event.key === 'Delete')
              editSelection(event, 'deleteContentForward')
            else if (
              /^\d$/.test(event.key) &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.altKey
            )
              editSelection(event, 'insertText', event.key)
          }}
          onBeforeInput={(event) => {
            const native = event.nativeEvent
            if (native.inputType?.startsWith('delete'))
              editSelection(event, native.inputType)
            else if (native.inputType === 'insertText' && native.data)
              editSelection(event, native.inputType, native.data)
          }}
          onPaste={(event) => {
            if (!editable) return
            event.preventDefault()
            showPastedText(event.clipboardData.getData('text'), true)
          }}
          onChange={(event) => {
            if (!editable) return
            const raw = event.target.value
            const rawDigits = raw.replace(/\D/g, '')
            // Mobile keyboards may deliver input without a cancellable
            // beforeinput. An extra typed digit must not become a new prefix.
            if (
              digits.length === 10 &&
              rawDigits.length === 11 &&
              event.nativeEvent.inputType === 'insertText' &&
              /^\d$/.test(event.nativeEvent.data || '')
            ) {
              commit(
                digits,
                phoneCaretAfterDigits(
                  display,
                  countPhoneDigitsBefore(raw, event.target.selectionStart) - 1
                )
              )
              return
            }
            const complete =
              rawDigits.length === 11 || /^\+7/.test(raw)
                ? normalizePhoneNumber(raw)
                : null
            if (rawDigits.length > 10 && !complete) {
              setMessage('Укажите 10 цифр номера или 11 цифр с 7 или 8.')
              return
            }
            const nextDigits = complete
              ? complete.slice(1)
              : rawDigits.slice(0, 10)
            const count =
              countPhoneDigitsBefore(raw, event.target.selectionStart) -
              (complete ? 1 : 0)
            commit(
              nextDigits,
              phoneCaretAfterDigits(formatPhoneLocalDigits(nextDigits), count)
            )
          }}
        />
        {copyPasteButtons && editable ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              title="Вставить номер"
              aria-label="Вставить номер"
              aria-busy={busy || undefined}
              disabled={busy}
              className={buttonClassName}
              onClick={pasteFromClipboard}
            >
              <FontAwesomeIcon icon={faPaste} className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Скопировать номер"
              aria-label="Скопировать номер"
              disabled={!digits}
              className={buttonClassName}
              onClick={copyPhone}
            >
              <FontAwesomeIcon icon={faCopy} className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>
      {message ? (
        <p
          id={descriptionId}
          role="status"
          className="mt-1 text-xs text-slate-600"
        >
          {message}
        </p>
      ) : null}
      {choices.length ? (
        <div
          id={choicesId}
          role="dialog"
          aria-label="Выберите номер телефона"
          className="mt-2 rounded border border-sky-200 bg-white p-2 text-sm text-slate-900"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            event.stopPropagation()
            setChoices([])
            inputRef.current?.focus()
          }}
        >
          <p className="mb-1 font-medium">Выберите номер телефона</p>
          <div className="max-h-60 overflow-y-auto">
            {choices.map((phone, index) => (
              <button
                key={phone}
                ref={index === 0 ? choiceRef : undefined}
                type="button"
                className="flex min-h-11 w-full cursor-pointer items-center rounded px-2 text-left hover:bg-sky-50 focus-visible:outline-sky-500"
                onClick={() => replacePhone(phone)}
              >
                {formatPhoneNumber(phone)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="mt-1 min-h-10 cursor-pointer px-2 text-sky-700"
            onClick={() => {
              setChoices([])
              inputRef.current?.focus()
            }}
          >
            Отмена
          </button>
        </div>
      ) : null}
    </div>
  )
}

const PhoneInput = ({
  value,
  label = 'Телефон',
  onChange,
  required = false,
  disabled,
  labelClassName,
  className,
  noMargin,
  paddingY,
  smallMargin,
  error,
  showErrorText,
  copyPasteButtons = true,
  autoComplete,
  name,
  help,
  tone = 'default',
}) => (
  <InputWrapper
    label={label}
    labelClassName={labelClassName}
    value={value}
    required={required}
    className={cn('w-72 max-w-full', className)}
    disabled={disabled}
    noMargin={noMargin}
    paddingY={paddingY}
    smallMargin={smallMargin}
    error={error}
    showErrorText={showErrorText}
    tone={tone}
    help={help}
    floatingLabel={false}
  >
    <PhoneNumberField
      value={value}
      label={label}
      onChange={onChange}
      disabled={disabled}
      copyPasteButtons={copyPasteButtons}
      tone={tone}
      autoComplete={autoComplete}
      name={name}
      inputClassName={cn(
        disabled
          ? 'text-disabled cursor-not-allowed'
          : tone === 'party'
            ? 'text-sky-900'
            : 'text-input'
      )}
    />
  </InputWrapper>
)

export default PhoneInput
