/**
 * LLA1108H · videollamada sin router. El único camino hacia el par es Bluetooth: la llamada pide sola el Wi-Fi
 * directo (clase «llamada»), lleva vídeo ligero por el enlace de datos mientras tanto y, cuando el enlace directo
 * aparece, sube a WebRTC SIN colgar. «Preguntar» enseña la propuesta; «Nunca» se queda en el vídeo ligero.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Identidad } from "@/lib/llamadas/identidad";
import type { ConexionCanal } from "@/lib/llamadas/senalizacion";
import { fijarSumideroDiagnostico } from "@/lib/llamadas/voz-datos/diagnostico";
import { fabricaCodecsSimples, SesionVozDatos, type AudioVoz, type FabricaCodecs, type TransporteVoz } from "@/lib/llamadas/voz-datos/sesion";
import { armarPaquete, esTextoVoz, leerControl } from "@/lib/llamadas/voz-datos/paquete";
import { MS_TRAMA } from "@/lib/llamadas/voz-datos/codec";
import { CONTROLES, disponibilidad, motivosDesactivados, MOTIVO_PANTALLA_BLUETOOTH, MOTIVO_VIDEO_BLUETOOTH, type ContextoMatriz } from "@/lib/llamadas/superficie/matriz-controles";
import {
    claseEscalada,
    debeEscalar,
    pasoWifiDe,
    textoEscalada,
    TEXTO_ABRIENDO_WIFI,
    TEXTO_PROPUESTA_WIFI,
    TEXTO_VIDEO_LIGERO_BLE,
    TEXTO_VIDEO_WIFI_DIRECTO,
    TEXTO_VOZ_BLE_ESPERANDO_WIFI,
    TEXTO_WIFI_NUNCA,
    type EstadoWifiLlamada,
} from "@/lib/llamadas/escalada-wifi";
import { AVISO_RADIO_UNICA, decidirEnlaceWifi } from "@/lib/malla/enlace-wifi-orquestacion";
import type { CodecVideo, CodificadorVideo, DecodificadorVideo, FabricaVideo, FrameCodificado, ImagenDecodificada } from "@/lib/llamadas/video-datos/tipos";

vi.mock("@/lib/llamadas/senalizacion", () => ({ abrirCanalLlamada: () => null }));

/* ─────────────────────────────── Medios y entorno falsos ─────────────────────────────── */

class PistaFalsa {
    enabled = true;
    readyState = "live";
    muted = false;
    stop = vi.fn(() => {
        this.readyState = "ended";
    });
    onended: (() => void) | null = null;
    constructor(public kind: "audio" | "video") {}
    getSettings() {
        return { deviceId: `${this.kind}-1` };
    }
}

class StreamFalso {
    id = `s-${Math.random().toString(36).slice(2, 8)}`;
    constructor(public pistas: PistaFalsa[] = []) {}
    getTracks() {
        return this.pistas;
    }
    getAudioTracks() {
        return this.pistas.filter((p) => p.kind === "audio");
    }
    getVideoTracks() {
        return this.pistas.filter((p) => p.kind === "video");
    }
    addTrack(p: PistaFalsa) {
        if (!this.pistas.includes(p)) this.pistas.push(p);
    }
    removeTrack(p: PistaFalsa) {
        this.pistas = this.pistas.filter((x) => x !== p);
    }
}

vi.mock("@/lib/llamadas/medios", () => ({
    obtenerMedios: vi.fn(async (p: { audio: boolean; video: boolean }) => ({
        stream: new StreamFalso([...(p.audio ? [new PistaFalsa("audio")] : []), ...(p.video ? [new PistaFalsa("video")] : [])]),
        error: null,
        aviso: null,
    })),
    obtenerPista: vi.fn(async (tipo: "audio" | "video") => ({ pista: new PistaFalsa(tipo), error: null })),
    obtenerPantalla: vi.fn(async () => ({ pista: new PistaFalsa("video"), error: null })),
    listarDispositivos: vi.fn(async () => ({ microfonos: [], camaras: [], altavoces: [] })),
    pararStream: vi.fn((s: StreamFalso | null) => s?.getTracks().forEach((t) => t.stop())),
}));

vi.mock("@/lib/llamadas/identidad", () => ({ clavePestana: (base: string) => `${base}:t` }));

let pcs: PCFalsa[] = [];

