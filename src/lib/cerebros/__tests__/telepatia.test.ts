import { describe, it, expect } from "vitest";
import {
    CONFIGURACIONES_TELEPATIA,
    validarVinculo,
    normalizarVinculos,
    conVinculo,
    sinVinculo,
    estaCaducado,
    planSincronizacion,
} from "../telepatia";

describe("validarVinculo", () => {
    it("acepta un vínculo válido", () => {
        const v = {
            id: "v1",
            destino: { tipo: "cerebro", id: "c2" },
            alcance: { completo: false, memorias: ["mem1.md"], carpetas: ["carp1"], configuraciones: ["servers"] },
            direccion: "ambas",
            acceso: "escribir",
            auto: true,
            estado: "activo",
            creadoEn: "2026-10-13T10:00:00Z",
        };
        const r = validarVinculo(v);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.vinculo.id).toBe("v1");
    });

    it("rechaza destino sin tipo", () => {
        const r = validarVinculo({ id: "v1", destino: {}, alcance: { completo: true }, direccion: "ambas", acceso: "leer", auto: false, estado: "activo", creadoEn: "2026-01-01T00:00:00Z" });
        expect(r.ok).toBe(false);
        expect(r.motivo).toContain("tipo");
    });

    it("rechaza alcance vacío sin completo", () => {
        const r = validarVinculo({ id: "v1", destino: { tipo: "cerebro", id: "x" }, alcance: { completo: false, memorias: [], carpetas: [], configuraciones: [] }, direccion: "enviar", acceso: "leer", auto: false, estado: "activo", creadoEn: "2026-01-01T00:00:00Z" });
        expect(r.ok).toBe(false);
        expect(r.motivo).toContain("vacío");
    });

    it("rechaza configuración fuera de la lista", () => {
        const r = validarVinculo({ id: "v1", destino: { tipo: "cuenta", id: "u1" }, alcance: { completo: false, memorias: ["a.md"], carpetas: [], configuraciones: ["invalid"] }, direccion: "ambas", acceso: "escribir", auto: false, estado: "pendiente", creadoEn: "2026-01-01T00:00:00Z" });
        expect(r.ok).toBe(false);
    });

    it("rechaza fecha no ISO", () => {
        const r = validarVinculo({ id: "v1", destino: { tipo: "grupo", id: "g1" }, alcance: { completo: true }, direccion: "recibir", acceso: "escribir", auto: false, estado: "activo", creadoEn: "no-es-fecha" });
        expect(r.ok).toBe(false);
        expect(r.motivo).toContain("ISO");
    });

    it("acepta expiraEn nulo y ultimaSync", () => {
        const r = validarVinculo({ id: "v2", destino: { tipo: "pagina", id: "p1" }, alcance: { completo: true }, direccion: "enviar", acceso: "leer", auto: true, estado: "pausado", creadoEn: "2026-01-01T00:00:00Z", expiraEn: null, ultimaSync: "2026-10-13T12:00:00Z" });
        expect(r.ok).toBe(true);
    });
});

describe("telepatia", () => {
    it("esqueleto", () => {
        expect(CONFIGURACIONES_TELEPATIA).toContain("servers");
    });
});

describe("normalizarVinculos", () => {
    it("filtra inválidos y conserva válidos", () => {
        const config = {
            telepatia: [
                { id: "v1", destino: { tipo: "cerebro", id: "c2" }, alcance: { completo: true }, direccion: "ambas", acceso: "leer", auto: false, estado: "activo", creadoEn: "2026-01-01T00:00:00Z" },
                { id: "bad", destino: { tipo: "desconocido", id: "x" }, alcance: { completo: true }, direccion: "ambas", acceso: "leer", auto: false, estado: "activo", creadoEn: "2026-01-01T00:00:00Z" },
            ],
        };
        const norm = normalizarVinculos(config);
        expect(norm.length).toBe(1);
        expect(norm[0].id).toBe("v1");
    });

    it("devuelve vacío para null o sin telepatia", () => {
        expect(normalizarVinculos(null)).toEqual([]);
        expect(normalizarVinculos({})).toEqual([]);
    });
});

describe("conVinculo y sinVinculo", () => {
    it("reemplaza por id y quita", () => {
        const base = { a: 1, telepatia: [{ id: "v1", destino: { tipo: "cerebro", id: "c" }, alcance: { completo: true }, direccion: "ambas", acceso: "leer", auto: false, estado: "activo", creadoEn: "2026-01-01T00:00:00Z" }] };
        const v = { id: "v1", destino: { tipo: "cerebro", id: "c2" }, alcance: { completo: true }, direccion: "enviar", acceso: "escribir", auto: true, estado: "activo", creadoEn: "2026-01-01T00:00:00Z" };
        const actualizado = conVinculo(base, v);
        const arr = actualizado.telepatia as any[];
        expect(arr.length).toBe(1);
        expect(arr[0].direccion).toBe("enviar");
        const quitado = sinVinculo(actualizado, "v1");
        const arrQ = quitado.telepatia as any[];
        expect(arrQ.length).toBe(0);
    });
});

describe("estaCaducado", () => {
    it("caducado si expiraEn está en el pasado", () => {
        const v: any = { expiraEn: "2020-01-01T00:00:00Z" };
        expect(estaCaducado(v, Date.now())).toBe(true);
    });
    it("no caducado si expiraEn es futuro", () => {
        const v: any = { expiraEn: "2099-12-31T23:59:59Z" };
        expect(estaCaducado(v, Date.now())).toBe(false);
    });
    it("no caducado sin expiraEn", () => {
        const v: any = { expiraEn: null };
        expect(estaCaducado(v, Date.now())).toBe(false);
    });
});

