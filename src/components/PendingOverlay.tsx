'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

const PendingContext = createContext<((delta: number) => void) | null>(null)

// Un cop mostrat, es queda com a mínim aquesta estona: si l'acció és
// instantània (com en local), igualment es percep que ha passat alguna cosa.
const MIN_VISIBLE_MS = 200

/** Mostra un indicador global (fons semitransparent + espiner centrat) mentre
 * hi hagi alguna acció en curs, amb una durada mínima perceptible. */
export function PendingProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0)
  const [visible, setVisible] = useState(false)
  const shownAt = useRef<number | null>(null)
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Identitat estable: si es recreés a cada render, l'efecte de neteja de
  // useGlobalPending (deps [bump]) es dispararia contínuament i decrementaria
  // el comptador tot just després d'incrementar-lo.
  const bump = useCallback((delta: number) => setCount((c) => Math.max(0, c + delta)), [])

  useEffect(() => {
    if (count > 0) {
      if (hideTimeout.current) {
        clearTimeout(hideTimeout.current)
        hideTimeout.current = null
      }
      if (!visible) {
        setVisible(true)
        shownAt.current = Date.now()
      }
    } else if (visible && !hideTimeout.current) {
      const elapsed = Date.now() - (shownAt.current ?? Date.now())
      hideTimeout.current = setTimeout(() => {
        setVisible(false)
        shownAt.current = null
        hideTimeout.current = null
      }, Math.max(0, MIN_VISIBLE_MS - elapsed))
    }
  }, [count, visible])

  useEffect(() => () => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current)
  }, [])

  return (
    <PendingContext.Provider value={bump}>
      {children}
      <div
        className={`pending-overlay ${visible ? 'pending-overlay-visible' : ''}`}
        aria-hidden={!visible}
      >
        <div className="pending-spinner" />
      </div>
    </PendingContext.Provider>
  )
}

/** Marca una acció com a "en curs": activa l'indicador global mentre `pending` sigui true. */
export function useGlobalPending(pending: boolean) {
  const bump = useContext(PendingContext)
  const wasPending = useRef(false)

  useEffect(() => {
    if (!bump) return
    if (pending && !wasPending.current) bump(1)
    if (!pending && wasPending.current) bump(-1)
    wasPending.current = pending
  }, [pending, bump])

  // Si el component es desmunta mentre encara està "pending", allibera el comptador.
  useEffect(
    () => () => {
      if (bump && wasPending.current) bump(-1)
    },
    [bump],
  )
}
