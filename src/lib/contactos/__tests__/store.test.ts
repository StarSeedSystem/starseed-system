// @vitest-environment jsdom
/**
 * store.test.ts — mockea toda la nube (entity-state, live-signal, publicos,
 * migrar-seguidos) para probar el almacén en aislamiento: hidratación,
 * guardado debounced, reglas de visibilidad e importación con fusión.
 *
 * Nota: `waitFor` de testing-library sondea con timers reales y se
 * bloquea contra `vi.useFakeTimers()`; en vez de eso, cada avance se hace con
 * `act(async () => { await vi.advanceTimersByTimeAsync(ms) })`, que sí fluye
 * timers falsos + microtasks pendientes dentro de un `act` que aplica el
 * re-render antes de comprobar `result.current`.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const uidActual = { id: "u1" as string | null };

vi.mock("@/lib/sync/entity-state", () => ({
    currentUserRef: vi.fn(async () => (uidActual.id ? { kind: "user", id: uidActual.id } : null)),
    getEntityStateChecked: vi.fn(async () => ({ row: null, error: null })),
    setEntityStateChecked: vi.fn(async (_ref: unknown, _key: string, value: unknown) => ({
        row: { value, rev: 1, updated_at: new Date().toISOString(), device_id: null },
        error: null,
    })),
}));

vi.mock("@/lib/sync/live-signal", () => ({
    emitChange: vi.fn(async () => {}),
    onChange: vi.fn(() => () => {}),
}));

vi.mock("@/lib/contactos/publicos", () => ({
    publicarContacto: vi.fn(async () => null),
    retirarContacto: vi.fn(async () => null),
    etiquetaDeRelacion: vi.fn(() => "Amistad"),
}));

vi.mock("@/lib/contactos/migrar-seguidos", () => ({
    leerSeguidosPersonas: vi.fn(async () => []),
}));

import { getEntityStateChecked, setEntityStateChecked } from "@/lib/sync/entity-state";
import { publicarContacto, retirarContacto } from "@/lib/contactos/publicos";
import { leerSeguidosPersonas } from "@/lib/contactos/migrar-seguidos";
import { act, renderHook } from "@testing-library/react";

async function cargarStoreFresco() {
    vi.resetModules();
    return import("@/lib/contactos/store");
}

/** Avanza timers falsos + microtasks pendientes DENTRO de un act, para que React aplique los re-renders. */
async function avanzar(ms: number): Promise<void> {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
}

