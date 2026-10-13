import { beforeEach, describe, expect, it, vi } from "vitest";

// (2026-10-13) 15 «Cerebro StarSeed» en la cuenta de Alex: con el presupuesto del día agotado el
// guardián deja pasar las escrituras pero no las lecturas, y un fallo de lectura se tomaba por
// «no tiene cerebros». Estas pruebas fijan que un fallo de lectura NUNCA crea otro.
const estado = {
    lectura: { data: null as unknown, error: null as unknown },
    upserts: 0,
};

function consulta() {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order"]) q[m] = () => q;
    q.abortSignal = () => Promise.resolve(estado.lectura);
    q.then = (r: (v: unknown) => unknown) => Promise.resolve(estado.lectura).then(r);
    q.upsert = () => {
        estado.upserts += 1;
        return { select: () => ({ single: () => Promise.resolve({ data: { id: "nuevo", name: "Cerebro StarSeed" }, error: null }) }) };
    };
    return q;
}

vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        auth: { getUser: async () => ({ data: { user: { id: "cuenta-1" } } }) },
        from: () => consulta(),
    }),
}));

beforeEach(() => {
    vi.resetModules();
    estado.lectura = { data: null, error: null };
    estado.upserts = 0;
    // Pruebas en node: un localStorage mínimo para la marca «esta cuenta ya tuvo cerebro».
    const almacen = new Map<string, string>();
    vi.stubGlobal("window", {
        localStorage: {
            getItem: (k: string) => almacen.get(k) ?? null,
            setItem: (k: string, v: string) => void almacen.set(k, v),
            removeItem: (k: string) => void almacen.delete(k),
            clear: () => almacen.clear(),
        },
    });
});

describe("cerebro por defecto (sin duplicados)", () => {
    it("la decisión pura: solo con lectura buena, cero cerebros y sin marca", async () => {
        const { debeCrearCerebroPorDefecto } = await import("../brains");
        expect(debeCrearCerebroPorDefecto({ ok: true, cuantos: 0 }, false)).toBe(true);
        expect(debeCrearCerebroPorDefecto({ ok: false, cuantos: 0 }, false)).toBe(false);
        expect(debeCrearCerebroPorDefecto({ ok: true, cuantos: 1 }, false)).toBe(false);
        expect(debeCrearCerebroPorDefecto({ ok: true, cuantos: 0 }, true)).toBe(false);
    });

    it("si la lectura falla (402 sintético del guardián) no crea nada", async () => {
        estado.lectura = { data: null, error: { message: "presupuesto agotado", code: "402" } };
        const { ensureDefaultBrain } = await import("../brains");
        expect(await ensureDefaultBrain()).toBeNull();
        expect(estado.upserts).toBe(0);
    });

    it("con cerebros devuelve el más antiguo y no crea otro", async () => {
        estado.lectura = { data: [{ id: "viejo", name: "Cerebro StarSeed" }, { id: "nuevo", name: "Copia" }], error: null };
        const { ensureDefaultBrain } = await import("../brains");
        expect((await ensureDefaultBrain())?.id).toBe("viejo");
        expect(estado.upserts).toBe(0);
    });

    it("una cuenta de verdad vacía recibe UNO, y el aparato no vuelve a crear aunque luego lea vacío", async () => {
        estado.lectura = { data: [], error: null };
        let m = await import("../brains");
        expect((await m.ensureDefaultBrain())?.id).toBe("nuevo");
        expect(estado.upserts).toBe(1);
        vi.resetModules();
        m = await import("../brains");
        expect(await m.ensureDefaultBrain()).toBeNull();
        expect(estado.upserts).toBe(1);
    });
});
