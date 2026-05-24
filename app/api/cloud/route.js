import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const CLOUD_API_URL = 'https://cloud.escalion.ru/api'

export const POST = async (req) => {
  const apiPassword = process.env.ESCALIONCLOUD_PASSWORD
  if (!apiPassword) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Cloud password is not configured',
      },
      { status: 500 }
    )
  }

  try {
    const incomingForm = await req.formData()
    const formData = new FormData()

    const project = String(incomingForm.get('project') ?? 'artistcrm')
    const folder = String(incomingForm.get('folder') ?? 'temp')
    const fileType = String(incomingForm.get('fileType') ?? 'image')
    const fileNameRaw = incomingForm.get('fileName')
    const fileName = fileNameRaw == null ? '' : String(fileNameRaw)

    formData.append('project', project)
    formData.append('folder', folder)
    formData.append('password', apiPassword)
    formData.append('fileType', fileType)
    formData.append('fileName', fileName)

    const files = incomingForm.getAll('files')
    for (const file of files) {
      if (file) formData.append('files', file)
    }

    const response = await fetch(CLOUD_API_URL, {
      method: 'POST',
      body: formData,
      cache: 'no-store',
    })

    const responseText = await response.text()
    let payload = null
    try {
      payload = responseText ? JSON.parse(responseText) : null
    } catch {
      payload = { status: 'error', message: responseText || 'Unknown response' }
    }

    return NextResponse.json(payload ?? {}, { status: response.status })
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Cloud upload failed',
      },
      { status: 500 }
    )
  }
}
