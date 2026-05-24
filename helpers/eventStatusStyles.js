export const EVENT_STATUS_UI_STYLES = {
  draft: {
    badge: 'bg-gray-100 text-gray-700',
    button: {
      active:
        'border-gray-400 !bg-gray-400 !text-white shadow-sm hover:brightness-95',
      inactive:
        'border-gray-400 text-gray-700 bg-white hover:bg-gray-50 hover:text-gray-800',
    },
  },
  planned: {
    badge: 'bg-blue-100 text-blue-800',
    button: {
      active:
        'border-blue-500 !bg-blue-500 !text-white shadow-sm hover:brightness-95',
      inactive:
        'border-blue-500 text-blue-600 bg-white hover:bg-blue-50 hover:text-blue-700',
    },
  },
  in_progress: {
    badge: 'bg-amber-100 text-amber-800',
    button: {
      active:
        'border-amber-500 !bg-amber-500 !text-white shadow-sm hover:brightness-95',
      inactive:
        'border-amber-500 text-amber-600 bg-white hover:bg-amber-50 hover:text-amber-700',
    },
  },
  completed: {
    badge: 'bg-emerald-100 text-emerald-800',
    button: {
      active:
        'border-emerald-500 !bg-emerald-500 !text-white shadow-sm hover:brightness-95',
      inactive:
        'border-emerald-500 text-emerald-600 bg-white hover:bg-emerald-50 hover:text-emerald-700',
    },
  },
  canceled: {
    badge: 'bg-red-100 text-red-800',
    button: {
      active:
        'border-red-500 !bg-red-500 !text-white shadow-sm hover:brightness-95',
      inactive:
        'border-red-500 text-red-600 bg-white hover:bg-red-50 hover:text-red-700',
    },
  },
  transferred: {
    badge: 'bg-general/20 text-general',
    button: {
      active:
        'border-general !bg-general !text-black shadow-sm hover:brightness-95',
      inactive:
        'border-general text-general bg-white hover:bg-general/10 hover:text-[#6f582f]',
    },
  },
  active: {
    badge: 'bg-blue-100 text-blue-800',
    button: {
      active:
        'border-blue-500 !bg-blue-500 !text-white shadow-sm hover:brightness-95',
      inactive:
        'border-blue-500 text-blue-600 bg-white hover:bg-blue-50 hover:text-blue-700',
    },
  },
  closed: {
    badge: 'bg-emerald-100 text-emerald-800',
    button: {
      active:
        'border-emerald-500 !bg-emerald-500 !text-white shadow-sm hover:brightness-95',
      inactive:
        'border-emerald-500 text-emerald-600 bg-white hover:bg-emerald-50 hover:text-emerald-700',
    },
  },
  finished: {
    badge: 'bg-emerald-100 text-emerald-800',
    button: {
      active:
        'border-emerald-500 !bg-emerald-500 !text-white shadow-sm hover:brightness-95',
      inactive:
        'border-emerald-500 text-emerald-600 bg-white hover:bg-emerald-50 hover:text-emerald-700',
    },
  },
  inProgress: {
    badge: 'bg-blue-100 text-blue-800',
    button: {
      active:
        'border-blue-500 !bg-blue-500 !text-white shadow-sm hover:brightness-95',
      inactive:
        'border-blue-500 text-blue-600 bg-white hover:bg-blue-50 hover:text-blue-700',
    },
  },
}

export const getEventStatusButtonClasses = (status, isActive) => {
  const style = EVENT_STATUS_UI_STYLES[status] ?? EVENT_STATUS_UI_STYLES.planned
  return isActive ? style.button.active : style.button.inactive
}

export const getEventStatusBadgeClasses = (status) => {
  const style = EVENT_STATUS_UI_STYLES[status]
  return style ? style.badge : 'bg-gray-200 text-gray-700'
}
