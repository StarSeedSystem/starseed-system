import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { GridArea } from '@/components/dashboard/grid-area'
import { DashboardWidget } from '@/components/dashboard/dashboard-types'
import React from 'react'

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  }),
});

// Mocks for GridArea test
vi.mock('@/hooks/use-width', () => ({
  useWidth: () => ({
    width: 1000,
    containerRef: React.createRef()
  })
}))

vi.mock('@/context/appearance-context', () => ({
  useAppearance: () => ({
    config: {
      widgets: {
        marco: 'clasico',
        compact: false,
        weatherVariant: undefined
      },
      animations: {
        hover: false,
        press: false
      }
    }
  })
}))

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children }) => <div>{children}</div>
  },
  useReducedMotion: () => false
}))

vi.mock('./widget-manifest', () => ({
  getSizeConstraints: () => ({ minW: 1, minH: 1 }),
  getManifest: () => ({ label: 'Test' })
}))

vi.mock('@/lib/dashboard/acomodo-pantalla', () => ({
  acomodosPorPantalla: vi.fn(),
  acomodoPara: vi.fn(),
  puntoParaAncho: vi.fn().mockReturnValue('lg'),
  altoFila: vi.fn().mockReturnValue(100),
  COLUMNAS: { lg: 12 },
  rolDe: vi.fn().mockReturnValue('hero'),
  tipoPara: vi.fn(),
}))

vi.mock('./editor-superior/acomodo', () => ({
  conBloqueo: vi.fn().mockImplementation((widgets, ids, blocked) => widgets),
  estaBloqueado: vi.fn().mockReturnValue(false),
  columnasPara: vi.fn().mockReturnValue(12)
}))

vi.mock('./editor-superior/arrastre-catalogo', () => ({
  arrastreCatalogoActual: vi.fn(),
  esArrastreCatalogo: vi.fn().mockReturnValue(false),
  leerCargaCatalogo: vi.fn().mockReturnValue(null),
  terminarArrastreCatalogo: vi.fn()
}))

vi.mock('@/lib/widget-sync', () => ({
  shareWidget: vi.fn().mockResolvedValue({ entityId: 'test' })
}))

describe('GridArea', () => {
  it('renders widget with data-ss-elemento attribute in mouse version', () => {
    const widgets: DashboardWidget[] = [
      {
        id: 'w1',
        widget_type: 'CLOCK_DATE',
        layout: { i: 'w1', x: 0, y: 0, w: 2, h: 2 },
        settings: {}
      }
    ]
    const { container } = render(
      <GridArea
        dashboardId="test"
        widgets={widgets}
        setWidgets={() => {}}
        isEditMode={false}
      />
    )
    const element = container.querySelector(`[data-ss-elemento="widget:CLOCK_DATE"]`)
    expect(element).not.toBeNull()
  })
})