describe("store de contactos", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        uidActual.id = "u1";
        localStorage.clear();
        vi.clearAllMocks();
        (getEntityStateChecked as ReturnType<typeof vi.fn>).mockResolvedValue({ row: null, error: null });
        (setEntityStateChecked as ReturnType<typeof vi.fn>).mockImplementation(
            async (_ref: unknown, _key: string, value: unknown) => ({
                row: { value, rev: 1, updated_at: new Date().toISOString(), device_id: null },
                error: null,
            }),
        );
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test("hidrata: sin sesión da sinSesion=true y listo=true", async () => {
        uidActual.id = null;
        const { useContactos, resetStoreParaTests } = await cargarStoreFresco();
        resetStoreParaTests();

        const { result } = renderHook(() => useContactos());
        await avanzar(20);

        expect(result.current.listo).toBe(true);
        expect(result.current.sinSesion).toBe(true);
        expect(result.current.contactos).toEqual([]);
    });

    test("hidrata con sesión: listo, no sinSesion, doc vacío inicialmente", async () => {
        const { useContactos, resetStoreParaTests } = await cargarStoreFresco();
        resetStoreParaTests();
        const { result } = renderHook(() => useContactos());
        await avanzar(20);

        expect(result.current.listo).toBe(true);
        expect(result.current.sinSesion).toBe(false);
        expect(result.current.contactos).toEqual([]);
    });

    test("crear un contacto guarda local al instante y programa el guardado debounced en la nube", async () => {
        const { useContactos, resetStoreParaTests } = await cargarStoreFresco();
        resetStoreParaTests();
        const { result } = renderHook(() => useContactos());
        await avanzar(20);
        // La hidratación (con su posible migración de seguidos) ya pudo disparar
        // un guardado propio; lo descartamos para aislar el debounce de `crear`.
        vi.clearAllMocks();

        act(() => {
            result.current.crear({ nombre: "Ada Lovelace" });
        });

        // Local al instante: aparece ya en el estado sin esperar el debounce.
        expect(result.current.contactos.map((c) => c.nombre)).toEqual(["Ada Lovelace"]);
        expect(setEntityStateChecked).not.toHaveBeenCalled();

        // Pasado el debounce (800ms), se guarda en la nube.
        await avanzar(900);
        expect(setEntityStateChecked).toHaveBeenCalledTimes(1);
        const doc = (setEntityStateChecked as ReturnType<typeof vi.fn>).mock.calls[0][2];
        expect(doc.contactos.map((c: { nombre: string }) => c.nombre)).toEqual(["Ada Lovelace"]);
    });

    test("cambiarVisibilidad: rechaza 'publica' sin userId y no llama a publicarContacto", async () => {
        const { useContactos, resetStoreParaTests } = await cargarStoreFresco();
        resetStoreParaTests();
        const { result } = renderHook(() => useContactos());
        await avanzar(20);

        let creado!: ReturnType<typeof result.current.crear>;
        act(() => {
            creado = result.current.crear({ nombre: "Sin cuenta" });
        });

        let error: string | null = null;
        await act(async () => {
            error = await result.current.cambiarVisibilidad(creado.id, "publica");
        });

        expect(error).toBe("Solo un contacto con cuenta StarSeed puede ser público.");
        expect(publicarContacto).not.toHaveBeenCalled();
        expect(result.current.porId(creado.id)?.visibilidad).toBe("privada");
    });

    test("cambiarVisibilidad: acepta 'publica' con userId y llama a publicarContacto", async () => {
        const { useContactos, resetStoreParaTests } = await cargarStoreFresco();
        resetStoreParaTests();
        const { result } = renderHook(() => useContactos());
        await avanzar(20);

        let creado!: ReturnType<typeof result.current.crear>;
        act(() => {
            creado = result.current.crear({ nombre: "Con cuenta", userId: "u-otro" });
        });

        let error: string | null = null;
        await act(async () => {
            error = await result.current.cambiarVisibilidad(creado.id, "publica");
        });

        expect(error).toBeNull();
        expect(publicarContacto).toHaveBeenCalledWith("u1", "u-otro", "Amistad");
        expect(result.current.porId(creado.id)?.visibilidad).toBe("publica");
    });

    test("eliminar un contacto público lo retira también de la lista pública", async () => {
        const { useContactos, resetStoreParaTests } = await cargarStoreFresco();
        resetStoreParaTests();
        const { result } = renderHook(() => useContactos());
        await avanzar(20);

        let creado!: ReturnType<typeof result.current.crear>;
        act(() => {
            creado = result.current.crear({ nombre: "Público", userId: "u-otro2", visibilidad: "publica" });
        });

        act(() => {
            result.current.eliminar(creado.id);
        });

        expect(retirarContacto).toHaveBeenCalledWith("u1", "u-otro2");
        expect(result.current.contactos).toEqual([]); // vivos() ya no lo incluye
        expect(result.current.porId(creado.id)).toBeUndefined();
    });

    test("importar: fusiona con un existente por teléfono y crea uno nuevo si no hay coincidencia", async () => {
        const { useContactos, resetStoreParaTests } = await cargarStoreFresco();
        resetStoreParaTests();
        const { result } = renderHook(() => useContactos());
        await avanzar(20);

        act(() => {
            result.current.crear({ nombre: "Existente", telefonos: [{ id: "1", etiqueta: "móvil", valor: "600111222" }] });
        });

        let resumen!: { nuevos: number; fusionados: number };
        act(() => {
            resumen = result.current.importar([
                { nombre: "Existente actualizado", telefonos: [{ id: "2", etiqueta: "casa", valor: "600-111-222" }] },
                { nombre: "Nuevo de verdad" },
            ]);
        });

        expect(resumen).toEqual({ nuevos: 1, fusionados: 1 });
        expect(result.current.contactos).toHaveLength(2);
        const fusionado = result.current.contactos.find((c) => c.telefonos.length > 0);
        expect(fusionado?.telefonos).toHaveLength(1); // deduplicado (mismo teléfono normalizado)
    });

    test("migra los seguidos una sola vez cuando hay sesión", async () => {
        (leerSeguidosPersonas as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
            { nombre: "Seguido Uno", userId: "seg-1", origen: "seguido", visibilidad: "privada", relacion: "comunidad" },
        ]);
        const { useContactos, resetStoreParaTests } = await cargarStoreFresco();
        resetStoreParaTests();
        const { result } = renderHook(() => useContactos());
        await avanzar(50);

        expect(leerSeguidosPersonas).toHaveBeenCalledTimes(1);
        expect(result.current.contactos.some((c) => c.userId === "seg-1")).toBe(true);
    });

    test("resetStoreParaTests limpia el estado compartido entre pruebas", async () => {
        const { useContactos, resetStoreParaTests } = await cargarStoreFresco();
        resetStoreParaTests();
        const primero = renderHook(() => useContactos());
        await avanzar(20);
        act(() => {
            primero.result.current.crear({ nombre: "Efímero" });
        });
        expect(primero.result.current.contactos).toHaveLength(1);

        resetStoreParaTests();
        localStorage.clear(); // el reset limpia la memoria del módulo; la caché local es otra capa
        const segundo = renderHook(() => useContactos());
        await avanzar(20);
        expect(segundo.result.current.contactos).toEqual([]);
    });
});
