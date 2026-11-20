/**
 * RST06 · la petición explícita de la fuente llega a lo nativo y la contestación enseña la fuente REAL que respondió el aparato.
 * `invocar` se inyecta: ni red, ni disco, ni Tauri. En este árbol la petición «proyeccion» ya viaja por el camino de la fluida
 * (`buscarFluida`) y `nativo-comandos` ya incluye la clave `fuente`; faltaba llevar `fuente_pedida` en la respuesta para avisar (RST04).
 */
import { afterEach, describe, expect, it } from "vitest";
import { OrigenPantalla, type DepsOrigen, type Pintor, type SesionViva } from "../pantalla-origen";
import type { RespuestaOrden } from "../orden";

const SESION: SesionViva = { token: "a".repeat(32), de: "h".repeat(64), nivel: "ver" };
const CTX = { sobre: { v: 1, carga: "c", firma: "f" }, sesion: { token: SESION.token, nivel: "ver" } };
type Llamada = { cmd: string; args?: Record<string, unknown> };
type Fuente = "accesibilidad" | "proyeccion";

function mundo(real: Fuente) {
    const llamadas: Llamada[] = [];
    const pintor: Pintor = { async pintar() { return true; }, pista: () => ({}), flujo: () => ({}), liberar() {} };
    let ahora = 0;
    const origen = new OrigenPantalla({
        invocar: async (cmd, args) => {
            llamadas.push({ cmd, args });
            if (cmd === "control_pantalla_iniciar") return { ok: true, fuente: real, ancho: 800, alto: 1280, giro: 0 };
            if (cmd === "control_capacidades") return { pantalla: { accesibilidad: true, proyeccion: false }, falta: [] };
            if (cmd === "control_pantalla_cuadro") return new Uint8Array(0);
            return { ok: true };
        },
        iceServers: async () => [],
        crearPeer: () => { throw new Error("sin peer"); },
        crearPintor: () => pintor,
        sesionViva: () => SESION,
        recibirSobre: async () => ({ tipo: "respuesta", nonce: "", ok: true, motivo: "ok" }) as RespuestaOrden,
        esperar: async (ms) => { ahora += ms; await new Promise<void>((r) => setTimeout(r, 0)); },
        ahora: () => ahora,
        anotar: () => undefined,
    } satisfies DepsOrigen);
    return { origen, llamadas };
}

const vivos: OrigenPantalla[] = [];
afterEach(async () => {
    for (const o of vivos.splice(0)) await o.parar("fin");
});
function abrir(real: Fuente) {
    const m = mundo(real);
    vivos.push(m.origen);
    return m;
}

describe("RST06 · fuente pedida y fuente real", () => {
    it("con fuente «proyeccion» la petición llega a lo nativo", async () => {
        const m = abrir("accesibilidad");
        await m.origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, CTX);
        await new Promise<void>((r) => setTimeout(r, 5));
        expect(m.llamadas.some((l) => l.cmd === "control_pantalla_iniciar" && l.args?.fuente === "proyeccion")).toBe(true);
    });

    it("sin petición explícita el arranque va por «auto» (la fluida se pide por el camino de siempre)", async () => {
        const m = abrir("accesibilidad");
        await m.origen.ejecutar("pantalla-iniciar", {}, CTX);
        expect(m.llamadas.find((l) => l.cmd === "control_pantalla_iniciar")?.args?.fuente).toBe("auto");
    });

    it("si lo nativo contesta accesibilidad, se dice esa fuente y la pedida, y la sesión sigue", async () => {
        const m = abrir("accesibilidad");
        const r = (await m.origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, CTX)) as Record<string, unknown>;
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad", fuente_pedida: "proyeccion" });
        expect(m.origen.enMarcha()).toBe(true);
    });

    it("si lo nativo contesta proyeccion, se dice la real y también la pedida", async () => {
        const m = abrir("proyeccion");
        const r = (await m.origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, CTX)) as Record<string, unknown>;
        expect(r).toMatchObject({ ok: true, fuente: "proyeccion", fuente_pedida: "proyeccion" });
        expect(m.origen.enMarcha()).toBe(true);
    });

    it("«mantener» con proyección también dice la fuente pedida junto a la real", async () => {
        const m = abrir("accesibilidad");
        await m.origen.ejecutar("pantalla-iniciar", {}, CTX);
        const r = (await m.origen.ejecutar("pantalla-iniciar", { mantener: true, fuente: "proyeccion" }, CTX)) as Record<string, unknown>;
        expect(r).toMatchObject({ ok: true, mantenida: true, fuente: "accesibilidad", fuente_pedida: "proyeccion" });
    });

    it("sin petición de fuente no aparece el campo de lo pedido", async () => {
        const m = abrir("accesibilidad");
        const r = (await m.origen.ejecutar("pantalla-iniciar", {}, CTX)) as Record<string, unknown>;
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad" });
        expect("fuente_pedida" in r).toBe(false);
    });
});
