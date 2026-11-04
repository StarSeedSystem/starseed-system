import { describe, expect, it } from "vitest";
import type { EnlaceLocalVivo } from "@/lib/malla/registro-enlaces-locales";
import { canalesParaLlamada } from "@/lib/llamadas/canales-directos";
import { iceParaCanal, tipoCanalDirecto } from "@/lib/llamadas/decision-ice";

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

describe("iceParaCanal", () => {
    it("devuelve iceServers vacíos cuando hay enlaces y no hay red Supabase", () => {
        const enlaces = [enlace("a"), enlace("b")];
        const decision = canalesParaLlamada({
            hayRedSupabase: false,
            enlaces,
            tema: null,
        });
        const result = iceParaCanal(decision, false);
        expect(result).toEqual([]);
    });

    it("devuelve ICE servers cuando hay red Supabase y enlaces", () => {
        const enlaces = [enlace("a")];
        const decision = canalesParaLlamada({
            hayRedSupabase: true,
            enlaces,
            tema: "llamada:test",
        });
        const result = iceParaCanal(decision, true);
        expect(result).toHaveLength(1);
    });

    it("devuelve iceServers vacíos cuando hay enlaces directos sin servidor", () => {
        const enlaces = [enlace("a"), enlace("b")];
        const decision = canalesParaLlamada({
            hayRedSupabase: false,
            enlaces,
            tema: null,
        });
        expect(decision.enlaces).toHaveLength(2);
        expect(decision.texto).toBe("por enlace directo (misma red)");
        const result = iceParaCanal(decision, false);
        expect(result).toEqual([]);
    });

    it("mantiene ICE servers cuando hay canal privado (tema) con enlaces", () => {
        const enlaces = [enlace("a")];
        const decision = canalesParaLlamada({
            hayRedSupabase: true,
            enlaces,
            tema: "llamada:test",
        });
        const result = iceParaCanal(decision, true);
        expect(result).toHaveLength(1);
    });

    it("devuelve iceServers vacíos con enlaces sin red y sin tema", () => {
        const enlaces = [enlace("a")];
        const decision = canalesParaLlamada({
            hayRedSupabase: false,
            enlaces,
            tema: null,
        });
        const result = iceParaCanal(decision, false);
        expect(result).toEqual([]);
    });

    it("devuelve lista vacía cuando no hay enlaces", () => {
        const decision = canalesParaLlamada({
            hayRedSupabase: true,
            enlaces: [],
            tema: "llamada:test",
        });
        const result = iceParaCanal(decision, true);
        expect(result).toEqual([]);
    });
});

describe("tipoCanalDirecto", () => {
    it("devuelve 'directo' cuando decision.enlaces.length > 0 y !hayRedSupabase", () => {
        const enlaces = [enlace("a")];
        const decision = canalesParaLlamada({
            hayRedSupabase: false,
            enlaces,
            tema: null,
        });
        expect(tipoCanalDirecto(decision, false)).toBe("directo");
    });

    it("devuelve 'privado' cuando hay red y tema y enlaces", () => {
        const enlaces = [enlace("a")];
        const decision = canalesParaLlamada({
            hayRedSupabase: true,
            enlaces,
            tema: "llamada:test",
        });
        expect(tipoCanalDirecto(decision, true)).toBe("privado");
    });

    it("devuelve 'privado' cuando hay red y enlaces sin tema", () => {
        const enlaces = [enlace("a")];
        const decision = canalesParaLlamada({
            hayRedSupabase: true,
            enlaces,
            tema: null,
        });
        expect(tipoCanalDirecto(decision, true)).toBe("privado");
    });

    it("devuelve 'ninguno' cuando no hay enlaces", () => {
        const decision = canalesParaLlamada({
            hayRedSupabase: true,
            enlaces: [],
            tema: "llamada:test",
        });
        expect(tipoCanalDirecto(decision, true)).toBe("ninguno");
    });
});