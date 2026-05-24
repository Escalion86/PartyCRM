export async function POST(request) {
  try {
    const payload = await request.json()
    console.error('client-log', payload)
  } catch (error) {
    console.error('client-log-parse-error', error)
  }

  return new Response(null, { status: 204 })
}
