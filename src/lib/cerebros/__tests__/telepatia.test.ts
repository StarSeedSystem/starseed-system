<<<<<<< HEAD
import { describe, it, expect } from 'vitest';
import { validarVinculo, normalizarVinculos, conVinculo, sinVinculo, estaCaducado, planSincronizacion, CONFIGURACIONES_TELEPATIA } from '../telepatia';

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
    const v = { ...vinculoValido, alcance: { completo: false, memorias: ['m1'], carpetas: [], configuraciones: ['no-existe' as any] } };
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
    expect((cfg as any).telepatia).toHaveLength(1);
  });

  it('reemplaza por id', () => {
    const v2 = { ...vinculoValido, auto: false };
    const cfg1 = conVinculo({}, vinculoValido);
    const cfg2 = conVinculo(cfg1, v2);
    expect((cfg2 as any).telepatia).toHaveLength(1);
    expect((cfg2 as any).telepatia[0].auto).toBe(false);
  });
});

describe('sinVinculo', () => {
  it('elimina por id', () => {
    const cfg = { telepatia: [vinculoValido] };
    const out = sinVinculo(cfg, 'v1');
    expect((out as any).telepatia).toHaveLength(0);
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
    const v = { ...vinculoValido, estado: 'pausado' as any };
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
=======
import { describe, expect, it } from "vitest";
import {
  destinoEnPalabras,
  alcanceResumido,
  estadoConMotivo,
  obtenerVinculos,
  normalizarVinculo,
  normalizarVinculos,
  validarVinculo,
  type VinculoTelepatico,
} from "../telepatia";

const cerebroDemo = {
  id: "cerebro1",
  name: "Mi Cerebro",
  scope: "account",
  scope_ref: null,
  config: { telepatia: [] },
  includes: { vaults: [], backends: [], personalities: [], runtimes: [], tokens: [], memories: [], connections: [], bindScope: false, permissions: [] },
  servers: [],
} as any;

const entidadGrupo = { id: "grupo1", tipo: "grupo", nombre: "Mi Grupo" };
const entidadComunidad = { id: "com1", tipo: "comunidad", nombre: "Mi Comunidad" };
const entidadPagina = { id: "page1", tipo: "pagina", nombre: "Mi Página" };

const cerebrosMapa = {
  cerebro1: cerebroDemo,
  cerebro2: { ...cerebroDemo, id: "cerebro2", name: "Otro Cerebro" },
} as const;

describe("telepatia (lógica pura)", () => {
  describe("destinoEnPalabras", () => {
    it("muestra nombre de cerebro para destino cerebro", () => {
      const v: VinculoTelepatico = { destino: { tipo: "cerebro", id: "cerebro2" }, alcance: { completo: false, memorias: [], carpetas: [], configuraciones: [] }, direccion: "ambas", acceso: "leer", auto: false, estado: "activo", creadoEn: "2024-01-01T00:00:00.000Z" };
      expect(destinoEnPalabras(v, cerebrosMapa)).toBe("Otro Cerebro");
    });
    it("muestra fallback si cerebro no existe", () => {
      const v: VinculoTelepatico = { destino: { tipo: "cerebro", id: "desconocido" }, alcance: { completo: false, memorias: [], carpetas: [], configuraciones: [] }, direccion: "ambas", acceso: "leer", auto: false, estado: "activo", creadoEn: "2024-01-01T00:00:00.000Z" };
      expect(destinoEnPalabras(v, cerebrosMapa)).toContain("desconocido");
    });
    it("muestra grupo/comunidad/página para entidades", () => {
      const v1: VinculoTelepatico = { destino: { tipo: "grupo", id: "grupo1" }, alcance: { completo: false, memorias: [], carpetas: [], configuraciones: [] }, direccion: "ambas", acceso: "leer", auto: false, estado: "activo", creadoEn: "2024-01-01T00:00:00.000Z" };
      expect(destinoEnPalabras(v1, {}, { grupo1: entidadGrupo })).toBe("Grupo Mi Grupo");
      const v2: VinculoTelepatico = { destino: { tipo: "comunidad", id: "com1" }, alcance: { completo: false, memorias: [], carpetas: [], configuraciones: [] }, direccion: "ambas", acceso: "leer", auto: false, estado: "activo", creadoEn: "2024-01-01T00:00:00.000Z" };
      expect(destinoEnPalabras(v2, {}, { com1: entidadComunidad })).toBe("Comunidad Mi Comunidad");
      const v3: VinculoTelepatico = { destino: { tipo: "pagina", id: "page1" }, alcance: { completo: false, memorias: [], carpetas: [], configuraciones: [] }, direccion: "ambas", acceso: "leer", auto: false, estado: "activo", creadoEn: "2024-01-01T00:00:00.000Z" };
      expect(destinoEnPalabras(v3, {}, { page1: entidadPagina })).toBe("Página Mi Página");
    });
    it("muestra 'Cuenta externa' para cuentas", () => {
      const v: VinculoTelepatico = { destino: { tipo: "cuenta", id: "cuenta123" }, alcance: { completo: false, memorias: [], carpetas: [], configuraciones: [] }, direccion: "ambas", acceso: "leer", auto: false, estado: "activo", creadoEn: "2024-01-01T00:00:00.000Z" };
      expect(destinoEnPalabras(v, {}, {})).toBe("Cuenta externa (cuenta123)");
    });
  });

  describe("alcanceResumido", () => {
    it("completo", () => {
      expect(alcanceResumido({ completo: true, memorias: [], carpetas: [], configuraciones: [] })).toBe("Cerebro completo");
    });
    it("parcial con todos", () => {
      expect(alcanceResumido({ completo: false, memorias: ["a.md", "b.md"], carpetas: ["f1"], configuraciones: ["servers"] })).toBe("2 memorias, 1 carpeta, 1 configuración");
    });
    it("solo algunas", () => {
      expect(alcanceResumido({ completo: false, memorias: ["a.md"], carpetas: [], configuraciones: [] })).toBe("1 memoria");
    });
    it("ninguna seleccionada", () => {
      expect(alcanceResumido({ completo: false, memorias: [], carpetas: [], configuraciones: [] })).toBe("Nada seleccionado");
    });
  });

  describe("estadoConMotivo", () => {
    it("activo sin última sync", () => {
      const v: VinculoTelepatico = { destino: { tipo: "cerebro", id: "c1" }, alcance: { completo: false, memorias: [], carpetas: [], configuraciones: [] }, direccion: "ambas", acceso: "leer", auto: false, estado: "activo", creadoEn: "2024-01-01T00:00:00.000Z", ultimaSync: null };
      expect(estadoConMotivo(v)).toEqual({ estado: "activo", motivo: "Activo y sincronizando" });
    });
    it("pausado manualmente", () => {
      const v: VinculoTelepatico = { destino: { tipo: "cerebro", id: "c1" }, alcance: { completo: false, memorias: [], carpetas: [], configuraciones: [] }, direccion: "ambas", acceso: "leer", auto: false, estado: "pausado", creadoEn: "2024-01-01T00:00:00.000Z" };
      expect(estadoConMotivo(v)).toEqual({ estado: "pausado", motivo: "Sincronización pausada manualmente" });
    });
    it("expirado con fecha en el pasado", () => {
      const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);
      const v: VinculoTelepatico = { destino: { tipo: "cerebro", id: "c1" }, alcance: { completo: false, memorias: [], carpetas: [], configuraciones: [] }, direccion: "ambas", acceso: "leer", auto: false, estado: "activo", creadoEn: "2024-01-01T00:00:00.000Z", expiraEn: ayer.toISOString() };
      expect(estadoConMotivo(v)).toEqual({ estado: "caducado", motivo: expect.stringContaining("expiró") });
    });
    it("aviso de última sync antigua", () => {
      const haceDosDias = new Date(); haceDosDias.setDate(haceDosDias.getDate() - 2);
      const v: VinculoTelepatico = { destino: { tipo: "cerebro", id: "c1" }, alcance: { completo: false, memorias: [], carpetas: [], configuraciones: [] }, direccion: "ambas", acceso: "leer", auto: false, estado: "activo", creadoEn: "2024-01-01T00:00:00.000Z", ultimaSync: haceDosDias.toISOString() };
      expect(estadoConMotivo(v).motivo).toContain("Última sync");
    });
  });

  describe("obtenerVinculos", () => {
    it("lee de cerebro.config.telepatia", () => {
      const cerebro = { ...cerebroDemo, config: { telepatia: [ { id: "v1", destino: { tipo: "cerebro", id: "c2" }, alcance: { completo: false, memorias: [], carpetas: [], configuraciones: [] }, direccion: "ambas", acceso: "leer", auto: false, estado: "activo", creadoEn: "2024-01-01T00:00:00.000Z" } ] } } as any;
      const vinculos = obtenerVinculos(cerebro);
      expect(vinculos).toHaveLength(1);
      expect(vinculos[0].id).toBe("v1");
    });
    it("vacío si telepatia no existe o no es array", () => {
      const cerebro1 = { ...cerebroDemo, config: {} } as any;
      expect(obtenerVinculos(cerebro1)).toEqual([]);
      const cerebro2 = { ...cerebroDemo, config: { telepatia: "not-array" } } as any;
      expect(obtenerVinculos(cerebro2)).toEqual([]);
    });
  });

  describe("normalizarVinculo", () => {
    it("normaliza un vínculo válido", () => {
      const raw = { id: "v1", tipo: "cerebro", idDestino: "c2", alcance: { completo: true, memorias: [], carpetas: [], configuraciones: [] }, direccion: "enviar", acceso: "leer", auto: true, estado: "activo", creadoEn: "2024-01-01T00:00:00.000Z" };
      const v = normalizarVinculo(raw);
      expect(v).not.toBeNull();
      expect(v?.id).toBe("v1");
      expect(v?.destino.tipo).toBe("cerebro");
      expect(v?.alcance.completo).toBe(true);
      expect(v?.direccion).toBe("enviar");
    });
    it("rechaza ids vacíos o tipos inválidos", () => {
      expect(normalizarVinculo({ id: "", tipo: "cerebro" })).toBeNull();
      expect(normalizarVinculo({ id: "v1", tipo: "desconocido" })).toBeNull();
    });
    it("normaliza dirección/acceso por defecto cuando faltan", () => {
      const raw = { id: "v1", tipo: "cerebro", idDestino: "c2", alcance: { completo: false, memorias: [], carpetas: [], configuraciones: [] }, creadoEn: "2024-01-01T00:00:00.000Z" };
      const v = normalizarVinculo(raw);
      expect(v?.direccion).toBe("ambas");
      expect(v?.acceso).toBe("leer");
      expect(v?.auto).toBe(false);
      expect(v?.estado).toBe("activo");
    });
  });

  describe("normalizarVinculos", () => {
    it("filtra inválidos", () => {
      const raws = [
        { id: "v1", tipo: "cerebro", idDestino: "c2", alcance: { completo: false, memorias: [], carpetas: [], configuraciones: [] }, direccion: "enviar", acceso: "leer", auto: false, estado: "activo", creadoEn: "2024-01-01T00:00:00.000Z" },
        null,
        { id: "", tipo: "cerebro", idDestino: "c2", alcance: { completo: false, memorias: [], carpetas: [], configuraciones: [] }, direccion: "enviar", acceso: "leer", auto: false, estado: "activo", creadoEn: "2024-01-01T00:00:00.000Z" },
      ];
      const norm = normalizarVinculos(raws);
      expect(norm).toHaveLength(1);
      expect(norm[0].id).toBe("v1");
    });
  });

  describe("validarVinculo", () => {
    it("rechaza cuando el destino no existe", () => {
      const v: VinculoTelepatico = { destino: { tipo: "cerebro", id: "desconocido" }, alcance: { completo: false, memorias: [], carpetas: [], configuraciones: [] }, direccion: "ambas", acceso: "leer", auto: false, estado: "activo", creadoEn: "2024-01-01T00:00:00.000Z" };
      const err = validarVinculo(v, [], []);
      expect(err).toContain("no existe");
    });
    it("acepta destino válido", () => {
      const v: VinculoTelepatico = { destino: { tipo: "cerebro", id: "cerebro1" }, alcance: { completo: false, memorias: [], carpetas: [], configuraciones: [] }, direccion: "ambas", acceso: "leer", auto: false, estado: "activo", creadoEn: "2024-01-01T00:00:00.000Z" };
      const err = validarVinculo(v, [cerebroDemo], []);
      expect(err).toEqual([]);
    });
    it("valida alcance, dirección, acceso, auto, estado, creadoEn", () => {
      const v: VinculoTelepatico = { destino: { tipo: "cerebro", id: "cerebro1" }, alcance: { completo: false, memorias: [""], carpetas: [], configuraciones: [] }, direccion: "direc", acceso: "nivel", auto: "sí", estado: "raro", creadoEn: "" };
      const err = validarVinculo(v, [cerebroDemo], []);
      expect(err).toContain("no válida");
      expect(err).toContain("no válida");
      expect(err).toContain("no booleano");
      expect(err).toContain("no válido");
      expect(err).toContain("no válido");
      expect(err).toContain("no válido");
      expect(err).toContain("Falta creadoEn");
    });
>>>>>>> 2f838ded (salvavidas · CB1013Gb: trabajo del agente antes de las puertas (tsc / vitest))
  });
});
