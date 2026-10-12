import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PrepararImpresion } from './preparar-impresion'

describe('PrepararImpresion component', () => {
  it('renders without crashing', () => {
    render(<PrepararImpresion />)
    expect(screen.getByText(/Preparar para imprimir/i)).toBeTruthy()
  })
})