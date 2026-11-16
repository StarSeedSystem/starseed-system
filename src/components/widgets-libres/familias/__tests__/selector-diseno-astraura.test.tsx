import '@testing-library/jest-dom/vitest'
import { describe, test, beforeEach, vi, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SelectorDisenoAstraura } from '../selector-diseno-astraura'
import { DISENOS } from '@/lib/widgets/astraura/disenos'

const OPCIONES_DIALOGO = ['minimo', 'conversacion', 'acciones', 'voz'] as const

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

    test('renders four options with names and descriptions', () => {
        render(<SelectorDisenoAstraura valor="auto" degradado={false} onCambiar={mockChange} />)
        const btn = screen.getByRole('button')
        fireEvent.click(btn)
        const dialog = screen.getByRole('dialog')
        const radiogroup = dialog.querySelector('[role="radiogroup"]')
        expect(radiogroup).toBeInTheDocument()
        const radios = screen.getAllByRole('radio')
        expect(radios).toHaveLength(4)
        OPCIONES_DIALOGO.forEach((opcion) => {
            expect(screen.getByText(DISENOS[opcion].nombre)).toBeInTheDocument()
            expect(screen.getByText(DISENOS[opcion].sirvePara)).toBeInTheDocument()
        })
    })

    test('marks the currently selected option', () => {
        render(<SelectorDisenoAstraura valor="conversacion" degradado={false} onCambiar={mockChange} />)
        const btn = screen.getByRole('button')
        fireEvent.click(btn)
        const dialog = screen.getByRole('dialog')
        const radios = screen.getAllByRole('radio')
        const conversacionRadio = radios[1]
        expect(conversacionRadio).toBeChecked()
        radios.forEach((radio, i) => {
            if (i !== 1) expect(radio).not.toBeChecked()
        })
    })

    test('selects option with arrow keys and Enter', () => {
        render(<SelectorDisenoAstraura valor="auto" degradado={false} onCambiar={mockChange} />)
        const btn = screen.getByRole('button')
        fireEvent.click(btn)
        const dialog = screen.getByRole('dialog')
        fireEvent.keyDown(dialog, { key: 'ArrowUp' })
        fireEvent.keyDown(dialog, { key: 'ArrowUp' })
        fireEvent.keyDown(dialog, { key: 'Enter' })
        expect(mockChange).toHaveBeenCalledWith('minimo')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    test('selects option with arrow keys and Space', () => {
        render(<SelectorDisenoAstraura valor="auto" degradado={false} onCambiar={mockChange} />)
        const btn = screen.getByRole('button')
        fireEvent.click(btn)
        const dialog = screen.getByRole('dialog')
        fireEvent.keyDown(dialog, { key: 'ArrowDown' })
        fireEvent.keyDown(dialog, { key: ' ' })
        expect(mockChange).toHaveBeenCalledWith('voz')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    test('Escape closes without changing selection', () => {
        render(<SelectorDisenoAstraura valor="acciones" degradado={false} onCambiar={mockChange} />)
        const btn = screen.getByRole('button')
        fireEvent.click(btn)
        const dialog = screen.getByRole('dialog')
        fireEvent.keyDown(dialog, { key: 'ArrowUp' })
        fireEvent.keyDown(dialog, { key: 'Escape' })
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(mockChange).not.toHaveBeenCalled()
    })

    test('shows degradado note when degradado is true', () => {
        render(<SelectorDisenoAstraura valor="auto" degradado={true} onCambiar={mockChange} />)
        const btn = screen.getByRole('button')
        fireEvent.click(btn)
        expect(screen.getByRole('status')).toHaveTextContent('Este tamaño es pequeño')
    })

    test('focus returns to button when dialog closes', () => {
        render(<SelectorDisenoAstraura valor="auto" degradado={false} onCambiar={mockChange} />)
        const btn = screen.getByRole('button')
        fireEvent.click(btn)
        expect(screen.getByRole('dialog')).toBeInTheDocument()
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(btn).toHaveFocus()
    })

    test('clicking an option selects it and closes', () => {
        render(<SelectorDisenoAstraura valor="auto" degradado={false} onCambiar={mockChange} />)
        const btn = screen.getByRole('button')
        fireEvent.click(btn)
        const dialog = screen.getByRole('dialog')
        const vozRadio = screen.getAllByRole('radio')[3]
        fireEvent.click(vozRadio)
        expect(mockChange).toHaveBeenCalledWith('voz')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    test('wraps around with arrow keys', () => {
        render(<SelectorDisenoAstraura valor="voz" degradado={false} onCambiar={mockChange} />)
        const btn = screen.getByRole('button')
        fireEvent.click(btn)
        const dialog = screen.getByRole('dialog')
        fireEvent.keyDown(dialog, { key: 'ArrowDown' })
        fireEvent.keyDown(dialog, { key: 'Enter' })
        expect(mockChange).toHaveBeenCalledWith('minimo')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
})