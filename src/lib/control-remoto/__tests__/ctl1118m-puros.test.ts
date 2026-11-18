/**
 * CTL1118M · piezas puras: automático inteligente (auto-enlace), pantalla por la malla (cuadro-malla) y WebRTC en Linux.
 */
import { describe, expect, it } from "vitest";
import {
    CAUDAL_NOMINAL_KBPS, MEJORA_RTT_MS, PERMANENCIA_MS, REEVALUAR_MS, elegirOrdenesAuto, elegirPantallaAuto, enlacesAuto, lineaCambioMedio, tocaReevaluar,
    type EnlaceAuto,
} from "../auto-enlace";
import {
    ESPERA_ICE_MS, MAX_CUADRO_BYTES, UMBRALES_MALLA, PARTE_CUADRO_MAX, ReensambladorCuadro, causaParaMalla, leerParteCuadro, lineaVia, partirCuadro, planPorCamino, rotuloVia, validarPideCuadro,
} from "../cuadro-malla";
import { ORDEN_APT_WEBRTC, esLinuxEscritorio, faltaWebrtcLinux, lineaWebrtcLinux } from "../webrtc-linux";
import { NIVELES_CUADRO, RITMO_INICIAL, siguienteRitmo } from "../ritmo-pantalla";
import { definicion } from "../niveles";
import type { CandidatoMedio } from "@/lib/mensajeria/medios/tipos";

const cand = (enlaceId: string, extra: Partial<CandidatoMedio> = {}): CandidatoMedio =>
    ({ enlaceId, abierto: true, llega: true, rttMs: null, ...extra }) as CandidatoMedio;
const en = (enlaceId: string, o: Partial<EnlaceAuto> = {}): EnlaceAuto => ({ enlaceId, medio: "red-local", directo: true, rttMs: 20, kbps: 5000, kbpsMedido: true, ...o });

describe("auto-enlace · órdenes: el directo de menor latencia", () => {
    it("sin previo elige el de menor latencia medida; sin medir queda detrás de uno medido", () => {
        const r = elegirOrdenesAuto([en("a", { rttMs: 80 }), en("b", { rttMs: 12 }), en("c", { rttMs: null })], null, { ahora: 1000 });
        expect(r.enlace?.enlaceId).toBe("b");
        expect(r.causa).toBe("inicial");
        expect(r.cambia).toBe(true);
    });
    it("un directo gana SIEMPRE a lo que no es directo (relevo, capa)", () => {
        const r = elegirOrdenesAuto([en("capa", { directo: false, rttMs: 1 }), en("lento", { rttMs: 300 })], null, { ahora: 1 });
        expect(r.enlace?.enlaceId).toBe("lento");
    });
    it("sin ningún directo no hay enlace (las órdenes irán por el relevo)", () => {
        const r = elegirOrdenesAuto([en("x", { directo: false })], { enlaceId: "x", desde: 0 }, { ahora: 10 });
        expect(r.enlace).toBeNull();
        expect(r.causa).toBe("sin-directos");
    });
    it("histéresis: no deja el enlace en uso por otro algo mejor ni antes de la permanencia", () => {
        const previo = { enlaceId: "a", desde: 1000 };
        const lista = [en("a", { rttMs: 50 }), en("b", { rttMs: 20 })];
        expect(elegirOrdenesAuto(lista, previo, { ahora: 1000 + PERMANENCIA_MS - 1 }).enlace?.enlaceId).toBe("a");
        // pasado el tiempo y claramente mejor (30 ms y 60 %)
        const r = elegirOrdenesAuto(lista, previo, { ahora: 1000 + PERMANENCIA_MS });
        expect(r.enlace?.enlaceId).toBe("b");
        expect(r.causa).toBe("mejor-latencia");
        // una mejora pequeña no cambia nunca
        const casi = [en("a", { rttMs: 50 }), en("b", { rttMs: 50 - MEJORA_RTT_MS + 1 })];
        expect(elegirOrdenesAuto(casi, previo, { ahora: 99_999 }).enlace?.enlaceId).toBe("a");
        const poco = [en("a", { rttMs: 400 }), en("b", { rttMs: 330 })]; // 70 ms pero 17 %
        expect(elegirOrdenesAuto(poco, previo, { ahora: 99_999 }).enlace?.enlaceId).toBe("a");
    });
    it("si el enlace en uso falla o desaparece, se cambia de inmediato", () => {
        const previo = { enlaceId: "a", desde: 1000 };
        const lista = [en("a", { rttMs: 5 }), en("b", { rttMs: 40 })];
        const fallo = elegirOrdenesAuto(lista.filter((e) => e.enlaceId !== "a"), previo, { ahora: 1001, fallidos: new Set(["a"]) });
        expect(fallo.enlace?.enlaceId).toBe("b");
        expect(fallo.causa).toBe("fallo-del-anterior");
        const caido = elegirOrdenesAuto([en("b")], previo, { ahora: 1001 });
        expect(caido.causa).toBe("anterior-caido");
    });
});