class PCFalsa {
    signalingState: RTCSignalingState = "stable";
    iceConnectionState: RTCIceConnectionState = "new";
    connectionState: RTCPeerConnectionState = "new";
    localDescription: RTCSessionDescriptionInit | null = null;
    remoteDescription: RTCSessionDescriptionInit | null = null;
    pistas: PistaFalsa[] = [];
    reinicios = 0;
    private n = 0;
    private negociando = false;
    onicecandidate: ((ev: unknown) => void) | null = null;
    ontrack: ((ev: unknown) => void) | null = null;
    onnegotiationneeded: (() => void) | null = null;
    oniceconnectionstatechange: (() => void) | null = null;
    onconnectionstatechange: (() => void) | null = null;
    constructor(public config: RTCConfiguration) {
        pcs.push(this);
    }
    addTrack(p: PistaFalsa) {
        this.pistas.push(p);
        if (!this.negociando) {
            this.negociando = true;
            queueMicrotask(() => {
                this.negociando = false;
                if (this.signalingState === "stable") this.onnegotiationneeded?.();
            });
        }
        return { track: p, replaceTrack: vi.fn(async () => undefined) };
    }
    async setLocalDescription(d?: RTCSessionDescriptionInit) {
        await Promise.resolve();
        if (d?.type === "rollback") {
            this.signalingState = "stable";
            this.localDescription = null;
            return;
        }
        if (this.signalingState === "have-remote-offer") {
            this.localDescription = { type: "answer", sdp: `respuesta-${++this.n}` };
            this.signalingState = "stable";
        } else {
            this.localDescription = { type: "offer", sdp: `oferta-${++this.n}` };
            this.signalingState = "have-local-offer";
        }
    }
    async setRemoteDescription(d: RTCSessionDescriptionInit) {
        await Promise.resolve();
        if (d.type === "offer") {
            if (this.signalingState === "have-local-offer") throw new Error("glare sin rollback");
            this.signalingState = "have-remote-offer";
        } else {
            this.signalingState = "stable";
        }
        this.remoteDescription = d;
    }
    async addIceCandidate() {
        /* sin efecto */
    }
    restartIce() {
        this.reinicios++;
    }
    async getStats() {
        return new Map();
    }
    close() {
        /* sin efecto */
    }
    fijarIce(estado: RTCIceConnectionState) {
        this.iceConnectionState = estado;
        this.oniceconnectionstatechange?.();
    }
}

const { MotorLlamada } = await import("@/lib/llamadas/motor");
const { abrirCanalLlamadaPorTransporte } = await import("@/lib/llamadas/canal-enlace-transporte");
const { avisarEnvioPesado } = await import("@/lib/malla/puente-ble-wifi");
const { __fijarMotorWifiParaPruebas } = await import("@/lib/malla/enlace-wifi-motor");
type DepsCanal = Parameters<typeof abrirCanalLlamadaPorTransporte>[3];
type Motor = InstanceType<typeof MotorLlamada>;
type OpcionesVozDatos = NonNullable<ConstructorParameters<typeof MotorLlamada>[0]["vozDatos"]>;

/* ─────────────────────────────────── Ayudas ─────────────────────────────────── */

async function esperarHasta(cond: () => boolean, ms = 3000) {
    const fin = Date.now() + ms;
    while (!cond() && Date.now() < fin) await new Promise((r) => setTimeout(r, 10));
    if (!cond()) throw new Error("la condición no se cumplió a tiempo");
}

function yo(base: string): Identidad {
    return { base, uid: base, nombre: base.toUpperCase(), avatar: null, invitado: false };
}

/** La señalización: solo Bluetooth (con acuse), como en el caso real. */
function redBle() {
    const oyentes: Record<string, Set<(m: { cuerpo: unknown; origen: { tipo: string } }) => void>> = { neuronA: new Set(), neuronB: new Set() };
    const lado = (mio: "neuronA" | "neuronB", otro: "neuronA" | "neuronB"): DepsCanal => ({
        enviar: async (_neurona, cuerpo) => {
            const copia: unknown = JSON.parse(JSON.stringify(cuerpo));
            queueMicrotask(() => oyentes[otro].forEach((cb) => cb({ cuerpo: copia, origen: { tipo: "ble" } })));
            return { ok: true, via: "ble" };
        },
        alRecibir: (cb) => {
            oyentes[mio].add(cb);
            return () => void oyentes[mio].delete(cb);
        },
        hayEnlace: () => true,
        yo: () => mio,
        esperar: async () => undefined,
    });
    return { mac: lado("neuronA", "neuronB"), tableta: lado("neuronB", "neuronA") };
}

