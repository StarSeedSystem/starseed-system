import { describe, it, expect } from 'vitest';
import {
  validarVinculo,
  normalizarVinculos,
  conVinculo,
  sinVinculo,
  estaCaducado,
  planSincronizacion,
  CONFIGURACIONES_TELEPATIA,
  destinoEnPalabras,
  alcanceResumido,
  direccionEnPalabras,
  accesoEnPalabras,
  estadoConMotivo,
  etiquetaConfiguracion,
  clavesDeAlcance,
  ambitoExterno,
  entregaTokenPendiente,
  esConfiguracionDelCerebro,
  type VinculoTelepatico,
} from '../telepatia';

function vinculosDe(config: Record<string, unknown>): VinculoTelepatico[] {
  return Array.isArray(config.telepatia) ? (config.telepatia as VinculoTelepatico[]) : [];
}

const vinculoValido = {
  id: 'v1',
  destino: { tipo: 'cerebro' as const, id: 'b1' },
  alcance: { completo: true, memorias: [], carpetas: [], configuraciones: [] },
  direccion: 'ambas' as const,
  acceso: 'escribir' as const,
  auto: true,
  estado: 'activo' as const,
  creadoEn: '2023-01-01T00:00:00Z',
  expiraEn: null,
  ultimaSync: null
};

describe('validarVinculo', () => {
  it('acepta vinculo válido', () => {
    const r = validarVinculo(vinculoValido);
    expect(r.ok).toBe(true);
  });

  it('rechaza no objeto', () => {
    expect(validarVinculo(null).ok).toBe(false);
  });

  it('rechaza id vacío', () => {
    const v = { ...vinculoValido, id: '' };
    expect(validarVinculo(v).ok).toBe(false);
  });

  it('rechaza destino tipo inválido', () => {
    const v = { ...vinculoValido, destino: { tipo: 's', id: '1' } };
    expect(validarVinculo(v).ok).toBe(false);
  });

  it('rechaza alcance vacío cuando no completo', () => {
    const v = { ...vinculoValido, alcance: { completo: false, memorias: [], carpetas: [], configuraciones: [] } };
    expect(validarVinculo(v).ok).toBe(false);
  });

  it('rechaza configuración fuera de lista', () => {
    const v = { ...vinculoValido, alcance: { completo: false, memorias: ['m1'], carpetas: [], configuraciones: ['no-existe'] } };
    expect(validarVinculo(v).ok).toBe(false);
  });

  it('rechaza fecha ISO inválida', () => {
    const v = { ...vinculoValido, creadoEn: '2023-01-01' };
    expect(validarVinculo(v).ok).toBe(false);
  });
});

describe('normalizarVinculos', () => {
  it('devuelve [] para null', () => {
    expect(normalizarVinculos(null)).toEqual([]);
  });

  it('filtra inválidos', () => {
    const config = { telepatia: [vinculoValido, { id: '' }] };
    const res = normalizarVinculos(config);
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('v1');
  });
});

describe('conVinculo', () => {
  it('añade vínculo', () => {
    const cfg = conVinculo({}, vinculoValido);
    expect(vinculosDe(cfg)).toHaveLength(1);
  });

  it('reemplaza por id', () => {
    const v2 = { ...vinculoValido, auto: false };
    const cfg1 = conVinculo({}, vinculoValido);
    const cfg2 = conVinculo(cfg1, v2);
    expect(vinculosDe(cfg2)).toHaveLength(1);
    expect(vinculosDe(cfg2)[0].auto).toBe(false);
  });
});

describe('sinVinculo', () => {
  it('elimina por id', () => {
    const cfg = { telepatia: [vinculoValido] };
    const out = sinVinculo(cfg, 'v1');
    expect(vinculosDe(out)).toHaveLength(0);
  });
});

