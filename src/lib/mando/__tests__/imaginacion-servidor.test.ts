/**
 * Imaginación en Genesis (Ola 1021I · IMN1021G; Ola 1024I · IMG1024A): contrato
 * `architecture/imaginacion-autodesarrollo.md` §3, §4 y §6 y el de la Ola 1024I, sobre carpetas temporales.
 * Aprobar una de Astraura con el backend dormido NO cambia nada (honestidad radical). Sin red: el fetch
 * al backend 1.58 se inyecta.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AJUSTES_POR_DEFECTO } from "@/lib/mando/imaginacion-tipos";
import {
    aprobar, guardarAjustes, integrar, itemAstraura, leerAjustes, leerPropuestas, lote, normalizarPropuesta,
    posponer, posponerHasta, rechazar, reimaginar, rutasImaginacion,
} from "@/lib/mando/imaginacion-servidor";

const AHORA = new Date("2026-10-23T10:00:00.000Z");
const base = (aparte: Record<string, unknown> = {}) => ({
    id: "directores:T1", fuente: "directores", titulo: "Mejora", cuerpo: "breve", archivos: ["src/a.ts"],
    utilidad: 0.7, importancia: "media", estado: "esperando-aprobacion", motivo: "", t: "2026-10-21T10:00:00Z", ...aparte,
});
const astraura = base({ id: "astraura:c-1", fuente: "astraura", origen: { tipo: "creacion", id: "c-1" } });

let raiz = "";
let casa = "";
const lugar = () => ({ raiz, casa });
const sembrar = (datos: unknown) => {
    mkdirSync(path.dirname(rutasImaginacion(lugar()).propuestas), { recursive: true });
    writeFileSync(rutasImaginacion(lugar()).propuestas, JSON.stringify(datos));
};
const enDisco = () => JSON.parse(readFileSync(rutasImaginacion(lugar()).propuestas, "utf-8")) as unknown;

beforeEach(() => {
    raiz = mkdtempSync(path.join(tmpdir(), "imaginacion-raiz-"));
    casa = mkdtempSync(path.join(tmpdir(), "imaginacion-casa-"));
});
afterEach(() => {
    rmSync(raiz, { recursive: true, force: true });
    rmSync(casa, { recursive: true, force: true });
});

describe("lo puro", () => {
    it("normalizarPropuesta: sin id o fuente válida no hay propuesta, y quita rutas del disco", () => {
        expect(normalizarPropuesta({})).toBeNull();
        expect(normalizarPropuesta({ id: "x", fuente: "toString" })).toBeNull();
        const p = normalizarPropuesta(base({ utilidad: 7, estado: "inventado", archivos: ["/Users/alex/x.ts", "../fuera", "~/y", "src/ok.ts"], origen: { ruta: "/Users/alex" } }));
        expect(p).toMatchObject({ utilidad: 1, estado: "nueva", archivos: ["src/ok.ts"] });
        expect(JSON.stringify(p)).not.toContain("/Users");
    });
    it("normalizarPropuesta lee «critica» sin acento como «crítica» y «encargada» como estado conocido (IMG1024C)", () => {
        expect(normalizarPropuesta(base({ importancia: "critica" }))?.importancia).toBe("crítica");
        expect(normalizarPropuesta(base({ estado: "encargada", tarea: "IMG-T1" }))).toMatchObject({ estado: "encargada", tarea: "IMG-T1" });
        expect(normalizarPropuesta(base({ reimaginacion: { notas: "x", por: "automatica", encolada: "2026-10-24T10:00:00", salida: "/abs/x.json" } }))?.reimaginacion)
            .toEqual({ notas: "x", referencias: [], pedida: "", por: "automatica", encolada: "2026-10-24T10:00:00" });
    });
    it("itemAstraura traduce el tipo del director al del backend; posponerHasta acota a 1–720 h", () => {
        expect(itemAstraura(astraura)).toEqual({ item_id: "c-1", item_type: "creation" });
        expect(itemAstraura(base({ fuente: "astraura" }))).toBeNull();
        expect(posponerHasta(0, 24)).toBe("1970-01-02T00:00:00.000Z");
        expect(posponerHasta(0, 9_999)).toBe(posponerHasta(0, 720));
    });
});

describe("acciones sobre el disco", () => {
    it("sin archivos: lista vacía y ajustes de defecto", async () => {
        expect(await leerPropuestas(lugar())).toEqual([]);
        expect(await leerAjustes(lugar())).toEqual(AJUSTES_POR_DEFECTO);
    });
    it("Astraura con el backend dormido: error honesto y el archivo queda igual", async () => {
        sembrar([astraura]);
        const r = await aprobar("astraura:c-1", { ...lugar(), hace: async () => { throw new Error("caída"); } });
        expect(r).toMatchObject({ ok: false });
        if (!r.ok) expect(r.error).toContain("no responde");
        expect(enDisco()).toEqual([astraura]);
    });
    it("Astraura con el backend vivo: manda el POST del contrato y marca «aprobada»", async () => {
        sembrar([astraura]);
        let url = "";
        let cuerpo = "";
        const hace = (async (u: RequestInfo | URL, init?: RequestInit) => {
            url = String(u); cuerpo = String(init?.body ?? "");
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        }) as typeof fetch;
        expect((await aprobar("astraura:c-1", { ...lugar(), hace, base: "http://127.0.0.1:8000/", ahora: AHORA })).ok).toBe(true);
        expect(url).toBe("http://127.0.0.1:8000/api/imagination/action");
        expect(JSON.parse(cuerpo)).toEqual({ item_id: "c-1", item_type: "creation", action: "apply" });
        expect(enDisco()).toEqual([{ ...astraura, estado: "aprobada", decidida: AHORA.toISOString() }]);
    });
    it("Astraura que responde HTTP 500 o success:false tampoco cambia nada", async () => {
        sembrar([astraura]);
        const r500 = await aprobar("astraura:c-1", { ...lugar(), hace: (async () => new Response("", { status: 500 })) as typeof fetch });
        const rNo = await aprobar("astraura:c-1", { ...lugar(), hace: (async () => Response.json({ success: false, error: "ya aplicada" })) as typeof fetch });
        expect([r500.ok, rNo.ok]).toEqual([false, false]);
        expect(enDisco()).toEqual([astraura]);
    });
    it("aprobar de directores conserva la forma {propuestas} y los campos del director", async () => {
        sembrar({ version: 1, propuestas: [base({ cita: "x" })] });
        expect((await aprobar("directores:T1", lugar())).ok).toBe(true);
        expect(enDisco()).toMatchObject({ version: 1, propuestas: [{ estado: "aprobada", cita: "x" }] });
        expect((await aprobar("nada", lugar())).ok).toBe(false);
    });
    it("no se decide dos veces lo ya decidido", async () => {
        sembrar([base({ estado: "autodesarrollo" })]);
        expect((await rechazar("directores:T1", "", lugar())).ok).toBe(false);
    });
    it("rechazar guarda el motivo; posponer deja la vuelta y aprobar después la quita", async () => {
        sembrar([base()]);
        expect((await posponer("directores:T1", 0, lugar())).ok).toBe(false);
        const r = await posponer("directores:T1", 48, { ...lugar(), ahora: AHORA });
        expect(r.ok && r.propuesta).toMatchObject({ estado: "pospuesta", hasta: "2026-10-25T10:00:00.000Z" });
        expect((await aprobar("directores:T1", lugar())).ok).toBe(true);
        expect((await leerPropuestas(lugar()))[0].hasta).toBeUndefined();
        sembrar([base()]);
        expect((await rechazar("directores:T1", "no es útil", lugar())).ok).toBe(true);
        expect(await leerPropuestas(lugar())).toMatchObject([{ estado: "rechazada", motivo: "no es útil" }]);
    });
    it("guardarAjustes une con lo guardado y valida: lo inválido vuelve al defecto", async () => {
        await guardarAjustes({ automatico: false, rango: { min: 1, max: 4 } }, lugar());
        const a = await guardarAjustes({ profunda: { cada_dias: 3 }, rango: { min: 0, max: 99 } }, lugar());
        expect(a).toMatchObject({ automatico: false, rango: { min: 0, max: 10 }, profunda: { cada_dias: 3 } });
        expect(await leerAjustes(lugar())).toEqual(a);
    });
});

describe("Ola 1024I · propuestas libres, reimaginar, lote y automático", () => {
    const vieja = base({ id: "vieja" }); // forma de la Ola 1021I: sin ningún campo nuevo
    const agente = base({
        id: "agentes:ref-1", fuente: "agentes", agente: "referencias-diseno", tipo: "diseno", ambito: "grupo:diseno",
        cuerpo: `# Paleta\n\n${"x".repeat(9000)}`, version: 2, version_de: "agentes:ref-0",
        referencias: [{ titulo: "Are.na", url: "https://www.are.na/canal" }, { titulo: "inseguro", url: "http://no.org" }, "file:///etc/passwd"],
    });
    const enDiscoLista = () => enDisco() as Record<string, unknown>[];
    const porId = (id: string) => enDiscoLista().find((d) => d.id === id) as Record<string, unknown>;

    it("retrocompatible: una propuesta vieja sale con los defectos y el disco no se toca al leer", async () => {
        sembrar([vieja]);
        const [p] = await leerPropuestas(lugar());
        expect(p).toMatchObject({ id: "vieja", tipo: "codigo", ambito: "metagenesis", referencias: [], version: 1 });
        expect(p.agente).toBeUndefined();
        expect(p.reimaginacion).toBeUndefined();
        expect(enDisco()).toEqual([vieja]);
    });
    it("normalizarPropuesta: formato libre hasta 8000 y solo referencias https", () => {
        const p = normalizarPropuesta(agente);
        expect(p?.cuerpo).toHaveLength(8000);
        expect(p?.cuerpo.startsWith("# Paleta")).toBe(true);
        expect(p).toMatchObject({ fuente: "agentes", agente: "referencias-diseno", tipo: "diseno", ambito: "grupo:diseno", version: 2, version_de: "agentes:ref-0" });
        expect(p?.referencias).toEqual([{ titulo: "Are.na", url: "https://www.are.na/canal" }]);
        expect(normalizarPropuesta(base({ tipo: "inventado", ambito: "../x", version: 0 }))).toMatchObject({ tipo: "codigo", ambito: "metagenesis", version: 1 });
    });
    it("reimaginar sin notas ni referencias válidas → error honesto y nada cambia", async () => {
        sembrar([vieja]);
        const r = await reimaginar("vieja", "   ", ["http://no.org", "ftp://x"], "alex", lugar());
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toContain("reimaginar");
        expect(enDisco()).toEqual([vieja]);
    });
    it("reimaginar con notas y referencias → «reimaginando» con lo pedido (las no https se descartan)", async () => {
        sembrar([vieja]);
        const r = await reimaginar("vieja", " más contraste ", [{ titulo: "Ref", url: "https://ref.org/a" }, { url: "http://no.org" }], "alex", { ...lugar(), ahora: AHORA });
        expect(r.ok && r.propuesta).toMatchObject({ estado: "reimaginando", reimaginacion: { notas: "más contraste", referencias: [{ titulo: "Ref", url: "https://ref.org/a" }], pedida: AHORA.toISOString(), por: "alex" } });
        expect(porId("vieja")).toMatchObject({ estado: "reimaginando", decidida: AHORA.toISOString(), titulo: "Mejora" });
        expect((await reimaginar("vieja", "otra vez", [], "alex", lugar())).ok).toBe(false); // ya no espera decisión
    });
    it("integrar es aprobar, y rescata una descartada o una nueva", async () => {
        sembrar([base({ id: "d", estado: "descartada" }), base({ id: "n", estado: "nueva" })]);
        expect(integrar).toBe(aprobar);
        expect((await integrar("d", lugar())).ok).toBe(true);
        expect((await integrar("n", lugar())).ok).toBe(true);
        expect(enDiscoLista().map((d) => d.estado)).toEqual(["aprobada", "aprobada"]);
    });
    it("lote con ids válidos, ya decididos e inexistentes: uno por uno, sin parar al primer error, y una sola escritura", async () => {
        sembrar({ version: 1, propuestas: [base({ id: "a" }), base({ id: "b", estado: "hecha" }), base({ id: "c", estado: "pregunta", cita: "x" })] });
        const r = await lote(["a", "no-existe", "b", "c", "a"], "rechazar", { motivo: "no encaja" }, { ...lugar(), ahora: AHORA });
        expect(r.ok).toBe(false);
        expect(r.resultados).toEqual([
            { id: "a", ok: true },
            { id: "no-existe", ok: false, error: "No existe esa propuesta." },
            { id: "b", ok: false, error: expect.stringContaining("«hecha»") },
            { id: "c", ok: true },
        ]);
        expect(enDisco()).toMatchObject({ version: 1, propuestas: [{ id: "a", estado: "rechazada", motivo: "no encaja" }, { id: "b", estado: "hecha" }, { id: "c", estado: "rechazada", cita: "x" }] });
        const sobras = readdirSync(path.dirname(rutasImaginacion(lugar()).propuestas)).filter((n) => n.includes(".tmp-"));
        expect(sobras).toEqual([]);
    });
    it("lote sin nada que cambiar no escribe; sin ids es un error", async () => {
        sembrar([base({ id: "h", estado: "hecha" })]);
        const antes = statSync(rutasImaginacion(lugar()).propuestas).mtimeMs;
        expect((await lote(["h"], "integrar", {}, lugar())).resultados[0].ok).toBe(false);
        expect(statSync(rutasImaginacion(lugar()).propuestas).mtimeMs).toBe(antes);
        expect(await lote([], "integrar", {}, lugar())).toMatchObject({ ok: false, error: "El lote no trae ids." });
    });
    it("«pendientes» por ámbito: solo las decidibles de ese ámbito (nueva y descartada incluidas)", async () => {
        sembrar([
            base({ id: "m1" }), base({ id: "g1", ambito: "grupo:g" }), base({ id: "g2", ambito: "grupo:g", estado: "nueva" }),
            base({ id: "g3", ambito: "grupo:g", estado: "descartada" }), base({ id: "g4", ambito: "grupo:g", estado: "aprobada" }),
            base({ id: "g5", ambito: "grupo:g", estado: "reimaginando" }),
        ]);
        const r = await lote("pendientes", "rechazar", {}, { ...lugar(), ambito: "grupo:g" });
        expect(r).toEqual({ ok: true, resultados: [{ id: "g1", ok: true }, { id: "g2", ok: true }, { id: "g3", ok: true }] });
        expect(enDiscoLista().map((d) => `${d.id}:${d.estado}`)).toEqual(["m1:esperando-aprobacion", "g1:rechazada", "g2:rechazada", "g3:rechazada", "g4:aprobada", "g5:reimaginando"]);
        expect((await lote(["m1"], "rechazar", {}, { ...lugar(), ambito: "grupo:g" })).resultados[0]).toMatchObject({ ok: false, error: "Esa propuesta es de otro ámbito." });
        expect(await lote("pendientes", "rechazar", {}, { ...lugar(), ambito: "raro" })).toMatchObject({ ok: false, error: expect.stringContaining("Ámbito") });
        expect(await lote("pendientes", "rechazar", {}, { ...lugar(), ambito: "personal" })).toEqual({ ok: true, resultados: [] });
    });
    it("lote reimaginar sin notas: error de todo el lote y nada cambia", async () => {
        sembrar([base({ id: "a" })]);
        expect(await lote("pendientes", "reimaginar", { notas: "" }, lugar())).toMatchObject({ ok: false, resultados: [], error: expect.stringContaining("reimaginar") });
        expect(enDisco()).toEqual([base({ id: "a" })]);
    });
    it("la automática NUNCA integra alta ni crítica por lote; lo bajo/medio sobre el umbral sí", async () => {
        await guardarAjustes({ auto: { aprobar: true, umbral: 0.6 } }, lugar());
        sembrar([
            base({ id: "baja", importancia: "baja", utilidad: 0.9 }), base({ id: "alta", importancia: "alta", utilidad: 1 }),
            base({ id: "crit", importancia: "crítica", utilidad: 1 }), base({ id: "floja", importancia: "media", utilidad: 0.3 }),
        ]);
        const r = await lote("pendientes", "integrar", {}, { ...lugar(), por: "automatica" });
        expect(r.resultados.map((x) => [x.id, x.ok])).toEqual([["baja", true], ["alta", false], ["crit", false], ["floja", false]]);
        expect(r.resultados[1].error).toContain("nunca la integra");
        expect(enDiscoLista().map((d) => d.estado)).toEqual(["aprobada", "esperando-aprobacion", "esperando-aprobacion", "esperando-aprobacion"]);
        // Alex sí puede integrar la alta en el mismo lote de después.
        expect((await lote(["alta"], "integrar", {}, lugar())).ok).toBe(true);
    });
    it("la automática con su interruptor apagado no integra nada; y reimagina solo con reimaginaciones libres", async () => {
        sembrar([base({ id: "a", importancia: "baja", utilidad: 1 }), base({ id: "v3", version: 3 }), base({ id: "v1" })]);
        expect((await aprobar("a", { ...lugar(), por: "automatica" })).ok).toBe(false);
        await guardarAjustes({ auto: { reimaginar: true, max_reimaginaciones: 2 } }, lugar());
        const r = await lote(["v3", "v1"], "reimaginar", { notas: "la crítica del director" }, { ...lugar(), por: "automatica", ahora: AHORA });
        expect(r.resultados.map((x) => x.ok)).toEqual([false, true]);
        expect(porId("v1")).toMatchObject({ estado: "reimaginando", reimaginacion: { por: "automatica", notas: "la crítica del director" } });
        expect(porId("v3").estado).toBe("esperando-aprobacion");
    });
    it("lote integrar con una de Astraura y el backend dormido: esa no cambia, las demás sí", async () => {
        sembrar([astraura, base({ id: "d1" })]);
        const r = await lote(["astraura:c-1", "d1"], "integrar", {}, { ...lugar(), hace: async () => { throw new Error("caída"); } });
        expect(r.resultados).toEqual([{ id: "astraura:c-1", ok: false, error: expect.stringContaining("no responde") }, { id: "d1", ok: true }]);
        expect(enDiscoLista()[0]).toEqual(astraura);
        expect(enDiscoLista()[1].estado).toBe("aprobada");
    });
    it("guardarAjustes une `auto` campo a campo: encender aprobar no borra el umbral", async () => {
        await guardarAjustes({ auto: { umbral: 0.9, max_reimaginaciones: 4 } }, lugar());
        const a = await guardarAjustes({ auto: { aprobar: true } }, lugar());
        expect(a.auto).toEqual({ aprobar: true, reimaginar: false, umbral: 0.9, max_reimaginaciones: 4 });
        expect(await leerAjustes(lugar())).toEqual(a);
    });
});