/** Un enlace de datos (Bluetooth) entre los dos aparatos: sin IP, con cola propia de vídeo. */
function enlaceDatos() {
    const oyentes = { a: new Set<(t: string) => void>(), b: new Set<(t: string) => void>() };
    const lado = (mio: "a" | "b", otro: "a" | "b"): TransporteVoz => ({
        enviar(t) {
            queueMicrotask(() => oyentes[otro].forEach((cb) => cb(t)));
            return "ok";
        },
        enviarVideo(t) {
            queueMicrotask(() => oyentes[otro].forEach((cb) => cb(t)));
            return "ok";
        },
        colaVozBytes: () => 0,
        colaVideoBytes: () => 0,
        ocupado: () => false,
        alRecibir(cb) {
            oyentes[mio].add(cb);
            return () => void oyentes[mio].delete(cb);
        },
        abierto: () => true,
        info: () => ({ tipo: "ble", cifrada: true }),
        capacidadKbps: () => 480,
    });
    return { a: lado("a", "b"), b: lado("b", "a") };
}

const audioFalso = (): AudioVoz => ({ iniciar: async () => true, reproducir: () => undefined, detener: () => undefined });

/** Vídeo con códecs y cámara falsos (jsdom no tiene WebCodecs). */
function videoFalso(codecs: CodecVideo[] = ["vp8", "jpeg"]) {
    class Cod implements CodificadorVideo {
        cb: (f: FrameCodificado) => void = () => undefined;
        configurar() {
            /* nada */
        }
        codificar(f: { ts: number; w: number; h: number }, clave: boolean) {
            this.cb({ clave, bytes: new Uint8Array(clave ? 2500 : 400).fill(clave ? 9 : 5), ts: f.ts, w: f.w, h: f.h });
        }
        alSalir(cb: (f: FrameCodificado) => void) {
            this.cb = cb;
        }
        cerrar() {
            /* nada */
        }
    }
    class Dec implements DecodificadorVideo {
        cbI: (i: ImagenDecodificada) => void = () => undefined;
        decodificar(f: FrameCodificado) {
            this.cbI({ imagen: {}, w: f.w, h: f.h });
        }
        alImagen(cb: (i: ImagenDecodificada) => void) {
            this.cbI = cb;
        }
        alError() {
            /* nada */
        }
        cerrar() {
            /* nada */
        }
    }
    const fabrica: FabricaVideo = { codificables: () => codecs, decodificables: () => codecs, codificador: () => new Cod(), decodificador: () => new Dec() };
    return {
        fabrica: () => fabrica,
        fuenteDePista: () => ({ capturar: (w: number, h: number) => ({ imagen: {}, w, h, ts: Date.now() }), cerrar: () => undefined }),
        crearSalida: () => ({ stream: new StreamFalso([new PistaFalsa("video")]) as unknown as MediaStream, pintar: () => undefined, cerrar: () => undefined }),
    };
}

const motores: Motor[] = [];
const hitos: string[] = [];

interface Escenario {
    mac: Motor;
    tab: Motor;
    ip: { v: boolean | null };
    wifi: { v: EstadoWifiLlamada };
    escalar: ReturnType<typeof vi.fn>;
}

async function escenario(o: { camara?: boolean; ip?: boolean | null; wifi?: EstadoWifiLlamada; conVideo?: boolean; escalar?: (clase: "llamada" | "pantalla", flujo: MediaStream | null) => void } = {}): Promise<Escenario> {
    const red = redBle();
    const datos = enlaceDatos();
    const canalMac = abrirCanalLlamadaPorTransporte("neuronB", "s1", "a:t", red.mac);
    const canalTab = abrirCanalLlamadaPorTransporte("neuronA", "s1", "b:t", red.tableta);
    const ip = { v: o.ip ?? false };
    const wifi = { v: o.wifi ?? ({ paso: "inactivo" } as EstadoWifiLlamada) };
    const escalar = vi.fn((clase: "llamada" | "pantalla", flujo: MediaStream | null) => o.escalar?.(clase, flujo));
    const voz = (transporte: TransporteVoz, vecina: string, conEscalada: boolean): OpcionesVozDatos => ({
        neurona: vecina,
        transporteHacia: () => transporte,
        hayRutaIp: () => ip.v,
        crearAudio: () => audioFalso(),
        codecs: () => fabricaCodecsSimples(),
        intervaloMs: 20,
        ...(conEscalada ? { escalarWifi: escalar, estadoWifi: () => wifi.v } : {}),
        ...(o.conVideo === false ? {} : { video: videoFalso() }),
    });
    const mac = new MotorLlamada({ sesionId: "s1", yo: yo("a"), canalesDirectos: () => [canalMac], vozDatos: voz(datos.a, "neuronB", true), intervaloNivelMs: 60_000, intervaloStatsMs: 60_000 });
    const tab = new MotorLlamada({ sesionId: "s1", yo: yo("b"), canalesDirectos: () => [canalTab], vozDatos: voz(datos.b, "neuronA", true), intervaloNivelMs: 60_000, intervaloStatsMs: 60_000 });
    motores.push(mac, tab);
    await mac.prepararMedios({ audio: true, video: o.camara !== false });
    await tab.prepararMedios({ audio: true, video: false });
    mac.entrar();
    tab.entrar();
    await esperarHasta(() => mac.estado().contestada && tab.estado().contestada);
    return { mac, tab, ip, wifi, escalar };
}

