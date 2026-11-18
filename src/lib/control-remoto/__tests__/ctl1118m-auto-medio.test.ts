// @vitest-environment jsdom
/**
 * CTL1118M · «automático» inteligente de las órdenes. El caso `capa:nodo` de la prueba tableta → Mac: el enlace local nativo no existía (nadie había
 * saludado al otro aparato) y la orden se iba por el relevo de otra neurona; ahora se saluda, se elige el directo y solo sin directos se cae al relevo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CandidatoMedio } from "@/lib/mensajeria/medios/tipos";

const estado = vi.hoisted(() => ({ candidatos: [] as unknown[] }));
vi.mock("@/lib/malla/transporte-universal", () => ({ enlacesDisponibles: async () => [] }));
vi.mock("@/lib/malla/eleccion-enlace", () => ({ alcanzaDestino: () => true }));
vi.mock("@/lib/mensajeria/medios/medios", () => ({ candidatosDesdeEnlaces: () => estado.candidatos }));
vi.mock("@/lib/malla/enlace-wifi-orquestacion", () => ({ enlaceWifiDe: () => null, esEnlaceWifiDirecto: () => false }));
vi.mock("@/lib/malla/relevo/real", () => ({ estadoRelevo: () => ({ destinos: [] }) }));
vi.mock("@/lib/llamadas/ice", () => ({ contieneTurn: () => false, obtenerIceServidores: async () => ({ iceServers: [] }) }));
vi.mock("@/lib/llamadas/voz-datos/diagnostico", () => ({ anotarLlamada: () => undefined }));

import { __olvidarMedio, enviarOrdenPorMedio, instantaneaMedio } from "../medio-estado";
import { CASTIGO_FALLO_MS } from "../medio-estado";
import { PERMANENCIA_MS } from "../auto-enlace";

const cand = (enlaceId: string, medio: CandidatoMedio["medio"], extra: Partial<CandidatoMedio> = {}): CandidatoMedio =>
    ({ enlaceId, medio, etiqueta: enlaceId, abierto: true, llega: true, rttMs: null, ruta: null, ...extra }) as CandidatoMedio;

let lineas: string[];
let espia: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T10:00:00Z"));
    __olvidarMedio();
    estado.candidatos = [];
    lineas = [];
    espia = vi.spyOn(console, "info").mockImplementation((m: unknown) => void lineas.push(String(m)));
});
afterEach(() => {
    espia.mockRestore();
    vi.useRealTimers();
});

const ok = { ok: true, confirmado: true, enlace: { id: "x", tipo: "nativo" }, intentos: [], descartados: [] };

describe("CTL1118M · automático inteligente", () => {
    it("capa:nodo: sin enlace local aún, saluda al otro aparato y la orden sale por el enlace nativo, no por el relevo", async () => {
        const enviarMensaje = vi.fn(async (_d: unknown) => ok);
        const prepararEnlaceNativo = vi.fn(async () => {
            estado.candidatos = [cand("nativo:10.0.0.5", "local", { rttMs: 8 })];
            return null;
        });
        const r = await enviarOrdenPorMedio({ enviarMensaje, prepararEnlaceNativo } as never, "mac", "c", { x: 1 });
        expect(r.ok).toBe(true);
        expect(prepararEnlaceNativo).toHaveBeenCalledTimes(1);
        expect(enviarMensaje.mock.calls[0][0]).toEqual({ neuronDeviceId: "mac", enlaceId: "nativo:10.0.0.5" });
        expect(instantaneaMedio("mac").ordenes).toEqual({ camino: "directo", medio: "red-local" });
        expect(lineas.some((l) => /control-medio cambio uso=ordenes de=ninguno a=directo:red-local causa=inicial ms=8 kbps=/.test(l))).toBe(true);
    });
    it("si de verdad no hay ningún directo, cae al transporte de siempre (que puede usar el relevo)", async () => {
        const enviarMensaje = vi.fn(async (_d: unknown) => ({ ...ok, enlace: null, relevo: { neurona: "n2", nombre: "Nodo" } }));
        const prepararEnlaceNativo = vi.fn(async () => null);
        const r = await enviarOrdenPorMedio({ enviarMensaje, prepararEnlaceNativo } as never, "mac", "c", {});
        expect(r.ok).toBe(true);
        expect(enviarMensaje.mock.calls[0][0]).toEqual({ neuronDeviceId: "mac" }); // sin forzar enlace
        expect(instantaneaMedio("mac").ordenes.medio).toBe("nodo");
    });
    it("un directo gana al relevo aunque el relevo exista: solo se manda por el directo", async () => {
        estado.candidatos = [cand("relevo:n2", "p2p-internet", { rttMs: 2 }), cand("nativo:10.0.0.5", "local", { rttMs: 40 })];
        const enviarMensaje = vi.fn(async (_d: unknown) => ok);
        await enviarOrdenPorMedio({ enviarMensaje, prepararEnlaceNativo: vi.fn() } as never, "mac", "c", {});
        expect(enviarMensaje.mock.calls[0][0]).toEqual({ neuronDeviceId: "mac", enlaceId: "nativo:10.0.0.5" });
    });
    it("histéresis: no salta a otro enlace antes de la permanencia; después, si es claramente mejor, sí y lo registra", async () => {
        estado.candidatos = [cand("nativo:a", "local", { rttMs: 60 })];
        const enviarMensaje = vi.fn(async (_d: unknown) => ok);
        const t = { enviarMensaje, prepararEnlaceNativo: vi.fn() } as never;
        await enviarOrdenPorMedio(t, "mac", "c", {});
        estado.candidatos = [cand("nativo:a", "local", { rttMs: 60 }), cand("ble:1", "bluetooth", { rttMs: 10 })];
        await vi.advanceTimersByTimeAsync(5_000);
        await enviarOrdenPorMedio(t, "mac", "c", {});
        expect((enviarMensaje.mock.calls[1][0] as { enlaceId: string }).enlaceId).toBe("nativo:a");
        await vi.advanceTimersByTimeAsync(PERMANENCIA_MS);
        await enviarOrdenPorMedio(t, "mac", "c", {});
        expect((enviarMensaje.mock.calls[2][0] as { enlaceId: string }).enlaceId).toBe("ble:1");
        expect(lineas.some((l) => l.includes("causa=mejor-latencia") && l.includes("a=directo:bluetooth"))).toBe(true);
    });
    it("si el enlace elegido falla, se castiga un rato y la siguiente orden va por el otro directo", async () => {
        estado.candidatos = [cand("nativo:a", "local", { rttMs: 5 }), cand("ble:1", "bluetooth", { rttMs: 90 })];
        const enviarMensaje = vi.fn(async (d: { enlaceId?: string }) => (d.enlaceId === "nativo:a" ? { ...ok, ok: false } : ok));
        const t = { enviarMensaje, prepararEnlaceNativo: vi.fn() } as never;
        await enviarOrdenPorMedio(t, "mac", "c", {}); // falla nativo:a y cae al transporte
        await enviarOrdenPorMedio(t, "mac", "c", {});
        const ids = enviarMensaje.mock.calls.map((c) => (c[0] as { enlaceId?: string }).enlaceId);
        expect(ids).toContain("ble:1");
        expect(CASTIGO_FALLO_MS).toBeGreaterThan(0);
    });
    it("sin prepararEnlaceNativo (otros transportes) todo sigue como antes", async () => {
        const enviarMensaje = vi.fn(async (_d: unknown) => ok);
        await enviarOrdenPorMedio({ enviarMensaje } as never, "mac", "c", {});
        expect(enviarMensaje.mock.calls[0][0]).toEqual({ neuronDeviceId: "mac" });
    });
});
