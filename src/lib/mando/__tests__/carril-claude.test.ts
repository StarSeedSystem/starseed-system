import { describe, expect, it } from "vitest";

import { agentesDeCarrilClaude, DONDE_CARRIL_CLAUDE, duracionCorta, leerRegistroCarril, limpiarTexto, vistaCarril } from "../carril-claude";
import { detalleDeMedidor, dondeCorto, dondeLegible, type DatosMedidores } from "../medidores";

const AHORA = Date.parse("2026-11-11T07:30:00Z");
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();

/** La forma real del registro (`relevo_carril_claude_logica.py`), con prompt y archivos que NO deben salir. */
const registro = (latidoMin: number | null, extra: Record<string, unknown>[] = []) => ({
    ...(latidoMin === null ? {} : { latido: hace(latidoMin) }),
    tareas: [
        { id: "PRO1026P3", ola: "1026P", titulo: "Protomolécula · motor", prompt: "SECRETO", archivos: ["/Users/alex/a.ts"], estado: "hecha", desde: hace(900), cerrada: hace(60) },
        { id: "MED1111E", ola: "1111", titulo: "Medidores de Genesis: que se vean los procesos", prompt: "Haz lo del /Users/alex/x", archivos: ["src/a.ts"], capacidad: "alta", estado: "en_curso", desde: hace(20) },
        { id: "VER1111F", ola: "1111", titulo: "Centro de Versiones", prompt: "p", archivos: [], estado: "en_curso", desde: hace(20) },
        { id: "LLA1111H", ola: "1111", titulo: "Llamadas, remates", prompt: "p", archivos: [], estado: "pendiente", desde: hace(20) },
        ...extra,
    ],
});

describe("leerRegistroCarril", () => {
    it("quita prompt, archivos y rutas: lo que sale puede viajar", () => {
        const l = leerRegistroCarril(registro(5))!;
        const texto = JSON.stringify(l);
        expect(texto).not.toContain("SECRETO");
        expect(texto).not.toContain("prompt");
        expect(texto).not.toContain("archivos");
        expect(texto).not.toContain("/Users");
        expect(l.tareas.map((t) => t.id)).toEqual(["MED1111E", "VER1111F", "LLA1111H", "PRO1026P3"]);
        expect(l.tareas.find((t) => t.id === "MED1111E")!.desdeMs).toBe(AHORA - 20 * 60_000);
    });
    it("una ruta en un título se tacha", () => {
        expect(limpiarTexto("arregla /Users/alex/Documents/x.ts ya", 100)).toBe("arregla [ruta] ya");
        expect(limpiarTexto("en C:\\Users\\alex\\x", 100)).toBe("en [ruta]");
    });
    it("ids raros, estados desconocidos y basura se descartan; sin estado es en_curso como en Python", () => {
        const l = leerRegistroCarril({ latido: hace(1), tareas: [{ id: "con espacios", estado: "en_curso" }, { id: "OK1", estado: "inventado" }, { id: "OK2" }, null, 3] })!;
        expect(l.tareas.map((t) => t.id)).toEqual(["OK2"]);
        expect(l.tareas[0].estado).toBe("en_curso");
        expect(leerRegistroCarril(null)).toBeNull();
        expect(leerRegistroCarril("x")).toBeNull();
        expect(leerRegistroCarril({})).toEqual({ latidoMs: null, tareas: [] });
    });
    it("conserva solo las tres últimas cerradas", () => {
        const cerradas = Array.from({ length: 6 }, (_, i) => ({ id: `H${i}`, titulo: "t", estado: "hecha" }));
        expect(leerRegistroCarril({ latido: hace(1), tareas: cerradas })!.tareas.map((t) => t.id)).toEqual(["H3", "H4", "H5"]);
    });
});

