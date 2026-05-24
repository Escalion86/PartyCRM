import { NextResponse } from 'next/server'
import path from 'path'
import { readFile } from 'fs/promises'

export const GET = async () => {
  try {
    const filePath = path.join(process.cwd(), 'docs', 'PUBLIC_LEADS_API.md')
    const content = await readFile(filePath, 'utf-8')
    return new NextResponse(content, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (error) {
    console.error('read PUBLIC_LEADS_API.md error', error)
    return NextResponse.json(
      { success: false, error: 'Не удалось загрузить инструкцию API' },
      { status: 500 }
    )
  }
}
