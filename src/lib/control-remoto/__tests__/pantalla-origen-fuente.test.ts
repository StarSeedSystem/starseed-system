/**
 * RST1116A · pruebas de la petición explícita de fuente (proyección) y la fuente real que contesta lo nativo.
 * Cubre: con `fuente:"proyeccion"` el invocador recibe `fuente`; sin ella no; si lo nativo contesta
 * `accesibilidad`, el resultado dice `fuente:"accesibilidad"` y `fuente_pedida:"proyeccion"`; si contesta
 * `proyeccion`, dice `proyeccion`.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { OrigenPantalla, type DepsOrigen, type SesionViva } from "../pantalla-origen";
import type { RespuestaOrden } from "../orden";

const SESION: SesionViva = { token: "a".repeat(32), de: "h".repeat(64), nivel: "controlar" };
const ctx = (nivel = "controlar", sobre: unknown = { v: 1, carga: "c", firma: "f" }) => ({ sobre, sesion: { token: SESION.token, nivel } });
const pausa = (ms = 2) => new Promise<void>((r) => setTimeout(r, ms));

class PeerFalso {
    iceGatheringState = "complete";
    localDescription: { type?: string; sdp?: string } | null = null;
    connectionState = "new";
    onicegatheringstatechange: (() => void) | null = null;
    onconnectionstatechange: (() => void) | null = null;
    ondatachannel: ((e: { channel: unknown }) => void) | null = null;
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

class PintorFalso {
    pintados: { ancho: number; alto: number; bytes: number }[] = [];
    enCurso = 0;
    maxEnCurso = 0;
    liberado = false;
    resultado = true;
    async pintar(_j: Uint8Array, ancho: number, alto: number) {
        this.enCurso++;
        this.maxEnCurso = Math.max(this.maxEnCurso, this.enCurso);
        await pausa(3);
        this.enCurso--;
        this.pintados.push({ ancho, alto, bytes: 20 });
        return this.resultado;
    }
    pista() { return { pista: true }; }
    flujo() { return { flujo: true }; }
    liberar() { this.liberado = true; }
}

let llamadas: { cmd: string; args?: Record<string, unknown> }[];
let respuestas: Record<string, unknown>;
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
                      return new Uint8Array(0);
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
    viva = { ...SESION };
    peer = new PeerFalso();
    pintor = new PintorFalso();
    ahora = 1_000_000;
    recibidos = [];
    montar();
});

const n = (cmd: string) => llamadas.filter((l) => l.cmd === cmd);

describe("pantalla-iniciar · fuente pedida y real", () => {
    it("sin fuente en args: no manda fuente (lo nativo usa su defecto)", async () => {
        const r = (await origen.ejecutar("pantalla-iniciar", { lado: 1000 }, ctx())) as Record<string, unknown>;
        const args = n("control_pantalla_iniciar")[0].args;
        expect(args).toEqual({ sesion: SESION.token, lado_max: 1000, calidad: 60 });
        expect("fuente" in args).toBe(false);
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad" });
        expect("fuente_pedida" in r).toBe(false);
        await origen.parar("fin");
    });

    it("con fuente:auto explícita: no manda fuente (lo nativo usa su defecto)", async () => {
        const r = (await origen.ejecutar("pantalla-iniciar", { lado: 1000, fuente: "auto" }, ctx())) as Record<string, unknown>;
        const args = n("control_pantalla_iniciar")[0].args;
        expect(args).toEqual({ sesion: SESION.token, lado_max: 1000, calidad: 60 });
        expect("fuente" in args).toBe(false);
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad" });
        expect("fuente_pedida" in r).toBe(false);
        await origen.parar("fin");
    });

    it("con fuente:proyeccion: invoca con fuente:proyeccion y devuelve fuente_pedida", async () => {
        const r = (await origen.ejecutar("pantalla-iniciar", { lado: 1000, fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        const args = n("control_pantalla_iniciar")[0].args;
        expect(args).toEqual({ sesion: SESION.token, lado_max: 1000, calidad: 60, fuente: "proyeccion" });
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad", fuente_pedida: "proyeccion" });
        await origen.parar("fin");
    });

    it("si lo nativo contesta proyeccion: devuelve fuente:proyeccion SIN fuente_pedida (se cumplió)", async () => {
        respuestas.control_pantalla_iniciar = { ok: true, fuente: "proyeccion", ancho: 800, alto: 1280, giro: 0 };
        const r = (await origen.ejecutar("pantalla-iniciar", { lado: 1000, fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        expect(r).toMatchObject({ ok: true, fuente: "proyeccion" });
        expect("fuente_pedida" in r).toBe(false);
        await origen.parar("fin");
    });

    it("si lo nativo contesta accesibilidad aunque se pidió proyeccion: devuelve fuente:accesibilidad y fuente_pedida:proyeccion", async () => {
        respuestas.control_pantalla_iniciar = { ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 };
        const r = (await origen.ejecutar("pantalla-iniciar", { lado: 1000, fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad", fuente_pedida: "proyeccion" });
        await origen.parar("fin");
    });

    it("la sesión sigue abierta aunque lo nativo no conceda la proyeccion pedida", async () => {
        respuestas.control_pantalla_iniciar = { ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 };
        await origen.ejecutar("pantalla-iniciar", { lado: 1000, fuente: "proyeccion" }, ctx());
        expect(origen.enMarcha()).toBe(true);
        expect(n("control_pantalla_parar")).toHaveLength(0);
        await origen.parar("fin");
    });

    it("mantener con fuente:proyeccion: devuelve fuente_pedida si la actual no es proyeccion", async () => {
        await origen.ejecutar("pantalla-iniciar", {}, ctx());
        llamadas = [];
        const r = (await origen.ejecutar("pantalla-iniciar", { mantener: true, fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        expect(r).toMatchObject({ ok: true, mantenida: true, fuente: "accesibilidad", fuente_pedida: "proyeccion" });
        await origen.parar("fin");
    });

    it("mantener con fuente:proyeccion y ya siendo proyeccion: no devuelve fuente_pedida", async () => {
        respuestas.control_pantalla_iniciar = { ok: true, fuente: "proyeccion", ancho: 800, alto: 1280, giro: 0 };
        await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx());
        llamadas = [];
        const r = (await origen.ejecutar("pantalla-iniciar", { mantener: true, fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        expect(r).toMatchObject({ ok: true, mantenida: true, fuente: "proyeccion" });
        expect("fuente_pedida" in r).toBe(false);
        await origen.parar("fin");
    });
});