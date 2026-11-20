/**
 * RST1116A · del lado del aparato controlado: la petición de fuente llega a lo nativo y se devuelve
 * la fuente REAL que contestó, nunca la pedida. Con `invocar` simulado (misma costura que
 * `pantalla-origen.test.ts`).
 *
 * Nota: esta petición explícita deja sin efecto las expectativas antiguas de `pantalla-origen.test.ts`
 * («fuente: "auto"» al arrancar) y de `pantalla-proyeccion.test.ts` («siempre auto»): ahora «auto» no
 * se manda y «proyeccion» sí. Esos archivos no son de esta tarea.
 */
import { afterEach, describe, expect, it } from "vitest";
import { OrigenPantalla, type DepsOrigen, type Pintor, type SesionViva } from "../pantalla-origen";
import type { RespuestaOrden } from "../orden";

const SESION: SesionViva = { token: "a".repeat(32), de: "h".repeat(64), nivel: "ver" };
const ctx = () => ({ sobre: { v: 1, carga: "c", firma: "f" }, sesion: { token: SESION.token, nivel: "ver" } });

const pintor: Pintor = {
    async pintar() {
        return true;
    },
    pista() {
        return {};
    },
    flujo() {
        return {};
    },
    liberar() {
        /* nada */
    },
};

const abiertos: OrigenPantalla[] = [];

afterEach(async () => {
    for (const o of abiertos) await o.parar("fin");
    abiertos.length = 0;
});

function montar(fuenteReal: "accesibilidad" | "proyeccion") {
    const llamadas: { cmd: string; args?: Record<string, unknown> }[] = [];
    const capacidades = {
        pantalla: { accesibilidad: true, proyeccion: false, fuente_activa: "accesibilidad" },
        entrada: {},
        falta: [],
    };
    const origen = new OrigenPantalla({
        invocar: async (cmd, args) => {
            llamadas.push({ cmd, args });
            if (cmd === "control_pantalla_iniciar") return { ok: true, fuente: fuenteReal, ancho: 800, alto: 1280, giro: 0 };
            if (cmd === "control_pantalla_cuadro") return new Uint8Array(0);
            if (cmd === "control_capacidades") return capacidades;
            return { ok: true };
        },
        iceServers: async () => [],
        crearPeer: () => {
            throw new Error("sin conexión");
        },
        crearPintor: () => pintor,
        sesionViva: () => SESION,
        recibirSobre: async () => ({ tipo: "respuesta", nonce: "", ok: true, motivo: "ok" }) as RespuestaOrden,
        esperar: async (ms) => new Promise<void>((r) => setTimeout(r, Math.min(ms, 3))),
        ahora: () => 1,
        anotar: () => undefined,
    } satisfies DepsOrigen);
    abiertos.push(origen);
    const inicios = () => llamadas.filter((l) => l.cmd === "control_pantalla_iniciar");
    return { origen, inicios };
}

describe("RST1116A · fuente pedida y fuente real", () => {
    it("con fuente «proyeccion» el invocador recibe esa fuente", async () => {
        const { origen, inicios } = montar("proyeccion");
        await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx());
        expect(inicios()[0].args).toMatchObject({ sesion: SESION.token, lado_max: 1280, calidad: 60, fuente: "proyeccion" });
    });

    it("sin fuente, o con «auto», no se manda fuente a lo nativo", async () => {
        const sinFuente = montar("accesibilidad");
        await sinFuente.origen.ejecutar("pantalla-iniciar", {}, ctx());
        expect("fuente" in (sinFuente.inicios()[0].args ?? {})).toBe(false);

        const conAuto = montar("accesibilidad");
        await conAuto.origen.ejecutar("pantalla-iniciar", { fuente: "auto" }, ctx());
        expect("fuente" in (conAuto.inicios()[0].args ?? {})).toBe(false);
    });

    it("si lo nativo contesta «accesibilidad», se devuelve la real y se anota la pedida", async () => {
        const { origen } = montar("accesibilidad");
        const r = await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx());
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad", fuente_pedida: "proyeccion", ancho: 800, alto: 1280 });
    });

    it("si lo nativo contesta «proyeccion», se dice proyeccion (nunca se inventa la fluida)", async () => {
        const { origen } = montar("proyeccion");
        const r = await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx());
        expect(r).toMatchObject({ ok: true, fuente: "proyeccion", fuente_pedida: "proyeccion" });
    });

    it("sin petición, la fuente real que contesta el aparato es la única que se devuelve", async () => {
        const { origen } = montar("accesibilidad");
        const r = await origen.ejecutar("pantalla-iniciar", {}, ctx());
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad" });
        expect(r).not.toHaveProperty("fuente_pedida");
    });
});
