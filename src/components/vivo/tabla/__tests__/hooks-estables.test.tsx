/**
 * Los hooks que leen almacenes externos con `useSyncExternalStore` deben devolver EL MISMO
 * objeto mientras nada cambie: un snapshot nuevo en cada lectura provocó el bucle React #185 en
 * producción. Aquí se comprueba con renders repetidos, StrictMode y limpieza al desmontar.
 */
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const canal = vi.hoisted(() => {
    const estado = {
        syncs: [] as (() => void)[],
        presencia: {} as Record<string, unknown[]>,
        creados: 0,
        quitados: 0,
        tracks: [] as Record<string, unknown>[],
    };
    return estado;
});
vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        channel: () => {
            canal.creados += 1;
            const c = {
                on: (_t: string, _f: unknown, cb: () => void) => {
                    canal.syncs.push(cb);
                    return c;
                },
                subscribe: (cb: (e: string) => void) => {
                    cb("SUBSCRIBED");
                    return c;
                },
                track: (p: Record<string, unknown>) => void canal.tracks.push(p),
                untrack: () => {},
                presenceState: () => canal.presencia,
            };
            return c;
        },
        removeChannel: () => void (canal.quitados += 1),
    }),
}));
vi.mock("@/lib/social/os-profiles", () => ({ fetchMyProfile: async () => ({ displayName: "Yo" }), fetchProfilesByIds: async () => ({}), searchUsers: async () => [] }));

const espacio = vi.hoisted(() => ({
    suscriptores: new Set<() => void>(),
    altas: 0,
    bajas: 0,
    doc: { vivo: "prueba", n: 0 } as Record<string, unknown>,
}));
vi.mock("@/lib/vivo/tabla/espacio", () => ({ miUid: async () => "11111111-1111-4111-8111-111111111111" }));

import { MotorColab, type DepsMotor } from "@/lib/vivo/tabla/motor-colab";
import { useEsMovil, useMediaQuery } from "../use-media";
import { useMotorVivo } from "../use-motor";
import { usePresencia } from "../use-presencia";

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

// ───────────────────────────── useMediaQuery ─────────────────────────────

describe("useMediaQuery", () => {
    let coincide = false;
    const oyentes = new Set<() => void>();
    beforeEach(() => {
        coincide = false;
        oyentes.clear();
        window.matchMedia = ((q: string) => ({
            get matches() {
                return coincide;
            },
            media: q,
            addEventListener: (_e: string, cb: () => void) => oyentes.add(cb),
            removeEventListener: (_e: string, cb: () => void) => oyentes.delete(cb),
            addListener: () => {},
            removeListener: () => {},
            onchange: null,
            dispatchEvent: () => false,
        })) as unknown as typeof window.matchMedia;
    });

    test("devuelve un booleano estable, cambia cuando cambia la pantalla y se da de baja al desmontar", () => {
        let renders = 0;
        const { result, rerender, unmount } = renderHook(() => {
            renders += 1;
            return useMediaQuery("(max-width: 767px)");
        });
        expect(result.current).toBe(false);
        const antes = renders;
        for (let i = 0; i < 20; i++) rerender();
        expect(result.current).toBe(false);
        expect(renders - antes).toBe(20); // un render por rerender: ningún bucle
        expect(oyentes.size).toBe(1);
        coincide = true;
        act(() => oyentes.forEach((f) => f()));
        expect(result.current).toBe(true);
        unmount();
        expect(oyentes.size).toBe(0);
    });

    test("useEsMovil usa el corte de 768 px", () => {
        const espia = vi.spyOn(window, "matchMedia");
        renderHook(() => useEsMovil());
        expect(espia).toHaveBeenCalledWith("(max-width: 767px)");
    });
});

// ───────────────────────────── usePresencia ─────────────────────────────

function persona(uid: string, nombre: string) {
    return { uid, nombre, color: "#10B981", fila: null, col: null, editando: false };
}