describe("auto-enlace · pantalla: el directo de más caudal", () => {
    it("elige el de más caudal y solo cambia con ≥ 50 % más", () => {
        const lista = [en("lento", { kbps: 1000 }), en("rapido", { kbps: 8000 })];
        expect(elegirPantallaAuto(lista, null, { ahora: 1 }).enlace?.enlaceId).toBe("rapido");
        const previo = { enlaceId: "lento", desde: 0 };
        expect(elegirPantallaAuto(lista, previo, { ahora: PERMANENCIA_MS }).causa).toBe("mas-caudal");
        const parecido = [en("lento", { kbps: 1000 }), en("otro", { kbps: 1400 })];
        expect(elegirPantallaAuto(parecido, previo, { ahora: 99_999 }).enlace?.enlaceId).toBe("lento");
    });
});

describe("auto-enlace · de candidatos a enlaces y el caso capa:nodo", () => {
    it("no cuenta los relevos ni los cerrados ni los fallidos; separa directos de capa", () => {
        const lista = enlacesAuto(
            [cand("nativo:10.0.0.2", { rttMs: 9 }), cand("relevo:xyz"), cand("cerrado", { abierto: false }), cand("malo", { rttMs: 3 })],
            { ahora: 1, fallidos: new Set(["malo"]) },
        );
        expect(lista.map((e) => e.enlaceId)).toEqual(["nativo:10.0.0.2"]);
    });
    it("kbps: medido manda, si no la capacidad del candidato, si no el nominal del tipo", () => {
        const [a, b] = enlacesAuto([cand("a", { capacidadKbps: 777 }), cand("b")], { ahora: 1, caudalMedido: new Map([["b", 4321]]) });
        expect(a.kbps).toBe(777);
        expect(a.kbpsMedido).toBe(true);
        expect(b.kbps).toBe(4321);
        expect(Object.values(CAUDAL_NOMINAL_KBPS).every((n) => n > 0)).toBe(true);
    });
    it("reevaluar cada REEVALUAR_MS o ya si falló", () => {
        expect(tocaReevaluar(0, REEVALUAR_MS - 1, false)).toBe(false);
        expect(tocaReevaluar(0, REEVALUAR_MS, false)).toBe(true);
        expect(tocaReevaluar(0, 1, true)).toBe(true);
    });
});

describe("auto-enlace · línea de registro", () => {
    it("control-medio cambio de=… a=… causa=… ms=N kbps=N", () => {
        const l = lineaCambioMedio({ de: null, a: en("a", { medio: "wifi-directo" }), causa: "mejor-latencia", ms: 12.4, kbps: 5000.2 });
        expect(l).toBe("control-medio cambio uso=ordenes de=ninguno a=directo:wifi-directo causa=mejor-latencia ms=12 kbps=5000");
        expect(lineaCambioMedio({ de: null, a: null, causa: "Raro Texto!", ms: null, kbps: null, uso: "pantalla" })).toBe("control-medio cambio uso=pantalla de=ninguno a=ninguno causa=otra ms=sin-medir kbps=sin-medir");
    });
});

