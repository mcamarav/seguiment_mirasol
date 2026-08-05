import type { Metadata, Viewport } from 'next'
import './globals.css'
import { PendingProvider } from '@/components/PendingOverlay'
import { NavigationPendingListener } from '@/components/NavigationPendingListener'

export const metadata: Metadata = {
  title: 'Seguiment Mirasol',
  description: 'Seguiment de tasques pendents de la construcció de l’habitatge',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ca">
      <body>
        <PendingProvider>
          <NavigationPendingListener />
          <div id="app-content">{children}</div>
        </PendingProvider>
      </body>
    </html>
  )
}
