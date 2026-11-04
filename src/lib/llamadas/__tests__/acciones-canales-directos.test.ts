import { describe, expect, it } from "vitest";
import type { EnlaceLocalVivo } from "@/lib/malla/registro-enlaces-locales";
import type { FuenteIce } from "@/lib/llamadas/ice";
import { canalesParaLlamada, type CanalesDecision } from "@/lib/llamadas/canales-directos";

function enlace(id: string, abierto = true): EnlaceLocalVivo {
    return {
        id: `local:${id}`,
        par: { nombre: `Aparato ${id}` },
        desde: Date.now(),
        abierto: () => abierto,
        rttMs: () => null,
        ruta: () => null,
        capacidadKbps: () => null,
        enviar: () => true,
        enviarBinario: () => true,
        bufferedAmount: () => 0,
        alMensaje: () => () => undefined,
        ponerPistas: async () => true,
        alFlujoRemoto: () => () => undefined,
        cerrar: () => undefined,
    };
}

function usaIceVacio(decision: CanalesDecision, fuente: FuenteIce): boolean {
    const hayRedSupabase = fuente !== "stun";
    return decision.enlaces.length > 0 && !hayRedSupabase;
}

describe("determinarIceServers (lógica de acciones.ts)", () => {
    it("sin red Supabase (solo STUN) y con enlaces vivos: debe usarse iceServers vacíos", () => {
        const enlaces = [enlace("a"), enlace("b")];
        const fuente: FuenteIce = "stun";
        const decision = canalesParaLlamada({ hayRedSupabase: false, enlaces, tema: null });
        expect(decision.enlaces).toHaveLength(2);
        expect(decision.texto).toBe("por enlace directo (misma red)");
        expect(usaIceVacio(decision, fuente)).toBe(true);
    });

    it("con fuente estatico (con TURN) y sin enlaces: NO debe usarse iceServers vacío", () => {
        const fuente: FuenteIce = "estatico";
        const decision = canalesParaLlamada({ hayRedSupabase: true, enlaces: [], tema: "llamada:abc" });
        expect(usaIceVacio(decision, fuente)).toBe(false);
    });

    it("con fuente estatico, enlaces vivos y tema: NO debe usarse iceServers vacío", () => {
        const enlaces = [enlace("a")];
        const fuente: FuenteIce = "estatico";
        const decision = canalesParaLlamada({ hayRedSupabase: true, enlaces, tema: "llamada:abc" });
        expect(usaIceVacio(decision, fuente)).toBe(false);
    });

    it("con fuente rest (servidor OS) y enlaces vivos sin tema: NO debe usarse iceServers vacío", () => {
        const enlaces = [enlace("a")];
        const fuente: FuenteIce = "rest";
        const decision = canalesParaLlamada({ hayRedSupabase: true, enlaces, tema: null });
        expect(usaIceVacio(decision, fuente)).toBe(false);
    });

    it("con fuente cloudflare (TURN gratuito) y enlaces vivos: NO debe usarse iceServers vacío", () => {
        const enlaces = [enlace("a")];
        const fuente: FuenteIce = "cloudflare";
        const decision = canalesParaLlamada({ hayRedSupabase: true, enlaces, tema: "llamada:abc" });
        expect(usaIceVacio(decision, fuente)).toBe(false);
    });

    it("sin red Supabase y sin enlaces vivos: NO debe usarse iceServers vacío", () => {
        const fuente: FuenteIce = "stun";
        const decision = canalesParaLlamada({ hayRedSupabase: false, enlaces: [], tema: null });
        expect(usaIceVacio(decision, fuente)).toBe(false);
    });
});