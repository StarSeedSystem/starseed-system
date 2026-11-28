import { describe, it, expect } from 'vitest';
import {
  BRILLO_MINIMO,
  VIDA_MEDIA_ENFRIAMIENTO_MS,
  brilloRecuerdo,
  construirGrafoCerebros,
  mapearAlcanceCerebro,
  type CerebroFuente,
} from '../plantillas/cerebros';

const DIA = 24 * 60 * 60 * 1000;
const AHORA = 1_800_000_000_000;

function cerebroBase(extra: Partial<CerebroFuente> = {}): CerebroFuente {
  return {
    id: 'brain-1',
    titulo: 'Cerebro personal',
    dueno: 'yo',
    alcance: 'privado',
    uso: 4,
    t_actividad: AHORA,
    carpetas: [{ id: 'carpeta-1', titulo: 'Memoria', uso: 3, t_actividad: AHORA }],
    archivos: [
      {
        id: 'archivo-1',
        titulo: 'soul.md',
        ref: '/cerebros?tab=memoria&brain=brain-1',
        carpetaId: 'carpeta-1',
        uso: 8,
        t_actividad: AHORA,
      },
    ],
    memorias: [
      {
        id: 'memoria-1',
        titulo: 'Recuerdo de diseño',
        ref: '/cerebros?tab=memoria&brain=brain-1',
        uso: 2,
        t_actividad: AHORA,
      },
    ],
    ...extra,
  };
}

describe('mapearAlcanceCerebro', () => {
  it('traduce los alcances del cerebro a los del grafo', () => {
    expect(mapearAlcanceCerebro('account')).toBe('privado');
    expect(mapearAlcanceCerebro('profile')).toBe('contactos');
    expect(mapearAlcanceCerebro('group')).toBe('grupo');
    expect(mapearAlcanceCerebro('page')).toBe('comunidad');
  });

  it('cae a privado ante un alcance desconocido', () => {
    expect(mapearAlcanceCerebro('raro')).toBe('privado');
  });
});

describe('brilloRecuerdo', () => {
  it('un recuerdo más usado brilla más con la misma actividad', () => {
    const poco = brilloRecuerdo(0, AHORA, AHORA);
    const mucho = brilloRecuerdo(20, AHORA, AHORA);
    expect(mucho).toBeGreaterThan(poco);
  });

  it('se enfría despacio con el tiempo', () => {
    const fresco = brilloRecuerdo(5, AHORA, AHORA);
    const viejo = brilloRecuerdo(5, AHORA - 90 * DIA, AHORA);
    expect(viejo).toBeLessThan(fresco);
  });

  it('nunca desaparece: conserva un brillo mínimo', () => {
    const antiguo = brilloRecuerdo(0, AHORA - 10_000 * DIA, AHORA);
    expect(antiguo).toBeGreaterThanOrEqual(BRILLO_MINIMO);
  });

  it('nunca supera el máximo', () => {
    expect(brilloRecuerdo(10_000, AHORA, AHORA)).toBeLessThanOrEqual(1);
  });

  it('trata la actividad futura como reciente', () => {
    expect(brilloRecuerdo(5, AHORA + 10 * DIA, AHORA)).toBe(
      brilloRecuerdo(5, AHORA, AHORA),
    );
  });

  it('usa la vida media por defecto cuando no se indica', () => {
    const aMediaVida = brilloRecuerdo(0, AHORA - VIDA_MEDIA_ENFRIAMIENTO_MS, AHORA);
    const casi = brilloRecuerdo(0, AHORA - VIDA_MEDIA_ENFRIAMIENTO_MS + 1, AHORA);
    expect(aMediaVida).toBeLessThan(casi);
  });
});