beforeEach(() => {
    pcs = [];
    hitos.length = 0;
    fijarSumideroDiagnostico((l) => hitos.push(`${l.hito}${l.detalle ? ` ${l.detalle}` : ""}`));
    (globalThis as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = PCFalsa;
});

afterEach(() => {
    for (const m of motores.splice(0)) m.colgar();
    fijarSumideroDiagnostico(null);
    __fijarMotorWifiParaPruebas(null);
    delete (globalThis as unknown as { RTCPeerConnection?: unknown }).RTCPeerConnection;
});

/* ══════════════════════════════════ La escalada ══════════════════════════════════ */

describe("videollamada solo por Bluetooth: escalada automática al Wi-Fi directo", () => {
    it("pide el enlace con clase «llamada», lleva vídeo ligero mientras abre y sube a WebRTC SIN colgar", async () => {
        const { mac, tab, ip, wifi, escalar } = await escenario({ camara: true });

        // 1. El único camino es Bluetooth y hay cámara: pide el Wi-Fi directo (una vez) con el flujo local para retenerlo.
        await esperarHasta(() => escalar.mock.calls.length > 0);
        expect(escalar).toHaveBeenCalledTimes(1);
        expect(escalar.mock.calls[0][0]).toBe("llamada");
        expect(escalar.mock.calls[0][1]).toBe(mac.estado().participantes.find((p) => p.yo)?.stream);
        expect(hitos.some((h) => h.startsWith("escalada-wifi") && h.includes("clase=llamada"))).toBe(true);

        // 2. La voz va por el enlace de datos y el vídeo NO se bloquea: va ligero, en baja resolución.
        await esperarHasta(() => mac.estado().videoDatos?.enviando === true && mac.estado().medio?.tipo === "enlace-datos");
        let e = mac.estado();
        expect(e.videoNoDisponible).toBeNull();
        expect(e.videoDatos?.disponible).toBe(true);
        expect(e.videoDatos?.calidadTexto).toMatch(/^160×120 · 4 fps · 40 kbps/);
        expect(e.escalada?.texto).toBe(TEXTO_VIDEO_LIGERO_BLE);
        // El otro aparato recibe esa imagen y la ve como cámara remota.
        await esperarHasta(() => tab.estado().videoDatos?.recibiendo === true);
        expect(tab.estado().participantes.find((p) => !p.yo)?.stream?.getVideoTracks().length).toBe(1);

        // 3. El Wi-Fi directo se está abriendo.
        wifi.v = { paso: "abriendo", aviso: AVISO_RADIO_UNICA };
        await esperarHasta(() => mac.estado().escalada?.texto === TEXTO_ABRIENDO_WIFI);
        expect(mac.estado().escalada?.aviso).toBe(AVISO_RADIO_UNICA);
        expect(pcs.every((p) => p.reinicios === 0)).toBe(true); // aún sin ruta IP: no se toca WebRTC

        // 4. El enlace directo está activo (ruta IP): WebRTC reintenta por ella sin colgar.
        ip.v = true;
        wifi.v = { paso: "activo" };
        await esperarHasta(() => pcs.some((p) => p.reinicios > 0));
        expect(mac.estado().fase).toBe("en-curso");
        expect(mac.estado().medio?.tipo).toBe("enlace-datos"); // la voz sigue por Bluetooth hasta que WebRTC conecte

        // 5. WebRTC conecta. (LLA1110D) La voz que ya funciona por Bluetooth SE QUEDA (antes saltaba a WebRTC y el otro
        // extremo la rearrancaba: el salto de la prueba 33); el vídeo sube a WebRTC tras 3 s de evidencia, sin colgar.
        for (const p of pcs) p.fijarIce("connected");
        await esperarHasta(() => mac.estado().carriles?.[0]?.video === "webrtc", 6000);
        await esperarHasta(() => mac.estado().videoDatos == null, 3000);
        expect(mac.estado().medio?.tipo).toBe("enlace-datos");
        expect(mac.estado().carriles?.[0]?.voz).toBe("ble-l2cap");
        expect(hitos.some((h) => h.includes("vuelve a WebRTC sin cortar"))).toBe(false);
        expect(hitos.some((h) => h.startsWith("carril") && h.includes("flujo=video") && h.includes("a=webrtc"))).toBe(true);
        e = mac.estado();
        expect(e.fase).toBe("en-curso");
        expect(mac.cerrada).toBe(false);
        expect(tab.cerrada).toBe(false);
        expect(e.videoDatos).toBeNull();
        expect(e.escalada?.texto).toBe(TEXTO_VIDEO_WIFI_DIRECTO);
        expect(hitos.some((h) => h.startsWith("fallo"))).toBe(false);
    });

    it("«Preguntar»: mientras la persona decide se enseña la propuesta (con el aviso de la radio del Mac) y el vídeo ligero sigue", async () => {
        const { mac, wifi } = await escenario({ camara: true, wifi: { paso: "propuesta", aviso: AVISO_RADIO_UNICA } });
        await esperarHasta(() => mac.estado().escalada?.texto === TEXTO_PROPUESTA_WIFI);
        expect(mac.estado().escalada?.aviso).toContain("Este Mac tiene una sola radio Wi-Fi");
        await esperarHasta(() => mac.estado().videoDatos?.enviando === true);
        // La persona acepta: ahora abre.
        wifi.v = { paso: "abriendo" };
        await esperarHasta(() => mac.estado().escalada?.texto === TEXTO_ABRIENDO_WIFI);
    });

    it("«Nunca»: no se abre nada, no se toca WebRTC y la videollamada se queda en vídeo ligero por Bluetooth", async () => {
        const { mac, escalar } = await escenario({ camara: true, wifi: { paso: "no" } });
        await esperarHasta(() => mac.estado().videoDatos?.enviando === true);
        expect(mac.estado().escalada?.texto).toBe(TEXTO_WIFI_NUNCA);
        expect(escalar).toHaveBeenCalledTimes(1); // lo pide; el ajuste «Nunca» lo para en el motor Wi-Fi
        await new Promise((r) => setTimeout(r, 300));
        expect(pcs.every((p) => p.reinicios === 0)).toBe(true);
        expect(mac.estado().fase).toBe("en-curso");
    });

    it("sin vídeo ligero (sin códec en el aparato) la cámara sigue diciendo por qué no hay vídeo", async () => {
        const { mac } = await escenario({ camara: true, conVideo: false });
        await esperarHasta(() => mac.estado().medio?.tipo === "enlace-datos");
        expect(mac.estado().videoNoDisponible).toMatch(/vídeo no cabe por Bluetooth/);
        expect(mac.estado().videoDatos).toBeNull();
    });

    it("una llamada de solo voz con la voz buena NO pide el Wi-Fi directo; con ruta IP desde el principio tampoco toca ICE", async () => {
        const solo = await escenario({ camara: false });
        await esperarHasta(() => solo.mac.estado().medio?.tipo === "enlace-datos");
        await new Promise((r) => setTimeout(r, 300));
        expect(solo.escalar).not.toHaveBeenCalled();
        for (const m of motores.splice(0)) m.colgar();
        pcs = [];

        const conIp = await escenario({ camara: true, ip: true });
        await new Promise((r) => setTimeout(r, 300));
        expect(conIp.escalar).not.toHaveBeenCalled();
        expect(pcs.every((p) => p.reinicios === 0)).toBe(true);
    });

    it("compartir pantalla por Bluetooth pide clase «pantalla» y explica que irá por Wi-Fi directo", async () => {
        const { mac, escalar } = await escenario({ camara: false });
        await esperarHasta(() => mac.estado().medio?.tipo === "enlace-datos");
        expect(await mac.alternarPantalla()).toBeNull();
        await esperarHasta(() => escalar.mock.calls.some((c) => c[0] === "pantalla"));
        expect(mac.estado().videoNoDisponible).toMatch(/Wi‑Fi P2P/);
    });

    it("la cadena real: la llamada llama a avisarEnvioPesado → alNecesitarAncho con clase «llamada» y retiene el flujo", async () => {
        const necesitaAncho = vi.fn(async () => ({ accion: "nada", motivo: "prueba" }));
        const retenerFlujo = vi.fn();
        const uso = vi.fn();
        __fijarMotorWifiParaPruebas({ necesitaAncho, retenerFlujo, uso } as never);
        const { mac } = await escenario({
            camara: true,
            escalar: (clase, flujo) => avisarEnvioPesado({ clave: `t:${clase}`, destino: { neuronDeviceId: "neuronB" }, clase, flujo }),
        });
        await esperarHasta(() => necesitaAncho.mock.calls.length > 0);
        const arg = (necesitaAncho.mock.calls[0] as unknown[])[0] as { neurona: string; clase: string; enlaceActual: { tipo: string } };
        expect(arg.neurona).toBe("neuronB");
        expect(arg.clase).toBe("llamada");
        expect(retenerFlujo).toHaveBeenCalledTimes(1);
        // El flujo retenido es el local: al colgar sus pistas acaban y el enlace se suelta por las reglas de inactividad.
        const flujo = (retenerFlujo.mock.calls[0] as unknown[])[1] as { getTracks(): Array<{ readyState: string }> };
        expect(flujo.getTracks().some((t) => t.readyState === "live")).toBe(true);
        mac.colgar();
        expect(flujo.getTracks().every((t) => t.readyState === "ended")).toBe(true);
    });
});

/* ══════════════════════════════════ Piezas puras ══════════════════════════════════ */

describe("decisión de la escalada (pura)", () => {
    const base = { contestada: true, hayRutaIp: false as boolean | null, camara: false, pantalla: false, vozDatosActiva: true, nivelVoz: "buena" as "buena" | "regular" | "mala" | null };
    it("solo escala sin ruta IP y con algo que pedir", () => {
        expect(debeEscalar({ ...base, camara: true })).toBe(true);
        expect(debeEscalar({ ...base, pantalla: true })).toBe(true);
        expect(debeEscalar({ ...base, nivelVoz: "regular" })).toBe(true); // la voz también quiere mejor calidad
        expect(debeEscalar({ ...base, nivelVoz: "mala" })).toBe(true);
        expect(debeEscalar({ ...base })).toBe(false);
        expect(debeEscalar({ ...base, camara: true, hayRutaIp: true })).toBe(false);
        expect(debeEscalar({ ...base, camara: true, hayRutaIp: null })).toBe(false);
        expect(debeEscalar({ ...base, camara: true, contestada: false })).toBe(false);
        expect(claseEscalada({ pantalla: true })).toBe("pantalla");
        expect(claseEscalada({ pantalla: false })).toBe("llamada");
    });

    it("el ajuste decide: Automático abre, Preguntar propone, Nunca no hace nada (para clase «llamada» por Bluetooth)", () => {
        const comun = {
            clase: "llamada" as const,
            capPropia: { plataforma: "macos" as const, ap: ["hotspot-local" as const], cliente: ["corewlan" as const], permiso: "concedido" as const, radioUnica: true, wifi: true, lanas: ["punto-acceso-optin" as const] },
            enlaceActual: { tipo: "ble" as const, kbps: 200 },
            cerca: true,
            fase: "inactivo" as const,
            ahora: Date.now(),
        };
        const r = (ajuste: "automatico" | "preguntar" | "nunca") => decidirEnlaceWifi({ ...comun, ajuste });
        expect(r("automatico").accion).toBe("abrir");
        expect(r("preguntar").accion).toBe("proponer");
        expect(r("preguntar").aviso).toBe(AVISO_RADIO_UNICA); // el Mac sale de su Wi-Fi de casa mientras dure
        expect(r("nunca").accion).toBe("nada");
    });

    it("el paso del enlace respecto a esa neurona y los textos de cada paso", () => {
        const vacia = { estado: { fase: "inactivo", otro: null }, propuesta: null, pregunta: null, avisoRadio: null };
        expect(pasoWifiDe(vacia, "n1", "preguntar").paso).toBe("inactivo");
        expect(pasoWifiDe(vacia, "n1", "nunca").paso).toBe("no");
        expect(pasoWifiDe({ ...vacia, propuesta: { neurona: "n1" } }, "n1", "preguntar").paso).toBe("propuesta");
        expect(pasoWifiDe({ ...vacia, pregunta: { otro: "n1" } }, "n1", "preguntar").paso).toBe("propuesta"); // la otra neurona pide
        expect(pasoWifiDe({ ...vacia, estado: { fase: "esperando-red", otro: "n1" } }, "n1", "automatico").paso).toBe("abriendo");
        expect(pasoWifiDe({ ...vacia, estado: { fase: "activo", otro: "n1" }, avisoRadio: "x" }, "n1", "automatico")).toEqual({ paso: "activo", aviso: "x" });
        expect(pasoWifiDe({ ...vacia, estado: { fase: "activo", otro: "n2" } }, "n1", "automatico").paso).toBe("inactivo"); // otro enlace, otra neurona

        const t = (p: Parameters<typeof textoEscalada>[0]) => textoEscalada(p);
        expect(t({ paso: "abriendo", webrtcConectado: false, videoPedido: true, videoDatosActivo: false })).toBe("Abriendo Wi‑Fi P2P…");
        expect(t({ paso: "inactivo", webrtcConectado: false, videoPedido: true, videoDatosActivo: false })).toBe("Voz por Bluetooth · el video llegará al abrir el Wi‑Fi P2P");
        expect(t({ paso: "inactivo", webrtcConectado: false, videoPedido: true, videoDatosActivo: true })).toBe("Video ligero por Bluetooth (baja resolución)");
        expect(t({ paso: "activo", webrtcConectado: true, videoPedido: true, videoDatosActivo: false })).toBe("Video por Wi‑Fi P2P (sin router ni hotspot)");
        expect(t({ paso: "inactivo", webrtcConectado: false, videoPedido: false, videoDatosActivo: false })).toBeNull();
        expect(TEXTO_VOZ_BLE_ESPERANDO_WIFI).toContain("el video llegará al abrir el Wi‑Fi P2P");
    });
});

/* ══════════════════════════════════ La matriz ══════════════════════════════════ */

describe("matriz de controles con vídeo ligero", () => {
    const ctx = (c: Partial<ContextoMatriz>): ContextoMatriz => ({
        tipo: "voz",
        medio: "bluetooth",
        entorno: { pantalla: true, androidWebView: false, movil: false, camaras: 1, pip: true, pantallaCompleta: true, setSinkId: true, rutasNativas: 0, grabadora: true },
        personas: 2,
        camaraEncendida: false,
        pantallaCompartida: false,
        hayVideoRemoto: false,
        soyCreador: true,
        viva: true,
        ...c,
    });

    it("sin vídeo ligero la cámara sigue apagada por Bluetooth (como antes); con vídeo ligero se habilita", () => {
        expect(disponibilidad("camara", ctx({})).ok).toBe(false);
        expect(disponibilidad("camara", ctx({})).motivo).toBe(MOTIVO_VIDEO_BLUETOOTH);
        expect(disponibilidad("camara", ctx({ videoLigero: true })).ok).toBe(true);
        expect(disponibilidad("tipo-video", ctx({ videoLigero: true })).ok).toBe(true);
        expect(disponibilidad("camara", ctx({ videoLigero: true, medio: "enlace-datos" })).ok).toBe(true);
        expect(disponibilidad("camara", ctx({ videoLigero: true, medio: "webrtc" })).ok).toBe(true);
    });

    it("la pantalla por Bluetooth sigue desactivada, con un motivo que habla del Wi-Fi directo automático", () => {
        const d = disponibilidad("pantalla", ctx({ videoLigero: true, escalaWifi: true }));
        expect(d.ok).toBe(false);
        expect(d.motivo).toBe(MOTIVO_PANTALLA_BLUETOOTH);
        expect(d.motivo).toMatch(/Wi‑Fi directo/);
        expect(disponibilidad("pantalla", ctx({ videoLigero: true })).motivo).toBe(MOTIVO_VIDEO_BLUETOOTH);
        expect(disponibilidad("pantalla", ctx({ medio: "webrtc", escalaWifi: true })).ok).toBe(true);
    });

    it("ningún botón muerto: todo control desactivado trae motivo", () => {
        const c = ctx({ videoLigero: true, escalaWifi: true });
        const motivos = motivosDesactivados(c);
        for (const id of CONTROLES) if (!disponibilidad(id, c).ok) expect(motivos[id]).toBeTruthy();
    });
});

/* ══════════════════════ Voz: códec por sentido y recuperación ══════════════════════ */

describe("negociación del códec de voz", () => {
    const opusFalso = (): FabricaCodecs => {
        const simples = fabricaCodecsSimples();
        return {
            soportados: () => ["opus", ...simples.soportados()],
            codificador: (c) =>
                c === "opus"
                    ? (() => {
                          let cb: (b: Uint8Array) => void = () => undefined;
                          return { codificar: (pcm: Int16Array) => cb(new Uint8Array(pcm.length / 16).fill(3)), alSalir: (f: (b: Uint8Array) => void) => void (cb = f), cerrar: () => undefined };
                      })()
                    : simples.codificador(c),
            decodificador: (c) =>
                c === "opus"
                    ? (() => {
                          let cb: (p: Int16Array, q: number) => void = () => undefined;
                          return { decodificar: (_b: Uint8Array, q: number) => cb(new Int16Array(320), q), alPcm: (f: (p: Int16Array, q: number) => void) => void (cb = f), cerrar: () => undefined };
                      })()
                    : simples.decodificador(c),
        };
    };

    function reloj() {
        let t = 0;
        const timers: Array<{ fn: () => void; ms: number; prox: number; vivo: boolean }> = [];
        return {
            ahora: () => t,
            cada(fn: () => void, ms: number) {
                const x = { fn, ms, prox: t + ms, vivo: true };
                timers.push(x);
                return () => void (x.vivo = false);
            },
            avanzar(ms: number) {
                const fin = t + ms;
                while (t < fin) {
                    t = Math.min(fin, t + 5);
                    for (const x of timers.slice()) while (x.vivo && x.prox <= t) {
                        x.prox += x.ms;
                        x.fn();
                    }
                }
            },
        };
    }

    it("cada lado anota el códec final por sentido: A (Opus+ADPCM) con B (solo ADPCM) acaban en ADPCM en los dos", async () => {
        const r = reloj();
        const d = enlaceDatos();
        const hA: string[] = [];
        const hB: string[] = [];
        const a = new SesionVozDatos({ idLlamada: "s", transporte: d.a, audio: audioFalso(), codecs: opusFalso(), reloj: r, anotar: (h) => hA.push(h) });
        const b = new SesionVozDatos({ idLlamada: "s", transporte: d.b, audio: audioFalso(), codecs: fabricaCodecsSimples(), reloj: r, anotar: (h) => hB.push(h) });
        await a.iniciar();
        await b.iniciar();
        await Promise.resolve();
        await Promise.resolve();
        r.avanzar(200);
        expect(a.estado().codecTx).toBe("adpcm");
        expect(b.estado().codecTx).toBe("adpcm");
        expect(hA.some((h) => h.startsWith("voz-datos tx=adpcm"))).toBe(true);
        expect(hB.some((h) => h.startsWith("voz-datos tx=adpcm"))).toBe(true);
        a.detener();
        b.detener();
    });

    it("si llega un códec que este lado no sabe decodificar, lo anota y vuelve a saludar para que el otro rehaga la elección", async () => {
        const r = reloj();
        const d = enlaceDatos();
        const hB: string[] = [];
        const saludos: string[] = [];
        const b = new SesionVozDatos({ idLlamada: "s", transporte: d.b, audio: audioFalso(), codecs: fabricaCodecsSimples(), reloj: r, anotar: (h) => hB.push(h) });
        d.a.alRecibir((t) => {
            if (leerControl(t)?.k === "hola") saludos.push(t);
        });
        await b.iniciar();
        await Promise.resolve();
        const antes = saludos.length;
        // El otro (que supuso mal) manda Opus.
        d.a.enviar(armarPaquete({ s: "s", q: 0, ts: 0, c: "opus", f: MS_TRAMA, tramas: [new Uint8Array(20).fill(1)] }));
        await Promise.resolve();
        await Promise.resolve();
        expect(hB).toContain("voz-datos rx-sin-decodificador codec=opus");
        expect(saludos.length).toBe(antes + 1);
        // No se repite en cada paquete.
        d.a.enviar(armarPaquete({ s: "s", q: 1, ts: 0, c: "opus", f: MS_TRAMA, tramas: [new Uint8Array(20).fill(1)] }));
        await Promise.resolve();
        await Promise.resolve();
        expect(saludos.length).toBe(antes + 1);
        expect(esTextoVoz(saludos[0])).toBe(true);
        b.detener();
    });
});
