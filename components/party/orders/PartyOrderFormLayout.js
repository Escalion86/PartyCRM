'use client'

import { Children, useRef, useEffect } from 'react'
import TabContext from '@components/Tabs/TabContext'

// Reuse the exact same fields in both layouts, including nested editors.
export default function PartyOrderFormLayout({
  children,
  compact,
  summaries,
  focusSection,
  initialSection,
}) {
  const root = useRef(null)
  useEffect(() => {
    if (!focusSection) return
    const name =
      focusSection.name === 'Основное'
        ? focusSection.field === 'date'
          ? 'Дата и ответственный'
          : 'Услуги'
        : focusSection.name
    const section = [...(root.current?.querySelectorAll('details') || [])].find(
      (item) => item.dataset.orderSection === name
    )
    if (section) {
      section.open = true
      section.scrollIntoView({ block: 'nearest' })
      section.querySelector('input, button, select, textarea')?.focus()
    }
  }, [focusSection])
  const sections = Children.toArray(children).filter(
    (child) => child?.props?.tabName
  )
  if (!compact)
    return (
      <TabContext value="Основное" requestedTab={focusSection}>
        {children}
      </TabContext>
    )
  const order = [
    'Клиенты и контакты',
    'Услуги',
    'Дата и ответственный',
    'Место',
    'Бриф',
    'Команда',
    'Финансы и документы',
    'Задачи',
    'Комментарии',
  ]
  const compactSections = sections
    .flatMap((section) =>
      section.props.tabName === 'Основное'
        ? Children.toArray(section.props.children.props.children)
            .filter((child) => child.props?.['data-order-group'])
            .map((child) => ({
              name: child.props['data-order-group'],
              content: child,
            }))
        : [{ name: section.props.tabName, content: section.props.children }]
    )
    .sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))
  return (
    <div ref={root} className="mx-auto grid w-full max-w-3xl gap-3">
      {compactSections.map(({ name, content }) => {
        return (
          <details
            key={name}
            open={name === initialSection}
            data-order-section={name}
            className="rounded-xl border border-sky-100 bg-white"
            onToggle={(event) => {
              if (
                event.currentTarget.open &&
                document.activeElement ===
                  event.currentTarget.querySelector('summary')
              ) {
                event.currentTarget.scrollIntoView({
                  block: 'nearest',
                  behavior: 'auto',
                })
              }
            }}
          >
            <summary className="cursor-pointer rounded-xl p-3 text-sm font-semibold text-slate-900 focus-visible:outline-sky-600">
              {name === 'Задачи' ? 'Задачи и напоминания' : name}
              <span className="mt-1 line-clamp-2 block pl-4 text-sm font-normal break-words text-slate-500">
                {summaries[name]}
              </span>
            </summary>
            <div className="min-w-0 border-t border-sky-100 p-3">{content}</div>
          </details>
        )
      })}
    </div>
  )
}