describe('construirGrafoCerebros', () => {
  it('convierte cerebro, carpeta, archivo y memoria en sus cuerpos del contrato', () => {
    const grafo = construirGrafoCerebros([cerebroBase()], { ahora: AHORA });
    expect(grafo.nodos.get('brain-1')?.tipo).toBe('cerebro');
    expect(grafo.nodos.get('carpeta-1')?.tipo).toBe('carpeta');
    expect(grafo.nodos.get('archivo-1')?.tipo).toBe('archivo');
    expect(grafo.nodos.get('memoria-1')?.tipo).toBe('memoria');
  });

  it('respeta el alcance de cada cerebro y de sus recuerdos', () => {
    const grafo = construirGrafoCerebros(
      [cerebroBase({ alcance: 'grupo', archivos: [
        { id: 'archivo-1', titulo: 'soul.md', ref: '/x', alcance: 'publico', uso: 1, t_actividad: AHORA },
      ] })],
      { ahora: AHORA },
    );
    expect(grafo.nodos.get('brain-1')?.alcance).toBe('grupo');
    expect(grafo.nodos.get('archivo-1')?.alcance).toBe('publico');
  });

  it('anida cerebro → carpeta → archivo y deriva las memorias del cerebro', () => {
    const grafo = construirGrafoCerebros([cerebroBase()], { ahora: AHORA });
    const tipos = grafo.aristas.map((a) => `${a.de}>${a.a}:${a.tipo}`);
    expect(tipos).toContain('brain-1>carpeta-1:contiene');
    expect(tipos).toContain('carpeta-1>archivo-1:contiene');
    expect(tipos).toContain('brain-1>memoria-1:deriva');
  });

  it('convierte fusiones y telepatías en aristas propias', () => {
    const grafo = construirGrafoCerebros(
      [
        cerebroBase({
          memorias: [
            { id: 'memoria-1', titulo: 'A', ref: '/x', uso: 1, t_actividad: AHORA },
            { id: 'memoria-2', titulo: 'B', ref: '/y', uso: 1, t_actividad: AHORA },
          ],
          fusiones: [{ de: 'memoria-1', a: 'memoria-2' }],
          telepatias: [{ de: 'memoria-2', a: 'memoria-1' }],
        }),
      ],
      { ahora: AHORA },
    );
    const tipos = grafo.aristas.map((a) => a.tipo);
    expect(tipos).toContain('fusion');
    expect(tipos).toContain('telepatia');
  });

  it('no crea aristas hacia recuerdos que no existen', () => {
    const grafo = construirGrafoCerebros(
      [cerebroBase({ fusiones: [{ de: 'memoria-1', a: 'fantasma' }] })],
      { ahora: AHORA },
    );
    expect(grafo.aristas.some((a) => a.a === 'fantasma' || a.de === 'fantasma')).toBe(false);
  });

  it('el brillo por uso se refleja en el peso del nodo', () => {
    const grafo = construirGrafoCerebros(
      [cerebroBase({ archivos: [
        { id: 'archivo-1', titulo: 'muy usado', ref: '/x', uso: 50, t_actividad: AHORA },
        { id: 'archivo-2', titulo: 'poco usado', ref: '/y', uso: 0, t_actividad: AHORA },
      ] })],
      { ahora: AHORA },
    );
    const usado = grafo.nodos.get('archivo-1')?.peso ?? 0;
    const poco = grafo.nodos.get('archivo-2')?.peso ?? 0;
    expect(usado).toBeGreaterThan(poco);
  });

  it('los recuerdos antiguos se enfrían pero siguen en el grafo', () => {
    const grafo = construirGrafoCerebros(
      [cerebroBase({ memorias: [
        { id: 'memoria-1', titulo: 'vieja', ref: '/x', uso: 1, t_actividad: AHORA - 2_000 * DIA },
      ] })],
      { ahora: AHORA },
    );
    const nodo = grafo.nodos.get('memoria-1');
    expect(nodo).toBeDefined();
    expect(nodo?.peso).toBeGreaterThanOrEqual(BRILLO_MINIMO);
  });

  it('no incluye contenido privado: solo referencias y facetas', () => {
    const grafo = construirGrafoCerebros([cerebroBase()], { ahora: AHORA });
    for (const nodo of grafo.nodos.values()) {
      expect(Object.keys(nodo)).not.toContain('contenido');
      expect(Object.keys(nodo)).not.toContain('content');
      expect(nodo.ref).toBeTruthy();
    }
  });

  it('lo privado ajeno no aparece para otro observador', () => {
    const grafo = construirGrafoCerebros([cerebroBase()], {
      ahora: AHORA,
      observador: { id: 'otra-persona' },
    });
    expect(grafo.nodos.size).toBe(0);
    expect(grafo.aristas).toHaveLength(0);
  });

  it('el dueño ve su propio cerebro privado', () => {
    const grafo = construirGrafoCerebros([cerebroBase()], {
      ahora: AHORA,
      observador: { id: 'yo' },
    });
    expect(grafo.nodos.get('brain-1')).toBeDefined();
    expect(grafo.nodos.get('memoria-1')).toBeDefined();
  });

  it('es determinista: misma entrada, mismo grafo', () => {
    const a = construirGrafoCerebros([cerebroBase()], { ahora: AHORA });
    const b = construirGrafoCerebros([cerebroBase()], { ahora: AHORA });
    expect(a.nodos.size).toBe(b.nodos.size);
    expect(a.aristas.length).toBe(b.aristas.length);
    expect(a.nodos.get('archivo-1')?.peso).toBe(b.nodos.get('archivo-1')?.peso);
  });
});
