/**
 * RST1116A · el aparato controlado recibe la fuente PEDIDA y devuelve la fuente REAL que contestó.
 * Con `invocar` simulado: se mira lo que viaja a `control_pantalla_iniciar` y lo que se enseña.
 *
 * Nota para el orquestador: `pantalla-origen.test.ts` y `ctl1118f-fluida.test.ts` todavía afirman
 * que el arranque manda `fuente:"auto"`; este contrato lo sustituye (sin fuente no se manda el campo).
 */
import { describe, expect, it } from "vitest";
import { OrigenPantalla, type DepsOrigen, type Pintor, type SesionViva } from "../pantalla-origen";
import type { RespuestaOrden } from "../orden";

const SESION: SesionViva = { token: "a".repeat(32), de: "h".repeat(64), nivel: "ver" };
const ctx = () => ({ sobre: { v: 1, carga: "c", firma: "f" }, sesion: { token: SESION.token, nivel: "ver" } });

function montar(respuesta: Record<string, unknown>) {
    const llamadas: { cmd: string; args?: Record<string, unknown> }[] = [];
    const pintor: Pintor = {
        async pintar() { return true; },
        pista() { return {}; },
        flujo() { return {}; },
        liberar() { /* nada */ },
    };
    const origen = new OrigenPantalla({
        invocar: async (cmd, args) => {
            llamadas.push({ cmd, args });
            if (cmd === "control_pantalla_iniciar") return respuesta;
            if (cmd === "control_pantalla_cuadro") return new Uint8Array(0);
            if (cmd === "control_capacidades") return { pantalla: { accesibilidad: true, proyeccion: false } };
            return null;
        },
        iceServers: async () => [],
        crearPeer: () => { throw new Error("sin peer"); },
        crearPintor: () => pintor,
        sesionViva: () => SESION,
        recibirSobre: async () => ({ tipo: "respuesta", nonce: "", ok: true, motivo: "ok" }) as RespuestaOrden,
        esperar: async (ms) => new Promise<void>((r) => setTimeout(r, Math.min(ms, 3))),
        ahora: () => 1,
        anotar: () => undefined,
    } satisfies DepsOrigen);
    return { origen, llamadas };
}

const iniciar = (llamadas: { cmd: string; args?: Record<string, unknown> }[]) => llamadas.find((l) => l.cmd === "control_pantalla_iniciar");

describe("RST1116A · la fuente pedida llega a lo nativo", () => {
    it("con «proyeccion» el invocador recibe fuente:proyeccion", async () => {
        const { origen, llamadas } = montar({ ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 });
        await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx());
        expect(iniciar(llamadas)!.args).toMatchObject({ sesion: SESION.token, fuente: "proyeccion" });
        await origen.parar("fin");
    });

    it("sin fuente (o con «auto») el invocador no recibe el campo", async () => {
        for (const args of [{}, { fuente: "auto" }]) {
            const { origen, llamadas } = montar({ ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 });
            await origen.ejecutar("pantalla-iniciar", args, ctx());
            expect(iniciar(llamadas)!.args).not.toHaveProperty("fuente");
            await origen.parar("fin");
        }
    });
});

describe("RST1116A · se devuelve la fuente REAL, no la pedida", () => {
    it("si lo nativo contesta accesibilidad, la sesión sigue y el resultado lleva la pedida", async () => {
        const { origen } = montar({ ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 });
        const r = (await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad", fuente_pedida: "proyeccion" });
        expect(origen.enMarcha()).toBe(true);
        await origen.parar("fin");
    });

    it("si lo nativo contesta proyección, el resultado dice proyección y no hay aviso de fuente pedida", async () => {
        const { origen } = montar({ ok: true, fuente: "proyeccion", ancho: 1280, alto: 798, giro: 0 });
        const r = (await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        expect(r).toMatchObject({ ok: true, fuente: "proyeccion" });
        expect(r).not.toHaveProperty("fuente_pedida");
        await origen.parar("fin");
    });
});
