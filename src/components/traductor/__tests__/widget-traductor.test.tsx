// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WidgetTraductor from '../widget-traductor';

describe('WidgetTraductor', () => {
    const ajustesBase = {
        idiomaOrigen: 'es',
        idiomaDestino: 'en',
        motor: 'automático',
        tamanoLetra: 'M' as const,
        historialCorto: false,
    };

    const fakeServicio = vi.fn((texto: string) => texto.toUpperCase());

    it('translate with fake service', async () => {
        render(
            <WidgetTraductor ajustes={ajustesBase} onAjustes={vi.fn()} servicio={fakeServicio} />
        );
        const textarea = screen.getByPlaceholderText('Escribe el texto que quieres traducir…');
        fireEvent.change(textarea, { target: { value: 'hola' } });
        const button = screen.getByRole('button', { name: /traducir/i });
        fireEvent.click(button);
        await waitFor(() => screen.getByText('HOLA'));
        expect(fakeServicio).toHaveBeenCalledWith('hola');
        expect(screen.getByText('HOLA')).toBeTruthy();
    });

    it('shows ajustes', () => {
        render(
            <WidgetTraductor ajustes={ajustesBase} onAjustes={vi.fn()} servicio={fakeServicio} />
        );
        expect(screen.getByText('automático')).toBeTruthy();
        expect(screen.getByText('M')).toBeTruthy();
        expect(screen.getByText('ES')).toBeTruthy();
        expect(screen.getByText('EN')).toBeTruthy();
    });

    it('does not store history when historialCorto is false', () => {
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
        render(
            <WidgetTraductor ajustes={ajustesBase} onAjustes={vi.fn()} servicio={fakeServicio} />
        );
        const textarea = screen.getByPlaceholderText('Escribe el texto que quieres traducir…');
        fireEvent.change(textarea, { target: { value: 'test' } });
        const button = screen.getByRole('button', { name: /traducir/i });
        fireEvent.click(button);
        expect(setItemSpy).not.toHaveBeenCalled();
        setItemSpy.mockRestore();
    });

    it('stores history when historialCorto is true', () => {
        const ajustesHist = { ...ajustesBase, historialCorto: true };
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
        render(
            <WidgetTraductor ajustes={ajustesHist} onAjustes={vi.fn()} servicio={fakeServicio} />
        );
        const textarea = screen.getByPlaceholderText('Escribe el texto que quieres traducir…');
        fireEvent.change(textarea, { target: { value: 'hello' } });
        const button = screen.getByRole('button', { name: /traducir/i });
        fireEvent.click(button);
        expect(setItemSpy).toHaveBeenCalled();
        setItemSpy.mockRestore();
    });
});