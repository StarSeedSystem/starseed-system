import { describe, it, expect } from 'vitest';
import {
  TIPOS_ENTIDAD_IA,
  ESTADOS_ENTIDAD,
  ETIQUETA_TIPO,
  ETIQUETA_ESTADO,
  construirGrafoIA,
  entidadesPorCerebro,
  entidadesPorGrupo,
  entidadesPorEstado,
  llamadasRecientes,
  type EntidadIA,
  type LlamadaIA,
  type EntradaPlantillaIA,
} from '../plantillas/ia';

function entidad(parcial: Partial<EntidadIA> & Pick<EntidadIA, 'id' | 'tipo' | 'titulo' | 'ref'>): EntidadIA {
  return {
    estado: 'activo',
    actividad: 0.5,
    ...parcial,
  };
}

function llamada(de: string, a: string, tipo: LlamadaIA['tipo'] = 'invoca', t = Date.now()): LlamadaIA {
  return { de, a, tipo, t, intensidad: 0.8 };
}

describe('constantes y etiquetas', () => {
  it('expone todos los tipos de entidad del contrato', () => {
    expect(TIPOS_ENTIDAD_IA).toEqual([
      'astraura',
      'agente',
      'bot',
      'habilidad',
      'conector',
      'cerebro',
      'personalidad',
    ]);
  });

  it('expone todos los estados posibles', () => {
    expect(ESTADOS_ENTIDAD).toEqual([
      'activo',
      'en-espera',
      'trabajando',
      'detenido',
      'error',
    ]);
  });

  it('tiene etiquetas en español para cada tipo', () => {
    for (const tipo of TIPOS_ENTIDAD_IA) {
      expect(ETIQUETA_TIPO[tipo]).toBeDefined();
      expect(typeof ETIQUETA_TIPO[tipo]).toBe('string');
      expect(ETIQUETA_TIPO[tipo].length).toBeGreaterThan(0);
    }
  });

  it('tiene etiquetas en español para cada estado', () => {
    for (const estado of ESTADOS_ENTIDAD) {
      expect(ETIQUETA_ESTADO[estado]).toBeDefined();
      expect(typeof ETIQUETA_ESTADO[estado]).toBe('string');
      expect(ETIQUETA_ESTADO[estado].length).toBeGreaterThan(0);
    }
  });
});

describe('brillo de entidades', () => {
  it('el centro (Astraura) tiene brillo máximo', () => {
    const entrada: EntradaPlantillaIA = {
      ahora: 1000,
      entidades: [
        entidad({ id: 'astraura-1', tipo: 'astraura', titulo: 'Astraura', ref: '/ia/astraura', actividad: 1 }),
        entidad({ id: 'agente-1', tipo: 'agente', titulo: 'Agente', ref: '/ia/agente/1', actividad: 1 }),
      ],
      llamadas: [],
    };
    const resultado = construirGrafoIA(entrada);
    const centro = resultado.grafo.nodos.get(resultado.centro ?? '');
    expect(centro?.peso).toBeCloseTo(1, 1);
  });

  it('agentes trabajando son cometas con brillo alto', () => {
    const entrada: EntradaPlantillaIA = {
      ahora: 1000,
      entidades: [
        entidad({ id: 'astraura-1', tipo: 'astraura', titulo: 'Astraura', ref: '/ia/astraura', actividad: 0.5 }),
        entidad({ id: 'agente-1', tipo: 'agente', titulo: 'Agente trabajando', ref: '/ia/agente/1', estado: 'trabajando', actividad: 0.9 }),
        entidad({ id: 'agente-2', tipo: 'agente', titulo: 'Agente en espera', ref: '/ia/agente/2', estado: 'en-espera', actividad: 0.1 }),
      ],
      llamadas: [],
    };
    const resultado = construirGrafoIA(entrada);
    const cometa = resultado.grafo.nodos.get('ia:agente-1');
    const enEspera = resultado.grafo.nodos.get('ia:agente-2');
    expect(cometa?.peso).toBeGreaterThan((enEspera?.peso ?? 0));
    expect(resultado.cometas).toContain('ia:agente-1');
    expect(resultado.cometas).not.toContain('ia:agente-2');
  });

  it('habilidades y conectores son lunas', () => {
    const entrada: EntradaPlantillaIA = {
      ahora: 1000,
      entidades: [
        entidad({ id: 'astraura-1', tipo: 'astraura', titulo: 'Astraura', ref: '/ia/astraura' }),
        entidad({ id: 'hab-1', tipo: 'habilidad', titulo: 'Habilidad', ref: '/ia/habilidad/1' }),
        entidad({ id: 'conn-1', tipo: 'conector', titulo: 'Conector', ref: '/ia/conector/1' }),
      ],
      llamadas: [],
    };
    const resultado = construirGrafoIA(entrada);
    expect(resultado.lunas).toContain('ia:hab-1');
    expect(resultado.lunas).toContain('ia:conn-1');
  });
});

