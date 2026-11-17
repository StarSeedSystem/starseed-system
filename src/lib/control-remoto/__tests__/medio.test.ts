// @vitest-environment jsdom
/**
 * CTL1117B · el medio del control: lo que se usa de verdad (enlaces y estadísticas WebRTC), las opciones con su motivo,
 * lo guardado (con valores antiguos), la política de la pantalla y que elegir un medio cambia lo que se pide al canal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    CLAVE_MEDIO, MEDIOS_ELEGIBLES, canalDatosPermitido, conEleccion, cumpleEleccion, eleccionDe, filtrarSdp, leerElecciones, lineaRegistroMedio, medioDeEnlaceUsado,
    medioDeEstadisticas, opcionesDeMedio, planOrdenes, politicaIce, serializarElecciones, SIN_DETERMINAR, type ContextoMedio,
} from "../medio";
import { textoMedioReal } from "../medio-palabras";
import { __fijarContexto, __olvidarMedio, enviarOrdenPorMedio, eleccionActual, fijarEleccion, configuracionIce, filtrarRespuesta, instantaneaMedio } from "../medio-estado";
import { palabrasMotivo } from "../palabras";
import type { CandidatoMedio } from "@/lib/mensajeria/medios/tipos";

const cand = (enlaceId: string, medio: CandidatoMedio["medio"], extra: Partial<CandidatoMedio> = {}): CandidatoMedio => ({ enlaceId, medio, etiqueta: enlaceId, abierto: true, llega: true, rttMs: null, ruta: null, ...extra });
const ctx = (c: CandidatoMedio[], extra: Partial<ContextoMedio> = {}): ContextoMedio => ({ candidatos: c, relevoPorNodo: false, hayTurn: true, wifiDirecto: null, ...extra });

describe("medio real de un enlace", () => {
    it("traduce cada enlace del transporte", () => {
        expect(medioDeEnlaceUsado(cand("ble:1", "bluetooth"))).toEqual({ camino: "directo", medio: "bluetooth" });
        expect(medioDeEnlaceUsado(cand("nativo:192.168.1.5", "local"))).toEqual({ camino: "directo", medio: "red-local" });
        expect(medioDeEnlaceUsado(cand("nativo:192.168.49.2", "local"), (id) => id.includes("49."))).toEqual({ camino: "directo", medio: "wifi-directo" });
        expect(medioDeEnlaceUsado(cand("cuenta:x", "wifi-local", { ruta: "misma-red-local" })).medio).toBe("red-local");
        expect(medioDeEnlaceUsado(cand("cuenta:x", "p2p-internet", { ruta: "internet-directo" }))).toEqual({ camino: "directo", medio: "internet" });
        expect(medioDeEnlaceUsado(cand("cuenta:x", "turn"))).toEqual({ camino: "capa", medio: "turn" });
        expect(medioDeEnlaceUsado(cand("rele", "rele"))).toEqual({ camino: "capa", medio: "servidor" });
        expect(medioDeEnlaceUsado(cand("relevo:n2", "p2p-internet"))).toEqual({ camino: "capa", medio: "nodo" });
    });
    it("P2P con la ruta sin medir no inventa la red", () => {
        const r = medioDeEnlaceUsado(cand("cuenta:x", "p2p-internet", { ruta: null }));
        expect(r.camino).toBe("directo");
        expect(r.medio).toBeNull();
        expect(textoMedioReal(r)).toBe("Directo · ruta sin medir");
    });
});

describe("medio real a partir de estadísticas WebRTC", () => {
    const stats = (local: Record<string, unknown>, remoto: Record<string, unknown>, par: Record<string, unknown> = {}) => [
        { id: "T", type: "transport", selectedCandidatePairId: "P" },
        { id: "P", type: "candidate-pair", state: "succeeded", nominated: true, localCandidateId: "L", remoteCandidateId: "R", currentRoundTripTime: 0.02, ...par },
        { id: "L", type: "local-candidate", ...local },
        { id: "R", type: "remote-candidate", ...remoto },
    ];
    it("host contra host en la misma subred es la red local, con el tipo de red", () => {
        const r = medioDeEstadisticas(stats({ candidateType: "host", address: "192.168.1.10", networkType: "wifi" }, { candidateType: "host", address: "192.168.1.20" }), 1);
        expect(r).toEqual({ camino: "directo", medio: "red-local", nota: "Wi‑Fi" });
        expect(textoMedioReal(r)).toBe("Directo · Wi‑Fi de la red local (router) (Wi‑Fi)");
    });
    it("srflx es internet directo (datos móviles)", () => {
        const r = medioDeEstadisticas(stats({ candidateType: "srflx", address: "83.1.1.1", networkType: "cellular" }, { candidateType: "srflx", address: "90.2.2.2" }), 1);
        expect(r).toMatchObject({ camino: "directo", medio: "internet", nota: "datos móviles" });
    });
    it("relay es por capa (servidor de retransmisión)", () => {
        expect(medioDeEstadisticas(stats({ candidateType: "relay", address: "1.2.3.4" }, { candidateType: "host", address: "10.0.0.2" }), 1)).toEqual({ camino: "capa", medio: "turn" });
    });
    it("la subred del enlace Wi‑Fi directo lo distingue del router", () => {
        const s = stats({ candidateType: "host", address: "192.168.49.1" }, { candidateType: "host", address: "192.168.49.2" });
        expect(medioDeEstadisticas(s, 1, { ipOtroWifiDirecto: "192.168.49.2" }).medio).toBe("wifi-directo");
        expect(medioDeEstadisticas(s, 1).medio).toBe("red-local");
    });
    it("sin par elegido, sin determinar", () => {
        expect(medioDeEstadisticas([], 1)).toEqual(SIN_DETERMINAR);
        expect(textoMedioReal(SIN_DETERMINAR)).toBe("sin determinar");
    });
});

describe("opciones apagadas con su motivo", () => {
    it("sin enlaces solo «Automático» está encendida y las demás dicen por qué", () => {
        const o = opcionesDeMedio(ctx([], { hayTurn: null }));
        expect(o.map((x) => x.id)).toEqual([...MEDIOS_ELEGIBLES]);
        expect(o[0].disponible).toBe(true);
        for (const x of o.slice(1)) {
            expect(x.disponible).toBe(false);
            expect(x.motivoNo).toMatch(/\.$/);
        }
    });
    it("con Bluetooth y red local: se encienden las suyas y la pantalla por Bluetooth se marca «aún no»", () => {
        const o = Object.fromEntries(opcionesDeMedio(ctx([cand("ble:1", "bluetooth"), cand("nativo:10.0.0.5", "local")])).map((x) => [x.id, x]));
        expect(o.bluetooth.disponible).toBe(true);
        expect(o.bluetooth.pantalla).toBe("aun-no");
        expect(o["wifi-router"].disponible).toBe(true);
        expect(o["wifi-router"].pantalla).toBe("forzada");
        expect(o.malla.disponible).toBe(true);
        expect(o["wifi-directo"].disponible).toBe(false);
        expect(o.nodos.disponible).toBe(false);
    });
    it("nodos se enciende con un nodo de relevo; sin TURN la pantalla no se puede forzar", () => {
        const o = Object.fromEntries(opcionesDeMedio(ctx([], { relevoPorNodo: true, hayTurn: false })).map((x) => [x.id, x]));
        expect(o.nodos.disponible).toBe(true);
        expect(o.nodos.pantalla).toBe("aun-no");
    });
    it("un enlace cerrado o que no llega no cuenta", () => {
        const o = opcionesDeMedio(ctx([cand("ble:1", "bluetooth", { abierto: false }), cand("nativo:1.1.1.1", "local", { llega: false })]));
        expect(o.find((x) => x.id === "bluetooth")?.disponible).toBe(false);
        expect(o.find((x) => x.id === "wifi-router")?.disponible).toBe(false);
    });
});

describe("lo guardado", () => {
    it("lo que no hay o no se entiende queda en automático", () => {
        for (const crudo of [null, undefined, "", "{", "[]", "3", '{"v":9,"porNeurona":{"a":"teletransporte"}}', '{"a":"wifi"}', '{"porNeurona":[1]}']) {
            expect(eleccionDe(leerElecciones(crudo as string), "a")).toBe("auto");
        }
    });
    it("guarda y lee por aparato; automático no se guarda", () => {
        let m = conEleccion({}, "tableta", "malla");
        m = conEleccion(m, "otra", "bluetooth");
        const leido = leerElecciones(serializarElecciones(m));
        expect(eleccionDe(leido, "tableta")).toBe("malla");
        expect(eleccionDe(leido, "otra")).toBe("bluetooth");
        expect(eleccionDe(leido, "nueva")).toBe("auto");
        expect(Object.keys(leerElecciones(serializarElecciones(conEleccion(m, "tableta", "auto"))))).toEqual(["otra"]);
    });
    it("una forma antigua plana se aprovecha y una opción desconocida se ignora sin romper las demás", () => {
        const leido = leerElecciones('{"t":"wifi-router","u":"opcion-futura"}');
        expect(eleccionDe(leido, "t")).toBe("wifi-router");
        expect(eleccionDe(leido, "u")).toBe("auto");
    });
    it("el almacén de la página: valor por defecto, persistencia y clave propia", () => {
        __olvidarMedio();
        window.localStorage.removeItem(CLAVE_MEDIO);
        expect(eleccionActual("t1")).toBe("auto");
        fijarEleccion("t1", "bluetooth");
        expect(JSON.parse(window.localStorage.getItem(CLAVE_MEDIO) as string).porNeurona).toEqual({ t1: "bluetooth" });
        __olvidarMedio();
        expect(eleccionActual("t1")).toBe("bluetooth");
        window.localStorage.setItem(CLAVE_MEDIO, '{"basura":true}');
        __olvidarMedio();
        expect(eleccionActual("t1")).toBe("auto");
    });
});

describe("elegir un medio cambia lo que se pide al canal", () => {
    const links = [cand("ble:1", "bluetooth", { rttMs: 80 }), cand("nativo:10.0.0.5", "local", { rttMs: 5 }), cand("cuenta:z", "p2p-internet", { ruta: "internet-directo", rttMs: 30 })];
    it("el plan de órdenes de cada elección", () => {
        const c = ctx(links);
        expect(planOrdenes("auto", c).automatico).toBe(true);
        expect(planOrdenes("bluetooth", c).pasos.map((p) => p.enlaceId)).toEqual(["ble:1"]);
        expect(planOrdenes("wifi-router", c).pasos.map((p) => p.enlaceId)).toEqual(["nativo:10.0.0.5"]);
        expect(planOrdenes("malla", c).pasos.map((p) => p.enlaceId)).toEqual(["nativo:10.0.0.5", "cuenta:z", "ble:1"]);
        expect(planOrdenes("malla", c, 1).pasos[0].enlaceId).toBe("cuenta:z"); // reparte la carga girando
        expect(planOrdenes("nodos", ctx(links, { relevoPorNodo: true })).porNodo).toBe(true);
        expect(planOrdenes("nodos", c).porNodo).toBe(false);
    });
    beforeEach(() => {
        __olvidarMedio();
        window.localStorage.removeItem(CLAVE_MEDIO);
    });
    it("el envío usa solo el enlace del medio elegido", async () => {
        const enviarMensaje = vi.fn(async (_d: unknown) => ({ ok: true, confirmado: true, enlace: null, intentos: [], descartados: [] }));
        __fijarContexto("t", ctx(links));
        fijarEleccion("t", "bluetooth");
        const r = await enviarOrdenPorMedio({ enviarMensaje } as never, "t", "control-neuronas", { x: 1 }, { sinRefrescar: true });
        expect(r.ok).toBe(true);
        expect(enviarMensaje).toHaveBeenCalledTimes(1);
        expect(enviarMensaje.mock.calls[0][0]).toEqual({ neuronDeviceId: "t", enlaceId: "ble:1" });
        expect(instantaneaMedio("t").ordenes).toEqual({ camino: "directo", medio: "bluetooth" });
    });
    it("en automático se manda como siempre, sin forzar enlace", async () => {
        const enviarMensaje = vi.fn(async (_d: unknown) => ({ ok: true, confirmado: true, enlace: { id: "nativo:10.0.0.5", tipo: "nativo" }, intentos: [], descartados: [] }));
        __fijarContexto("t", ctx(links));
        await enviarOrdenPorMedio({ enviarMensaje } as never, "t", "c", {}, { sinRefrescar: true });
        expect(enviarMensaje.mock.calls[0][0]).toEqual({ neuronDeviceId: "t" });
        expect(instantaneaMedio("t").ordenes.medio).toBe("red-local");
    });
    it("si el medio elegido desaparece NO cambia a escondidas: avisa y no manda por otro", async () => {
        const enviarMensaje = vi.fn(async () => ({ ok: true, confirmado: true, enlace: null, intentos: [], descartados: [] }));
        __fijarContexto("t", ctx(links));
        fijarEleccion("t", "bluetooth");
        __fijarContexto("t", ctx(links.filter((l) => l.medio !== "bluetooth")));
        const r = await enviarOrdenPorMedio({ enviarMensaje } as never, "t", "c", {}, { sinRefrescar: true });
        expect(r).toEqual({ ok: false, motivo: "medio-no-disponible" });
        expect(enviarMensaje).not.toHaveBeenCalled();
        expect(instantaneaMedio("t").perdido).toBe(true);
        expect(palabrasMotivo("medio-no-disponible")).toMatch(/Automático/);
        fijarEleccion("t", "auto");
        expect(instantaneaMedio("t").perdido).toBe(false);
    });
    it("un enlace que falla pasa al siguiente DEL MISMO medio, nunca a otro", async () => {
        const enviarMensaje = vi.fn(async (d: { enlaceId?: string }) => ({ ok: d.enlaceId === "cuenta:z", confirmado: true, enlace: null, intentos: [], descartados: [] }));
        __fijarContexto("t", ctx(links));
        fijarEleccion("t", "malla");
        const r = await enviarOrdenPorMedio({ enviarMensaje } as never, "t", "c", {}, { sinRefrescar: true });
        expect(r.ok).toBe(true);
        expect(enviarMensaje.mock.calls.map((c) => (c[0] as { enlaceId: string }).enlaceId)).not.toContain(undefined);
    });
});

describe("la pantalla: política ICE", () => {
    const c = ctx([], { wifiDirecto: { ipOtro: "192.168.49.2" } });
    const host = "candidate:1 1 udp 2122 192.168.1.5 5000 typ host";
    const hostWd = "candidate:2 1 udp 2122 192.168.49.1 5000 typ host";
    const srflx = "candidate:3 1 udp 1686 83.1.1.1 5000 typ srflx raddr 0.0.0.0 rport 0";
    const relay = "candidate:4 1 udp 41 1.2.3.4 5000 typ relay raddr 0.0.0.0 rport 0";
    it("automático no fuerza nada", () => {
        const p = politicaIce("auto", c);
        expect(p.forzada).toBe(false);
        expect([host, srflx, relay].every(p.permitir)).toBe(true);
    });
    it("router: solo host", () => {
        const p = politicaIce("wifi-router", c);
        expect(p.forzada).toBe(true);
        expect([host, srflx, relay].map(p.permitir)).toEqual([true, false, false]);
    });
    it("Wi‑Fi directo: solo host de la subred de ese enlace", () => {
        const p = politicaIce("wifi-directo", c);
        expect([host, hostWd, srflx].map(p.permitir)).toEqual([false, true, false]);
        expect(politicaIce("wifi-directo", ctx([])).forzada).toBe(false); // sin enlace no se aparenta
    });
    it("malla: sin servidores de retransmisión; nodos: solo relay", () => {
        expect([host, srflx, relay].map(politicaIce("malla", c).permitir)).toEqual([true, true, false]);
        expect(politicaIce("nodos", c).iceTransportPolicy).toBe("relay");
        expect(politicaIce("nodos", ctx([], { hayTurn: false })).forzada).toBe(false);
    });
    it("Bluetooth no se aplica a la pantalla", () => {
        expect(politicaIce("bluetooth", c).forzada).toBe(false);
    });
    it("filtra las líneas del SDP y deja lo demás", () => {
        const sdp = ["v=0", "m=video 9 UDP/TLS/RTP/SAVPF 96", `a=${host}`, `a=${relay}`, "a=end-of-candidates"].join("\r\n");
        const f = filtrarSdp(sdp, politicaIce("wifi-router", c).permitir);
        expect(f).toContain(host);
        expect(f).not.toContain("typ relay");
        expect(f).toContain("m=video");
        expect(f.split("\r\n")).toHaveLength(4);
    });
    it("lo que pide la conexión sale del medio elegido para ese aparato", () => {
        __olvidarMedio();
        window.localStorage.removeItem(CLAVE_MEDIO);
        __fijarContexto("p", ctx([], { hayTurn: true }));
        expect(configuracionIce("p", [])).toEqual({ iceServers: [] });
        fijarEleccion("p", "nodos");
        expect(configuracionIce("p", []).iceTransportPolicy).toBe("relay");
        fijarEleccion("p", "malla");
        expect(filtrarRespuesta("p", `a=${relay}\r\na=${host}`)).not.toContain("relay");
    });
});

describe("cumplimiento, canal de datos y registro", () => {
    it("lo real cumple o no lo elegido", () => {
        expect(cumpleEleccion("auto", SIN_DETERMINAR)).toBe(true);
        expect(cumpleEleccion("wifi-router", { camino: "directo", medio: "red-local" })).toBe(true);
        expect(cumpleEleccion("wifi-router", { camino: "directo", medio: "internet" })).toBe(false);
        expect(cumpleEleccion("nodos", { camino: "capa", medio: "turn" })).toBe(true);
        expect(cumpleEleccion("malla", { camino: "capa", medio: "turn" })).toBe(false);
    });
    it("gestos y teclas solo van por la conexión de vídeo si su camino real cumple lo elegido", () => {
        expect(canalDatosPermitido("auto", SIN_DETERMINAR)).toBe(true);
        expect(canalDatosPermitido("bluetooth", { camino: "directo", medio: "bluetooth" })).toBe(false);
        expect(canalDatosPermitido("wifi-router", SIN_DETERMINAR)).toBe(false);
        expect(canalDatosPermitido("wifi-router", { camino: "directo", medio: "red-local" })).toBe(true);
    });
    it("la línea del registro sigue el formato clave=valor de las demás `control-*`", () => {
        const l = lineaRegistroMedio({ elegido: "malla", ordenes: { camino: "directo", medio: "bluetooth" }, entrada: null, pantalla: SIN_DETERMINAR, pantallaForzada: true });
        expect(l).toBe("control-medio elegido=malla ordenes=directo:bluetooth entrada=canal-de-ordenes pantalla=sin-determinar pantalla-forzada=si");
        expect(l).toMatch(/^control-medio( [a-z-]+=[a-z:-]+)+$/);
    });
});
