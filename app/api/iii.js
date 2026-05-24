'use server'
// import { postData } from '@helpers/CRUD'
// import formatDate from '@helpers/formatDate'
// import Requests from '@models/Requests'
// import dbConnect from '@utils/dbConnect'

import { postData } from '@helpers/CRUD'
import formatDate from '@helpers/formatDate'

export const AUDIENCE = [
  { value: 'adults', name: 'Взрослые (18-99 лет)' },
  { value: 'teenagers', name: 'Подростки (10-18 лет)' },
  { value: 'kids', name: 'Дети (5-12 лет)' },
  { value: 'other', name: 'Смешанная аудитория' },
]

export const EVENT_TYPES = [
  { value: 'birthday', name: 'День рождения' },
  { value: 'wedding', name: 'Свадьба' },
  { value: 'corporate', name: 'Корпоратив' },
  { value: 'presentation', name: 'Презентация' },
  { value: 'opening', name: 'Открытие заведения' },
  { value: 'club', name: 'Клуб' },
  { value: 'other', name: 'Другое' },
]

const sendTelegramMassage = async (text, url, req) =>
  postData(
    `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`,
    {
      chat_id: 261102161,
      text,
      parse_mode: 'html',
      // reply_markup:
      //   req.headers.origin.substr(0, 5) === 'https'
      //     ? JSON.stringify({
      //         inline_keyboard: [
      //           [
      //             {
      //               text: 'Позвонить клиенту',
      //               url: url,
      //             },
      //           ],
      //         ],
      //       })
      //     : undefined,
    },
    (data) => console.log('data', data),
    (data) => console.log('error', data),
    true
  )

export default async function handler(req, res) {
  console.log('!!!!!')
  const { query, method, body } = req
  console.log('body :>> ', body)
  // await dbConnect()
  if (method === 'POST') {
    try {
      const {
        audience,
        type,
        customType,
        date,
        spectators,
        town,
        address,
        phone,
        official,
        comment,
      } = body
      console.log('1 :>> ', 1)

      // const clearedBody = { ...body }
      // delete clearedBody._id
      // const data = await Requests.create(body)
      // if (!data) {
      //   return res?.status(400).json({ success: false })
      // // }
      const audienceName =
        AUDIENCE.find((item) => item.value === audience)?.name ?? '-'
      const typeName =
        EVENT_TYPES.find((item) => item.value === type)?.name ?? '-'
      // await sendTelegramMassage(
      //   `Заявка на cigam.ru\n\n<b>Аудитория:</b> ${audienceName}\n<b>Тип:</b> ${typeName}${
      //     customType ? ' - ' + customType + ' ' : ''
      //   }\n<b>Дата:</b> ${
      //     !!date ? formatDate(date, false, true) : '-'
      //   }\n<b>Кол-во зрителей:</b> ${
      //     !!spectators ? spectators : '-'
      //   }\n<b>Город:</b> ${!!town ? town : '-'}\n<b>Адрес:</b> ${
      //     !!address ? address : '-'
      //   }\n<b>Телефон:</b> +${phone}\n<b>Комментарий:</b> ${
      //     !!comment ? comment : '-'
      //   }\n<b>Юр. лицо:</b> ${official ? 'Нет' : 'Да'}`,
      //   `tel:+${phone}`,
      //   req
      // )

      await sendTelegramMassage(
        `Заявка на cigam.ru\n\n<b>Аудитория:</b> ${audienceName}\n<b>Тип:</b> ${typeName}${
          customType ? ' - ' + customType + ' ' : ''
        }\n<b>Дата:</b> ${
          !!date ? formatDate(date, false, true) : '-'
        }\n<b>Кол-во зрителей:</b> ${
          !!spectators ? spectators : '-'
        }\n<b>Город:</b> ${!!town ? town : '-'}\n<b>Адрес:</b> ${
          !!address ? address : '-'
        }\n<b>Телефон:</b> +${phone}\n<b>Комментарий:</b> ${
          !!comment ? comment : '-'
        }\n<b>Юр. лицо:</b> ${official ? 'Нет' : 'Да'}`,
        `tel:+${phone}`,
        req
      )

      return res?.status(201).json({ success: true, data })

    } catch (error) {
      console.log(error)
      return res?.status(400).json({ success: false, error })
    }
  } else return res?.status(400).json({ success: false })
}
