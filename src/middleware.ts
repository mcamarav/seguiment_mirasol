import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Accessibles sense sessió. `/auth` (l'intercanvi de codi dels enllaços de
// correu) no és a AUTH_ONLY_PATHS: encara que ja hi hagi sessió, ha de poder
// continuar el seu propi redirect en lloc que el middleware el talli abans.
const AUTH_ONLY_PATHS = ['/entrar', '/registre', '/recuperar']
const PUBLIC_PATHS = [...AUTH_ONLY_PATHS, '/auth']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // Refresca la sessió i la deixa a les cookies de la resposta.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/entrar'
    url.search = ''
    return NextResponse.redirect(url)
  }

  const isAuthOnly = AUTH_ONLY_PATHS.some((p) => path === p || path.startsWith(`${p}/`))
  if (user && isAuthOnly) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