describe('filtros', () => {
  it('filtra por cerebro', () => {
    const entrada: EntradaPlantillaIA = {
      ahora: 1000,
      entidades: [
        entidad({ id: 'astraura-1', tipo: 'astraura', titulo: 'Astraura', ref: '/ia/astraura', cerebroId: 'cerebro-a' }),
        entidad({ id: 'agente-1', tipo: 'agente', titulo: 'Agente A', ref: '/ia/agente/1', cerebroId: 'cerebro-a' }),
        entidad({ id: 'agente-2', tipo: 'agente', titulo: 'Agente B', ref: '/ia/agente/2', cerebroId: 'cerebro-b' }),
      ],
      llamadas: [],
      filtro: { cerebro: 'cerebro-a' },
    };
    const resultado = construirGrafoIA(entrada);
    expect(resultado.grafo.nodos.size).toBe(2);
    expect(resultado.grafo.nodos.has('ia:astraura-1')).toBe(true);
    expect(resultado.grafo.nodos.has('ia:agente-1')).toBe(true);
    expect(resultado.grafo.nodos.has('ia:agente-2')).toBe(false);
  });

  it('filtra por grupo', () => {
    const entrada: EntradaPlantillaIA = {
      ahora: 1000,
      entidades: [
        entidad({ id: 'astraura-1', tipo: 'astraura', titulo: 'Astraura', ref: '/ia/astraura', grupoId: 'grupo-1' }),
        entidad({ id: 'agente-1', tipo: 'agente', titulo: 'Agente', ref: '/ia/agente/1', grupoId: 'grupo-1' }),
        entidad({ id: 'bot-1', tipo: 'bot', titulo: 'Bot', ref: '/ia/bot/1', grupoId: 'grupo-2' }),
      ],
      llamadas: [],
      filtro: { grupo: 'grupo-1' },
    };
    const resultado = construirGrafoIA(entrada);
    expect(resultado.grafo.nodos.size).toBe(2);
  });

  it('filtra por estado', () => {
    const entrada: EntradaPlantillaIA = {
      ahora: 1000,
      entidades: [
        entidad({ id: 'astraura-1', tipo: 'astraura', titulo: 'Astraura', ref: '/ia/astraura', estado: 'activo' }),
        entidad({ id: 'agente-1', tipo: 'agente', titulo: 'Agente', ref: '/ia/agente/1', estado: 'trabajando' }),
        entidad({ id: 'bot-1', tipo: 'bot', titulo: 'Bot', ref: '/ia/bot/1', estado: 'detenido' }),
      ],
      llamadas: [],
      filtro: { estado: 'trabajando' },
    };
    const resultado = construirGrafoIA(entrada);
    expect(resultado.grafo.nodos.size).toBe(1);
    expect(resultado.grafo.nodos.has('ia:agente-1')).toBe(true);
  });

  it('filtra por tipo de entidad', () => {
    const entrada: EntradaPlantillaIA = {
      ahora: 1000,
      entidades: [
        entidad({ id: 'astraura-1', tipo: 'astraura', titulo: 'Astraura', ref: '/ia/astraura' }),
        entidad({ id: 'agente-1', tipo: 'agente', titulo: 'Agente', ref: '/ia/agente/1' }),
        entidad({ id: 'hab-1', tipo: 'habilidad', titulo: 'Habilidad', ref: '/ia/habilidad/1' }),
      ],
      llamadas: [],
      filtro: { tipo: 'habilidad' },
    };
    const resultado = construirGrafoIA(entrada);
    expect(resultado.grafo.nodos.size).toBe(1);
    expect(resultado.grafo.nodos.has('ia:hab-1')).toBe(true);
  });

  it('filtra por dueño', () => {
    const entrada: EntradaPlantillaIA = {
      ahora: 1000,
      entidades: [
        entidad({ id: 'astraura-1', tipo: 'astraura', titulo: 'Astraura', ref: '/ia/astraura', duenio: 'yo' }),
        entidad({ id: 'agente-1', tipo: 'agente', titulo: 'Agente', ref: '/ia/agente/1', duenio: 'otro' }),
      ],
      llamadas: [],
      filtro: { duenio: 'yo' },
    };
    const resultado = construirGrafoIA(entrada);
    expect(resultado.grafo.nodos.size).toBe(1);
  });

  it('filtra por alcance mínimo', () => {
    const entrada: EntradaPlantillaIA = {
      ahora: 1000,
      entidades: [
        entidad({ id: 'astraura-1', tipo: 'astraura', titulo: 'Astraura', ref: '/ia/astraura', alcance: 'publico' }),
        entidad({ id: 'agente-1', tipo: 'agente', titulo: 'Agente', ref: '/ia/agente/1', alcance: 'privado' }),
        entidad({ id: 'bot-1', tipo: 'bot', titulo: 'Bot', ref: '/ia/bot/1', alcance: 'grupo' }),
      ],
      llamadas: [],
      filtro: { alcanceMinimo: 'grupo' },
    };
    const resultado = construirGrafoIA(entrada);
    expect(resultado.grafo.nodos.size).toBe(2);
    expect(resultado.grafo.nodos.has('ia:astraura-1')).toBe(true);
    expect(resultado.grafo.nodos.has('ia:bot-1')).toBe(true);
    expect(resultado.grafo.nodos.has('ia:agente-1')).toBe(false);
  });
});

