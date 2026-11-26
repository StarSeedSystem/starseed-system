/**
 * RST1116A · en el aparato controlado, la petición de fuente llega a lo nativo y lo que se devuelve
 * es la fuente REAL que contestó el aparato. Si se pidió «proyeccion» y contesta accesibilidad, se
 * dice «accesibilidad» con `fuente_pedida: "proyeccion"`; nunca se dice «fluida» si no lo es.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OrigenPantalla, type DepsOrigen, type Pintor, type SesionViva } from "../pantalla-origen";
import type { RespuestaOrden } from "../orden";
import type { Args } from "../niveles";

const SESION: SesionViva = { token: "a".repeat(32), de: "h".repeat(64), nivel: "controlar" };
const ctx = () => ({ sobre: { v: 1, carga: "c", firma: "f" }, sesion: { token: SESION.token, nivel: "controlar" } });
const pintor: Pintor = { async pintar() { return true; }, pista: () => ({}), flujo: () => ({}), liberar() {} };

let llamadas: { cmd: string; args?: Record<string, unknown> }[];
let respuestas: Record<string, unknown>;
let origen: OrigenPantalla;

function montar(invocar?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>) {
    llamadas = [];
    respuestas = {
        control_pantalla_iniciar: { ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 },
        control_capacidades: { pantalla: { accesibilidad: true, proyeccion: false, fuente_activa: "accesibilidad" }, falta: [] },
    };
    origen = new OrigenPantalla({
        invocar: invocar ?? (async (cmd, args) => {
            llamadas.push({ cmd, args });
            return respuestas[cmd] ?? { ok: true };
        }),
        iceServers: async () => [],
        crearPeer: () => {
            throw new Error("sin conexión en estas pruebas");
        },
        crearPintor: () => pintor,
        sesionViva: () => ({ ...SESION }),
        recibirSobre: async (): Promise<RespuestaOrden> => ({ tipo: "respuesta", nonce: "", ok: false, motivo: "sin-puerta" }),
        // Sin avanzar el reloj: el bucle no se para por «sin oferta» y la búsqueda de la fluida la corta `parar`.
        esperar: () => new Promise<void>((r) => setTimeout(r, 1)),
        ahora: () => 1_000_000,
        anotar: () => undefined,
        sistemaOperativo: () => "linux",
    } satisfies DepsOrigen);
}
const de = (cmd: string) => llamadas.filter((l) => l.cmd === cmd);
/** La petición explícita es SIEMPRE la primera; después, el aparato puede pedir la fluida él solo. */
const primeraPeticion = () => de("control_pantalla_iniciar")[0]?.args ?? {};

beforeEach(() => montar());
afterEach(async () => {
    await origen.parar("fin");
});

describe("RST1116A · la petición de fuente llega a lo nativo", () => {
    it("con «proyeccion» se manda fuente:proyeccion a control_pantalla_iniciar", async () => {
        await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx());
        expect(primeraPeticion()).toMatchObject({ sesion: SESION.token, fuente: "proyeccion" });
    });

    it("sin fuente o con «auto» la petición no lleva el campo: no se inventa lo que no se pidió", async () => {
        for (const args of [{}, { fuente: "auto" }] as Args[]) {
            montar();
            await origen.ejecutar("pantalla-iniciar", args, ctx());
            expect("fuente" in primeraPeticion()).toBe(false);
            await origen.parar("fin");
        }
    });
});

describe("RST1116A · lo que se devuelve es la fuente REAL que contestó el aparato", () => {
    it("se pidió proyeccion y el aparato contesta accesibilidad: se dice la real + fuente_pedida, y la sesión sigue", async () => {
        respuestas.control_pantalla_iniciar = { ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 };
        const r = (await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad", fuente_pedida: "proyeccion" });
        expect(origen.enMarcha()).toBe(true);
        expect(de("control_pantalla_parar")).toHaveLength(0);
    });

    it("si el aparato no ofrece proyeccion, la sesión sigue con la fuente disponible", async () => {
        montar(async (cmd, args) => {
            llamadas.push({ cmd, args });
            if (cmd === "control_pantalla_iniciar" && args?.fuente === "proyeccion") {
                return { ok: false, motivo: "sin-consentimiento" };
            }
            if (cmd === "control_pantalla_iniciar") {
                return { ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 };
            }
            return { ok: true };
        });
        const r = (await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        expect(de("control_pantalla_iniciar").slice(0, 2).map((l) => l.args?.fuente)).toEqual(["proyeccion", "auto"]);
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad", fuente_pedida: "proyeccion" });
        expect(origen.enMarcha()).toBe(true);
        expect(de("control_pantalla_parar")).toHaveLength(0);
    });

    it("se pidió proyeccion y el aparato la da: se dice proyeccion, nunca se rebautiza", async () => {
        respuestas.control_pantalla_iniciar = { ok: true, fuente: "proyeccion", ancho: 800, alto: 1280, giro: 0 };
        const r = (await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        expect(r).toMatchObject({ ok: true, fuente: "proyeccion" });
        expect(r.fuente).not.toBe("accesibilidad");
    });

    it("sin pedir nada, el resultado no se inventa una petición", async () => {
        const r = (await origen.ejecutar("pantalla-iniciar", {}, ctx())) as Record<string, unknown>;
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad" });
        expect(r.fuente_pedida).toBeUndefined();
    });
});
