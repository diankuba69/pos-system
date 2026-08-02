import { NextResponse } from 'next/server'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) {
    return NextResponse.json(
      {
        status: 'error',
        message:
          'Missing Supabase env vars. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY di .env.local',
      },
      { status: 500 }
    )
  }

  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      cache: 'no-store',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => null)
      console.error('Health check gagal', { status: response.status, error })

      return NextResponse.json(
        { status: 'error', message: 'Layanan autentikasi tidak dapat dihubungi' },
        { status: 500 }
      )
    }

    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('Health check gagal', error)
    return NextResponse.json(
      { status: 'error', message: 'Layanan autentikasi tidak dapat dihubungi' },
      { status: 500 }
    )
  }
}