describe("usePresencia", () => {
    beforeEach(() => {
        canal.syncs.length = 0;
        canal.presencia = {};
        canal.creados = 0;
        canal.quitados = 0;
        canal.tracks.length = 0;
    });

    test("la lista es la misma referencia mientras nadie cambie, aunque llegue el mismo estado una y otra vez", async () => {
        const { result, rerender } = renderHook(() => usePresencia("tabla:abc"));
        await act(async () => {
            await new Promise((r) => setTimeout(r, 20));
        });
        const vacia = result.current.presentes;
        expect(vacia).toHaveLength(0);
        for (let i = 0; i < 20; i++) {
            act(() => canal.syncs.forEach((f) => f())); // llega «sync» sin cambios
            rerender();
        }
        expect(result.current.presentes).toBe(vacia);

        canal.presencia = { otra1: [persona("22222222-2222-4222-8222-222222222222", "Marta")] };
        act(() => canal.syncs.forEach((f) => f()));
        const conMarta = result.current.presentes;
        expect(conMarta).toHaveLength(1);
        expect(conMarta[0].nombre).toBe("Marta");
        for (let i = 0; i < 20; i++) {
            act(() => canal.syncs.forEach((f) => f()));
            rerender();
        }
        expect(result.current.presentes).toBe(conMarta);
    });

    test("anunciarse repetidamente en el mismo sitio no envía nada de más", async () => {
        const { result } = renderHook(() => usePresencia("tabla:abc"));
        await act(async () => {
            await new Promise((r) => setTimeout(r, 20));
        });
        const previos = canal.tracks.length;
        act(() => {
            for (let i = 0; i < 30; i++) result.current.anunciar({ fila: null, col: null, editando: false });
        });
        expect(canal.tracks.length).toBe(previos);
    });

    test("en StrictMode queda un solo canal abierto y al desmontar se suelta", async () => {
        const envoltura = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
        const { unmount } = renderHook(() => usePresencia("tabla:abc"), { wrapper: envoltura });
        await act(async () => {
            await new Promise((r) => setTimeout(r, 30));
        });
        expect(canal.creados - canal.quitados).toBe(1);
        unmount();
        expect(canal.creados - canal.quitados).toBe(0);
    });
});

// ───────────────────────────── useMotorVivo ─────────────────────────────

function crearMotor() {
    const deps: DepsMotor<{ n: number }> = {
        cargar: async () => ({ ok: true, espacio: { id: "e", titulo: "T", doc: espacio.doc, rev: 1, propietario: "o", acceso: "invite" } }),
        guardar: async () => ({ ok: true, espacio: { id: "e", titulo: "T", doc: espacio.doc, rev: 2, propietario: "o", acceso: "invite" } }),
        suscribir: () => {
            espacio.altas += 1;
            const f = () => {};
            espacio.suscriptores.add(f);
            return () => {
                espacio.bajas += 1;
                espacio.suscriptores.delete(f);
            };
        },
        puedeEditar: async () => true,
        autor: "yo0000000000",
        validar: () => null,
        extraer: (d) => ({ n: Number(d.n) || 0 }),
        fusionar: (a, b) => (b.n > a.n ? b : a),
        incrustar: (base, d) => ({ ...base, n: d.n }),
        maxTiempo: () => 0,
    };
    return new MotorColab(deps);
}

describe("useMotorVivo", () => {
    beforeEach(() => {
        espacio.suscriptores.clear();
        espacio.altas = 0;
        espacio.bajas = 0;
        espacio.doc = { vivo: "prueba", n: 0 };
    });

    test("el snapshot es la misma referencia entre renders y una sola suscripción sobrevive a StrictMode", async () => {
        const envoltura = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
        let renders = 0;
        const { result, rerender, unmount } = renderHook(
            () => {
                renders += 1;
                return useMotorVivo("clave", () => crearMotor());
            },
            { wrapper: envoltura },
        );
        await act(async () => {
            await new Promise((r) => setTimeout(r, 40));
        });
        expect(result.current.snap.fase).toBe("listo");
        const snap = result.current.snap;
        const antes = renders;
        for (let i = 0; i < 25; i++) rerender();
        expect(result.current.snap).toBe(snap);
        expect(renders - antes).toBeLessThan(80); // sin bucle infinito (StrictMode duplica renders)
        expect(espacio.altas - espacio.bajas).toBe(1);
        unmount();
        expect(espacio.altas - espacio.bajas).toBe(0);
    });

    test("un cambio local crea UN snapshot nuevo y después vuelve a ser estable", async () => {
        const { result } = renderHook(() => useMotorVivo("clave2", () => crearMotor()));
        await act(async () => {
            await new Promise((r) => setTimeout(r, 40));
        });
        const antes = result.current.snap;
        act(() => void result.current.motor!.aplicar((d) => ({ n: d.n + 1 })));
        const despues = result.current.snap;
        expect(despues).not.toBe(antes);
        expect(despues.doc).toEqual({ n: 1 });
        expect(despues.version).toBe(antes.version + 1);
        for (let i = 0; i < 10; i++) expect(result.current.motor!.getSnapshot()).toBe(despues);
    });

    test("un componente que se monta y desmonta sin esperar no deja motores vivos", async () => {
        const { unmount } = render(<Vacio />);
        unmount();
        await new Promise((r) => setTimeout(r, 60));
        expect(espacio.altas - espacio.bajas).toBe(0);
    });
});

function Vacio() {
    useMotorVivo("clave3", () => crearMotor());
    return null;
}