describe('llamadas y partículas', () => {
  it('crea aristas de señal para llamadas entre entidades existentes', () => {
    const ahora = 1000;
    const entrada: EntradaPlantillaIA = {
      ahora,
      entidades: [
        entidad({ id: 'astraura-1', tipo: 'astraura', titulo: 'Astraura', ref: '/ia/astraura' }),
        entidad({ id: 'agente-1', tipo: 'agente', titulo: 'Agente', ref: '/ia/agente/1' }),
      ],
      llamadas: [llamada('astraura-1', 'agente-1', 'invoca', ahora)],
    };
    const resultado = construirGrafoIA(entrada);
    const arista = resultado.grafo.aristas.find(
      (a) => a.de === 'ia:astraura-1' && a.a === 'ia:agente-1' && a.tipo === 'senal',
    );
    expect(arista).toBeDefined();
    expect(arista?.intensidad).toBe(0.8);
    expect(resultado.particulas).toHaveLength(1);
  });

  it('ignora llamadas que apuntan a entidades filtradas o inexistentes', () => {
    const ahora = 1000;
    const entrada: EntradaPlantillaIA = {
      ahora,
      entidades: [entidad({ id: 'astraura-1', tipo: 'astraura', titulo: 'Astraura', ref: '/ia/astraura' })],
      llamadas: [
        llamada('astraura-1', 'inexistente', 'invoca', ahora),
        llamada('inexistente', 'astraura-1', 'notifica', ahora),
      ],
    };
    const resultado = construirGrafoIA(entrada);
    expect(resultado.grafo.aristas.length).toBe(0);
    expect(resultado.particulas).toHaveLength(0);
  });
});

