// @vitest-environment jsdom
/**
 * Adoptar una neurona ya conocida (2026-09-29, persistencia entre medios): quién es candidata y
 * qué pasa al «Usar su configuración» — id nuevo, neurona marcada como configurada y borrado
 * GUARDADO de la fila duplicada que el registro creó al arrancar.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ borrados: [] as string[], error: null as null | { message: string } }));
vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        from: (tabla: string) => ({
            delete: () => ({
                eq: async (_col: string, id: string) => {
                    if (tabla === "neuron_devices") db.borrados.push(id);
                    return { error: db.error };
                },
            }),
        }),
    }),
}));

import { EVENTO_NEURONA_ADOPTADA, candidatasAdopcion, usarConfiguracionDeNeurona } from "../adopcion-neurona";
import { AVISO_NEURONA_CONFIGURADA, neuronaConfiguradaAqui } from "@/lib/onboarding/primer-arranque";
import { AVISOS_KEY, _reiniciarCacheAvisosParaPruebas, estadoAviso } from "@/lib/sync/avisos-cuenta";

const PROPIA = "neurona-propia-recien-creada";
const OTRA = "neurona-de-la-cuenta-mac";

beforeEach(() => {
    localStorage.clear();
    _reiniciarCacheAvisosParaPruebas();
    db.borrados = [];
    db.error = null;
    localStorage.setItem("starseed.neuron.device-id", PROPIA);
});

describe("candidatasAdopcion", () => {
    it("ofrece las demás neuronas (nunca este dispositivo), la vista más recientemente primero", () => {
        const c = candidatasAdopcion([
            { id: "yo", name: "Yo", isThisDevice: true, last_seen_at: "2026-09-29T10:00:00Z" },
            { id: "a", name: "Vieja", last_seen_at: "2026-09-01T10:00:00Z" },
            { id: "b", name: "Reciente", last_seen_at: "2026-09-28T10:00:00Z" },
            { id: "c", name: "Sin fecha" },
        ]);
        expect(c.map((n) => n.id)).toEqual(["b", "a", "c"]);
    });

    it("sin otras neuronas no hay nada que ofrecer", () => {
        expect(candidatasAdopcion([{ id: "yo", name: "Yo", isThisDevice: true }])).toEqual([]);
        expect(candidatasAdopcion([])).toEqual([]);
    });
});

describe("usarConfiguracionDeNeurona", () => {
    it("adopta el id, deja la neurona configurada (local + cuenta) y avisa", async () => {
        const oyente = vi.fn();
        window.addEventListener(EVENTO_NEURONA_ADOPTADA, oyente);
        const r = await usarConfiguracionDeNeurona(OTRA, { propiaCreadaAhora: false });
        expect(r).toMatchObject({ ok: true, anterior: PROPIA, adoptada: OTRA, filaDuplicadaEliminada: false });
        expect(localStorage.getItem("starseed.neuron.device-id")).toBe(OTRA);
        expect(localStorage.getItem("starseed.neuron.setup.v1")).toBe("1");
        expect(estadoAviso(AVISO_NEURONA_CONFIGURADA, { neurona: OTRA }).estado).toBe("hecho");
        expect(neuronaConfiguradaAqui(OTRA)).toBe(true);
        expect(oyente).toHaveBeenCalledTimes(1);
        expect((oyente.mock.calls[0][0] as CustomEvent).detail).toEqual({ anterior: PROPIA, adoptada: OTRA });
        window.removeEventListener(EVENTO_NEURONA_ADOPTADA, oyente);
    });

    it("borra la fila duplicada SOLO si nació en este arranque y la persona no le puso nada", async () => {
        const r = await usarConfiguracionDeNeurona(OTRA, { propiaCreadaAhora: true });
        expect(r.filaDuplicadaEliminada).toBe(true);
        expect(db.borrados).toEqual([PROPIA]);
    });

    it("NO borra si la fila no es de este arranque", async () => {
        const r = await usarConfiguracionDeNeurona(OTRA, { propiaCreadaAhora: false });
        expect(r.filaDuplicadaEliminada).toBe(false);
        expect(db.borrados).toEqual([]);
    });

    it("NO borra si la persona ya le puso nombre, permisos o ajustes a la fila propia", async () => {
        for (const prefs of [
            { names: { [PROPIA]: "Mi portátil" } },
            { permissions: { [PROPIA]: { compute: false } } },
            { settings: { [PROPIA]: { syncLibrary: false } } },
        ]) {
            localStorage.setItem("starseed.neuron.device-id", PROPIA);
            localStorage.setItem("starseed.neurons.prefs.v1", JSON.stringify(prefs));
            const r = await usarConfiguracionDeNeurona(OTRA, { propiaCreadaAhora: true });
            expect(r.filaDuplicadaEliminada).toBe(false);
        }
        expect(db.borrados).toEqual([]);
    });

    it("con prefs ilegibles NO borra (ante la duda, nada)", async () => {
        localStorage.setItem("starseed.neurons.prefs.v1", "{roto");
        const r = await usarConfiguracionDeNeurona(OTRA, { propiaCreadaAhora: true });
        expect(r.filaDuplicadaEliminada).toBe(false);
        expect(db.borrados).toEqual([]);
    });

    it("si el borrado falla, la adopción sigue valiendo (queda una fila offline)", async () => {
        db.error = { message: "sin red" };
        const r = await usarConfiguracionDeNeurona(OTRA, { propiaCreadaAhora: true });
        expect(r.ok).toBe(true);
        expect(r.filaDuplicadaEliminada).toBe(false);
        expect(localStorage.getItem("starseed.neuron.device-id")).toBe(OTRA);
    });

    it("un id inválido no cambia nada ni borra nada", async () => {
        const r = await usarConfiguracionDeNeurona("<x>", { propiaCreadaAhora: true });
        expect(r.ok).toBe(false);
        expect(localStorage.getItem("starseed.neuron.device-id")).toBe(PROPIA);
        expect(db.borrados).toEqual([]);
        expect(localStorage.getItem(AVISOS_KEY)).toBeNull();
    });

    it("adoptar el id que ya se usa es un no-op (no borra la fila propia)", async () => {
        const r = await usarConfiguracionDeNeurona(PROPIA, { propiaCreadaAhora: true });
        expect(r.ok).toBe(true);
        expect(r.filaDuplicadaEliminada).toBe(false);
        expect(db.borrados).toEqual([]);
    });
});
