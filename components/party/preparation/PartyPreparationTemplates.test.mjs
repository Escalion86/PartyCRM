import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import {
  createHookHost,
  nodes,
  textOf,
} from '../orders/partyOrderBoardTestHost.mjs'

const require = createRequire(import.meta.url)
const { transformSync } = require('next/dist/build/swc')
const compile = async (path) =>
  transformSync(
    (await readFile(new URL(path, import.meta.url), 'utf8'))
      .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
      .replaceAll('export default function ', 'function '),
    {
      jsc: {
        parser: { syntax: 'ecmascript', jsx: true },
        transform: { react: { runtime: 'classic', pragma: 'h' } },
        target: 'es2022',
      },
      module: { type: 'commonjs' },
    }
  ).code
const applySource = await compile('./PartyPreparationTemplateApply.js')
const settingsSource = await compile(
  '../../../app/company/settings/content/CompanySettingsPreparationTemplatesContent.js'
)
const companyId = 'a'.repeat(24),
  orderId = 'b'.repeat(24),
  templateId = 'c'.repeat(24),
  staffId = 'd'.repeat(24)
const h = (type, props, ...children) => ({
  type,
  props: { ...props, children },
})
const find = (tree, type, text) =>
  [...nodes(tree)].find(
    (node) => node.type === type && (!text || textOf(node).includes(text))
  )
