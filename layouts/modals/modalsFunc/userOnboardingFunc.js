import ComboBox from '@components/ComboBox'
import FormWrapper from '@components/FormWrapper'
import Input from '@components/Input'
import { postData } from '@helpers/CRUD'
import itemsFuncAtom from '@state/atoms/itemsFuncAtom'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useAtom, useAtomValue } from 'jotai'

const TIME_ZONE_OPTIONS = [
  { value: 'UTC', name: 'UTC' },
  { value: 'Europe/Kaliningrad', name: 'UTC+02 Калининград' },
  { value: 'Europe/Moscow', name: 'UTC+03 Москва' },
  { value: 'Europe/Samara', name: 'UTC+04 Самара' },
  { value: 'Asia/Yekaterinburg', name: 'UTC+05 Екатеринбург' },
  { value: 'Asia/Omsk', name: 'UTC+06 Омск' },
  { value: 'Asia/Krasnoyarsk', name: 'UTC+07 Красноярск' },
  { value: 'Asia/Irkutsk', name: 'UTC+08 Иркутск' },
  { value: 'Asia/Yakutsk', name: 'UTC+09 Якутск' },
  { value: 'Asia/Vladivostok', name: 'UTC+10 Владивосток' },
  { value: 'Asia/Magadan', name: 'UTC+11 Магадан' },
  { value: 'Asia/Kamchatka', name: 'UTC+12 Камчатка' },
]

const normalizeTowns = (towns = []) =>
  Array.from(
    new Set(
      towns
        .map((town) => (typeof town === 'string' ? town.trim() : ''))
        .filter(Boolean)
      )
  )

const userOnboardingFunc = () => {
  const UserOnboardingModal = ({
    closeModal,
    setOnConfirmFunc,
    setDisableConfirm,
    setConfirmButtonName,
  }) => {
    const [loggedUser, setLoggedUser] = useAtom(loggedUserAtom)
    const [siteSettings, setSiteSettings] = useAtom(siteSettingsAtom)
    const itemsFunc = useAtomValue(itemsFuncAtom)
    const detectedTimeZone = useMemo(() => {
      if (typeof Intl === 'undefined') return ''
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
      } catch (error) {
        return ''
      }
    }, [])
    const timeZoneOptions = useMemo(() => {
      if (!detectedTimeZone) return TIME_ZONE_OPTIONS
      const exists = TIME_ZONE_OPTIONS.some(
        (item) => item.value === detectedTimeZone
      )
      if (exists) return TIME_ZONE_OPTIONS
      return [{ value: detectedTimeZone, name: detectedTimeZone }, ...TIME_ZONE_OPTIONS]
    }, [detectedTimeZone])

    const [firstName, setFirstName] = useState(loggedUser?.firstName ?? '')
    const [secondName, setSecondName] = useState(
      loggedUser?.secondName ?? ''
    )
    const [town, setTown] = useState(siteSettings?.defaultTown ?? '')
    const [timeZone, setTimeZone] = useState(() => {
      const current = siteSettings?.timeZone ?? 'Asia/Krasnoyarsk'
      const confirmed = siteSettings?.custom?.timeZoneConfirmed === true
      if (!confirmed && detectedTimeZone) return detectedTimeZone
      return current
    })
    const [isDarkTheme, setIsDarkTheme] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
      setConfirmButtonName('Сохранить')
      const storedTheme = localStorage.getItem('theme')
      const isDark = storedTheme === 'dark'
      setIsDarkTheme(isDark)
      document.body.classList.toggle('theme-dark', isDark)
    }, [setConfirmButtonName])

    const errors = useMemo(() => {
      return {
        firstName: !firstName.trim() ? 'Укажите имя' : null,
        secondName: !secondName.trim() ? 'Укажите фамилию' : null,
        town: !town.trim() ? 'Укажите город' : null,
        timeZone: !timeZone ? 'Укажите часовой пояс' : null,
      }
    }, [firstName, secondName, town, timeZone])

    const isValid = useMemo(
      () =>
        !errors.firstName &&
        !errors.secondName &&
        !errors.town &&
        !errors.timeZone,
      [errors]
    )

    useEffect(() => {
      setDisableConfirm(!isValid || isSaving)
    }, [isSaving, isValid, setDisableConfirm])

    const handleSave = useCallback(async () => {
      if (!isValid || !loggedUser?._id) return
      setIsSaving(true)
      try {
        const trimmedFirstName = firstName.trim()
        const trimmedSecondName = secondName.trim()
        const trimmedTown = town.trim()

        const updatedUser = await itemsFunc?.user?.set({
          _id: loggedUser._id,
          firstName: trimmedFirstName,
          secondName: trimmedSecondName,
        })

        if (updatedUser?._id) {
          setLoggedUser(updatedUser)
        }

        const nextTowns = normalizeTowns([
          ...(siteSettings?.towns ?? []),
          trimmedTown,
        ])

        await postData(
          '/api/site',
          {
            timeZone,
            defaultTown: trimmedTown,
            towns: nextTowns,
            custom: {
              ...(siteSettings?.custom ?? {}),
              timeZoneConfirmed: true,
            },
          },
          (data) => setSiteSettings(data),
          null,
          false,
          null
        )

        const themeValue = isDarkTheme ? 'dark' : 'light'
        localStorage.setItem('theme', themeValue)
        document.body.classList.toggle('theme-dark', isDarkTheme)

        closeModal()
      } catch (error) {
        console.error('User onboarding save error', error)
      } finally {
        setIsSaving(false)
      }
    }, [
      closeModal,
      firstName,
      isDarkTheme,
      secondName,
      town,
      timeZone,
      isValid,
      loggedUser?._id,
      itemsFunc?.user,
      setLoggedUser,
      setSiteSettings,
      siteSettings?.custom,
      siteSettings?.towns,
    ])

    const onConfirmRef = useRef(handleSave)

    useEffect(() => {
      onConfirmRef.current = handleSave
    }, [handleSave])

    useEffect(() => {
      setOnConfirmFunc(() => onConfirmRef.current?.())
    }, [setOnConfirmFunc])

    return (
      <FormWrapper flex className="flex-col gap-3">
        <div className="text-sm text-gray-600">
          Заполните обязательные данные для корректной работы системы.
        </div>
        <Input
          label="Имя"
          value={firstName}
          onChange={setFirstName}
          error={errors.firstName}
          required
        />
        <Input
          label="Фамилия"
          value={secondName}
          onChange={setSecondName}
          error={errors.secondName}
          required
        />
        <Input
          label="Город"
          value={town}
          onChange={setTown}
          error={errors.town}
          required
        />
        <ComboBox
          label="Часовой пояс"
          items={timeZoneOptions}
          value={timeZone}
          onChange={setTimeZone}
          error={errors.timeZone}
          required
          fullWidth
        />
        <label className="flex items-center gap-3 rounded border border-input px-3 py-2">
          <input
            type="checkbox"
            checked={isDarkTheme}
            onChange={(event) => {
              const nextValue = event.target.checked
              setIsDarkTheme(nextValue)
              localStorage.setItem('theme', nextValue ? 'dark' : 'light')
              document.body.classList.toggle('theme-dark', nextValue)
            }}
            className="h-4 w-4 cursor-pointer"
          />
          <span className="text-sm text-gray-900">Темная тема</span>
        </label>
      </FormWrapper>
    )
  }

  return {
    title: 'Заполните профиль',
    showDecline: false,
    closeButtonShow: false,
    declineButtonShow: false,
    crossShow: false,
    Children: UserOnboardingModal,
  }
}

export default userOnboardingFunc
