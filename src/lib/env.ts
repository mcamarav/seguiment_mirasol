function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Falta la variable d'entorn ${name}. Copia .env.local.example a .env.local i omple-la.`,
    )
  }
  return value
}

export const SUPABASE_URL = () =>
  required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL)

export const SUPABASE_ANON_KEY = () =>
  required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
