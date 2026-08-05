'use client'

import { useFormStatus } from 'react-dom'
import { useGlobalPending } from './PendingOverlay'

/** Botó de submit d'un <form action={...}>: mostra l'estat de càrrega i activa
 * l'indicador global mentre l'acció s'executa. */
export function SubmitButton({
  children,
  pendingLabel,
  className = 'btn btn-primary',
  ...rest
}: {
  children: React.ReactNode
  pendingLabel?: React.ReactNode
  className?: string
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'disabled' | 'className' | 'children'>) {
  const { pending } = useFormStatus()
  useGlobalPending(pending)

  return (
    <button type="submit" className={className} disabled={pending} {...rest}>
      {pending ? (pendingLabel ?? '…') : children}
    </button>
  )
}
