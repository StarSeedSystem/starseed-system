/**
 * RST06 (RST1116A) · lado del aparato controlado: la fuente pedida viaja a lo nativo, pero lo que se
 * devuelve es SIEMPRE la fuente real que contestó el aparato. Si pidió proyección y no la dio, la sesión
 * sigue con lo que haya y el resultado lleva `fuente_pedida` para que quien manda pueda avisar.
 */
import { describe, expect, it } from "vitest";
import { OrigenPantalla, type DepsOrigen, type PeerLike, type Pintor, type SesionViva } from "../pantalla-origen";
import type { RespuestaOrden } from "../orden";

type FuenteReal = "accesibilidad" | "proyeccion";
type Llamada = { cmd: string; args?: Record<string, unknown> };
const SESION: SesionViva = { token: "a".repeat(32), de: "h".repeat(64), nivel: "controlar" };
const ctx = { sesion: { token: SESION.token, nivel: "ver" } };

function montar(real: FuenteReal) {
    const llamadas: Llamada[] = [];
    let ahora = 1_000_000;
    const pintor: Pintor = { async pintar() { return true; }, pista: () => ({}), flujo: () => ({}), liberar() {} };
    const origen = new OrigenPantalla({
        invocar: async (cmd, args) => {
            llamadas.push({ cmd, args });
            if (cmd === "control_pantalla_iniciar") return { ok: true, fuente: real, ancho: 800, alto: 1280, giro: 0 };
            if (cmd === "control_capacidades") return { pantalla: { accesibilidad: true, proyeccion: false }, falta: [] };
            return { ok: true };
        },
        iceServers: async () => [],
        crearPeer: () => ({}) as PeerLike,
        crearPintor: () => pintor,
        sesionViva: () => SESION,
        recibirSobre: async () => ({}) as RespuestaOrden,
        // El sondeo de la fluida usa esperas largas: se agota el reloj falso para que no quede una búsqueda colgada.
        esperar: async (ms) => { if (ms >= 1000) ahora += ms + 1; },
        ahora: () => ahora,
        anotar: () => undefined,
    } satisfies DepsOrigen);
    return { origen, llamadas };
}

const inicios = (llamadas: Llamada[]) => llamadas.filter((l) => l.cmd === "control_pantalla_iniciar");

describe("RST06 · la petición de fuente llega a lo nativo", () => {
    it("con «proyeccion» el invocador recibe la fuente", async () => {
        const { origen, llamadas } = montar("proyeccion");
        await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx);
        expect(inicios(llamadas)[0]?.args?.fuente).toBe("proyeccion");
        await origen.parar("fin");
    });

    it("sin fuente, o con «auto», el invocador no recibe el campo", async () => {
        for (const args of [{}, { fuente: "auto" }]) {
            const { origen, llamadas } = montar("accesibilidad");
            await origen.ejecutar("pantalla-iniciar", args, ctx);
            expect("fuente" in (inicios(llamadas)[0]?.args ?? {})).toBe(false);
            await origen.parar("fin");
        }
    });
});

describe("RST06 · lo que se devuelve es la fuente real, nunca la pedida", () => {
    it("si lo nativo contesta accesibilidad, lo dice y añade la fuente pedida; la sesión sigue", async () => {
        const { origen, llamadas } = montar("accesibilidad");
        const r = (await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx)) as Record<string, unknown>;
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad", fuente_pedida: "proyeccion" });
        expect(inicios(llamadas)[0]?.args?.fuente).toBe("proyeccion");
        expect(origen.enMarcha()).toBe(true);
        await origen.parar("fin");
    });

    it("si lo nativo contesta proyeccion, dice proyeccion", async () => {
        const { origen } = montar("proyeccion");
        const r = (await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx)) as Record<string, unknown>;
        expect(r).toMatchObject({ ok: true, fuente: "proyeccion", fuente_pedida: "proyeccion" });
        await origen.parar("fin");
    });

    it("sin petición explícita no se inventa una fuente pedida", async () => {
        const { origen } = montar("accesibilidad");
        const r = (await origen.ejecutar("pantalla-iniciar", {}, ctx)) as Record<string, unknown>;
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad" });
        expect("fuente_pedida" in r).toBe(false);
        await origen.parar("fin");
    });
});
