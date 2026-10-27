'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import FieldHelp from '@components/FieldHelp'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'

const control =
  'min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm'
const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 disabled:opacity-50'
export default function CompanySettingsWorkflowContent({ activeCompanyId }) {
  const [workflow, setWorkflow] = useState(null)
  const [savedWorkflow, setSavedWorkflow] = useState('')
  const [roles, setRoles] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  usePartyUnsavedChanges(
    Boolean(workflow && JSON.stringify(workflow) !== savedWorkflow),
    { label: 'этапы заказов', scope: activeCompanyId, pending: busy }
  )
  useEffect(() => {
    let current = true
    setWorkflow(null)
    Promise.all([
      apiJson('/api/party/workflow', {
        headers: { 'x-partycrm-company-id': activeCompanyId },
      }),
      apiJson('/api/party/roles', {
        headers: { 'x-partycrm-company-id': activeCompanyId },
      }),
    ])
      .then(([flow, positions]) => {
        if (current) {
          setWorkflow(flow.data)
          setSavedWorkflow(JSON.stringify(flow.data))
          setRoles(positions.data.filter((role) => role.active))
        }
      })
      .catch((cause) => {
        if (current) setError(cause.message)
      })
    return () => {
      current = false
    }
  }, [activeCompanyId])
  const save = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await apiJson('/api/party/workflow', {
        method: 'PATCH',
        headers: { 'x-partycrm-company-id': activeCompanyId },
        body: JSON.stringify({
          ...workflow,
          expectedRevision: workflow.revision,
        }),
      })
      setWorkflow(result.data)
      setSavedWorkflow(JSON.stringify(result.data))
      setNotice('Этапы сохранены.')
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }
  if (!workflow) return <p role="status">{error || 'Загрузка этапов…'}</p>
  const options = workflow.stages.map((stage) => (
    <option key={stage.id} value={stage.id}>
      {stage.title}
    </option>
  ))
  return (
    <fieldset disabled={busy} className="min-w-0 space-y-4">
      <p className="text-sm text-slate-600">
        Настройте путь заказа и должности, которые передают его дальше.
        Видимость каждого этапа задаётся в настройках должности.
      </p>
      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-sky-800">
          {notice}
        </p>
      )}
      <label className="block text-sm">
        Начальный этап заявки
        <select
          className={`${control} mt-1 cursor-pointer`}
          value={workflow.initialStageId}
          onChange={(event) =>
            setWorkflow((previous) => ({
              ...previous,
              initialStageId: event.target.value,
            }))
          }
        >
          {options}
        </select>
      </label>
      <div className="space-y-2">
        {workflow.stages.map((stage, index) => (
          <div key={stage.id} className="flex items-end gap-2">
            <label className="min-w-0 flex-1 text-sm">
              Этап {index + 1}
              <input
                className={`${control} mt-1`}
                value={stage.title}
                maxLength={100}
                onChange={(event) =>
                  setWorkflow((previous) => ({
                    ...previous,
                    stages: previous.stages.map((item) =>
                      item.id === stage.id
                        ? { ...item, title: event.target.value }
                        : item
                    ),
                  }))
                }
              />
            </label>
            <button
              type="button"
              className={button}
              disabled={workflow.stages.length === 1}
              onClick={() =>
                setWorkflow((previous) => ({
                  ...previous,
                  stages: previous.stages.filter(
                    (item) => item.id !== stage.id
                  ),
                  transitions: previous.transitions.filter(
                    (transition) =>
                      transition.fromStageId !== stage.id &&
                      transition.toStageId !== stage.id
                  ),
                  initialStageId:
                    previous.initialStageId === stage.id
                      ? previous.stages.find((item) => item.id !== stage.id).id
                      : previous.initialStageId,
                }))
              }
            >
              Убрать
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className={button}
        onClick={() =>
          setWorkflow((previous) => ({
            ...previous,
            stages: [
              ...previous.stages,
              {
                id: `stage_${globalThis.crypto.randomUUID().slice(0, 8)}`,
                title: 'Новый этап',
              },
            ],
          }))
        }
      >
        + Этап
      </button>
      <h3 className="font-semibold">
        Переходы
        <FieldHelp
          label="Переходы заказа"
          text="Настройте, из какого этапа и куда можно передать заказ. Разрешение на переход выдаётся должности отдельно. Переход не проводит платежи и не меняет системный статус заказа."
        />
      </h3>
      {workflow.transitions.map((transition, index) => (
        <div
          key={transition.id || index}
          className="space-y-3 rounded-xl border border-sky-100 p-3"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ['fromStageId', 'Из этапа'],
              ['toStageId', 'В этап'],
            ].map(([key, label]) => (
              <label key={key} className="text-sm">
                {label}
                <select
                  className={`${control} mt-1 cursor-pointer`}
                  value={transition[key]}
                  onChange={(event) =>
                    setWorkflow((previous) => ({
                      ...previous,
                      transitions: previous.transitions.map(
                        (item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, [key]: event.target.value }
                            : item
                      ),
                    }))
                  }
                >
                  {options}
                </select>
              </label>
            ))}
          </div>
          <fieldset>
            <legend className="text-sm">
              Разрешённые должности (пусто — любая с правом перехода)
            </legend>
            <div className="flex flex-wrap gap-3">
              {roles.map((role) => (
                <label
                  key={role._id}
                  className="flex min-h-10 cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={transition.roleIds.includes(role._id)}
                    onChange={(event) =>
                      setWorkflow((previous) => ({
                        ...previous,
                        transitions: previous.transitions.map(
                          (item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  roleIds: event.target.checked
                                    ? [...item.roleIds, role._id]
                                    : item.roleIds.filter(
                                        (id) => id !== role._id
                                      ),
                                }
                              : item
                        ),
                      }))
                    }
                  />
                  {role.title}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={transition.requireBrief !== false}
              onChange={(event) =>
                setWorkflow((previous) => ({
                  ...previous,
                  transitions: previous.transitions.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, requireBrief: event.target.checked }
                      : item
                  ),
                }))
              }
            />
            Требовать заполненный бриф
          </label>
          <button
            type="button"
            className={button}
            onClick={() =>
              setWorkflow((previous) => ({
                ...previous,
                transitions: previous.transitions.filter(
                  (_, itemIndex) => itemIndex !== index
                ),
              }))
            }
          >
            Убрать переход
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={button}
          disabled={workflow.stages.length < 2}
          onClick={() =>
            setWorkflow((previous) => ({
              ...previous,
              transitions: [
                ...previous.transitions,
                {
                  id: globalThis.crypto.randomUUID(),
                  fromStageId: previous.stages[0].id,
                  toStageId: previous.stages[1].id,
                  roleIds: [],
                  requireBrief: true,
                },
              ],
            }))
          }
        >
          + Переход
        </button>
        <button
          type="button"
          className={`${button} bg-sky-600 text-white`}
          disabled={busy}
          onClick={save}
        >
          {busy ? 'Сохранение…' : 'Сохранить этапы'}
        </button>
      </div>
    </fieldset>
  )
}
