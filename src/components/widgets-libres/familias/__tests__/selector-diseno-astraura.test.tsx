import '@testing-library/jest-dom/vitest'
import { describe, test, beforeEach, vi, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SelectorDisenoAstraura } from '../selector-diseno-astraura'

describe('SelectorDisenoAstraura', () => {
    const mockChange = vi.fn()
    beforeEach(() => {
        mockChange.mockClear()
    })
    test('opens and closes with button and Escape', () => {
        render(<SelectorDisenoAstraura valor="auto" degradado={false} onCambiar={mockChange} />)
        const btn = screen.getByRole('button')
        fireEvent.click(btn)
        expect(screen.getByRole('dialog')).toBeInTheDocument()
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(mockChange).not.toHaveBeenCalled()
    })
    test('selects minimo with arrow keys', () => {
        render(<SelectorDisenoAstraura valor="auto" degradado={false} onCambiar={mockChange} />)
        const btn = screen.getByRole('button')
        fireEvent.click(btn)
        const dialog = screen.getByRole('dialog')
        // initial index should be acciones (2). Arrow up twice to minimo
        fireEvent.keyDown(dialog, { key: 'ArrowUp' })
        fireEvent.keyDown(dialog, { key: 'ArrowUp' })
        // Press Enter to select
        fireEvent.keyDown(dialog, { key: 'Enter' })
        expect(mockChange).toHaveBeenCalledWith('minimo')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    test('shows degradado note when degradado', () => {
        render(<SelectorDisenoAstraura valor="auto" degradado={true} onCambiar={mockChange} />)
        const btn = screen.getByRole('button')
        fireEvent.click(btn)
        expect(screen.getByRole('status')).toHaveTextContent('Este tamaño es pequeño')
    })
})
