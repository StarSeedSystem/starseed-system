/**
 * RST1116A · del lado del aparato controlado: la petición de fuente («proyeccion») llega a lo nativo y
 * lo que se devuelve es la fuente REAL que contestó el aparato, nunca la pedida. Si el aparato no la
 * ofrece, la sesión sigue con lo que haya y el resultado lo dice con `fuente_pedida`.
 */
import { describe, expect, it } from "vitest";
import { OrigenPantalla, type DepsOrigen, type Pintor, type SesionViva } from "../pantalla-origen";
import type { RespuestaOrden } from "../orden";

const SESION: SesionViva = { token: "a".repeat(32), de: "h".repeat(64), nivel: "controlar" };
const ctx = { sobre: { v: 1, carga: "c", firma: "f" }, sesion: { token: SESION.token, nivel: "controlar" } };
const accesibilidad = { ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 };
const proyeccion = { ok: true, fuente: "proyeccion", ancho: 1280, alto: 800, giro: 0 };

type RespuestaIniciar = (args: Record<string, unknown>) => unknown;

function mundo(porFuente: RespuestaIniciar) {
    const llamadas: { cmd: string; args?: Record<string, unknown> }[] = [];
    const pintor: Pintor = { async pintar() { return true; }, pista: () => ({}), flujo: () => ({}), liberar() {} };
    const origen = new OrigenPantalla({
        invocar: async (cmd, args) => {
            llamadas.push({ cmd, args });
            if (cmd === "control_pantalla_iniciar") return porFuente(args ?? {});
            if (cmd === "control_pantalla_cuadro") return new Uint8Array(0);
            if (cmd === "control_capacidades") return { pantalla: { accesibilidad: true, proyeccion: false, fuente_activa: "accesibilidad" } };
            return { ok: true };
        },
        iceServers: async () => [],
        crearPeer: () => { throw new Error("sin peer"); },
        crearPintor: () => pintor,
        sesionViva: () => SESION,
        recibirSobre: async () => ({ tipo: "respuesta", nonce: "", ok: true, motivo: "ok" }) as RespuestaOrden,
        esperar: (ms) => new Promise<void>((r) => setTimeout(r, Math.min(ms, 2))),
        ahora: () => 1_000_000,
        anotar: () => undefined,
    } satisfies DepsOrigen);
    const fuentes = () => llamadas.filter((l) => l.cmd === "control_pantalla_iniciar").map((l) => l.args?.fuente);
    return { origen, llamadas, fuentes };
}

const porAutoYProyeccion = (auto: unknown, fluida: unknown): RespuestaIniciar => (a) => (a.fuente === "proyeccion" ? fluida : auto);

describe("RST1116A · la petición de fuente llega a lo nativo", () => {
    it("con «proyeccion» el invocador recibe la petición; sin ella no se pide proyección", async () => {
        const pide = mundo(porAutoYProyeccion(accesibilidad, accesibilidad));
        await pide.origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx);
        expect(pide.fuentes()).toEqual(["auto", "proyeccion"]);
        await pide.origen.parar("fin");

        const sin = mundo(porAutoYProyeccion(proyeccion, proyeccion));
        await sin.origen.ejecutar("pantalla-iniciar", {}, ctx);
        // El arranque sigue pidiendo «auto» (CTL1118F: imagen ya); sin petición explícita no se manda «proyeccion».
        expect(sin.fuentes()).toEqual(["auto"]);
        await sin.origen.parar("fin");
    });
});

describe("RST1116A · se devuelve la fuente REAL que contestó el aparato", () => {
    it("si contesta accesibilidad, el resultado lo dice y añade la pedida", async () => {
        const m = mundo(porAutoYProyeccion(accesibilidad, accesibilidad));
        const r = await m.origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx);
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad", fuente_pedida: "proyeccion" });
        expect(m.origen.enMarcha()).toBe(true);
        expect(m.llamadas.filter((l) => l.cmd === "control_pantalla_parar")).toHaveLength(0);
        await m.origen.parar("fin");
    });

    it("si contesta proyeccion, el resultado dice proyeccion", async () => {
        const m = mundo(porAutoYProyeccion(accesibilidad, proyeccion));
        const r = await m.origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx);
        expect(r).toMatchObject({ ok: true, fuente: "proyeccion", fuente_pedida: "proyeccion" });
        await m.origen.parar("fin");
    });

    it("si el aparato no la ofrece, la sesión sigue con lo que haya (no se cierra)", async () => {
        const m = mundo(porAutoYProyeccion(accesibilidad, { ok: false, motivo: "sin-consentimiento" }));
        const r = await m.origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx);
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad", fuente_pedida: "proyeccion" });
        expect(m.origen.enMarcha()).toBe(true);
        expect(m.llamadas.filter((l) => l.cmd === "control_pantalla_parar")).toHaveLength(0);
        await m.origen.parar("fin");
    });

    it("sin pedir proyección, el resultado no lleva fuente_pedida", async () => {
        const m = mundo(porAutoYProyeccion(proyeccion, proyeccion));
        const r = await m.origen.ejecutar("pantalla-iniciar", {}, ctx);
        expect(r).toMatchObject({ ok: true, fuente: "proyeccion" });
        expect(r).not.toHaveProperty("fuente_pedida");
        await m.origen.parar("fin");
    });
});
