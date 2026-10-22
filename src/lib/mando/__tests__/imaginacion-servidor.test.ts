/**
 * Imaginación en Genesis (Ola 1021I · IMN1021G): la validación de ajustes y la
 * normalización de propuestas han de coincidir con el contrato
 * `architecture/imaginacion-autodesarrollo.md` §3–§6, y aprobar una de Astraura
 * con el backend dormido NO cambia nada (honestidad radical).
 */
import { mkdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
    AJUSTES_DEFECTO,
    aprobarPropuesta,
    guardarAjustes,
    leerAjustes,
    leerPropuestas,
    necesitaAstraura,
    posponerHasta,
    posponerPropuesta,
    proponerPropuesta,
    rechazarPropuesta,
    validarAjustes,
} from "@/lib/mando/imaginacion-servidor";
import type { PropuestaImaginacion } from "@/lib/mando/imaginacion-servidor";

const ITEM_ASTRAURA = { itemId: "c-1", itemType: "creation" };

const propuesta = (aparte: Partial<PropuestaImaginacion> = {}): PropuestaImaginacion => ({
    id: "IM-1",
    fuente: "directores",
    titulo: "Mejora en revisores",
    cuerpo: "cuerpo breve",
    archivos: ["src/lib/mando/revisores.ts"],
    utilidad: 0.7,
    importancia: "media",
    estado: "esperando-aprobacion",
    motivo: "",
    tarea: null,
    t: "2026-10-21T10:00:00.000Z",
    ...aparte,
});

describe("lo puro", () => {
    it("validarAjustes completa los defectos y rechaza lo imposible (§4)", () => {
        expect(validarAjustes({})).toEqual({ ok: true, valor: AJUSTES_DEFECTO });
        expect(validarAjustes({ automatico: "sí" }).ok).toBe(false);
        expect(validarAjustes({ rango: 11 }).ok).toBe(false);
        expect(validarAjustes({ rango: 2.5 }).ok).toBe(false);
        expect(validarAjustes({ profunda: { cada_dias: -1 } }).ok).toBe(false);
        expect(validarAjustes({ horario: { franjas: [{ dias: [], desde: "8:00", hasta: "09:00" }] } }).ok).toBe(false);
        const v = validarAjustes({ automatico: false, rango: 3, fuentes: { astraura: false }, horario: { modo: "franjas", franjas: [{ dias: [6], desde: "22:00", hasta: "23:30" }] }, profunda: { cada_dias: 0 } });
        expect(v.ok).toBe(true);
        if (v.ok) {
            expect(v.valor.automatico).toBe(false);
            expect(v.valor.rango).toBe(3);
            expect(v.valor.fuentes.astraura).toBe(false);
            expect(v.valor.fuentes.diaria).toBe(true);
            expect(v.valor.horario).toMatchObject({ modo: "franjas", repartir: true });
            expect(v.valor.horario.franjas).toEqual([{ dias: [6], desde: "22:00", hasta: "23:30" }]);
            expect(v.valor.profunda.cada_dias).toBe(0);
        }
    });

    it("proponerPropuesta: sin id o fuente no hay propuesta, y aísla rutas absolutas", () => {
        expect(proponerPropuesta({})).toBeNull();
        expect(proponerPropuesta({ id: "X", fuente: "marte" })).toBeNull();
        expect(proponerPropuesta({ id: "X", fuente: "profunda", estado: "inventado", importancia: "fuera", utilidad: 7 })?.estado).toBe("nueva");
        const p = proponerPropuesta({ ...propuesta(), utilidad: 7, archivos: ["/abs/uno.ts"] });
        expect(p?.utilidad).toBe(1);
        expect(p?.archivos[0]).toBe("abs/uno.ts");
        expect(proponerPropuesta(propuesta())?.astraura).toBeUndefined();
    });

    it("necesitaAstraura y posponerHasta: decisiones honestas con el reloj por parámetro", () => {
        expect(necesitaAstraura(propuesta({ fuente: "astraura", astraura: ITEM_ASTRAURA }))).toBe(true);
        expect(necesitaAstraura(propuesta({ fuente: "astraura" }))).toBe(false);
        expect(posponerHasta(0, 24)).toBe("1970-01-02T00:00:00.000Z");
        expect(posponerHasta(0, 9_999)).toBe(posponerHasta(0, 720));
    });
});

