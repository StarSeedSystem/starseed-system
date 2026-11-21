/**
 * PENC3 · pedir la pantalla con la fuente «auto», reflejar la REAL que contesta el aparato y decir lo que falta con las
 * palabras del contrato. Lo que viaja en los cuadros y el motor de llamadas no se tocan.
 */
import { describe, expect, it } from "vitest";
import { OrigenPantalla, type DepsOrigen, type Pintor, type SesionViva } from "../pantalla-origen";
import type { RespuestaOrden } from "../orden";
import { PALABRAS_FALTA, palabrasMotivo } from "../palabras";

const SESION: SesionViva = { token: "a".repeat(32), de: "h".repeat(64), nivel: "ver" };
const ctx = () => ({ sobre: { v: 1, carga: "c", firma: "f" }, sesion: { token: SESION.token, nivel: "ver" } });

function origenCon(respuesta: unknown) {
    const llamadas: { cmd: string; args?: Record<string, unknown> }[] = [];
    const pintor: Pintor = { async pintar() { return true; }, pista() { return {}; }, flujo() { return {}; }, liberar() { /* nada */ } };
    const origen = new OrigenPantalla({
        invocar: async (cmd, args) => {
            llamadas.push({ cmd, args });
            if (cmd === "control_pantalla_iniciar") return respuesta;
            if (cmd === "control_pantalla_cuadro") return new Uint8Array(0);
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

describe("PENC3 · fuente de pantalla", () => {
    it("con «proyeccion» se pide esa fuente al aparato (RST1116A)", async () => {
        const { origen, llamadas } = origenCon({ ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 });
        await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx());
        expect(llamadas.find((l) => l.cmd === "control_pantalla_iniciar")?.args?.fuente).toBe("proyeccion");
        await origen.parar("fin");
    });

    it("la fuente real que contesta el aparato es la que se refleja", async () => {
        const a = origenCon({ ok: true, fuente: "proyeccion", ancho: 1280, alto: 798, giro: 0 });
        expect(await a.origen.ejecutar("pantalla-iniciar", {}, ctx())).toMatchObject({ ok: true, fuente: "proyeccion", ancho: 1280, alto: 798 });
        await a.origen.parar("fin");
        const b = origenCon({ ok: true, fuente: "rara", ancho: 1, alto: 1, giro: 0 });
        expect(await b.origen.ejecutar("pantalla-iniciar", {}, ctx())).toMatchObject({ fuente: "accesibilidad" });
        await b.origen.parar("fin");
    });

    it("sin «Sí» de la proyección dice qué falta con la palabra del contrato", async () => {
        const { origen } = origenCon({ ok: false, motivo: "sin-consentimiento", falta: ["consentimiento-proyeccion"] });
        expect(await origen.ejecutar("pantalla-iniciar", {}, ctx())).toEqual({ ok: false, motivo: "sin-consentimiento", falta: ["consentimiento-proyeccion"] });
    });

    it("la palabra nueva tiene su frase y las demás no cambian", () => {
        expect(PALABRAS_FALTA["consentimiento-proyeccion"]).toBe("Android te preguntará en el aparato si compartes la pantalla; contesta allí.");
        expect(palabrasMotivo("consentimiento-proyeccion")).toBe(PALABRAS_FALTA["consentimiento-proyeccion"]);
        expect(Object.keys(PALABRAS_FALTA).sort()).toEqual(["accesibilidad-mac", "ajustes-restringidos", "consentimiento-pantalla", "consentimiento-proyeccion", "entrada-x11", "escribir-ajustes", "grabacion-pantalla", "servicio-accesibilidad", "sin-pantalla-x11", "wayland", "webrtc-linux"]); // CTL1118M: + WebRTC de Linux · CTL1117M: + los dos permisos del Mac · CTL1118L: + las tres faltas de Linux
        expect(PALABRAS_FALTA["servicio-accesibilidad"]).toMatch(/^El servicio de accesibilidad de StarSeed está apagado/);
        expect(PALABRAS_FALTA["escribir-ajustes"]).toMatch(/Modificar ajustes del sistema/);
    });
});