describe('estaCaducado', () => {
  it('detecta caducidad', () => {
    const v = { ...vinculoValido, expiraEn: '2020-01-01T00:00:00Z' };
    expect(estaCaducado(v, Date.now())).toBe(true);
  });

  it('no caduca sin expiraEn', () => {
    expect(estaCaducado(vinculoValido, Date.now())).toBe(false);
  });
});

describe('planSincronizacion', () => {
  it('vacío si estado pausado', () => {
    const v = { ...vinculoValido, estado: 'pausado' as const };
    const ops = planSincronizacion(v, { archivos: [], prefs: {} }, { archivos: [], prefs: {} });
    expect(ops).toEqual([]);
  });

  it('vacío si caducado', () => {
    const v = { ...vinculoValido, expiraEn: '2000-01-01T00:00:00Z' };
    const ops = planSincronizacion(v, { archivos: [], prefs: {} }, { archivos: [], prefs: {} });
    expect(ops).toEqual([]);
  });

  it('sincroniza archivos por updated_at', () => {
    const origen = {
      archivos: [
        { name: 'f1.txt', content: 'c1', updated_at: '2023-01-01T00:00:00Z' },
        { name: 'f2.txt', content: 'c2' }
      ],
      prefs: {}
    };
    const destino = {
      archivos: [
        { name: 'f1.txt', content: 'old', updated_at: '2022-12-31T00:00:00Z' },
        { name: 'f3.txt', content: 'c3', updated_at: '2023-01-02T00:00:00Z' }
      ],
      prefs: {}
    };
    const ops = planSincronizacion(vinculoValido, origen, destino);
    const archivos = ops.filter(o => o.tipo === 'archivo');
    expect(archivos).toContainEqual({ tipo: 'archivo', nombre: 'f1.txt', de: 'origen', a: 'destino' });
    expect(archivos).toContainEqual({ tipo: 'archivo', nombre: 'f2.txt', de: 'origen', a: 'destino' });
    expect(archivos).toContainEqual({ tipo: 'archivo', nombre: 'f3.txt', de: 'destino', a: 'origen' });
  });

  it('respeta dirección enviar', () => {
    const v = { ...vinculoValido, direccion: 'enviar' as const };
    const origen = { archivos: [{ name: 'a', content: '', updated_at: '2023-01-02T00:00:00Z' }], prefs: {} };
    const destino = { archivos: [{ name: 'a', content: '', updated_at: '2023-01-01T00:00:00Z' }], prefs: {} };
    const ops = planSincronizacion(v, origen, destino);
    expect(ops.every(o => o.a === 'destino')).toBe(true);
  });

  it('acceso leer impide destino→origen', () => {
    const v = { ...vinculoValido, acceso: 'leer' as const };
    const origen = { archivos: [{ name: 'a', content: '', updated_at: '2023-01-01T00:00:00Z' }], prefs: {} };
    const destino = { archivos: [{ name: 'a', content: '', updated_at: '2023-01-02T00:00:00Z' }], prefs: {} };
    const ops = planSincronizacion(v, origen, destino);
    expect(ops.every(o => o.de !== 'destino')).toBe(true);
  });

  it('respeta alcance memorias', () => {
    const v = { ...vinculoValido, alcance: { completo: false, memorias: ['keep.txt'], carpetas: [], configuraciones: [] } };
    const origen = { archivos: [{ name: 'keep.txt', content: '', updated_at: '2023-01-02T00:00:00Z' }, { name: 'skip.txt', content: '', updated_at: '2023-01-02T00:00:00Z' }], prefs: {} };
    const destino = { archivos: [{ name: 'keep.txt', content: '', updated_at: '2023-01-01T00:00:00Z' }], prefs: {} };
    const ops = planSincronizacion(v, origen, destino);
    const nombres = ops.filter(o => o.tipo === 'archivo').map(o => o.nombre);
    expect(nombres).toContain('keep.txt');
    expect(nombres).not.toContain('skip.txt');
  });

  it('genera operación carpeta', () => {
    const v = { ...vinculoValido, alcance: { completo: false, memorias: [], carpetas: ['c1'], configuraciones: [] } };
    const ops = planSincronizacion(v, { archivos: [], prefs: {} }, { archivos: [], prefs: {} });
    expect(ops.some(o => o.tipo === 'carpeta' && o.nombre === 'c1')).toBe(true);
  });
});

