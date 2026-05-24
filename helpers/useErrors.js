import { useState } from 'react'
import birthDateToAge from './birthDateToAge'
import validateEmail from './validateEmail'
import serverSettingsAtom from '@state/atoms/serverSettingsAtom'
import { getAtomValue } from '@state/storeHelpers'

const useErrors = () => {
  const [errors, setErrors] = useState({})

  const addError = (newError) => {
    setErrors((errors) => {
      return { ...errors, ...newError }
    })
    return true
  }
  const removeError = (errorKey) => {
    if (errors[errorKey]) {
      const errorsCopy = { ...errors }
      delete errorsCopy[errorKey]
      setErrors(errorsCopy)
    }
    return true
  }

  const clearErrors = () => {
    setErrors({})
    return true
  }

  const checkErrors = (object) => {
    const serverDate = new Date(getAtomValue(serverSettingsAtom)?.dateTime)
    clearErrors()
    let error = false
    const setError = (data) => {
      addError(data)
      error = true
    }
    const checks = {
      title: (data) => (!data ? setError({ title: 'Введите название' }) : null),
      shortDescription: (data) =>
        !data
          ? setError({ shortDescription: 'Введите короткое описание' })
          : null,
      shortDescription: (data) =>
        !data ? setError({ description: 'Введите краткое описание' }) : null,
      description: (data) =>
        !data ? setError({ description: 'Введите описание' }) : null,
      relationship: (data) =>
        typeof data !== 'boolean'
          ? setError({ relationship: 'Введите статус отношений' })
          : null,
      usersRelationshipAccess: (data) =>
        !data
          ? setError({
              usersRelationshipAccess:
                'Введите доступ для пользователей по статусу отношений',
            })
          : null,
      tags: (data) =>
        !data || data.length === 0
          ? setError({ tags: 'Укажите хотя бы один тэг' })
          : null,
      images: (data) =>
        !data || data.length === 0
          ? setError({ images: 'Загрузите хотя бы одно фото' })
          : null,
      image: (data) =>
        !data ? setError({ image: 'Загрузите картинку' }) : null,
      photo: (data) =>
        !data ? setError({ image: 'Загрузите фотографию' }) : null,
      supervisorName: (data) =>
        !data
          ? setError({ image: 'Введите имя и фамилию руководителя' })
          : null,
      quote: (data) => (!data ? setError({ image: 'Введите цитату' }) : null),
      date: (data) => (!data ? setError({ date: 'Введите дату' }) : null),
      dateEnd: (data) =>
        !data ? setError({ dateEnd: 'Введите дату завершения' }) : null,
      payAt: (data) =>
        !data
          ? setError({ payAt: 'Введите дату совершения транзакции' })
          : null,
      userId: (data) =>
        !data ? setError({ userId: 'Выберите пользователя' }) : null,
      serviceId: (data) =>
        !data ? setError({ serviceId: 'Выберите услугу' }) : null,
      eventId: (data) =>
        !data ? setError({ eventId: 'Выберите мероприятие' }) : null,
      price: (data) =>
        Number(data) < 0
          ? setError({ sum: 'Стоиомсть не может быть отрицательной' })
          : null,
      notificationTelegramUserName: (data) =>
        !data
          ? setError({
              notificationTelegramUserName:
                'Введите имя пользователя Telegram для оповещений',
            })
          : null,
      sum: (data) =>
        Number(data) < 0
          ? setError({ sum: 'Сумма не может быть отрицательной' })
          : null,
      author: (data) =>
        !data ? setError({ author: 'Введите имя автора' }) : null,
      firstName: (data) =>
        !data
          ? setError({ firstName: 'Введите имя' })
          : data.length === 1
            ? setError({ firstName: 'Имя не может содержать одну букву' })
            : null,
      secondName: (data) =>
        !data
          ? setError({ secondName: 'Введите фамилию' })
          : data.length === 1
            ? setError({ secondName: 'Фамилия не может содержать одну букву' })
            : null,
      thirdName: (data) =>
        data.length === 1
          ? setError({ thirdName: 'Отчество не может содержать одну букву' })
          : null,
      gender: (data) => (!data ? setError({ gender: 'Укажите пол' }) : null),
      phone: (data) =>
        !data
          ? setError({ phone: 'Введите номер телефона' })
          : `${data}`.length !== 11
            ? setError({ phone: 'Некорректно введен номер телефона' })
            : null,
      phoneNoRequired: (data) =>
        data && `${data}`.length !== 11
          ? setError({ phone: 'Некорректно введен номер телефона' })
          : null,
      viber: (data) => {
        return data && `${data}`.length !== 11
          ? setError({ viber: 'Некорректно введен номер viber' })
          : null
      },
      whatsapp: (data) =>
        data && `${data}`.length !== 11
          ? setError({ whatsapp: 'Некорректно введен номер whatsapp' })
          : null,
      email: (data) =>
        data && !validateEmail(data)
          ? setError({ email: 'Некорректно введен email' })
          : null,
      birthday: (data) =>
        !data
          ? setError({ birthday: 'Введите дату рождения' })
          : birthDateToAge(data, serverDate, false, false, false) < 18
            ? setError({
                birthday: 'Возраст не может быть менее 18 лет',
              })
            : null,
    }

    for (const [key, value] of Object.entries(object)) {
      checks[key] && checks[key](value)
    }

    return error
  }

  return [errors, checkErrors, addError, removeError, clearErrors]
}

export default useErrors
