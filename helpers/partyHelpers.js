export const roleLabels = {
  owner: 'Владелец',
  admin: 'Администратор',
  performer: 'Исполнитель',
}

export const specializationLabels = {
  animator: 'Аниматор',
  magician: 'Фокусник',
  host: 'Ведущий',
  photographer: 'Фотограф',
  workshop: 'Мастер-класс',
  other: 'Другое',
}

export const specializationOptions = [
  { value: '', label: 'Не указана' },
  { value: 'animator', label: specializationLabels.animator },
  { value: 'magician', label: specializationLabels.magician },
  { value: 'host', label: specializationLabels.host },
  { value: 'photographer', label: specializationLabels.photographer },
  { value: 'workshop', label: specializationLabels.workshop },
  { value: 'other', label: specializationLabels.other },
]

export const partyTransactionTypeLabels = {
  income: 'Доход',
  expense: 'Расход',
}

export const partyTransactionTypeOptions = [
  { value: 'income', label: partyTransactionTypeLabels.income },
  { value: 'expense', label: partyTransactionTypeLabels.expense },
]

export const partyTransactionCategoryLabels = {
  deposit: 'Задаток',
  final_payment: 'Остаток оплаты',
  client_payment: 'Оплата клиента',
  payout: 'Выплата исполнителю',
  refund: 'Возврат клиенту',
  taxes: 'Налоги',
  materials: 'Расходники',
  travel: 'Дорога',
  other: 'Другое',
}

export const partyTransactionCategoryOptions = [
  { value: 'deposit', label: partyTransactionCategoryLabels.deposit },
  {
    value: 'final_payment',
    label: partyTransactionCategoryLabels.final_payment,
  },
  {
    value: 'client_payment',
    label: partyTransactionCategoryLabels.client_payment,
  },
  { value: 'payout', label: partyTransactionCategoryLabels.payout },
  { value: 'refund', label: partyTransactionCategoryLabels.refund },
  { value: 'taxes', label: partyTransactionCategoryLabels.taxes },
  { value: 'materials', label: partyTransactionCategoryLabels.materials },
  { value: 'travel', label: partyTransactionCategoryLabels.travel },
  { value: 'other', label: partyTransactionCategoryLabels.other },
]

export const partyPaymentMethodLabels = {
  transfer: 'Перевод',
  account: 'Расчетный счет',
  cash: 'Наличка',
  barter: 'Бартер',
}

export const partyPaymentMethodOptions = [
  { value: 'transfer', label: partyPaymentMethodLabels.transfer },
  { value: 'account', label: partyPaymentMethodLabels.account },
  { value: 'cash', label: partyPaymentMethodLabels.cash },
  { value: 'barter', label: partyPaymentMethodLabels.barter },
]

export const paymentStatusLabels = {
  none: 'Нет оплаты',
  wait_prepayment: 'Ждем предоплату',
  prepaid: 'Предоплата внесена',
  paid: 'Оплачено',
}

export const EMPTY_PARTY_TRANSACTION = {
  amount: 0,
  type: 'income',
  category: 'deposit',
  date: '',
  comment: '',
  paymentMethod: 'transfer',
}

export const EMPTY_PARTY_ADDITIONAL_EVENT = {
  title: '',
  description: '',
  date: '',
  done: false,
}

export const EMPTY_LOCATION = {
  title: '',
  address: {
    town: '',
    street: '',
    house: '',
    room: '',
    comment: '',
  },
}

export const EMPTY_STAFF = {
  firstName: '',
  secondName: '',
  phone: '',
  email: '',
  specialization: '',
  description: '',
  role: 'performer',
}

export const EMPTY_PARTY_CLIENT = {
  firstName: '',
  secondName: '',
  thirdName: '',
  phone: '',
  whatsapp: '',
  viber: '',
  telegram: '',
  instagram: '',
  vk: '',
  preferredContactChannel: '',
  preferredContactChannelOther: '',
  email: '',
  leadSource: '',
  town: '',
  isLegalEntity: false,
  legalName: '',
  inn: '',
  kpp: '',
  ogrn: '',
  bankName: '',
  bik: '',
  checkingAccount: '',
  correspondentAccount: '',
  legalAddress: '',
  significantDates: [],
  comment: '',
}

export const EMPTY_PARTY_SERVICE = {
  title: '',
  specialization: 'other',
  duration: 0,
  price: 0,
  groupId: null,
}

export const EMPTY_ORDER = {
  title: '',
  clientId: '',
  eventDate: '',
  durationMinutes: '60',
  dateEnd: '',
  placeType: 'company_location',
  locationId: '',
  customAddress: '',
  clientAddress: {
    town: '',
    street: '',
    house: '',
    room: '',
    comment: '',
  },
  servicesIds: [],
  serviceTitle: '',
  contractAmount: '',
  clientPayment: {
    totalAmount: '',
    prepaidAmount: '',
    status: 'none',
  },
  transactions: [],
  additionalEvents: [],
  otherContacts: [],
  assignedStaff: [],
  adminComment: '',
}

export const EMPTY_COMPANY = {
  title: '',
  initialLocation: {
    title: '',
    address: {
      town: '',
      street: '',
      house: '',
      room: '',
    },
  },
  initialStaff: {
    firstName: '',
    secondName: '',
    phone: '',
    email: '',
    role: 'performer',
  },
}