const vinculoBase: VinculoTelepatico = {
  id: 'v-ayuda',
  destino: { tipo: 'cerebro', id: 'b2' },
  alcance: { completo: false, memorias: ['memory.md'], carpetas: [], configuraciones: ['servers'] },
  direccion: 'ambas',
  acceso: 'leer',
  auto: true,
  estado: 'activo',
  creadoEn: '2023-01-01T00:00:00.000Z',
  expiraEn: null,
  ultimaSync: null,
};

describe('destinoEnPalabras', () => {
  it('usa el nombre del cerebro cuando existe', () => {
    expect(destinoEnPalabras(vinculoBase, [{ id: 'b2', name: 'Cerebro de viaje' }])).toBe('Cerebro de viaje');
  });

  it('dice que no lo encuentra en vez de inventar un nombre', () => {
    expect(destinoEnPalabras(vinculoBase, [])).toContain('no encontrado');
    expect(destinoEnPalabras(vinculoBase, [])).toContain('b2');
  });

  it('nombra grupos, comunidades y páginas de misEntidades', () => {
    const grupo = { ...vinculoBase, destino: { tipo: 'grupo', id: 'g1' } as const };
    const comunidad = { ...vinculoBase, destino: { tipo: 'comunidad', id: 'c1' } as const };
    const pagina = { ...vinculoBase, destino: { tipo: 'pagina', id: 'p1' } as const };
    const entidades = [
      { id: 'g1', tipo: 'grupo', nombre: 'Jardín' },
      { id: 'c1', tipo: 'comunidad', nombre: 'Semilla' },
      { id: 'p1', tipo: 'pagina', nombre: 'Diario' },
    ];
    expect(destinoEnPalabras(grupo, [], entidades)).toBe('Grupo «Jardín»');
    expect(destinoEnPalabras(comunidad, [], entidades)).toBe('Comunidad «Semilla»');
    expect(destinoEnPalabras(pagina, [], entidades)).toBe('Página «Diario»');
  });

  it('nombra la cuenta externa por su nombre', () => {
    const cuenta = { ...vinculoBase, destino: { tipo: 'cuenta', id: 'ana@ejemplo.org' } as const };
    expect(destinoEnPalabras(cuenta)).toBe('Cuenta externa «ana@ejemplo.org»');
  });
});

describe('alcanceResumido', () => {
  it('dice cerebro completo', () => {
    expect(alcanceResumido({ completo: true, memorias: [], carpetas: [], configuraciones: [] })).toBe('Cerebro completo');
  });

  it('cuenta memorias, carpetas y configuraciones reales', () => {
    expect(alcanceResumido(vinculoBase.alcance)).toBe('1 memoria, 1 configuración');
    expect(alcanceResumido({ completo: false, memorias: ['a', 'b'], carpetas: ['r1'], configuraciones: [] })).toBe('2 memorias, 1 carpeta');
  });

  it('avisa si no se eligió nada', () => {
    expect(alcanceResumido({ completo: false, memorias: [], carpetas: [], configuraciones: [] })).toBe('Nada seleccionado');
  });
});

describe('palabras de dirección y acceso', () => {
  it('traduce las tres direcciones', () => {
    expect(direccionEnPalabras('enviar')).toBe('Enviar desde este cerebro');
    expect(direccionEnPalabras('recibir')).toBe('Recibir en este cerebro');
    expect(direccionEnPalabras('ambas')).toBe('En ambas direcciones');
  });

  it('traduce el acceso', () => {
    expect(accesoEnPalabras('leer')).toBe('Solo lectura');
    expect(accesoEnPalabras('escribir')).toBe('Lectura y escritura');
  });
});

