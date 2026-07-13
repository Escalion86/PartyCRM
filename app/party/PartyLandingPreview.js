const Icon = ({ name, className = 'h-5 w-5' }) => {
  const paths = {
    calendar: (
      <>
        <path d="M6 2v3M14 2v3M3 8h14" />
        <rect x="3" y="4" width="14" height="13" rx="2" />
        <path d="M7 12h2M11 12h2" />
      </>
    ),
    pin: (
      <>
        <path d="M16 8c0 4.5-6 9-6 9S4 12.5 4 8a6 6 0 1 1 12 0Z" />
        <circle cx="10" cy="8" r="2" />
      </>
    ),
    users: (
      <>
        <circle cx="7" cy="7" r="3" />
        <circle cx="14" cy="8" r="2.5" />
        <path d="M2.5 17c.4-3 2-5 4.5-5s4.1 2 4.5 5M11 13c2.8-.5 5.5 1 6 4" />
      </>
    ),
    wallet: (
      <>
        <path d="M3 5.5A2.5 2.5 0 0 1 5.5 3H16v14H5.5A2.5 2.5 0 0 1 3 14.5Z" />
        <path d="M13 8h4v4h-4a2 2 0 0 1 0-4Z" />
      </>
    ),
    document: (
      <>
        <path d="M5 2h7l4 4v12H5Z" />
        <path d="M12 2v5h4M8 11h5M8 14h5" />
      </>
    ),
    gift: (
      <>
        <path d="M3 8h14v10H3ZM2 5h16v3H2Z" />
        <path d="M10 5v13M10 5C8 5 5 4.5 5 2.8 5 1.4 7.8 2 10 5Zm0 0c2 0 5-.5 5-2.2C15 1.4 12.2 2 10 5Z" />
      </>
    ),
    briefcase: (
      <>
        <rect x="2" y="6" width="16" height="11" rx="2" />
        <path d="M7 6V3h6v3M2 10h16M9 10v2h2v-2" />
      </>
    ),
    cap: (
      <>
        <path d="m2 8 8-4 8 4-8 4Z" />
        <path d="M5 10.5v4c3 2 7 2 10 0v-4M18 8v5" />
      </>
    ),
    check: <path d="m4 10 4 4 8-8" />,
    search: (
      <>
        <circle cx="9" cy="9" r="5" />
        <path d="m13 13 4 4" />
      </>
    ),
  }

  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {paths[name] || paths.check}
    </svg>
  )
}

const heroOrders = [
  {
    title: 'День рождения Алисы',
    meta: '21 мая, ср · 15:00–18:00',
    place: 'Лофт «Облака»',
    person: 'МИ',
    owner: 'Мария Иванова',
    status: 'Подтверждён',
    tone: 'emerald',
    icon: 'gift',
  },
  {
    title: 'Корпоратив «Север»',
    meta: '23 мая, пт · 19:00–23:00',
    place: 'Ресторан «Парус»',
    person: 'ИП',
    owner: 'Иван Петров',
    status: 'В работе',
    tone: 'amber',
    icon: 'briefcase',
  },
  {
    title: 'Выпускной 4Б',
    meta: '24 мая, сб · 17:00–22:00',
    place: 'Парк-отель «Сосны»',
    person: 'ОК',
    owner: 'Ольга Кузнецова',
    status: 'Нужен контакт',
    tone: 'coral',
    icon: 'cap',
  },
]

const statusStyles = {
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  coral: 'bg-rose-50 text-rose-600',
}

