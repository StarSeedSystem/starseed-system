import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import {
  elegirTarjetas,
  WidgetReferencias,
  type CatalogoInspiracion,
} from '@/components/library/referencias/widget-referencias';
import type { TarjetaReferencia } from '@/lib/library/referencias/buscar-referencias';
import { AppearanceProvider } from '@/context/appearance-context';
import '@testing-library/jest-dom/vitest';

const renderConApariencia = (ui: React.ReactElement) =>
  render(<AppearanceProvider>{ui}</AppearanceProvider>);

const catalogo: CatalogoInspiracion = {
  temas: [
    { id: 'movimiento', nombre: 'Movimiento' },
    { id: 'marca', nombre: 'Marca' },
  ],
  entradas: [
    {
      id: 'lottie', nombre: 'LottieFiles', url: 'https://lottiefiles.com',
      tema: 'movimiento', que_es: 'Animaciones Lottie', verificado: '2026-10-18',
    },
    {
      id: 'mobbin', nombre: 'Mobbin', url: 'https://mobbin.com',
      tema: 'inspiracion-ui', que_es: 'Galería de pantallas', verificado: '2026-10-25',
    },
    {
      id: 'higgs', nombre: 'Higgsfield', url: 'https://higgsfield.ai',
      tema: 'marca', que_es: 'Vídeo con IA', verificado: '2026-10-18',
    },
  ],
};

const previas: TarjetaReferencia[] = [
  {
    entradaId: 'mobbin',
    porque: 'Tema «Inspiración de interfaz»; útil para pizarra.',
    enlaces: [{ titulo: 'Mobbin', url: 'https://mobbin.com' }],
    canalUsado: 'enlace',
  },
];

describe('elegirTarjetas', () => {
  afterEach(cleanup);

  it('sin búsqueda previa devuelve las novedades del catálogo, la más reciente primero', () => {
    const r = elegirTarjetas(catalogo);
    expect(r.map((t) => t.id)).toEqual(['mobbin', 'lottie', 'higgs']);
    expect(r.every((t) => t.porque.includes('Novedad del catálogo'))).toBe(true);
    expect(r[0].tema).toBe('inspiracion-ui');
  });

  it('con tarjetas de la búsqueda prevalecen esas y mapea el nombre del tema', () => {
    const r = elegirTarjetas(catalogo, previas);
    expect(r).toHaveLength(1);
    expect(r[0].nombre).toBe('Mobbin');
    expect(r[0].tema).toBe('inspiracion-ui');
    expect(r[0].porque).toContain('útil para pizarra');
    expect(r[0].url).toBe('https://mobbin.com');
  });

  it('respeta el máximo de tarjetas', () => {
    expect(elegirTarjetas(catalogo, null, 1)).toHaveLength(1);
    expect(elegirTarjetas(catalogo, previas, 1)).toHaveLength(1);
  });
});

describe('WidgetReferencias', () => {
  afterEach(cleanup);

  it('muestra el encabezado y las novedades con «Usar como inspiración»', () => {
    renderConApariencia(<WidgetReferencias />);
    expect(screen.getByText('Inspiración')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Usar como inspiración' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/novedad del catálogo/i).length).toBeGreaterThan(0);
  });

  it('con tarjetas de la búsqueda muestra preferentemente esas, con su tema y su porqué', () => {
    renderConApariencia(<WidgetReferencias tarjetas={previas} />);
    expect(screen.getAllByText('Mobbin').length).toBeGreaterThan(0);
    expect(screen.getByText('Inspiración de interfaz')).toBeInTheDocument();
    expect(screen.getByText(/útil para pizarra/)).toBeInTheDocument();
  });

  it('«Usar como inspiración» entrega la tarjeta elegida', () => {
    const usadas: string[] = [];
    renderConApariencia(<WidgetReferencias tarjetas={previas} onUsar={(t) => { usadas.push(t.id); }} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Usar como inspiración' })[0]);
    expect(usadas).toEqual(['mobbin']);
  });
});