describe('estadoConMotivo', () => {
  const ahora = Date.parse('2026-06-01T12:00:00.000Z');

  it('activo sin sincronizar lo dice sin inventar una fecha', () => {
    expect(estadoConMotivo(vinculoBase, ahora)).toEqual({
      estado: 'activo',
      motivo: 'Activo; todavía no se ha sincronizado.',
    });
  });

  it('pausado y pendiente explican el motivo', () => {
    expect(estadoConMotivo({ ...vinculoBase, estado: 'pausado' }, ahora).motivo).toContain('Pausado');
    expect(estadoConMotivo({ ...vinculoBase, estado: 'pendiente' }, ahora).motivo).toContain('Esperando');
  });

  it('caducado gana al estado guardado', () => {
    const v = { ...vinculoBase, expiraEn: '2026-05-01T00:00:00.000Z' };
    const r = estadoConMotivo(v, ahora);
    expect(r.estado).toBe('caducado');
    expect(r.motivo).toContain('Caducó');
  });

  it('con última sincronización la muestra', () => {
    const v = { ...vinculoBase, ultimaSync: '2026-06-01T10:30:00.000Z' };
    expect(estadoConMotivo(v, ahora).motivo).toContain('última sincronización');
  });

  it('una fecha ilegible es «sin medida», nunca un cero', () => {
    const v = { ...vinculoBase, ultimaSync: 'no-es-fecha' };
    expect(estadoConMotivo(v, ahora).motivo).toContain('sin medida');
  });
});

describe('etiquetaConfiguracion', () => {
  it('traduce las claves del contrato', () => {
    expect(etiquetaConfiguracion('servers')).toBe('Servidores');
    expect(etiquetaConfiguracion('includes.personalities')).toBe('Personalidades incluidas');
  });

  it('devuelve la clave si no la conoce', () => {
    expect(etiquetaConfiguracion('otra')).toBe('otra');
  });
});

describe('clavesDeAlcance', () => {
  it('con el cerebro completo comparte todas las configuraciones', () => {
    const v = { ...vinculoBase, alcance: { completo: true, memorias: [], carpetas: [], configuraciones: [] } };
    expect(clavesDeAlcance(v)).toEqual([...CONFIGURACIONES_TELEPATIA]);
  });

  it('con alcance elegido comparte solo las elegidas', () => {
    expect(clavesDeAlcance(vinculoBase)).toEqual(['servers']);
  });

  it('no inventa configuraciones que no están en la lista del contrato', () => {
    const v = { ...vinculoBase, alcance: { completo: false, memorias: [], carpetas: [], configuraciones: ['servers'] } };
    for (const clave of clavesDeAlcance(v)) {
      expect(CONFIGURACIONES_TELEPATIA).toContain(clave as (typeof CONFIGURACIONES_TELEPATIA)[number]);
    }
  });
});

describe('esConfiguracionDelCerebro', () => {
  it('las personalidades incluidas viven en el cerebro, no en el aparato', () => {
    expect(esConfiguracionDelCerebro('includes.personalities')).toBe(true);
    expect(esConfiguracionDelCerebro('servers')).toBe(false);
  });
});

describe('ambitoExterno', () => {
  it('el cerebro completo se comparte como cerebro', () => {
    const v = { ...vinculoBase, alcance: { completo: true, memorias: [], carpetas: [], configuraciones: [] } };
    expect(ambitoExterno(v, 'b1')).toEqual({ ambitoTipo: 'cerebro', ambitoId: 'b1' });
  });

  it('una sola memoria se comparte como memoria', () => {
    const v = { ...vinculoBase, alcance: { completo: false, memorias: ['memory.md'], carpetas: [], configuraciones: [] } };
    expect(ambitoExterno(v, 'b1')).toEqual({ ambitoTipo: 'memoria', ambitoId: 'memory.md' });
  });

  it('una sola carpeta se comparte como carpeta', () => {
    const v = { ...vinculoBase, alcance: { completo: false, memorias: [], carpetas: ['c1'], configuraciones: [] } };
    expect(ambitoExterno(v, 'b1')).toEqual({ ambitoTipo: 'carpeta', ambitoId: 'c1' });
  });

  it('varias cosas juntas se comparten como cerebro', () => {
    const v = { ...vinculoBase, alcance: { completo: false, memorias: ['a', 'b'], carpetas: [], configuraciones: [] } };
    expect(ambitoExterno(v, 'b1')).toEqual({ ambitoTipo: 'cerebro', ambitoId: 'b1' });
  });
});

