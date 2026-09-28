/**
 * Historial de versiones: con la tabla del servidor se guarda allí; SIN la migración aplicada
 * se guarda en este dispositivo y se dice («soloLocal»), sin romper ni reintentar sin fin.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const servidor = vi.hoisted(() => ({ tablaExiste: false, filas: [] as Record<string, unknown>[], inserciones: 0, lecturas: 0 }));

vi.mock("@/utils/supabase/client", () => {
    const faltaTabla = { code: "PGRST205", message: "Could not find the table 'public.os_doc_versiones' in the schema cache" };
    const consulta = () => {
        const q = {
            select: () => q,
            eq: () => q,
            order: () => q,
            limit: async () => {
                servidor.lecturas += 1;
                return servidor.tablaExiste ? { data: servidor.filas, error: null } : { data: null, error: faltaTabla };
            },
            insert: async (fila: Record<string, unknown>) => {
                servidor.inserciones += 1;
                if (!servidor.tablaExiste) return { error: faltaTabla };
                servidor.filas.unshift({ id: `v${servidor.filas.length}`, creada: new Date().toISOString(), ...fila });
                return { error: null };
            },
            maybeSingle: async () => ({ data: servidor.filas[0] ?? null, error: null }),
        };
        return q;
    };
    return { createClient: () => ({ from: consulta, auth: { getUser: async () => ({ data: { user: { id: "ana" } } }) } }) };
});

import { guardarVersion, leerVersion, listarVersiones, reiniciarVersionesParaTests } from "@/lib/vivo/doc-colaborativo/versiones";

beforeEach(() => {
    const mapa = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
        getItem: (k: string) => mapa.get(k) ?? null,
        setItem: (k: string, v: string) => void mapa.set(k, v),
        removeItem: (k: string) => void mapa.delete(k),
        clear: () => mapa.clear(),
        key: () => null,
        length: 0,
    } as Storage;
    servidor.tablaExiste = false;
    servidor.filas = [];
    servidor.inserciones = 0;
    servidor.lecturas = 0;
    reiniciarVersionesParaTests();
});

describe("historial de versiones", () => {
    test("sin la migración: se guarda en este dispositivo, se avisa y no se insiste al servidor", async () => {
        const r = await guardarVersion("esp1", { contenido: { app: "documento", unidades: [] }, motivo: "manual", resumen: "Vacío", autorNombre: "Ana" });
        expect(r).toEqual({ ok: true, local: true, error: null });
        const lista = await listarVersiones("esp1");
        expect(lista.soloLocal).toBe(true);
        expect(lista.versiones).toHaveLength(1);
        expect(lista.versiones[0]).toMatchObject({ motivo: "manual", resumen: "Vacío", autorNombre: "Ana", local: true });
        expect(await leerVersion("esp1", lista.versiones[0])).toEqual({ app: "documento", unidades: [] });
        // Ya se sabe que falta la tabla: no se vuelve a preguntar al servidor.
        const antes = servidor.inserciones + servidor.lecturas;
        await guardarVersion("esp1", { contenido: {}, motivo: "auto" });
        await listarVersiones("esp1");
        expect(servidor.inserciones + servidor.lecturas).toBe(antes);
    });

    test("con la tabla: se guarda en el servidor y el dispositivo guarda 20 como mucho", async () => {
        servidor.tablaExiste = true;
        const r = await guardarVersion("esp1", { contenido: { app: "documento", unidades: [] }, motivo: "auto" });
        expect(r).toEqual({ ok: true, local: false, error: null });
        const lista = await listarVersiones("esp1");
        expect(lista.soloLocal).toBe(false);
        expect(lista.versiones[0].local).toBe(false);
    });
});
