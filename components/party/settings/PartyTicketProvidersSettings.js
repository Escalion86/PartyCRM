'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'

const button = 'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50'
const field = 'min-h-11 min-w-0 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm'
const statuses = { unconfigured: 'Не подключено', unchecked: 'Токен сохранён, проверка не выполнена', verified: 'Чтение проверено', error: 'Проверка завершилась ошибкой' }
const rubles = (value) => value == null ? 'Сумма не указана' : `${(value / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽`
const initialPeriod = () => {
  const today = new Date(), yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const local = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return { from: local(yesterday), to: local(today) }
}

function ProviderForm({ connection, companyId, encryptionReady, onConnection }) {
  const id = useId(), [token, setToken] = useState(''), [storeUuid, setStoreUuid] = useState(connection.storeUuid || '')
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState('')
  const [stores, setStores] = useState([]), [preview, setPreview] = useState(null), [period, setPeriod] = useState(initialPeriod)
  const live = useRef(true), busyRef = useRef(false)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const dirty = token !== '' || storeUuid !== (connection.storeUuid || '')
  usePartyUnsavedChanges(dirty, { label: `подключение ${connection.title}`, scope: companyId, pending: Boolean(busy) })
  const run = async (action, payload) => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(action); setError(''); setMessage('')
    try {
      const result = await apiJson('/api/party/ticketing/providers', { method: 'POST', headers: { 'x-partycrm-company-id': companyId }, body: JSON.stringify({ action, provider: connection.provider, expectedRevision: connection.revision, ...(action === 'save' ? { token, storeUuid } : {}), ...(payload ? { payload } : {}) }) })
      if (!live.current) return
      if (result.data.connection) onConnection(result.data.connection)
      if (action === 'save' || action === 'disconnect') { setToken(''); setStoreUuid(result.data.connection.storeUuid || ''); setPreview(null); setStores([]) }
      if (action === 'test') { setStores(result.data.stores || []); setMessage('Чтение проверено. Автоматическая синхронизация не включена.') }
      if (action === 'save') setMessage('Токен сохранён. Нажмите «Проверить чтение», чтобы проверить доступ.')
      if (action === 'disconnect') setMessage('Токен удалён из подключения.')
      if (result.data.preview) setPreview(result.data.preview)
    } catch (cause) {
      if (live.current) { setError(cause.message || 'Не удалось выполнить действие'); if (action === 'test' && cause.payload?.error?.code?.startsWith('partycrm_provider_')) onConnection({ ...connection, status: 'error' }) }
    } finally { busyRef.current = false; if (live.current) setBusy('') }
  }
  const previewPeriod = (page = 1) => {
    const from = new Date(`${period.from}T00:00:00`), to = new Date(`${period.to}T00:00:00`)
    if (!Number.isFinite(+from) || !Number.isFinite(+to) || to <= from || to - from > 7 * 86400000) { setError('Укажите период до семи дней. Дата «До» не включается.'); return }
    run('preview', { dateFrom: from.toISOString(), dateTo: to.toISOString(), page })
  }
  return (
    <section aria-labelledby={`${id}-title`} className="grid min-w-0 gap-3 rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 id={`${id}-title`} className="font-semibold text-slate-900">{connection.title}</h3><span className={`rounded-full px-2.5 py-1 text-xs ${connection.status === 'verified' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{statuses[connection.status] || statuses.unconfigured}</span></div>
      <p className="text-sm leading-6 text-slate-600">{connection.limitation}</p>
      <form onSubmit={(event) => { event.preventDefault(); run('save') }} className="grid min-w-0 gap-3">
        <label htmlFor={`${id}-token`} className="grid min-w-0 gap-1.5 text-sm text-slate-700"><span>{connection.provider === 'evotor' ? 'Токен Облака Эвотор' : 'API-ключ Ticketscloud'}</span><input id={`${id}-token`} type="password" autoComplete="new-password" value={token} maxLength={4096} onChange={(event) => setToken(event.target.value)} disabled={Boolean(busy) || !encryptionReady} placeholder={connection.configured ? 'Сохранён. Введите новый для замены' : 'Введите токен'} className={field} /></label>
        {connection.provider === 'evotor' ? <div className="grid gap-1.5 text-sm text-slate-700"><label htmlFor={`${id}-store`}>UUID магазина</label><input id={`${id}-store`} value={storeUuid} maxLength={36} onChange={(event) => setStoreUuid(event.target.value)} disabled={Boolean(busy) || !encryptionReady} aria-describedby={`${id}-store-help`} list={`${id}-stores`} placeholder="Получите список кнопкой «Проверить чтение»" className={field} /><datalist id={`${id}-stores`}>{stores.map((store) => <option key={store.id} value={store.id}>{store.title}</option>)}</datalist><span id={`${id}-store-help`} className="text-xs text-slate-500">Можно сохранить токен без магазина, проверить чтение и выбрать магазин из подсказки.</span></div> : null}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={!dirty || Boolean(busy) || !encryptionReady} className={`${button} bg-sky-50`}>{busy === 'save' ? 'Сохраняем…' : 'Сохранить подключение'}</button>
          <button type="button" disabled={!connection.configured || dirty || Boolean(busy) || !encryptionReady} onClick={() => run('test')} className={button}>{busy === 'test' ? 'Проверяем…' : 'Проверить чтение'}</button>
          {dirty ? <button type="button" disabled={Boolean(busy)} onClick={() => { setToken(''); setStoreUuid(connection.storeUuid || ''); setError('') }} className={button}>Сбросить изменения</button> : null}
          {connection.configured ? <button type="button" disabled={dirty || Boolean(busy)} onClick={() => run('disconnect')} className={button}>Удалить токен</button> : null}
        </div>
      </form>
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {message ? <p role="status" className="text-sm text-emerald-800">{message}</p> : null}
      {connection.configured ? <div className="grid gap-3 border-t border-slate-100 pt-3">
        <p className="text-sm font-semibold text-slate-800">Предпросмотр {connection.provider === 'evotor' ? 'чеков' : 'заказов'}</p>
        <div className="grid gap-3 sm:grid-cols-2"><label htmlFor={`${id}-from`} className="grid gap-1 text-sm">С<input id={`${id}-from`} type="date" className={field} value={period.from} disabled={Boolean(busy)} onChange={(event) => { setPeriod((value) => ({ ...value, from: event.target.value })); setPreview(null) }} /></label><label htmlFor={`${id}-to`} className="grid gap-1 text-sm">До, не включая<input id={`${id}-to`} type="date" className={field} value={period.to} disabled={Boolean(busy)} onChange={(event) => { setPeriod((value) => ({ ...value, to: event.target.value })); setPreview(null) }} /></label></div>
        <p className="text-xs leading-5 text-slate-500">До семи дней, в часовом поясе этого устройства. Результат не записывается в CRM и не меняет деньги или свободные места.</p>
        <button type="button" disabled={dirty || Boolean(busy) || !encryptionReady || (connection.provider === 'evotor' && !connection.storeUuid)} onClick={() => previewPeriod()} className={`${button} justify-self-start`}>{busy === 'preview' ? 'Читаем…' : 'Показать предпросмотр'}</button>
        {preview ? <div aria-live="polite" className="grid gap-2">
          {!preview.rows.length ? <p className="text-sm text-slate-500">За выбранный период данных нет.</p> : preview.rows.map((row, index) => <div key={`${row.id}-${index}`} className="grid min-w-0 gap-1 rounded-lg bg-slate-50 p-3 text-sm"><span className="break-words font-medium">{row.title || (preview.kind === 'receipts' ? row.type === 'PAYBACK' ? 'Чек возврата' : 'Чек продажи' : 'Внешний заказ')} · {row.code || row.number || row.id}</span><span className="text-slate-600">{preview.kind === 'receipts' ? rubles(row.amountKopecks) : `${row.quantity ?? '—'} бил. · ${rubles(row.priceKopecks)} · ${row.status}`}</span><span className="text-xs text-slate-500">Дата источника: {row.closedAtSource || row.createdAtSource || 'не указана'}{row.sourceTimeZone ? ` (${row.sourceTimeZone})` : ''}</span></div>)}
          {preview.nextPage ? <button type="button" disabled={Boolean(busy)} onClick={() => previewPeriod(preview.nextPage)} className={button}>Следующая страница</button> : null}
          {preview.truncated ? <p className="text-sm text-amber-800">Показаны первые 200 документов. Сократите период для полной сверки.</p> : null}
        </div> : null}
      </div> : null}
    </section>
  )
}

