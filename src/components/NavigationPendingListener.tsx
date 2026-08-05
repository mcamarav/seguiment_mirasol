'use client'

import { useEffect, useRef, useState } from 'react'
import { useGlobalPending } from './PendingOverlay'

// Si res no canvia mai al DOM (p. ex. es clica l'enllaç de la pàgina on ja
// s'és), no ens quedem amb l'indicador encès per sempre.
const SAFETY_TIMEOUT_MS = 15000
// Un cop el contingut ha canviat, esperem que es quedi quiet aquesta estona
// abans de donar per acabada la navegació (evita tallar-la a mig renderitzat
// si arriben varis canvis consecutius).
const QUIET_MS = 100

/** Activa l'indicador global en clics d'enllaç i cerques (GET), que no passen
 * per cap acció de servidor. En lloc de confiar en senyals de Next.js (que
 * es poden resoldre abans que el contingut nou hagi arribat de veritat),
 * observem directament el DOM i esperem que deixi de canviar. */
export function NavigationPendingListener() {
  const [navigating, setNavigating] = useState(false)
  useGlobalPending(navigating)
  const quietTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!navigating) return

    const stop = () => setNavigating(false)

    function onMutate() {
      if (quietTimer.current) clearTimeout(quietTimer.current)
      quietTimer.current = setTimeout(stop, QUIET_MS)
    }

    // S'observa el contenidor del contingut, no <body> sencer: així no es
    // detecta com a "canvi" el propi indicador (que és germà, no fill).
    const target = document.getElementById('app-content') ?? document.body
    const observer = new MutationObserver(onMutate)
    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })
    safetyTimer.current = setTimeout(stop, SAFETY_TIMEOUT_MS)

    return () => {
      observer.disconnect()
      if (quietTimer.current) clearTimeout(quietTimer.current)
      if (safetyTimer.current) clearTimeout(safetyTimer.current)
    }
  }, [navigating])

  useEffect(() => {
    function isModifiedClick(e: MouseEvent) {
      return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0
    }

    function onClick(e: MouseEvent) {
      if (isModifiedClick(e)) return
      const anchor = (e.target as HTMLElement)?.closest('a')
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      try {
        const url = new URL(href, window.location.href)
        if (url.origin !== window.location.origin) return
      } catch {
        return
      }
      setNavigating(true)
    }

    function onSubmit(e: SubmitEvent) {
      const form = e.target as HTMLFormElement
      if (form.method?.toLowerCase() === 'get') setNavigating(true)
    }

    document.addEventListener('click', onClick)
    document.addEventListener('submit', onSubmit)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('submit', onSubmit)
    }
  }, [])

  return null
}