describe('grafo resultante', () => {
  it('solo guarda referencias y nunca campos de contenido privado', () => {
    const resultado = construirGrafoIA({
      ahora: 1,
      entidades: [entidad({ id: 'astraura-1', tipo: 'astraura', titulo: 'Astraura', ref: '/ia/astraura' })],
      llamadas: [],
    });
    for (const nodo of resultado.grafo.nodos.values()) {
      expect(nodo.ref.startsWith('/')).toBe(true);
      for (const clave of ['contenido', 'cuerpo', 'texto_privado', 'secret', 'password', 'token']) {
        expect(Object.prototype.hasOwnProperty.call(nodo, clave)).toBe(false);
      }
    }
  });

  it('refleja el estado en etiquetas y peso', () => {
    const resultado = construirGrafoIA({
      ahora: 1,
      entidades: [
        entidad({ id: 'astraura-1', tipo: 'astraura', titulo: 'Astraura', ref: '/ia/astraura', estado: 'trabajando', actividad: 1 }),
        entidad({ id: 'agente-1', tipo: 'agente', titulo: 'Agente', ref: '/ia/agente/1', estado: 'detenido', actividad: 0 }),
      ],
      llamadas: [],
    });
    const centro = resultado.grafo.nodos.get('ia:astraura-1');
    const agente = resultado.grafo.nodos.get('ia:agente-1');
    expect(centro?.etiquetas).toContain('trabajando');
    expect(centro?.etiquetas).toContain('actividad:1.00');
    expect(agente?.etiquetas).toContain('detenido');
    expect(agente?.etiquetas).toContain('actividad:0.00');
    expect((centro?.peso ?? 0) > (agente?.peso ?? 0)).toBe(true);
  });

  it('incluye capas de cerebro y grupo en los nodos', () => {
    const resultado = construirGrafoIA({
      ahora: 1,
      entidades: [
        entidad({ id: 'astraura-1', tipo: 'astraura', titulo: 'Astraura', ref: '/ia/astraura', cerebroId: 'c1', grupoId: 'g1' }),
      ],
      llamadas: [],
    });
    const nodo = resultado.grafo.nodos.get('ia:astraura-1');
    expect(nodo?.capas).toContain('cerebro:c1');
    expect(nodo?.capas).toContain('grupo:g1');
  });

  it('establece padre null para el centro y centro para el resto', () => {
    const resultado = construirGrafoIA({
      ahora: 1,
      entidades: [
        entidad({ id: 'astraura-1', tipo: 'astraura', titulo: 'Astraura', ref: '/ia/astraura' }),
        entidad({ id: 'agente-1', tipo: 'agente', titulo: 'Agente', ref: '/ia/agente/1' }),
        entidad({ id: 'hab-1', tipo: 'habilidad', titulo: 'Habilidad', ref: '/ia/habilidad/1' }),
      ],
      llamadas: [],
    });
    expect(resultado.padres.get('ia:astraura-1')).toBeNull();
    expect(resultado.padres.get('ia:agente-1')).toBe('ia:astraura-1');
    expect(resultado.padres.get('ia:hab-1')).toBe('ia:astraura-1');
  });
});

describe('funciones de agrupación', () => {
  const entidades: EntidadIA[] = [
    entidad({ id: 'a1', tipo: 'astraura', titulo: 'Astraura 1', ref: '/ia/a1', cerebroId: 'c1', grupoId: 'g1', estado: 'activo' }),
    entidad({ id: 'a2', tipo: 'agente', titulo: 'Agente 1', ref: '/ia/a2', cerebroId: 'c1', grupoId: 'g1', estado: 'trabajando' }),
    entidad({ id: 'a3', tipo: 'bot', titulo: 'Bot 1', ref: '/ia/a3', cerebroId: 'c2', grupoId: 'g1', estado: 'detenido' }),
    entidad({ id: 'a4', tipo: 'habilidad', titulo: 'Habilidad 1', ref: '/ia/a4', cerebroId: 'c2', grupoId: 'g2', estado: 'activo' }),
  ];

  it('agrupa por cerebro', () => {
    const mapa = entidadesPorCerebro(entidades);
    expect(mapa.get('c1')?.length).toBe(2);
    expect(mapa.get('c2')?.length).toBe(2);
    expect(mapa.get('sin-cerebro')).toBeUndefined();
  });

  it('agrupa por grupo', () => {
    const mapa = entidadesPorGrupo(entidades);
    expect(mapa.get('g1')?.length).toBe(3);
    expect(mapa.get('g2')?.length).toBe(1);
  });

  it('agrupa por estado', () => {
    const mapa = entidadesPorEstado(entidades);
    expect(mapa.get('activo')?.length).toBe(2);
    expect(mapa.get('trabajando')?.length).toBe(1);
    expect(mapa.get('detenido')?.length).toBe(1);
  });
});

describe('llamadas recientes', () => {
  const ahora = 10000;
  const llamadas: LlamadaIA[] = [
    llamada('a', 'b', 'invoca', ahora - 1000),
    llamada('b', 'c', 'consulta', ahora - 500),
    llamada('c', 'a', 'notifica', ahora - 2000),
    llamada('a', 'c', 'delega', ahora - 100),
  ];

  it('devuelve las llamadas desde un timestamp ordenadas por reciente', () => {
    const recientes = llamadasRecientes(llamadas, ahora - 600, 10);
    expect(recientes).toHaveLength(2);
    expect(recientes[0].t).toBe(ahora - 100);
    expect(recientes[1].t).toBe(ahora - 500);
  });

  it('respeta el límite', () => {
    const recientes = llamadasRecientes(llamadas, 0, 2);
    expect(recientes).toHaveLength(2);
  });
});