describe("vistaCarril", () => {
    it("con latido fresco las en_curso son agentes vivos con sus minutos; las pendientes son cola, nunca agentes", () => {
        const v = vistaCarril(leerRegistroCarril(registro(5)), AHORA);
        expect(v.estado).toBe("vivo");
        expect(v.agentes.map((a) => [a.id, a.minutos])).toEqual([["MED1111E", 20], ["VER1111F", 20]]);
        expect(v.enCola.map((t) => t.id)).toEqual(["LLA1111H"]);
        expect(v.latidoHaceMin).toBe(5);
        expect(v.texto).toContain("2 agentes en curso");
        expect(v.texto).toContain("1 en cola");
        expect(v.ultimaCerrada).toMatchObject({ id: "PRO1026P3" });
    });
    it("con el latido viejo (más de 45 min) NO hay agentes vivos: se dice «sin latido desde hace N min»", () => {
        const v = vistaCarril(leerRegistroCarril(registro(46)), AHORA);
        expect(v.estado).toBe("sin-latido");
        expect(v.agentes).toEqual([]);
        expect(v.sinLatido.map((a) => a.id)).toEqual(["MED1111E", "VER1111F"]);
        expect(v.texto).toContain("sin latido desde hace 46 min");
        expect(v.texto).toContain("2 en curso no cuentan como vivas");
    });
    it("justo en 45 min sigue vivo, en 46 no", () => {
        expect(vistaCarril(leerRegistroCarril(registro(45)), AHORA).estado).toBe("vivo");
        expect(vistaCarril(leerRegistroCarril(registro(46)), AHORA).estado).toBe("sin-latido");
    });
    it("sin latido registrado, tampoco cuentan", () => {
        const v = vistaCarril(leerRegistroCarril(registro(null)), AHORA);
        expect(v.estado).toBe("sin-latido");
        expect(v.texto).toContain("sin latido registrado");
    });
    it("sin tareas abiertas: vacío; sin archivo: sin registro", () => {
        expect(vistaCarril(leerRegistroCarril({ latido: hace(1), tareas: [{ id: "A", estado: "hecha" }] }), AHORA).estado).toBe("vacio");
        expect(vistaCarril(null, AHORA).estado).toBe("sin-registro");
    });
    it("solo pendientes con latido fresco: carril vivo, cero agentes", () => {
        const v = vistaCarril(leerRegistroCarril({ latido: hace(1), tareas: [{ id: "P", titulo: "t", estado: "pendiente" }] }), AHORA);
        expect(v.estado).toBe("vivo");
        expect(v.agentes).toEqual([]);
        expect(v.texto).toContain("0 agentes en curso");
    });
    it("duracionCorta", () => {
        expect(duracionCorta(7)).toBe("7 min");
        expect(duracionCorta(185)).toBe("3 h 05 min");
        expect(duracionCorta(60 * 60)).toBe("2 d");
        expect(duracionCorta(-1)).toBe("—");
    });
});

describe("agentesDeCarrilClaude y el medidor «Agentes»", () => {
    it("un latido por en_curso, solo con el carril vivo", () => {
        const vivos = agentesDeCarrilClaude(leerRegistroCarril(registro(5)), AHORA);
        expect(vivos).toHaveLength(2);
        expect(vivos[0]).toMatchObject({ tarea: "MED1111E", donde: DONDE_CARRIL_CLAUDE, fase: "escribiendo", minutos: 20 });
        expect(agentesDeCarrilClaude(leerRegistroCarril(registro(60)), AHORA)).toEqual([]);
        expect(agentesDeCarrilClaude(null, AHORA)).toEqual([]);
    });
    const base = (lat: unknown[], enMarcha: DatosMedidores["enMarcha"]): Partial<DatosMedidores> => ({
        progreso: {}, titulos: { MED1111E: "Medidores de Genesis" }, latidos: lat as DatosMedidores["latidos"], escritores: {}, fantasmas: [], ejecutables: [], fila: [], enMarcha,
    });
    it("el medidor los cuenta con id, título, minutos y dónde corren", () => {
        const l = leerRegistroCarril(registro(5));
        const lat = agentesDeCarrilClaude(l, AHORA);
        const d = detalleDeMedidor("agentes", base(lat, { generadoMs: AHORA, carril: l, puerta: null }), AHORA);
        expect(d.filas).toHaveLength(2);
        const f = d.filas.find((x) => x.id.startsWith("MED1111E"))!;
        expect(f.id).toContain("carril de Claude");
        expect(f.id).toContain("20 min");
        expect(f.titulo).toBe("Medidores de Genesis");
        expect(f.estado).toBe("escribiendo");
        expect(f.porque).toContain("carril del director de Claude");
        expect(d.resumen).toContain("2 en total");
        expect(d.aviso).toBeUndefined();
    });
    it("con el latido viejo el medidor no los cuenta y lo dice en el aviso", () => {
        const l = leerRegistroCarril(registro(90));
        const d = detalleDeMedidor("agentes", base(agentesDeCarrilClaude(l, AHORA), { generadoMs: AHORA, carril: l, puerta: null }), AHORA);
        expect(d.filas).toHaveLength(0);
        expect(d.resumen).toContain("ningún agente trabajando");
        expect(d.aviso).toContain("sin latido desde hace 1 h 30 min");
        expect(d.aviso).toContain("MED1111E, VER1111F");
    });
    it("los nombres del medio", () => {
        expect(dondeLegible(DONDE_CARRIL_CLAUDE)).toContain("Carril del director de Claude");
        expect(dondeCorto(DONDE_CARRIL_CLAUDE)).toBe("carril de Claude");
    });
});