describe("acciones sobre una carpeta de verdad", () => {
    let raiz = "";
    let casa = "";
    const propuestaJson = (lista: unknown[]) => {
        mkdirSync(path.join(raiz, "starseed_memory_root", "imaginacion"), { recursive: true });
        writeFileSync(path.join(raiz, "starseed_memory_root", "imaginacion", "propuestas.json"), JSON.stringify(lista));
    };

    beforeAll(() => {
        raiz = mkdtempSync(path.join(tmpdir(), "imaginacion-raiz-"));
        casa = mkdtempSync(path.join(tmpdir(), "imaginacion-casa-"));
    });

    afterAll(() => {
        rmSync(raiz, { recursive: true, force: true });
        rmSync(casa, { recursive: true, force: true });
    });

    it("sin archivo: lista vacía y ajustes de defecto", async () => {
        expect(await leerPropuestas(raiz)).toEqual([]);
        expect(await leerAjustes(casa)).toEqual(AJUSTES_DEFECTO);
    });

    it("aprobar una de Astraura con el backend dormido NO cambia nada", async () => {
        propuestaJson([propuesta({ fuente: "astraura", astraura: ITEM_ASTRAURA })]);
        const r = await aprobarPropuesta("IM-1", { raiz, hace: async () => { throw new Error("caída"); } });
        expect(r.ok).toBe(false);
        expect(r.error).toContain("no responde");
        expect(await leerPropuestas(raiz)).toMatchObject([{ estado: "esperando-aprobacion" }]);
    });

    it("aprobar (directores) marca «aprobada»; y sin id da error honesto", async () => {
        propuestaJson([propuesta()]);
        const r = await aprobarPropuesta("IM-1", { raiz });
        expect(r.ok).toBe(true);
        expect(await leerPropuestas(raiz)).toMatchObject([{ estado: "aprobada" }]);
        expect((await aprobarPropuesta("IM-9", { raiz })).ok).toBe(false);
    });

    it("aprobar una de Astraura con el backend vivo aplica y manda el POST del contrato", async () => {
        propuestaJson([propuesta({ fuente: "astraura", astraura: ITEM_ASTRAURA })]);
        let cuerpo = "";
        const hace = (async (_url: RequestInfo | URL, init?: RequestInit) => {
            cuerpo = String(init?.body ?? "");
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        }) as typeof fetch;
        expect((await aprobarPropuesta("IM-1", { raiz, hace })).ok).toBe(true);
        expect(JSON.parse(cuerpo)).toEqual({ item_id: "c-1", item_type: "creation", action: "apply" });
        expect(await leerPropuestas(raiz)).toMatchObject([{ estado: "aprobada" }]);
    });

    it("rechazar guarda el estado y el motivo; posponer deja la fecha de vuelta", async () => {
        propuestaJson([propuesta()]);
        expect((await rechazarPropuesta("IM-2", "no sirve", raiz)).ok).toBe(false);
        expect((await rechazarPropuesta("IM-1", "no es útil", raiz)).ok).toBe(true);
        expect(await leerPropuestas(raiz)).toMatchObject([{ estado: "rechazada", motivo: "no es útil" }]);
        expect((await posponerPropuesta("IM-1", 9_999, { raiz })).ok).toBe(false);
        const r = await posponerPropuesta("IM-1", 48, { raiz, ahoraMs: 1_000_000 });
        expect(r.ok).toBe(true);
        expect(r.propuesta?.estado).toBe("pospuesta");
        expect(r.propuesta?.hasta).toBe(posponerHasta(1_000_000, 48));
    });
});

describe("ajustes sobre una casa de verdad", () => {
    it("guardarAjustes valida, escribe y leerAjustes devuelve lo mismo", async () => {
        const casa = mkdtempSync(path.join(tmpdir(), "imaginacion-ajustes-"));
        expect((await guardarAjustes({ rango: 99 }, casa)).ok).toBe(false);
        let antes: string | null = null;
        try {
            antes = readFileSync(path.join(casa, ".starseed", "autodesarrollo.json"), "utf-8");
        } catch {
            antes = null;
        }
        expect(antes).toBeNull();
        const r = await guardarAjustes({ automatico: false, rango: 5, profunda: { cada_dias: 3 } }, casa);
        expect(r.ok).toBe(true);
        const leidos = await leerAjustes(casa);
        expect(leidos).toMatchObject({ automatico: false, rango: 5 });
        expect(leidos.profunda.cada_dias).toBe(3);
        expect(leidos.fuentes).toEqual(AJUSTES_DEFECTO.fuentes);
        rmSync(casa, { recursive: true, force: true });
    });
});