describe("planSincronizacion", () => {
    it("vínculo inactivo da plan vacío", () => {
        const v = { id: "v", destino: { tipo: "cerebro", id: "c" }, alcance: { completo: false, memorias: ["m.md"], carpetas: [], configuraciones: [] }, direccion: "ambas", acceso: "escribir", auto: false, estado: "pausado", creadoEn: "2026-01-01T00:00:00Z" } as any;
        expect(planSincronizacion(v, { archivos: [{ name: "m.md", content: "a" }], prefs: {} }, { archivos: [{ name: "m.md", content: "b", updated_at: "2026-01-02T00:00:00Z" }], prefs: {} })).toEqual([]);
    });

    it("vínculo caducado da vacío", () => {
        const v = { id: "v", destino: { tipo: "cerebro", id: "c" }, alcance: { completo: true }, direccion: "ambas", acceso: "leer", auto: false, estado: "activo", creadoEn: "2026-01-01T00:00:00Z", expiraEn: "2000-01-01T00:00:00Z" } as any;
        expect(planSincronizacion(v, { archivos: [], prefs: {} }, { archivos: [], prefs: {} })).toEqual([]);
    });

    it("alcance completo con archivo más nuevo en destino genera destino→origen con escribir y ambas", () => {
        const v = { id: "v", destino: { tipo: "cerebro", id: "c" }, alcance: { completo: true }, direccion: "ambas", acceso: "escribir", auto: false, estado: "activo", creadoEn: "2026-01-01T00:00:00Z" } as any;
        const plan = planSincronizacion(v, { archivos: [{ name: "f.md", content: "o", updated_at: "2026-01-01T00:00:00Z" }], prefs: {} }, { archivos: [{ name: "f.md", content: "d", updated_at: "2026-01-03T00:00:00Z" }], prefs: {} });
        expect(plan.some((op) => op.tipo === "archivo" && op.de === "destino" && op.a === "origen")).toBe(true);
    });

    it("acceso leer → nunca destino→origen", () => {
        const v = { id: "v", destino: { tipo: "cerebro", id: "c" }, alcance: { completo: true }, direccion: "ambas", acceso: "leer", auto: false, estado: "activo", creadoEn: "2026-01-01T00:00:00Z" } as any;
        const plan = planSincronizacion(v, { archivos: [{ name: "f.md", content: "o", updated_at: "2026-01-01T00:00:00Z" }], prefs: {} }, { archivos: [{ name: "f.md", content: "d", updated_at: "2026-01-03T00:00:00Z" }], prefs: {} });
        expect(plan.some((op) => op.de === "destino" && op.a === "origen")).toBe(false);
    });

    it("carpetas nombradas generan operación carpeta", () => {
        const v = { id: "v", destino: { tipo: "grupo", id: "g" }, alcance: { completo: false, memorias: [], carpetas: ["docs"], configuraciones: [] }, direccion: "enviar", acceso: "escribir", auto: false, estado: "activo", creadoEn: "2026-01-01T00:00:00Z" } as any;
        const plan = planSincronizacion(v, { archivos: [], prefs: {} }, { archivos: [], prefs: {} });
        expect(plan.some((op) => op.tipo === "carpeta" && op.nombre === "docs")).toBe(true);
    });

    it("configuraciones completas cubren la lista", () => {
        const v = { id: "v", destino: { tipo: "cuenta", id: "u" }, alcance: { completo: true }, direccion: "ambas", acceso: "escribir", auto: false, estado: "activo", creadoEn: "2026-01-01T00:00:00Z" } as any;
        const plan = planSincronizacion(v, { archivos: [], prefs: {} }, { archivos: [], prefs: {} });
        const confs = plan.filter((op) => op.tipo === "config").map((op) => op.nombre);
        expect(confs).toContain("servers");
        expect(confs).toContain("includes.personalities");
    });

    it("nunca genera operaciones de borrado", () => {
        const v = { id: "v", destino: { tipo: "cerebro", id: "c" }, alcance: { completo: true }, direccion: "ambas", acceso: "escribir", auto: false, estado: "activo", creadoEn: "2026-01-01T00:00:00Z" } as any;
        const plan = planSincronizacion(v, { archivos: [{ name: "f.md", content: "o", updated_at: "2026-01-01T00:00:00Z" }], prefs: {} }, { archivos: [{ name: "f.md", content: "d", updated_at: "2026-01-03T00:00:00Z" }], prefs: {} });
        // No debe existir una operación cuyo propósito sea eliminar un archivo.
        // Cuando destino es más nuevo que origen con ambas + escribir,
        // la operación es destino → origen, no borrado.
        expect(plan.some((op) => op.tipo === "archivo" && op.nombre === "f.md" && op.de === "destino" && op.a === "origen")).toBe(true);
        expect(plan.some((op) => op.tipo === "archivo" && op.nombre === "f.md" && op.de === "origen" && op.a === "destino")).toBe(false);
        // No debe haber ninguna operación con sentido de borrado (tipo 'borrado' no existe en el contrato).
        expect(plan.some((op) => op.tipo === "borrado")).toBe(false);
    });
});