describe("cuadro-malla · partes", () => {
    const jpeg = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) & 255);
    it("parte y reensambla un cuadro (con partes en cualquier orden)", () => {
        const j = jpeg(PARTE_CUADRO_MAX * 2 + 123);
        const ps = partirCuadro(j, 7);
        expect(ps).toHaveLength(3);
        const re = new ReensambladorCuadro();
        expect(re.meter(ps[2])).toBeNull();
        expect(re.meter(ps[0])).toBeNull();
        expect(re.meter(ps[1])).toEqual(j);
    });
    it("rechaza lo vacío o demasiado grande y las partes mal formadas", () => {
        expect(() => partirCuadro(new Uint8Array(0), 1)).toThrow("demasiado-grande");
        expect(() => partirCuadro(new Uint8Array(MAX_CUADRO_BYTES + 1), 1)).toThrow("demasiado-grande");
        const [p] = partirCuadro(jpeg(100), 1);
        expect(leerParteCuadro(p)).toEqual(p);
        expect(leerParteCuadro({ ...p, datos: "***" })).toBeNull();
        expect(leerParteCuadro({ ...p, total: 5000 })).toBeNull();
        expect(leerParteCuadro({ ...p, i: 3 })).toBeNull();
        expect(leerParteCuadro(null)).toBeNull();
    });
    it("partes de cuadros con tamaño distinto no se mezclan", () => {
        const re = new ReensambladorCuadro();
        const a = partirCuadro(jpeg(PARTE_CUADRO_MAX + 5), 1);
        re.meter(a[0]);
        expect(() => re.meter({ ...a[1], total: a[1].total + 1 })).toThrow("cuadro-incoherente");
    });
});

describe("cuadro-malla · la orden pantalla-cuadro", () => {
    it("valida los argumentos con la forma exacta", () => {
        expect(validarPideCuadro({ desde: 0, pide: 0 })).toEqual({ desde: 0, pide: 0 });
        expect(validarPideCuadro({ desde: 4, pide: 0, nivel: 2 })).toEqual({ desde: 4, pide: 0, nivel: 2 });
        expect(validarPideCuadro({ desde: 4, pide: 2, num: 9 })).toEqual({ desde: 4, pide: 2, num: 9 });
        expect(validarPideCuadro({ desde: 4, pide: 2 })).toBeNull(); // falta num
        expect(validarPideCuadro({ desde: 4, pide: 0, num: 1 })).toBeNull();
        expect(validarPideCuadro({ desde: 4, pide: 1, num: 1, nivel: 1 })).toBeNull(); // nivel solo en la parte 0
        expect(validarPideCuadro({ desde: 0, pide: 0, nivel: NIVELES_CUADRO.length })).toBeNull();
        expect(validarPideCuadro({ desde: 0, pide: 0, extra: 1 } as never)).toBeNull();
        expect(validarPideCuadro({ desde: -1, pide: 0 })).toBeNull();
    });
    it("es una acción de nivel «ver» (no hace falta controlar) y cuenta como señal", () => {
        const a = definicion("pantalla-cuadro");
        expect(a?.nivel).toBe("ver");
        expect(a?.senal).toBe(true);
    });
});

