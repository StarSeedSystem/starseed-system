import { describe, expect, it } from "vitest";
import { mundoDesdePlantilla } from "@/lib/vivo/xr-mundo";
import type { MundoSpec } from "@/lib/xr/mundo-tipos";
import type { Intencion, PasoVoz } from "@/lib/xr/intenciones-tipos";
import { ejecutarMundo, type ContextoMundo } from "../ejecutor-mundo";

const paso = (intencion: Intencion): PasoVoz => ({ intencion, capa: "reflejo" });
const crear = (extra: Partial<Extract<Intencion, { tipo: "crear-mundo" }>> = {}): Intencion =>
    ({ tipo: "crear-mundo", descripcion: "", caracteristicas: [], modo: "vr", libre: false, ...extra });
const objeto = (i: number): MundoSpec["objetos"][number] => ({
    id: `o${i}`, nombre: `o${i}`, fuente: { tipo: "primitiva", forma: "caja" }, pos: [0, 1, 0],
    rot: [0, 0, 0], esc: [1, 1, 1], color: "#ffffff", prioridad: 0,
});
const grande = (): MundoSpec => ({ ...mundoDesdePlantilla("grande"), objetos: Array.from({ length: 45 }, (_, i) => objeto(i)) });
function montar(over: Partial<ContextoMundo> = {}) {
    const guardados: { refId: string; mundo: MundoSpec }[] = [];
    const deshechos: string[] = [];
    const prompts: string[] = [];
    const ctx: ContextoMundo = {
        nivel: "media",
        razonar: async (p) => {
            prompts.push(p);
            return JSON.stringify(mundoDesdePlantilla("bosque", ["noche"]));
        },
        crear: async () => ({ refId: "r1", ruta: "/sala-xr/r1" }),
        guardar: async (refId, mundo) => { guardados.push({ refId, mundo }); },
        deshacerCreacion: async (refId) => { deshechos.push(refId); },
        ...over,
    };
    return { ctx, guardados, deshechos, prompts };
}

describe("ejecutor de mundo", () => {
    it("crea con plantilla sin red y guarda en la misma sala", async () => {
        const { ctx, guardados } = montar();
        const r = await ejecutarMundo(paso(crear()), ctx);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.refId).toBe("r1");
        expect(guardados).toHaveLength(1);
        expect(guardados[0].mundo.fisica.gravedad).toBe(-9.81);
    });
    it("crea libre con la razón devolviendo JSON válido", async () => {
        const { ctx, guardados, prompts } = montar();
        const r = await ejecutarMundo(paso(crear({ descripcion: "bosque", libre: true })), ctx);
        expect(r.ok).toBe(true);
        expect(prompts).toHaveLength(1);
        expect(guardados[0].mundo.entorno.cielo).toBe("noche");
    });
    it("con JSON inválido reintenta una vez y arregla", async () => {
        let n = 0;
        const { ctx, guardados } = montar({ razonar: async () => (++n === 1 ? "no es json" : JSON.stringify(mundoDesdePlantilla("bosque"))) });
        const r = await ejecutarMundo(paso(crear({ descripcion: "bosque", libre: true })), ctx);
        expect(r.ok).toBe(true);
        expect(n).toBe(2);
        expect(guardados).toHaveLength(1);
    });
    it("con JSON inválido dos veces falla sin guardar nada", async () => {
        let n = 0;
        const { ctx, guardados } = montar({ razonar: async () => { n++; return "{}"; } });
        const r = await ejecutarMundo(paso(crear({ descripcion: "bosque", libre: true })), ctx);
        expect(r.ok).toBe(false);
        expect(n).toBe(2);
        expect(guardados).toHaveLength(0);
    });
    it("edita el cielo de lo creado", async () => {
        const { ctx, guardados } = montar({ creado: { refId: "r1", mundo: mundoDesdePlantilla("base") } });
        const r = await ejecutarMundo(paso({ tipo: "editar-mundo", campo: "cielo", valor: "noche", sobre: "lo-creado" }), ctx);
        expect(r.ok).toBe(true);
        expect(guardados[0].mundo.entorno.cielo).toBe("noche");
    });
    it("edita la gravedad a cero", async () => {
        const { ctx, guardados } = montar({ mundoActual: { refId: "r1", mundo: mundoDesdePlantilla("base") } });
        const r = await ejecutarMundo(paso({ tipo: "editar-mundo", campo: "gravedad", valor: "cero", sobre: "mundo-actual" }), ctx);
        expect(r.ok).toBe(true);
        expect(guardados[0].mundo.fisica.gravedad).toBe(0);
    });
    it("la plantilla entiende «gravedad cero» y «cielo de noche»", () => {
        const m = mundoDesdePlantilla("un cielo de noche", ["gravedad cero"]);
        expect(m.fisica.gravedad).toBe(0);
        expect(m.entorno.cielo).toBe("noche");
    });
    it("deshacer llama a deshacerCreacionEscena", async () => {
        const { ctx, deshechos } = montar();
        const r = await ejecutarMundo(paso(crear()), ctx);
        if (r.ok) await r.deshacer();
        expect(deshechos).toEqual(["r1"]);
    });
    it("un mundo mayor que el nivel se recorta y lo dice", async () => {
        const { ctx } = montar({ nivel: "minima", razonar: async () => JSON.stringify(grande()) });
        const r = await ejecutarMundo(paso(crear({ descripcion: "grande", libre: true })), ctx);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.resumen).toContain("objetos");
    });
    it("ir-a devuelve la ruta sin ejecutar nada fuera", async () => {
        const { ctx } = montar();
        const r = await ejecutarMundo(paso({ tipo: "ir-a", destino: { tipo: "estacion", id: "e1", nombre: "Cumbre" } }), ctx);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.ruta).toBe("/estaciones/e1");
    });
    it("abrir pizarra devuelve su ruta", async () => {
        const { ctx } = montar();
        const r = await ejecutarMundo(paso({ tipo: "abrir", que: "pizarra", con: [] }), ctx);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.ruta).toBe("/pizarra");
    });
    it("abrir llamada devuelve la ruta de llamada", async () => {
        const { ctx } = montar();
        const r = await ejecutarMundo(paso({ tipo: "abrir", que: "llamada", con: [] }), ctx);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.ruta).toBe("/llamada");
    });
});
