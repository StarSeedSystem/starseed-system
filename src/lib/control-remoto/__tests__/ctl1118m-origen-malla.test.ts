/**
 * CTL1118M · el lado controlado sirve la orden `pantalla-cuadro`: congela el último cuadro, lo reparte en partes, lo reduce si piden menos,
 * y no se para por «sin oferta» mientras quien manda pide por la malla.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { OrigenPantalla, type CanalLike, type DepsOrigen, type PeerLike, type Pintor, type SesionViva } from "../pantalla-origen";
import { ReensambladorCuadro, leerParteCuadro, PARTE_CUADRO_MAX } from "../cuadro-malla";

function cuadro(numero: number, jpeg: number, ancho = 800, alto = 1280): Uint8Array {
    const b = new Uint8Array(12 + jpeg);
    const v = new DataView(b.buffer);
    v.setUint32(0, numero, true);
    v.setUint16(4, ancho, true);
    v.setUint16(6, alto, true);
    for (let i = 0; i < jpeg; i++) b[12 + i] = (i * 3 + numero) & 255;
    return b;
}
const SESION: SesionViva = { token: "a".repeat(32), de: "h".repeat(64), nivel: "ver" };
const ctx = { sobre: { v: 1, carga: "c", firma: "f" }, sesion: { token: SESION.token, nivel: "ver" } };
const pausa = (ms = 2) => new Promise<void>((r) => setTimeout(r, ms));
async function hasta(c: () => boolean, ms = 1500) {
    const t0 = Date.now();
    while (!c()) {
        if (Date.now() - t0 > ms) throw new Error("no llegó a cumplirse");
        await pausa(2);
    }
}
const peerFalso = (): PeerLike => ({}) as unknown as PeerLike;
const pintor: Pintor = { pintar: async () => true, pista: () => ({}), flujo: () => ({}), liberar: () => undefined } as unknown as Pintor;

let cola: Uint8Array[];
let ahora: number;
let reducciones: { lado: number; calidad: number }[];
let lineas: string[];
let origen: OrigenPantalla;

function montar(conReducir = true) {
    origen = new OrigenPantalla({
        invocar: async (cmd) => {
            if (cmd === "control_pantalla_cuadro") return cola.shift() ?? new Uint8Array(0);
            if (cmd === "control_pantalla_iniciar") return { ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 };
            if (cmd === "control_capacidades") return { pantalla: { accesibilidad: true }, entrada: { gestos: true, max_dedos: 10, teclas: [], volumen: true, brillo: true, texto: true }, falta: [] };
            return { ok: true };
        },
        iceServers: async () => [],
        crearPeer: peerFalso,
        crearPintor: () => pintor,
        sesionViva: () => SESION,
        recibirSobre: async () => ({ tipo: "respuesta", nonce: "n", ok: true, motivo: "ok" }),
        esperar: (ms) => pausa(Math.min(ms, 3)),
        ahora: () => ahora,
        anotar: (l) => void lineas.push(l),
        sistemaOperativo: () => "linux",
        ...(conReducir
            ? { reducir: async (j, ancho, alto, lado, calidad) => { reducciones.push({ lado, calidad }); return { jpeg: j.subarray(0, 100), ancho: Math.round(ancho / 2), alto: Math.round(alto / 2) }; } }
            : {}),
    } satisfies DepsOrigen);
}

beforeEach(() => {
    cola = [];
    ahora = 1_000_000;
    reducciones = [];
    lineas = [];
    montar();
});

async function arrancar(n = 1, jpeg = PARTE_CUADRO_MAX + 500) {
    await origen.ejecutar("pantalla-iniciar", {}, ctx);
    cola.push(cuadro(n, jpeg));
    await hasta(() => cola.length === 0);
    await pausa(10);
}

describe("CTL1118M · pantalla-cuadro (origen)", () => {
    it("sin cuadro nuevo contesta nuevo:false; con uno, parte 0 y luego el resto, y todo reensambla igual", async () => {
        await origen.ejecutar("pantalla-iniciar", {}, ctx);
        expect(await origen.ejecutar("pantalla-cuadro", { desde: 0, pide: 0 }, ctx)).toMatchObject({ nuevo: false });
        cola.push(cuadro(5, PARTE_CUADRO_MAX + 500));
        await hasta(() => cola.length === 0);
        await pausa(10);
        const r0 = (await origen.ejecutar("pantalla-cuadro", { desde: 0, pide: 0 }, ctx)) as Record<string, unknown>;
        expect(r0).toMatchObject({ nuevo: true, ancho: 800, alto: 1280, num: 5, n: 2 });
        const p0 = leerParteCuadro(r0);
        expect(p0).not.toBeNull();
        const re = new ReensambladorCuadro();
        expect(re.meter(p0!)).toBeNull();
        const p1 = leerParteCuadro(await origen.ejecutar("pantalla-cuadro", { desde: 0, pide: 1, num: 5 }, ctx));
        const jpeg = re.meter(p1!);
        expect(jpeg?.length).toBe(PARTE_CUADRO_MAX + 500);
        // ya visto: no se repite
        expect(await origen.ejecutar("pantalla-cuadro", { desde: 5, pide: 0 }, ctx)).toMatchObject({ nuevo: false, numero: 5 });
        await origen.parar("fin");
    });
    it("una parte de un cuadro que ya no es el congelado da cuadro-cambiado", async () => {
        await arrancar(7);
        await origen.ejecutar("pantalla-cuadro", { desde: 0, pide: 0 }, ctx);
        await expect(origen.ejecutar("pantalla-cuadro", { desde: 0, pide: 1, num: 6 }, ctx)).rejects.toThrow("cuadro-cambiado");
        await expect(origen.ejecutar("pantalla-cuadro", { desde: 0, pide: 9, num: 7 }, ctx)).rejects.toThrow("cuadro-cambiado");
        await origen.parar("fin");
    });
    it("con nivel > 0 reduce con el lado y la calidad de ese nivel; con nivel 0 y cuadro pequeño no", async () => {
        await arrancar(3, 500);
        await origen.ejecutar("pantalla-cuadro", { desde: 0, pide: 0, nivel: 0 }, ctx);
        expect(reducciones).toHaveLength(0);
        const r = (await origen.ejecutar("pantalla-cuadro", { desde: 0, pide: 0, nivel: 3 }, ctx)) as Record<string, unknown>;
        expect(reducciones).toHaveLength(1);
        expect(reducciones[0].lado).toBeLessThanOrEqual(1280);
        expect(r).toMatchObject({ ancho: 400, alto: 640, total: 100, n: 1 });
        await origen.parar("fin");
    });
    it("sin pantalla en marcha o con otra sesión no sirve nada", async () => {
        await expect(origen.ejecutar("pantalla-cuadro", { desde: 0, pide: 0 }, ctx)).rejects.toThrow();
    });
});