describe("cuadro-malla · ritmo, camino, texto y causa", () => {
    it("con umbrales de malla se baja de nivel antes que con los de WebRTC", () => {
        let web = RITMO_INICIAL, malla = RITMO_INICIAL;
        for (let i = 0; i < 4; i++) {
            web = siguienteRitmo(web, 120).estado;
            malla = siguienteRitmo(malla, 120, UMBRALES_MALLA).estado;
        }
        expect(web.nivel).toBeGreaterThan(0); // 120 ms ya es alto para WebRTC
        expect(malla.nivel).toBe(0); // y es normal por la malla (alto = 250)
        let m = RITMO_INICIAL;
        for (let i = 0; i < 4; i++) m = siguienteRitmo(m, 400, UMBRALES_MALLA).estado;
        expect(m.nivel).toBeGreaterThan(0);
    });
    it("por un camino que no es directo: nivel mínimo y pausa; directo: el pedido sin pausa", () => {
        expect(planPorCamino("capa", 0)).toEqual({ nivel: NIVELES_CUADRO.length - 1, pausaMs: 500 });
        expect(planPorCamino("directo", 1)).toEqual({ nivel: 1, pausaMs: 0 });
    });
    it("la línea control-fuente y el rótulo dicen la vía real y los cuadros/s medidos", () => {
        expect(lineaVia({ via: "malla", enlace: "red-local", cuadrosS: 6.04 })).toBe("control-fuente paso=via via=malla enlace=red-local cuadros-s=6");
        expect(lineaVia({ via: "webrtc", enlace: null, cuadrosS: null, causa: "ice-fallido", kbps: 120, nivel: 2 })).toBe("control-fuente paso=via via=webrtc enlace=sin-determinar cuadros-s=sin-medir causa=ice-fallido kbps=120 nivel=2");
        expect(rotuloVia("malla", "red-local", 6.5)).toBe("Pantalla por la malla · red-local · 6,5 cuadros/s");
        expect(rotuloVia("webrtc", null, undefined)).toBe("Pantalla por WebRTC");
        expect(rotuloVia("malla", null, 1)).not.toMatch(/Mando/);
    });
    it("cuándo pasar a la malla", () => {
        expect(causaParaMalla({ hayWebRtc: false })).toBe("sin-webrtc");
        expect(causaParaMalla({ hayWebRtc: true, fallo: "senal-oferta-timeout" })).toBe("sin-oferta");
        expect(causaParaMalla({ hayWebRtc: true, conexion: "failed" })).toBe("ice-fallido");
        expect(causaParaMalla({ hayWebRtc: true, estado: "conectando", msConectando: ESPERA_ICE_MS })).toBe("ice-sin-conexion");
        expect(causaParaMalla({ hayWebRtc: true, estado: "conectando", msConectando: 100 })).toBeNull();
        expect(causaParaMalla({ hayWebRtc: true, estado: "conectado" })).toBeNull();
    });
});

describe("webrtc-linux", () => {
    it("la orden es exactamente la pedida", () => {
        expect(ORDEN_APT_WEBRTC).toBe("su -c 'apt-get install -y gstreamer1.0-nice gstreamer1.0-plugins-bad'");
    });
    it("solo falta en Linux: sin peer siempre; con peer, si lo nativo midió y faltan elementos", () => {
        expect(faltaWebrtcLinux({ linux: false, hayPeer: false, nativo: null })).toBe(false);
        expect(faltaWebrtcLinux({ linux: true, hayPeer: false, nativo: null })).toBe(true);
        expect(faltaWebrtcLinux({ linux: true, hayPeer: true, nativo: null })).toBe(false);
        expect(faltaWebrtcLinux({ linux: true, hayPeer: true, nativo: { linux: true, sabido: true, faltan: ["nice"] } })).toBe(true);
        expect(faltaWebrtcLinux({ linux: true, hayPeer: true, nativo: { linux: true, sabido: false, faltan: [] } })).toBe(false); // no se acusa sin medir
    });
    it("la línea del registro lleva faltan= y orden=", () => {
        const l = lineaWebrtcLinux({ hayPeer: true, nativo: { linux: true, sabido: true, faltan: ["nice", "webrtcbin", "Mal Texto"] } });
        expect(l).toBe(`llamada webrtc-linux peer=si gstreamer=medido faltan=nice,webrtcbin orden=${ORDEN_APT_WEBRTC}`);
        expect(lineaWebrtcLinux({ hayPeer: false, nativo: null })).toContain("faltan=ninguno");
    });
    it("distingue Linux de escritorio de Android", () => {
        expect(esLinuxEscritorio("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15")).toBe(true);
        expect(esLinuxEscritorio("Mozilla/5.0 (Linux; Android 14)")).toBe(false);
        expect(esLinuxEscritorio(undefined)).toBe(false);
    });
});
