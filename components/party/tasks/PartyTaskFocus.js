'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'
import PartyTaskCard from './PartyTaskCard'

const names = new Map()
const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-800 disabled:cursor-not-allowed disabled:opacity-50'

export default function PartyTaskFocus({
  companyId,
  taskId,
  disabled = false,
  onChanged,
  onClose,
}) {
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState({
    key: '',
    task: null,
    error: '',
    busy: false,
  })
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const generation = useRef(0)
  const heading = useRef(null)
  const focusedIdentity = useRef('')
  const titleId = useId()
  const key = `${companyId}:${taskId}:${retry}`
  const current = state.key === key
  const task = current ? state.task : null
  const busy = !current || state.busy
  usePartyUnsavedChanges(false, {
    label: 'изменение задачи',
    scope: companyId,
    pending: saving,
  })
  useEffect(() => {
    const currentGeneration = ++generation.current
    const controller = new AbortController()
    const identity = `${companyId}:${taskId}`
    if (focusedIdentity.current !== identity) {
      focusedIdentity.current = identity
      heading.current?.focus()
    }
    setState({ key, task: null, error: '', busy: true })
    setSaving(false)
    setNotice('')
    apiJson(`/api/party/tasks/${encodeURIComponent(taskId)}`, {
      headers: { 'x-partycrm-company-id': companyId },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((result) => {
        if (generation.current !== currentGeneration) return
        if (String(result.data?._id) !== taskId)
          throw new Error('Не удалось получить задачу из ссылки.')
        setState({ key, task: result.data, error: '', busy: false })
      })
      .catch((cause) => {
        if (
          generation.current !== currentGeneration ||
          cause.name === 'AbortError'
        )
          return
        setState({
          key,
          task: null,
          error: cause.message || 'Задача недоступна. Обновите данные.',
          busy: false,
        })
      })
    return () => {
      generation.current += 1
      controller.abort()
    }
  }, [companyId, taskId, key])
  const mutate = async (row, patch) => {
    if (
      disabled ||
      saving ||
      !row.canComplete ||
      !['new', 'in_progress'].includes(row.status) ||
      patch.action !== 'status' ||
      !['in_progress', 'done'].includes(patch.status)
    )
      return
    const currentGeneration = generation.current
    setSaving(true)
    setNotice('')
    setState((previous) => ({ ...previous, error: '' }))
    try {
      const result = await apiJson(
        `/api/party/tasks/${encodeURIComponent(taskId)}`,
        {
          method: 'PATCH',
          headers: { 'x-partycrm-company-id': companyId },
          body: JSON.stringify({
            action: 'status',
            status: patch.status,
            revision: row.revision,
          }),
        }
      )
      if (generation.current !== currentGeneration) return
      if (String(result.data?._id) !== taskId)
        throw new Error('Не удалось получить обновлённую задачу.')
      setState({ key, task: result.data, error: '', busy: false })
      setNotice(
        patch.status === 'done' ? 'Задача выполнена.' : 'Задача взята в работу.'
      )
      onChanged?.()
    } catch (cause) {
      if (generation.current !== currentGeneration) return
      if (cause.status === 409) {
        setRetry((previous) => previous + 1)
        onChanged?.()
      } else
        setState((previous) => ({
          ...previous,
          error: cause.message || 'Не удалось изменить задачу.',
        }))
    } finally {
      if (generation.current === currentGeneration) setSaving(false)
    }
  }
  return (
    <section
      className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/50 p-3 sm:p-4"
      aria-labelledby={titleId}
      aria-busy={busy || saving}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id={titleId}
          ref={heading}
          tabIndex={-1}
          className="font-semibold text-sky-950"
        >
          Задача из рабочего экрана
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={button}
            disabled={busy || saving}
            onClick={() => setRetry((previous) => previous + 1)}
          >
            Обновить задачу
          </button>
          <button
            type="button"
            className={button}
            disabled={saving}
            onClick={onClose}
          >
            Закрыть карточку
          </button>
        </div>
      </div>
      {busy ? (
        <p role="status" className="text-sm text-slate-500">
          Загрузка задачи…
        </p>
      ) : null}
      {current && state.error ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {state.error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}
      {task ? (
        <PartyTaskCard
          task={{ ...task, canEdit: false, canCancel: false, canReopen: false }}
          staffById={names}
          rolesById={names}
          busy={saving || disabled}
          onMutate={mutate}
        />
      ) : null}
      {disabled ? (
        <p className="text-xs text-slate-600">
          Сохраните или отмените изменения в задаче ниже либо дождитесь
          окончания операции.
        </p>
      ) : null}
    </section>
  )
}