function CompanyTicketProvidersSettings({ activeCompanyId }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [version, setVersion] = useState(0)
  useEffect(() => {
    let live = true
    if (activeCompanyId) apiJson('/api/party/ticketing/providers', { headers: { 'x-partycrm-company-id': activeCompanyId } }).then((result) => { if (live) setData(result.data) }).catch((cause) => { if (live) setError(cause.message || 'Не удалось загрузить подключения') })
    return () => { live = false }
  }, [activeCompanyId, version])
  return <section className="min-w-0 rounded-2xl border border-sky-100 bg-white"><details className="group"><summary className="min-h-20 cursor-pointer px-5 py-4"><span className="font-semibold text-slate-900">Билетные сервисы и кассы</span><span className="mt-1 block text-sm text-slate-500">Ticketscloud, Эвотор и статус подключения Красбилета. Чтение и сверка данных.</span></summary><div className="grid min-w-0 gap-4 border-t border-sky-100 p-4 sm:p-5">
    {error ? <div role="alert" className="grid gap-2 text-sm text-red-800">{error}<button type="button" onClick={() => { setError(''); setData(null); setVersion((value) => value + 1) }} className={`${button} justify-self-start`}>Повторить загрузку</button></div> : !data ? <p className="text-sm text-slate-500">Загружаем подключения…</p> : <>
      {!data.encryptionReady ? <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Защищённое хранилище токенов не настроено. Обратитесь к администратору сервера.</p> : null}
      {data.providers.map((connection) => connection.provider === 'krasbilet' ? <div key={connection.provider} className="rounded-xl border border-dashed border-slate-200 p-4"><h3 className="font-semibold">Красбилет</h3><p className="mt-2 text-sm text-slate-600">{connection.limitation}</p></div> : <ProviderForm key={`${activeCompanyId}:${connection.provider}`} companyId={activeCompanyId} connection={connection} encryptionReady={data.encryptionReady} onConnection={(next) => setData((value) => ({ ...value, providers: value.providers.map((row) => row.provider === next.provider ? next : row) }))} />)}
    </>}
  </div></details></section>
}

export default function PartyTicketProvidersSettings({ activeCompanyId }) {
  return <CompanyTicketProvidersSettings key={activeCompanyId} activeCompanyId={activeCompanyId} />
}
