import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Aterratge dels enllaços de correu (restabliment de contrasenya) que porten
 * un `code`: l'intercanvia per una sessió i continua a `next`. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/entrar`)
}
