/**
 * RST1116A · pruebas de la petición de fuente explícita y la fuente real devuelta.
 * Con falsos de la costura 1 (Tauri), de la conexión y del lienzo.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { OrigenPantalla, type CanalLike, type DepsOrigen, type PeerLike, type Pintor, type SesionViva } from "../pantalla-origen";
import type { RespuestaOrden } from "../orden";
import { trocear } from "../senal-partes";

function cuadro(numero: number, ancho = 800, alto = 1280, giro = 0, cero = 0, jpeg = 20): Uint8Array {
    const b = new Uint8Array(12 + jpeg);
    const v = new DataView(b.buffer);
    v.setUint32(0, numero, true);
    v.setUint16(4, ancho, true);
    v.setUint16(6, alto, true);
    v.setUint16(8, giro, true);
    v.setUint16(10, cero, true);
    return b;
}

const SESION: SesionViva = { token: "a".repeat(32), de: "h".repeat(64), nivel: "controlar" };
const ctx = (nivel = "controlar", sobre: unknown = { v: 1, carga: "c", firma: "f" }) => ({ sobre, sesion: { token: SESION.token, nivel } });
const pausa = (ms = 2) => new Promise<void>((r) => setTimeout(r, ms));
async function hasta(c: () => boolean, ms = 1500) {
    const t0 = Date.now();
    while (!c()) {
        if (Date.now() - t0 > ms) throw new Error("no llegó a cumplirse");
        await pausa(2);
    }
}

class CanalFalso implements CanalLike {
    onmessage: CanalLike["onmessage"] = null;
    onclose: CanalLike["onclose"] = null;
    enviados: string[] = [];
    cerrado = false;
    send(d: string) { this.enviados.push(d); }
    close() { this.cerrado = true; }
}
class PeerFalso implements PeerLike {
    iceGatheringState = "complete";
    localDescription: { type?: string; sdp?: string } | null = null;
    connectionState = "new";
    onicegatheringstatechange: (() => void) | null = null;
    onconnectionstatechange: (() => void) | null = null;
    ondatachannel: PeerLike["ondatachannel"] = null;
    pistas: unknown[] = [];
    remota: { type: string; sdp: string } | null = null;
    candidatos: { candidate: string; sdpMLineIndex?: number }[] = [];
    cerrada = false;
    addTrack(p: unknown) { this.pistas.push(p); return {}; }
    async setRemoteDescription(d: { type: string; sdp: string }) { this.remota = d; }
    async createAnswer() { return { type: "answer", sdp: "v=0\r\nrespuesta" }; }
    async setLocalDescription(d?: unknown) { this.localDescription = d as { sdp?: string }; }
    async addIceCandidate(c: { candidate: string; sdpMLineIndex?: number }) { this.candidatos.push(c); }
    close() { this.cerrada = true; }
}
class PintorFalso implements Pintor {
    pintados: { ancho: number; alto: number; bytes: number }[] = [];
    enCurso = 0;
    maxEnCurso = 0;
    liberado = false;
    resultado = true;
    async pintar(j: Uint8Array, ancho: number, alto: number) {
        this.enCurso++;
        this.maxEnCurso = Math.max(this.maxEnCurso, this.enCurso);
        await pausa(3);
        this.enCurso--;
        this.pintados.push({ ancho, alto, bytes: j.length });
        return this.resultado;
    }
    pista() { return { pista: true }; }
    flujo() { return { flujo: true }; }
    liberar() { this.liberado = true; }
}

let llamadas: { cmd: string; args?: Record<string, unknown> }[];
let respuestas: Record<string, unknown>;
let cuadros: Uint8Array[];
let viva: SesionViva | null;
let peer: PeerFalso;
let pintor: PintorFalso;
let ahora: number;
let recibidos: unknown[];
let origen: OrigenPantalla;

function montar(sinInvocar = false) {
    origen = new OrigenPantalla({
        invocar: sinInvocar
            ? null
            : async (cmd, args) => {
                  llamadas.push({ cmd, args });
                  if (cmd === "control_pantalla_cuadro") {
                      const c = cuadros.shift();
                      return c ?? new Uint8Array(0);
                  }
                  if (cmd in respuestas) {
                      const r = respuestas[cmd];
                      if (r instanceof Error) throw r;
                      return r;
                  }
                  return { ok: true };
              },
        iceServers: async () => [{ urls: "stun:x" }],
        crearPeer: () => peer,
        crearPintor: () => pintor,
        sesionViva: () => viva,
        recibirSobre: async (s) => {
            recibidos.push(s);
            return { tipo: "respuesta", nonce: String((s as { n?: string }).n ?? ""), ok: true, motivo: "ok" } as RespuestaOrden;
        },
        esperar: (ms) => pausa(Math.min(ms, 3)),
        ahora: () => ahora,
        anotar: () => undefined,
    } satisfies DepsOrigen);
}

beforeEach(() => {
    llamadas = [];
    respuestas = {
        control_pantalla_iniciar: { ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 },
        control_capacidades: { pantalla: { accesibilidad: true, proyeccion: false, sin_preguntar: true }, entrada: { gestos: true, max_dedos: 10, teclas: ["atras"], volumen: true, brillo: true, texto: true }, falta: [] },
        control_estado_aparato: { brillo: 0.5, bateria: 0.8 },
        control_entrada: { ok: true },
    };
    cuadros = [];
    viva = { ...SESION };
    peer = new PeerFalso();
    pintor = new PintorFalso();
    ahora = 1_000_000;
    recibidos = [];
    montar();
});

const n = (cmd: string) => llamadas.filter((l) => l.cmd === cmd);

describe("RST1116A · fuente explícita y fuente real", () => {
    it("con fuente:proyeccion el invocador recibe la clave fuente", async () => {
        const r = (await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        expect(n("control_pantalla_iniciar")[0].args).toMatchObject({ sesion: SESION.token, fuente: "proyeccion" });
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad", fuente_pedida: "proyeccion" });
        await origen.parar("fin");
    });

    it("sin fuente (o auto) no se manda la clave fuente al nativo", async () => {
        const r = (await origen.ejecutar("pantalla-iniciar", { lado: 1000 }, ctx())) as Record<string, unknown>;
        expect(n("control_pantalla_iniciar")[0].args).toEqual({ sesion: SESION.token, lado_max: 1000, calidad: 60 });
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad" });
        expect(r).not.toHaveProperty("fuente_pedida");
        await origen.parar("fin");
    });

    it("si lo nativo contesta accesibilidad, el resultado dice fuente:accesibilidad y fuente_pedida:proyeccion", async () => {
        const r = (await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad", fuente_pedida: "proyeccion" });
        await origen.parar("fin");
    });

    it("si lo nativo contesta proyeccion, el resultado dice proyeccion y no tiene fuente_pedida", async () => {
        respuestas.control_pantalla_iniciar = { ok: true, fuente: "proyeccion", ancho: 1280, alto: 798, giro: 0 };
        const r = (await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        expect(r).toMatchObject({ ok: true, fuente: "proyeccion", ancho: 1280, alto: 798 });
        expect(r).not.toHaveProperty("fuente_pedida");
        await origen.parar("fin");
    });

    it("si la proyeccion falla, la sesión sigue con lo que haya y avisa con fuente_pedida", async () => {
        const inv = origen as unknown as { d: DepsOrigen };
        const base = inv.d.invocar!;
        inv.d.invocar = async (c, a) => {
            if (c === "control_pantalla_iniciar" && a?.fuente === "proyeccion") {
                llamadas.push({ cmd: c, args: a });
                return { ok: false, motivo: "sin-consentimiento" };
            }
            return base(c, a);
        };
        const r = (await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        expect(n("control_pantalla_iniciar").map((l) => l.args?.fuente).slice(0, 2)).toEqual(["proyeccion", undefined]);
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad", fuente_pedida: "proyeccion" });
        expect(origen.enMarcha()).toBe(true);
        await origen.parar("fin");
    });

    it("mantener con fuente:proyeccion pide la fluida y avisa si no se cumplió", async () => {
        await origen.ejecutar("pantalla-iniciar", {}, ctx());
        const r = (await origen.ejecutar("pantalla-iniciar", { mantener: true, fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        expect(r).toMatchObject({ ok: true, mantenida: true, fuente: "accesibilidad", fuente_pedida: "proyeccion" });
        await origen.parar("fin");
    });

    it("mantener sin fuente no pide la fluida y no avisa", async () => {
        await origen.ejecutar("pantalla-iniciar", {}, ctx());
        const r = (await origen.ejecutar("pantalla-iniciar", { mantener: true }, ctx())) as Record<string, unknown>;
        expect(r).toMatchObject({ ok: true, mantenida: true, fuente: "accesibilidad" });
        expect(r).not.toHaveProperty("fuente_pedida");
        await origen.parar("fin");
    });
});