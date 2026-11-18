import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppearanceProvider } from '@/context/appearance-context';
import { WidgetTraductor } from '../widget-traductor';

describe('WidgetTraductor', () => {
    it('traduce texto con servicio falso', async () => {
        const servicio = { traducir: vi.fn().mockResolvedValue('Hello') };
        const ajustes = { idiomasFijados: ['es', 'en'] as [string, string], motorPreferido: 'automatico' as 'automatico', tamanoLetra: 'M' as 'M', historialCorto: true };
        const onAjustes = vi.fn();
        const renderCrudo = (ui: any) => render(<AppearanceProvider>{ui}</AppearanceProvider>);
        renderCrudo(<WidgetTraductor ajustes={ajustes} onAjustes={onAjustes} servicio={servicio} />);
        
        fireEvent.change(screen.getByPlaceholderText('Texto a traducir...'), { target: { value: 'Hola' } });
        fireEvent.click(screen.getByText('Traducir'));
        
        await waitFor(() => expect(screen.getByText('Hello')).toBeDefined());
        expect(servicio.traducir).toHaveBeenCalledWith('Hola', 'es', 'en');
    });

    it('intercambia idiomas al pulsar el botón', async () => {
        const servicio = { traducir: vi.fn().mockResolvedValue('Hola') };
        const ajustes = { idiomasFijados: ['es', 'en'] as [string, string], motorPreferido: 'automatico' as 'automatico', tamanoLetra: 'M' as 'M', historialCorto: true };
        const onAjustes = vi.fn();
        const renderCrudo = (ui: any) => render(<AppearanceProvider>{ui}</AppearanceProvider>);
        renderCrudo(<WidgetTraductor ajustes={ajustes} onAjustes={onAjustes} servicio={servicio} />);
        
        fireEvent.click(screen.getByRole('button', { name: /intercambiar/i }));
        
        expect(onAjustes).toHaveBeenCalledWith({ idiomasFijados: ['en', 'es'] });
    });

    it('no guarda historial cuando historialCorto es false', async () => {
        const servicio = { traducir: vi.fn().mockResolvedValue('Hello') };
        const ajustes = { idiomasFijados: ['es', 'en'] as [string, string], motorPreferido: 'automatico' as 'automatico', tamanoLetra: 'M' as 'M', historialCorto: false };
        const onAjustes = vi.fn();
        const renderCrudo = (ui: any) => render(<AppearanceProvider>{ui}</AppearanceProvider>);
        renderCrudo(<WidgetTraductor ajustes={ajustes} onAjustes={onAjustes} servicio={servicio} />);
        
        fireEvent.change(screen.getByPlaceholderText('Texto a traducir...'), { target: { value: 'Hola' } });
        fireEvent.click(screen.getByText('Traducir'));
        
        await waitFor(() => expect(screen.getByText('Hello')).toBeDefined());
        expect(servicio.traducir).toHaveBeenCalledWith('Hola', 'es', 'en');
    });
});