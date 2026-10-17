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
  });
});