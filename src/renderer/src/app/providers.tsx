import type { ReactNode } from 'react'
import { HeroUIProvider } from '@heroui/react'

export function AppProviders({ children }: { children: ReactNode }) {
  return <HeroUIProvider>{children}</HeroUIProvider>
}