const deferred = () => {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const templates = {
  templates: [
    { _id: templateId, title: 'Подготовка', items: [{ id: 'call' }] },
  ],
  staff: [{ _id: staffId, name: 'Ирина' }],
  roles: [],
}
const plan = {
  previewToken: 'e'.repeat(64),
  timeZone: 'Asia/Krasnoyarsk',
  createCount: 1,
  skipCount: 0,
  items: [
    {
      id: 'call',
      title: 'Позвонить',
      assigneeStaffIds: [staffId],
      dueAt: '2026-11-01T05:00:00Z',
    },
  ],
}
function application(api, props = {}) {
  const calls = [],
    pending = []
  const host = createHookHost(
    (hooks) => {
      const deps = {
        ...hooks,
        h,
        React: { Fragment: 'fragment' },
        AbortController,
        apiJson: async (url, options) => {
          calls.push({ url, options })
          return api ? api(url, options) : { data: templates }
        },
      }
      return new Function(
        ...Object.keys(deps),
        `${applySource}\nreturn PartyPreparationTemplateApplyContent`
      )(...Object.values(deps))
    },
    {
      companyId,
      orderId,
      onPendingChange: (value) => pending.push(value),
      ...props,
    }
  )
  host.render()
  const open = async () => {
    find(host.value, 'details').props.onToggle({
      currentTarget: { open: true },
    })
    await host.flush()
  }
  const select = async () => {
    find(host.value, 'select').props.onChange({ target: { value: templateId } })
    await host.flush()
  }
  return { host, calls, pending, open, select }
}

test('application requires a preview and sends its exact token once while pending', async () => {
  const pendingApply = deferred()
  const app = application(async (url, options) => {
    if (options.method !== 'POST') return { data: templates }
    const body = JSON.parse(options.body)
    return body.action === 'preview' ? { data: plan } : pendingApply.promise
  })
  await app.open()
  await app.select()
  assert.equal(find(app.host.value, 'button', 'Добавить задачи'), undefined)
  await find(app.host.value, 'button', 'Проверить задачи').props.onClick()
  await app.host.flush()
  assert.match(textOf(app.host.value), /Ирина/)
  const apply = find(app.host.value, 'button', 'Добавить задачи')
  const first = apply.props.onClick()
  const second = apply.props.onClick()
  await app.host.flush()
  assert.equal(
    app.calls.filter(
      (call) =>
        call.options.method === 'POST' &&
        JSON.parse(call.options.body).action === 'apply'
    ).length,
    1
  )
  assert.equal(app.pending.at(-1), true)
  const request = app.calls.at(-1)
  assert.equal(request.options.headers['x-partycrm-company-id'], companyId)
  assert.equal(JSON.parse(request.options.body).previewToken, plan.previewToken)
  pendingApply.resolve({ data: { createdCount: 1, skippedCount: 0 } })
  await Promise.all([first, second])
  await app.host.flush()
  assert.match(textOf(app.host.value), /Добавлено задач: 1/)
  assert.equal(app.pending.at(-1), false)
})

test('existing task preview never presents newly calculated deadlines or assignments', async () => {
  const app = application(async (_url, options) => ({
    data:
      options.method === 'POST'
        ? {
            ...plan,
            createCount: 0,
            skipCount: 1,
            items: [{ ...plan.items[0], alreadyCreated: true }],
          }
        : templates,
  }))
  await app.open()
  await app.select()
  await find(app.host.value, 'button', 'Проверить задачи').props.onClick()
  await app.host.flush()
  const item = find(app.host.value, 'li')
  assert.match(textOf(item), /Существующие срок и назначение сохраняются/)
  assert.doesNotMatch(textOf(item), /Ирина|Срок:|Без срока|2026/)
})

test('reload failure after successful application retains success and explains that tasks were saved', async () => {
  const app = application(
    async (_url, options) => ({
      data:
        options.method !== 'POST'
          ? templates
          : JSON.parse(options.body).action === 'preview'
            ? plan
            : { createdCount: 1, skippedCount: 0 },
    }),
    {
      onApplied: async () => {
        throw new Error('reload failed')
      },
    }
  )
  await app.open()
  await app.select()
  await find(app.host.value, 'button', 'Проверить задачи').props.onClick()
  await app.host.flush()
  await find(app.host.value, 'button', 'Добавить задачи').props.onClick()
  await app.host.flush()
  assert.match(textOf(app.host.value), /Добавлено задач: 1/)
  assert.match(
    textOf(app.host.value),
    /Задачи сохранены. Не удалось обновить список/
  )
  assert.equal(find(app.host.value, 'button', 'Добавить задачи'), undefined)
})

test('disabled application cannot create or preview tasks and unmount ignores late replies', async () => {
  const load = deferred()
  const app = application(async () => load.promise, { disabled: true })
  await app.open()
  app.host.dispose()
  load.resolve({ data: templates })
  await app.host.flush()
  assert.equal(app.calls.length, 1)
  assert.doesNotMatch(textOf(app.host.value), /Подготовка ·/)
})

test('identity wrappers remount drafts and preview for another company or order', () => {
  const apply = new Function(
    'h',
    `${applySource}\nreturn PartyPreparationTemplateApply`
  )(h)
  const settings = new Function(
    'h',
    `${settingsSource}\nreturn CompanySettingsPreparationTemplatesContent`
  )(h)
  assert.equal(
    apply({ companyId, orderId }).props.key,
    `${companyId}:${orderId}`
  )
  assert.notEqual(
    apply({ companyId, orderId }).props.key,
    apply({ companyId, orderId: staffId }).props.key
  )
  assert.notEqual(
    settings({ activeCompanyId: companyId }).props.key,
    settings({ activeCompanyId: staffId }).props.key
  )
})

test('deadline controls preserve exact offsets across units and provide understandable before/after modes', async () => {
  const changes = []
  const host = createHookHost(
    (hooks) =>
      new Function(
        ...Object.keys({ ...hooks, h, React: { Fragment: 'fragment' } }),
        `${settingsSource}\nreturn TemplateDeadlineEditor`
      )(...Object.values({ ...hooks, h, React: { Fragment: 'fragment' } })),
    { value: -90, onChange: (value) => changes.push(value) }
  )
  host.render()
  const select = () =>
    [...nodes(host.value)].filter((node) => node.type === 'select')
  assert.match(
    textOf(host.value),
    /До начала.*После начала.*К началу.*Без срока/
  )
  select()[1].props.onChange({ target: { value: '60' } })
  await host.flush()
  assert.equal(find(host.value, 'input').props.value, 1.5)
  assert.equal(changes.length, 0)
  select()[1].props.onChange({ target: { value: '1440' } })
  await host.flush()
  assert.equal(find(host.value, 'input').props.value, 0.0625)
  find(host.value, 'button', 'За 3 часа').props.onClick()
  await host.flush()
  assert.equal(changes.at(-1), -180)
  host.setProps({ value: -180 })
  assert.equal(find(host.value, 'input').props.value, 3)
  select()[0].props.onChange({ target: { value: 'after' } })
  await host.flush()
  assert.equal(changes.at(-1), 180)
  select()[0].props.onChange({ target: { value: 'none' } })
  await host.flush()
  assert.equal(changes.at(-1), null)
  assert.equal(find(host.value, 'input'), undefined)
})

test('settings preserve a dirty draft when switching templates is declined and save the selected company', async () => {
  const guards = [],
    calls = []
  const host = createHookHost(
    (hooks) => {
      const deps = {
        ...hooks,
        h,
        React: { Fragment: 'fragment' },
        crypto: { randomUUID },
        AbortController,
        structuredClone,
        usePartyUnsavedChanges: (dirty, options) =>
          guards.push({ dirty, options }),
        requestPartyLeave: () => false,
        apiJson: async (url, options) => {
          calls.push({ url, options })
          return { data: { ...templates, canManage: true } }
        },
      }
      return new Function(
        ...Object.keys(deps),
        `${settingsSource}\nreturn PreparationTemplatesSettings`
      )(...Object.values(deps))
    },
    { activeCompanyId: companyId }
  )
  host.render()
  await host.flush()
  find(host.value, 'button', 'Создать шаблон').props.onClick()
  await host.flush()
  find(host.value, 'input').props.onChange({ target: { value: 'Мой шаблон' } })
  await host.flush()
  find(host.value, 'button', 'Подготовка').props.onClick()
  await host.flush()
  assert.equal(find(host.value, 'input').props.value, 'Мой шаблон')
  assert.equal(guards.at(-1).dirty, true)
  assert.equal(calls[0].options.headers['x-partycrm-company-id'], companyId)
})
