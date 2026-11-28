import { describe, it, expect, vi } from 'vitest';
import { SYNCED_KEYS } from '@/lib/settings-sync';
import { validarVariacionPublica } from '../../variaciones/fuentes';
import {
  CLAVE_VISTAS,
  VISTA_DEFECTO,
  configuracionPublica,
  guardarVista,
  leerAlmacen,
  migrarAlmacen,
  normalizarConfig,
  permisoValido,
  serializarAlmacen,
  variacionDesdeVista,
} from '../vistas';

describe('vistas de Ramas 4D', () => {
  it('usa la clave sincronizada del OS', () => {
    expect(CLAVE_VISTAS).toBe('starseed.ramas4d.vistas.v1');
    expect(SYNCED_KEYS).toContain(CLAVE_VISTAS);
  });

  it('guarda la vista en el almacén sincronizado y la vuelve a leer migrada', () => {
    const datos: Record<string, string> = {};
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (clave: string) => datos[clave] ?? null,
        setItem: (clave: string, valor: string) => { datos[clave] = valor; },
      },
    });
    try {
      guardarVista({ ambito: 'grupo', idAmbito: 'sangha', config: VISTA_DEFECTO });
      expect(JSON.parse(datos[CLAVE_VISTAS]).vistas['grupo:sangha'].config).toEqual(VISTA_DEFECTO);
      datos[CLAVE_VISTAS] = JSON.stringify({ v: 1, vistas: { 'persona:maggasukha': { plantilla: 'cerebros' } } });
      expect(leerAlmacen().vistas['persona:maggasukha'].config.plantilla).toBe('cerebros');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('devuelve la vista de fábrica ante un valor ausente', () => {
    expect(migrarAlmacen(null).v).toBe(2);
    expect(VISTA_DEFECTO.fisica.velocidad).toBeGreaterThan(0);
  });

  it('migra una vista v1 conservando la plantilla y traduciendo color y sonido', () => {
    const almacen = migrarAlmacen({
      v: 1,
      vistas: {
        'persona:maggasukha': {
          plantilla: 'cerebros',
          perspectiva: 'grupo',
          colorTema: 'primary',
          sonido: true,
          fisica: { gravedad: 0.8, distancia: 12 },
        },
      },
    });
    const vista = almacen.vistas['persona:maggasukha'];
    expect(almacen.v).toBe(2);
    expect(vista.ambito).toBe('persona');
    expect(vista.config.plantilla).toBe('cerebros');
    expect(vista.config.perspectiva).toBe('grupo');
    expect(vista.config.colores.tokens.acento).toBe('primary');
    expect(vista.config.sonidoEspacial.activo).toBe(true);
    expect(vista.config.fisica.distancia).toBe(12);
    expect(vista.config.fisica.velocidad).toBe(1);
  });

  it('sanea valores rotos y descarta caminos ajenos a la configuración', () => {
    const config = normalizarConfig({
      plantilla: '',
      capas: ['ia', 7, null],
      fisica: { gravedad: 'alta', velocidad: -3 },
      sonidoEspacial: { volumen: 9 },
      ref: '/privado/memoria',
      contenido: 'secreto',
    });
    expect(config.plantilla).toBe('educacion');
    expect(config.capas).toEqual(['ia']);
    expect(config.fisica.gravedad).toBe(0.5);
    expect(config.fisica.velocidad).toBe(-3);
    expect(config.sonidoEspacial.volumen).toBe(1);
    expect(config).not.toHaveProperty('ref');
    expect(config).not.toHaveProperty('contenido');
  });

  it('round-trip: guardar y volver a migrar conserva la vista por grupo', () => {
    const original = migrarAlmacen({
      v: 2,
      vistas: {
        'grupo:sangha': { ambito: 'grupo', idAmbito: 'sangha', config: { plantilla: 'politica', etiquetas: { visibles: false, tamano: 2, estilo: 'destacada' } } },
      },
    });
    const recuperado = migrarAlmacen(JSON.parse(serializarAlmacen(original)));
    expect(recuperado).toEqual(original);
    expect(recuperado.vistas['grupo:sangha'].config.etiquetas.estilo).toBe('destacada');
  });

  it('comparte solo la configuración, nunca referencias ni contenido privado', () => {
    const config = normalizarConfig({ ...VISTA_DEFECTO, ref: '/privado', contenido: 'secreto', idAmbito: 'otra-persona' });
    const publica = configuracionPublica(config);
    expect(publica).not.toHaveProperty('ref');
    expect(publica).not.toHaveProperty('contenido');
    expect(publica.plantilla).toBe('educacion');
    expect(permisoValido('publico')).toBe(true);
    expect(permisoValido('privado')).toBe(false);
  });

  it('exporta la vista como variación pública válida', () => {
    const variacion = variacionDesdeVista(VISTA_DEFECTO, 'Vista cristal', 'maggasukha');
    expect(validarVariacionPublica(variacion)).toBe(true);
    expect(variacion.elemento).toBe('vista:ramas4d');
    expect(variacion.familia).toBe('ramas4d');
    expect(variacion.payload).toEqual(VISTA_DEFECTO);
  });
});