export function HeroProductPreview({ compact = false }) {
  return (
    <div className={`party-product-window ${compact ? 'party-product-window--compact' : ''}`}>
      <aside className="party-product-sidebar">
        <span className="text-lg font-bold tracking-[-0.04em] text-[#102338]">
          Party<span className="text-[#0b9bd7]">CRM</span>
        </span>
        <nav className="mt-7 space-y-1.5" aria-label="Разделы демонстрационного кабинета">
          {[
            ['calendar', 'Заказы'],
            ['pin', 'Площадки'],
            ['users', 'Команда'],
            ['wallet', 'Финансы'],
            ['document', 'Документы'],
          ].map(([icon, label], index) => (
            <span
              key={label}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[11px] font-medium ${
                index === 0
                  ? 'bg-[#eaf6fc] text-[#087fbd]'
                  : 'text-[#607089]'
              }`}
            >
              <Icon name={icon} className="h-4 w-4" />
              {label}
            </span>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 p-4 sm:p-5 lg:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold tracking-[-0.03em] text-[#102338] sm:text-xl">
            Заказы
          </h2>
          <div className="hidden items-center gap-2 sm:flex">
            <span className="flex items-center gap-2 rounded-lg border border-[#d9e3eb] px-3 py-2 text-[10px] text-[#8a97a8]">
              Поиск по заказам
              <Icon name="search" className="h-3.5 w-3.5 text-[#607089]" />
            </span>
            <span className="rounded-lg bg-[#0b94d4] px-3 py-2 text-[10px] font-semibold text-white">
              + Новый заказ
            </span>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-[#dfe8ef] px-3 py-3 sm:px-4">
          <div className="grid grid-cols-7 gap-1 text-center">
            {[
              ['Пн', '19'],
              ['Вт', '20'],
              ['Ср', '21'],
              ['Чт', '22'],
              ['Пт', '23'],
              ['Сб', '24'],
              ['Вс', '25'],
            ].map(([day, date], index) => (
              <div key={day} className="text-[8px] text-[#7a8799] sm:text-[10px]">
                <span className={index > 4 ? 'text-rose-500' : ''}>{day}</span>
                <span
                  className={`mx-auto mt-1 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold sm:h-7 sm:w-7 sm:text-xs ${
                    index === 2
                      ? 'bg-[#0b94d4] text-white'
                      : 'text-[#102338]'
                  }`}
                >
                  {date}
                </span>
              </div>
            ))}
          </div>
        </div>

        {!compact && (
          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_150px]">
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[#102338]">
                Заказы на неделю
                <span className="rounded-full bg-[#edf2f6] px-2 py-0.5 text-[9px] text-[#607089]">
                  3
                </span>
              </div>
              <div className="space-y-2">
                {heroOrders.map((order) => (
                  <article
                    key={order.title}
                    className="grid grid-cols-[34px_minmax(0,1fr)] gap-3 rounded-xl border border-[#dfe8ef] p-2.5 sm:grid-cols-[38px_minmax(0,1fr)_112px] sm:p-3"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eaf6fc] text-[#0b94d4]">
                      <Icon name={order.icon} className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate text-[11px] font-semibold text-[#102338] sm:text-xs">
                        {order.title}
                      </h3>
                      <p className="mt-1 truncate text-[9px] text-[#748298] sm:text-[10px]">
                        {order.meta}
                      </p>
                      <p className="truncate text-[9px] text-[#748298] sm:text-[10px]">
                        {order.place}
                      </p>
                    </div>
                    <div className="hidden items-end justify-between gap-2 sm:flex sm:flex-col">
                      <div className="flex items-center gap-1.5 text-[9px] text-[#52627a]">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#dcebf3] text-[7px] font-semibold text-[#24506a]">
                          {order.person}
                        </span>
                        <span className="max-w-20 truncate">{order.owner}</span>
                      </div>
                      <span className={`rounded-md px-2 py-1 text-[8px] font-medium ${statusStyles[order.tone]}`}>
                        {order.status}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <aside className="hidden border-l border-[#e3eaf0] pl-4 xl:block">
              <p className="text-xs font-semibold text-[#102338]">Финансы</p>
              <p className="mt-1 text-[9px] text-[#748298]">Май 2026</p>
              <dl className="mt-5 space-y-3 text-[9px] text-[#52627a]">
                <div className="flex justify-between gap-2">
                  <dt>Выручка</dt>
                  <dd className="font-semibold text-[#102338]">1 245 000 ₽</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Расходы</dt>
                  <dd className="font-semibold text-[#102338]">620 300 ₽</dd>
                </div>
                <div className="border-t border-[#e3eaf0] pt-3">
                  <div className="flex justify-between gap-2">
                    <dt>Прибыль</dt>
                    <dd className="font-semibold text-emerald-600">624 700 ₽</dd>
                  </div>
                </div>
              </dl>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}

export function OrderDetailPreview() {
  const people = [
    ['ИП', 'Иван Петров', 'Ведущий'],
    ['АС', 'Анна Смирнова', 'Декоратор'],
    ['ДО', 'Дмитрий Орлов', 'Тех. специалист'],
  ]

  return (
    <div className="party-order-preview">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e1e9ef] p-5 sm:p-6">
        <div>
          <span className="text-[11px] font-medium text-[#0b8fd0]">← Все заказы</span>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-bold tracking-[-0.03em] text-[#102338] sm:text-2xl">
              День рождения Алисы
            </h3>
            <span className="rounded-md bg-emerald-50 px-2 py-1 text-[9px] font-medium text-emerald-700">
              Подтверждён
            </span>
          </div>
          <p className="mt-1 text-[10px] text-[#77859a]">Заказ №2026–0519</p>
        </div>
        <div className="flex rounded-lg border border-[#dbe5ec] p-1 text-[10px]">
          <span className="rounded-md bg-[#0b94d4] px-3 py-1.5 font-semibold text-white">Владелец</span>
          <span className="px-3 py-1.5 text-[#607089]">Исполнитель</span>
        </div>
      </div>

      <div className="grid gap-px bg-[#e1e9ef] sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['calendar', 'Дата и время', '21 мая 2026', '15:00–18:00'],
          ['pin', 'Площадка', 'Лофт «Облака»', 'Москва, ул. Лесная, 7'],
          ['users', 'Ответственный', 'Мария Иванова', 'Администратор'],
          ['users', 'Клиент', 'Ольга Кузнецова', '+7 999 123-45-67'],
        ].map(([icon, label, value, detail]) => (
          <div key={label} className="bg-white p-4">
            <div className="flex items-center gap-2 text-[#0b94d4]">
              <Icon name={icon} className="h-4 w-4" />
              <span className="text-[9px] font-medium text-[#738197]">{label}</span>
            </div>
            <p className="mt-2 text-xs font-semibold text-[#102338]">{value}</p>
            <p className="mt-1 text-[10px] text-[#738197]">{detail}</p>
          </div>
        ))}
      </div>

      <div className="p-5 sm:p-6">
        <p className="text-xs font-semibold text-[#102338]">Исполнители</p>
        <div className="mt-4 flex flex-wrap gap-5">
          {people.map(([initials, name, role]) => (
            <div key={name} className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e8f3f8] text-[9px] font-semibold text-[#31536a]">
                {initials}
              </span>
              <span>
                <span className="block text-[10px] font-medium text-[#102338]">{name}</span>
                <span className="block text-[9px] text-[#7b8798]">{role}</span>
              </span>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[#dfe8ef] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[#102338]">Оплаты</p>
              <span className="text-[10px] font-semibold text-emerald-600">50% оплачено</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#edf2f5]">
              <div className="h-full w-1/2 rounded-full bg-[#0b94d4]" />
            </div>
            <div className="mt-3 flex justify-between text-[10px] text-[#748298]">
              <span>Получено 622 500 ₽</span>
              <span>Итого 1 245 000 ₽</span>
            </div>
          </div>
          <div className="rounded-xl border border-[#dfe8ef] p-4">
            <p className="text-xs font-semibold text-[#102338]">Документы</p>
            <div className="mt-3 space-y-2">
              {['Договор №2026–0519', 'Техническое задание'].map((item) => (
                <div key={item} className="flex items-center justify-between gap-3 text-[10px]">
                  <span className="flex items-center gap-2 text-[#52627a]">
                    <Icon name="document" className="h-4 w-4 text-[#0b94d4]" />
                    {item}
                  </span>
                  <span className="font-medium text-[#0b8fd0]">Скачать</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export { Icon }
