// @vitest-environment jsdom
/** useSharedBoardSpace sobre el motor por registro (SVF1A5f): dos instancias con la MISMA rev acaban con las dos ediciones. */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { CanvasBlock } from "@/lib/canvas/canvas";
import { alinear, useSharedBoardSpace } from "../shared-board-space";

type Aviso = { rev: number; doc: Record<string, unknown> };
const S = vi.hoisted(() => ({
    rev: 1, doc: {} as Record<string, unknown>, subs: new Set<(c: Aviso) => void>(), llamadas: 0, guardados: 0, puede: true, avisar: true, uids: ["ana", "beto"],
}));
vi.mock("@/lib/spaces/spaces", () => ({ getSpace: async () => null }));
vi.mock("@/lib/vivo/tabla/espacio", () => {
    const esp = () => ({ id: "e1", titulo: "Pizarra", doc: S.doc, rev: S.rev, propietario: "dueno", acceso: "invite" });
    return {
        miUid: async () => (S.llamadas++, S.uids.shift() ?? "otra"),
        leerEspacio: async () => ({ ok: true, espacio: esp() }),
        puedoEditarEspacio: async () => S.puede,
        suscribirEspacio: (_id: string, cb: (c: Aviso) => void) => (S.subs.add(cb), () => void S.subs.delete(cb)),
        guardarEspacioCAS: async (_id: string, doc: Record<string, unknown>, rev: number) => {
            if (rev !== S.rev) return { ok: false, motivo: "conflicto" };
            S.rev += 1; S.doc = doc; S.guardados += 1;
            if (S.avisar) S.subs.forEach((s) => s({ rev: S.rev, doc }));
            return { ok: true, espacio: esp() };
        },
    };
});

const bl = (id: string, x = 0): CanvasBlock => ({ id, kind: "text", x, y: 0, w: 5, h: 5, data: {} });
const viejo = { sharing: "ajeno", blocks: [bl("b1"), bl("b2")], edges: [{ id: "e1", from: "b1", to: "b2" }] };
const avanzar = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const ids = (r?: { blocks: CanvasBlock[] } | null) => (r?.blocks ?? []).map((b) => b.id).sort();

beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(S, { rev: 1, doc: structuredClone(viejo), subs: new Set(), llamadas: 0, guardados: 0, puede: true, avisar: true, uids: ["ana", "beto"] });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("useSharedBoardSpace con el motor por registro", () => {
    test("dos instancias editan bloques distintos y las dos acaban con los dos (y el doc viejo se migra)", async () => {
        S.avisar = false; // Realtime tarda: las dos guardan con la misma rev y la segunda pasa por conflicto + fusión
        const a = renderHook(() => useSharedBoardSpace("e1", 600));
        const b = renderHook(() => useSharedBoardSpace("e1", 600));
        await avanzar(10);
        expect(ids(a.result.current.remoteDoc)).toEqual(["b1", "b2"]);
        const [ra, rb] = [a.result.current.remoteDoc!, b.result.current.remoteDoc!];
        act(() => a.result.current.pushDoc({ blocks: [...ra.blocks, bl("de-ana", 7)], edges: ra.edges }));
        act(() => b.result.current.pushDoc({ blocks: rb.blocks.filter((x) => x.id !== "b2"), edges: rb.edges }));
        await avanzar(4000);
        expect(S.guardados).toBe(2);
        S.subs.forEach((s) => s({ rev: S.rev, doc: S.doc })); // llega el aviso tardío
        await avanzar(10);
        for (const r of [a, b]) expect(ids(r.result.current.remoteDoc)).toEqual(["b1", "de-ana"]);
        expect(S.doc.formato).toBe(1);
        expect(S.doc.sharing).toBe("ajeno");
        expect(ids({ blocks: (S.doc.blocks as CanvasBlock[]) })).toEqual(["b1", "de-ana"]);
    });

    test("sin spaceId no hay ninguna llamada y el hook no entrega nada", async () => {
        const h = renderHook(() => useSharedBoardSpace(null));
        act(() => h.result.current.pushDoc({ blocks: [bl("x")], edges: [] }));
        await avanzar(5000);
        expect(S.llamadas + S.guardados + S.subs.size).toBe(0);
        expect(h.result.current).toMatchObject({ remoteDoc: null, space: null, loading: false, soloLectura: false, aviso: null });
    });

    test("sin permiso queda en solo lectura, lo dice con palabras y no escribe", async () => {
        S.puede = false;
        const h = renderHook(() => useSharedBoardSpace("e1", 600));
        await avanzar(10);
        act(() => h.result.current.pushDoc({ blocks: [bl("x")], edges: [] }));
        await avanzar(5000);
        expect(h.result.current.soloLectura).toBe(true);
        expect(h.result.current.aviso).toMatch(/solo lectura/);
        expect(S.guardados).toBe(0);
        expect(ids(h.result.current.remoteDoc)).toEqual(["b1", "b2"]);
    });

    test("alinear: igual a lo que ya hay devuelve la misma referencia; lo nuevo va al final", () => {
        const local = [bl("b"), bl("a")];
        expect(alinear(local, [bl("a"), bl("b")])).toBe(local);
        expect(alinear(local, [bl("a"), bl("c"), bl("b")]).map((x) => x.id)).toEqual(["b", "a", "c"]);
        expect(alinear(local, [bl("b", 9), bl("a")])).not.toBe(local);
    });
});
