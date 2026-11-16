import '@testing-library/jest-dom/vitest'
import { describe, it, beforeEach, vi, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SelectorDisenoAstraura } from '../selector-diseno-astraura'

describe('SelectorDisenoAstraura', () => {
    const mockChange = vi.fn()
    beforeEach(() => {
        mockChange.mockClear()
    })

    it('opens and closes with button and Escape', () => {
        render(<SelectorDisenoAstraura valor="auto" degradado={false} onCambiar={mockChange} />)
        const btn = screen.getByRole('button')
        fireEvent.click(btn)
        expect(screen.getByRole('dialog')).toBeInTheDocument()
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(mockChange).not.toHaveBeenCalled()
    })

    it('renders five options: Automático and the four designs', () => {
        render(<SelectorDisenoAstraura valor="auto" degradado={false} onCambiar={mockChange} />)
        const btn = screen.getByRole('button')
        fireEvent.click(btn)
        const dialog = screen.getByRole('dialog')
        const options = screen.getAllByRole('radio')
        expect(options).toHaveLength(5)
        expect(screen.getByText('Automático (según el tamaño y el aparato)')).toBeInTheDocument()
        expect(screen.getByText('Mínimo')).toBeInTheDocument()
        expect(screen.getByText('Conversación')).toBeInTheDocument()
        expect(screen.getByText('Acciones')).toBeInTheDocument()
        expect(screen.getByText('Voz')).toBeInTheDocument()
    })

    it('shows the currently selected option as checked (auto selects Automático)', () => {
        render(<SelectorDisenoAstraura valor="auto" degradado={false} onCambiar={mockChange} />)
        const btn = screen.getByRole('button')
        fireEvent.click(btn)
        const autoLabel = screen.getByText('Automático (según el tamaño y el aparato)').closest('label')
        const autoRadio = autoLabel?.querySelector('input[type="radio"]')
        expect(autoRadio).toBeChecked()
    })

    it('shows the currently selected option as checked for a design', () => {
        render(<SelectorDisenoAstraura valor="conversacion" degradado={false} onCambiar={mockChange} />)
        const btn = screen.getByRole('button')
        fireEvent.click(btn)
        const label = screen.getByText('Conversación').closest('label')
        const radio = label?.querySelector('input[type="radio"]')
        expect(radio).toBeChecked()
    })

    it('selects an option with ArrowUp/ArrowDown and Enter', () => {
        render(<SelectorDisenoAstraura valor="auto" degradado={false} onCambiar={mockChange} />)
        const btn = screen.getByRole('button')
        fireEvent.click(btn)
        const dialog = screen.getByRole('dialog')
        // initial focus on Automático (index 0). ArrowDown twice to Conversación
        fireEvent.keyDown(dialog, { key: 'ArrowDown' })
        fireEvent.keyDown(dialog, { key: 'ArrowDown' })
        fireEvent.keyDown(dialog, { key: 'Enter' })
        expect(mockChange).toHaveBeenCalledWith('conversacion')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('selects an option with Space key', () => {
        render(<SelectorDisenoAstraura valor="auto" degradado={false} onCambiar={mockChange} />)
        const btn = screen.getByRole('button')
        fireEvent.click(btn)
        const dialog = screen.getByRole('dialog')
        // ArrowDown once to Mínimo
        fireEvent.keyDown(dialog, { key: 'ArrowDown' })
        fireEvent.keyDown(dialog, { key: ' ' })
        expect(mockChange).toHaveBeenCalledWith('minimo')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('Escape closes without calling onCambiar', () => {
        render(<SelectorDisenoAstraura valor="auto" degradado={false} onCambiar={mockChange} />)
        const btn = screen.getByRole('button')
        fireEvent.click(btn)
        const dialog = screen.getByRole('dialog')
        fireEvent.keyDown(dialog, { key: 'ArrowDown' })
        fireEvent.keyDown(dialog, { key: 'Escape' })
        expect(mockChange).not.toHaveBeenCalled()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('shows degradado note when degradado is true', () => {
        render(<SelectorDisenoAstraura valor="auto" degradado={true} onCambiar={mockChange} />)
        const btn = screen.getByRole('button')
        fireEvent.click(btn)
        expect(screen.getByRole('status')).toHaveTextContent('Este tamaño es pequeño: se muestra el diseño Mínimo; agranda el widget para ver el elegido.')
    })

    it('returns focus to the button when dialog closes', () => {
        render(<SelectorDisenoAstraura valor="auto" degradado={false} onCambiar={mockChange} />)
        const btn = screen.getByRole('button')
        fireEvent.click(btn)
        expect(screen.getByRole('dialog')).toBeInTheDocument()
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
        expect(btn).toHaveFocus()
    })
})