/**
 * Regresión (2026-09-28): abrir un chat en /messages tiraba «Maximum update depth exceeded»
 * (React #185) porque `useCarpetasHilo` devolvía un objeto nuevo en cada lectura de la
 * instantánea de `useSyncExternalStore` mientras el hilo aún no estaba cargado. Lo mismo pasaba
 * con las notas de un contacto. Una instantánea sin cambios debe ser el MISMO objeto.
 */
import { describe, expect, test, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("@/utils/supabase/client", () => {
    const consulta = {
        select: () => consulta,
        eq: () => consulta,
        maybeSingle: () => new Promise(() => {}),
        single: () => new Promise(() => {}),
    };
    return { createClient: () => ({ from: () => consulta, auth: { getUser: () => new Promise(() => {}) }, channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }), removeChannel: () => {} }) };
});
vi.mock("@/lib/sync/entity-state", () => ({
    currentUserRef: () => new Promise(() => {}),
    getEntityStateChecked: () => new Promise(() => {}),
    setEntityStateChecked: () => new Promise(() => {}),
    deviceId: () => "test",
}));
vi.mock("@/lib/sync/live-signal", () => ({ emitChange: async () => {}, onChange: () => () => {} }));
vi.mock("@/lib/realtime/realtime", () => ({ onTableChange: () => () => {} }));
vi.mock("@/lib/contactos/publicos", () => ({ publicarContacto: async () => null, retirarContacto: async () => null }));
vi.mock("@/lib/contactos/migrar-seguidos", () => ({ leerSeguidosPersonas: async () => [] }));

describe("instantáneas estables de los almacenes", () => {
    test("useCarpetasHilo con un hilo aún sin cargar no entra en bucle", async () => {
        const { useCarpetasHilo } = await import("@/lib/mensajeria/carpetas-hilo");
        const { result, rerender } = renderHook(() => useCarpetasHilo("hilo-sin-cargar"));
        const primera = result.current.carpetas;
        rerender();
        expect(result.current.carpetas).toBe(primera);
        expect(result.current.listo).toBe(false);
    });

    test("useNotasContacto de un contacto sin cargar no entra en bucle", async () => {
        const { useNotasContacto } = await import("@/lib/contactos/store");
        const { result, rerender } = renderHook(() => useNotasContacto("contacto-sin-cargar"));
        const primeras = result.current.notas;
        rerender();
        expect(result.current.notas).toBe(primeras);
    });
});