describe('entregaTokenPendiente', () => {
  it('el primer vínculo con una cuenta externa aún debe entregar su token', () => {
    expect(entregaTokenPendiente(vinculoBase)).toBe(false);
    const cuenta = { ...vinculoBase, destino: { tipo: 'cuenta' as const, id: 'ana' } };
    expect(entregaTokenPendiente(cuenta)).toBe(true);
  });

  it('un vínculo al que ya se entregó el token no lo entrega otra vez', () => {
    const cuenta = { ...vinculoBase, destino: { tipo: 'cuenta' as const, id: 'ana' }, ultimaSync: '2026-06-01T10:00:00.000Z' };
    expect(entregaTokenPendiente(cuenta)).toBe(false);
  });

  it('un vínculo con otro cerebro nunca entrega token, tenga o no sincronización', () => {
    const ya = { ...vinculoBase, ultimaSync: '2026-06-01T10:00:00.000Z' };
    expect(entregaTokenPendiente(ya)).toBe(false);
  });
});

describe('planSincronizacion · configuraciones', () => {
  it('copia al destino la configuración que le falta, dentro de la dirección', () => {
    const v = { ...vinculoBase, direccion: 'enviar' as const };
    const ops = planSincronizacion(
      v,
      { archivos: [], prefs: { servers: ['a'] } },
      { archivos: [], prefs: {} },
    );
    expect(ops).toContainEqual({ tipo: 'config', nombre: 'servers', de: 'origen', a: 'destino' });
  });

  it('con acceso de solo lectura, recibir no copia configuraciones del destino hacia el origen', () => {
    const v = { ...vinculoBase, direccion: 'recibir' as const, acceso: 'leer' as const };
    const ops = planSincronizacion(
      v,
      { archivos: [], prefs: {} },
      { archivos: [], prefs: { servers: ['a'] } },
    );
    expect(ops).toEqual([]);
  });

  it('con acceso de escritura, recibir sí copia lo que falta en el origen', () => {
    const v = {
      ...vinculoBase,
      direccion: 'recibir' as const,
      acceso: 'escribir' as const,
      alcance: { completo: false, memorias: ['memory.md'], carpetas: [], configuraciones: ['skills'] },
    };
    const ops = planSincronizacion(
      v,
      { archivos: [], prefs: {} },
      { archivos: [], prefs: { skills: ['x'] } },
    );
    expect(ops).toContainEqual({ tipo: 'config', nombre: 'skills', de: 'destino', a: 'origen' });
  });

  it('no pisa una configuración que ambos lados ya declaran (no hay medida de cuál es más nueva)', () => {
    const ops = planSincronizacion(
      vinculoBase,
      { archivos: [], prefs: { servers: ['a'] } },
      { archivos: [], prefs: { servers: ['b'] } },
    );
    expect(ops).toEqual([]);
  });

  it('solo toca las configuraciones del alcance, nunca todas', () => {
    const v = { ...vinculoBase, alcance: { completo: false, memorias: [], carpetas: [], configuraciones: ['servers'] } };
    const ops = planSincronizacion(
      v,
      { archivos: [], prefs: { servers: ['a'], moa: ['b'] } },
      { archivos: [], prefs: {} },
    );
    expect(ops).toEqual([{ tipo: 'config', nombre: 'servers', de: 'origen', a: 'destino' }]);
  });
});
