// @vitest-environment jsdom
/**
 * usar-espacio · SES1115Q P1-B. La nube (`entity-state`) está simulada, como en las
 * pruebas de `src/lib/sync/__tests__`: se comprueba lectura filtrada por permisos,
 * escritura solo con `gestionar` sobre la clave `espacio` (jamás `layout`) y que un
 * fallo de lectura se muestra como error, no como «no hay pestañas».
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pestana } from "../modelo";
import type { ResultadoAccion } from "../usar-espacio";

const m = vi.hoisted(() => ({
    sesion: { kind: "user", id: "u1" } as { kind: string; id: string } | null,
    lectura: { row: null as unknown, error: null as string | null },
    escrituras: [] as Array<{ ref: unknown; key: string; value: unknown }>,
}));

vi.mock("@/lib/sync/entity-state", () => ({
    currentUserRef: async () => m.sesion,
    getEntityStateChecked: async () => m.lectura,
    setEntityStateChecked: async (ref: unknown, key: string, value: unknown) => {
        m.escrituras.push({ ref, key, value });
        return { row: { value, rev: 1, updated_at: "", device_id: null }, error: null };
    },
}));

import { usarEspacio } from "../usar-espacio";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const ENTIDAD = { kind: "page" as const, id: "pagina-1" };

function pestana(id: string, visibilidad: Pestana["visibilidad"]): Pestana {
    return {
        id,
        titulo: `Pestaña ${id}`,
        tipo: "pizarra",
        sesionId: UUID,
        visibilidad,
        accesoPublico: visibilidad === "publica" ? "ver" : "ninguno",
    };
}

function fila(...pestanas: Pestana[]) {
    return { value: pestanas, rev: 1, updated_at: "2026-11-17T00:00:00Z", device_id: null };
}

async function montar(ctx: { rango: number; roles?: string[]; anonimo?: boolean }) {
    const hook = renderHook(() => usarEspacio(ENTIDAD, ctx));
    await waitFor(() => expect(hook.result.current.cargando).toBe(false));
    return hook.result;
}

beforeEach(() => {
    m.sesion = { kind: "user", id: "u1" };
    m.lectura = { row: fila(pestana("abierta", "publica"), pestana("privada", "privada")), error: null };
    m.escrituras.length = 0;
});

describe("usarEspacio", () => {
    it("un observador ve solo lo suyo y no puede añadir", async () => {
        const result = await montar({ rango: 1 });
        expect(result.current.pestanas.map((p) => p.id)).toEqual(["abierta"]);

        let res: ResultadoAccion | undefined;
        await act(async () => { res = await result.current.anadir(pestana("nueva", "publica")); });
        expect(res?.ok).toBe(false);
        expect(res?.motivo).toMatch(/gestiona/);
        expect(m.escrituras).toHaveLength(0);
    });

    it("un gestor añade y la escritura llega con la clave espacio (layout intacto)", async () => {
        const result = await montar({ rango: 3 });
        const nueva = pestana("nueva", "privada");

        let res: ResultadoAccion | undefined;
        await act(async () => { res = await result.current.anadir(nueva); });

        expect(res?.ok).toBe(true);
        expect(m.escrituras).toHaveLength(1);
        expect(m.escrituras[0].key).toBe("espacio");
        expect(m.escrituras[0].ref).toEqual(ENTIDAD);
        expect((m.escrituras[0].value as Pestana[]).map((p) => p.id)).toContain("nueva");
        expect(m.escrituras.some((e) => e.key === "layout")).toBe(false);
        expect(result.current.pestanas.map((p) => p.id)).toContain("nueva");
    });

    it("un fallo de lectura deja error y no una lista vacía engañosa", async () => {
        m.lectura = { row: null, error: "sin conexión con la nube" };
        const result = await montar({ rango: 1 });
        expect(result.current.cargando).toBe(false);
        expect(result.current.error).toBe("sin conexión con la nube");
    });

    it("sin sesión: lista vacía y un error honesto", async () => {
        m.sesion = null;
        const result = await montar({ rango: 1 });
        expect(result.current.pestanas).toEqual([]);
        expect(result.current.error).toMatch(/Sin sesión/);
    });
});
