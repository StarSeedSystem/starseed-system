import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WidgetTraductor, TraductorSettings } from '../widget-traductor';
import '@testing-library/jest-dom';

function mockService(): { translate: typeof vi.fn<Promise<string>, [string, string, string]> } {
    const fn = vi.fn((text, from, to) => Promise.resolve(`translated:${text}:${from}->${to}`));
    return { translate: fn };
}

test('traduce y muestra resultado', async () => {
    const servicio = mockService();
    const ajustes: TraductorSettings = { from: 'es', to: 'en', size: 'M', withHistory: false };
    render(<WidgetTraductor ajustes={ajustes} servicio={servicio} />);

    const input = screen.getByPlaceholderText('Escribe aquí') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'hola' } });

    const btn = screen.getByText(/Traducir/i);
    fireEvent.click(btn);

    await waitFor(() => {
        expect(servicio.translate).toHaveBeenCalledWith('hola', 'es', 'en');
        expect(screen.getByText('translated:hola:es->en')).toBeInTheDocument();
    });
});

test('cambia idioma y dispara onAjustes', () => {
    const servicio = mockService();
    const ajustes: TraductorSettings = { from: 'es', to: 'en', size: 'M', withHistory: false };
    const onAjustes = jest.fn();
    render(<WidgetTraductor ajustes={ajustes} servicio={servicio} onAjustes={onAjustes} />);

    const fromSelect = screen.getByDisplayValue('Español') as HTMLSelectElement;
    fireEvent.change(fromSelect, { target: { value: 'fr' } });
    expect(onAjustes).toHaveBeenCalledWith({ from: 'fr' });

    const toSelect = screen.getByDisplayValue('Inglés') as HTMLSelectElement;
    fireEvent.change(toSelect, { target: { value: 'de' } });
    expect(onAjustes).toHaveBeenCalledWith({ to: 'de' });
});
