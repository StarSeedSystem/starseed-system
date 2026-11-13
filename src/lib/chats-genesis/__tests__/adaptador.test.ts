import { describe, expect, it, vi } from "vitest";
import {
    guardarPrefsChatsGenesis,
    leerCopiaLocalChatsGenesis,
    leerPrefsChatsGenesis,
    marcarConversacionGenesis,
    type AlmacenLocal,
    type SupabaseMinimo,
} from "../vinculos";
import { CLAVE_LOCAL, prefsVacias, type PrefsChatsGenesis } from "../tipos";

function almacen(): AlmacenLocal & { datos: Map<string, string> } {
    const datos = new Map<string, string>();
    return { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, v) };
}

/** Supabase de mentira: una fila por tabla y registro de lo que se pidió. */
function supabase(filas: Record<string, { data: unknown; error: unknown }>, errorUpdate: unknown = null) {
    const llamadas: { tabla: string; op: string; arg: unknown; eqs: [string, string][] }[] = [];
    const cliente: SupabaseMinimo = {
        from(tabla) {
            return {
                select(columnas) {
                    const eqs: [string, string][] = [];
                    llamadas.push({ tabla, op: "select", arg: columnas, eqs });
                    return { eq: (c, v) => (eqs.push([c, v]), { maybeSingle: async () => filas[tabla] }) };
                },
                update(v) {
                    const eqs: [string, string][] = [];
                    llamadas.push({ tabla, op: "update", arg: v, eqs });
                    return { eq: (c, x) => (eqs.push([c, x]), { eq: async (c2: string, x2: string) => (eqs.push([c2, x2]), { error: errorUpdate }) }) };
                },
            };
        },
    };
    return { cliente, llamadas };
}

const uid = async () => "cuenta-1";
const ahora = () => Date.parse("2026-11-13T10:00:00.000Z");

describe("marcarConversacionGenesis · lee y fusiona meta, nunca la sustituye", () => {
    it("escribe meta entera con las claves que ya tenía más genesis", async () => {
        const meta = { config: { pinned: true, modelo: "x" }, voiceNotes: { a: 1 } };
        const { cliente, llamadas } = supabase({ aurora_conversations: { data: { meta }, error: null } });
        const avisar = vi.fn();
        await marcarConversacionGenesis("conv-1", { nivel: "genesis", en: ["chats", "genesis"] }, { cliente, uid, avisar });
        expect(llamadas.map((l) => l.op)).toEqual(["select", "update"]);
        expect(llamadas[0]).toMatchObject({ arg: "meta", eqs: [["id", "conv-1"]] });
        expect(llamadas[1].arg).toEqual({ meta: { ...meta, genesis: { nivel: "genesis", en: ["chats", "genesis"] } } });
        expect(llamadas[1].eqs).toEqual([["id", "conv-1"], ["user_id", "cuenta-1"]]);
        expect(avisar).toHaveBeenCalledWith("conv-1");
    });

    it("con null quita solo meta.genesis", async () => {
        const meta = { config: { pinned: true }, genesis: { nivel: "genesis", en: ["genesis"] } };
        const { cliente, llamadas } = supabase({ aurora_conversations: { data: { meta }, error: null } });
        await marcarConversacionGenesis("conv-1", null, { cliente, uid, avisar: () => {} });
        expect(llamadas[1].arg).toEqual({ meta: { config: { pinned: true } } });
    });

    it("si la lectura falla o la fila no está, NO escribe nada", async () => {
        for (const fila of [{ data: null, error: { message: "red" } }, { data: null, error: null }, { data: { meta: "raro" }, error: null }]) {
            const { cliente, llamadas } = supabase({ aurora_conversations: fila });
            await expect(marcarConversacionGenesis("conv-1", { nivel: "genesis", en: ["genesis"] }, { cliente, uid, avisar: () => {} })).rejects.toThrow();
            expect(llamadas.filter((l) => l.op === "update")).toEqual([]);
        }
    });

    it("sin sesión no lee ni escribe", async () => {
        const { cliente, llamadas } = supabase({});
        await expect(marcarConversacionGenesis("conv-1", null, { cliente, uid: async () => null })).rejects.toThrow(/sesión/);
        expect(llamadas).toEqual([]);
    });
});

const buenas: PrefsChatsGenesis = {
    v: 1,
    vinculos: [{ v: 1, id: "direccion", fuente: { tipo: "direccion" }, nivel: "metagenesis", en: ["chats", "genesis"], creado: "2026-11-13T09:00:00.000Z", actualizado: "2026-11-13T09:00:00.000Z" }],
    conexiones: { metagenesis: { activo: true } },
};

describe("leerPrefsChatsGenesis / guardarPrefsChatsGenesis", () => {
    it("lee solo su clave, no escribe si no hay nada que migrar y deja la copia local", async () => {
        const { cliente, llamadas } = supabase({ user_settings: { data: { prefs: buenas, descartado: null }, error: null } });
        const merge = vi.fn(async () => ({ ok: true }));
        const a = almacen();
        expect(await leerPrefsChatsGenesis({ cliente, uid, merge, almacen: a, ahora })).toEqual(buenas);
        expect(llamadas[0].arg).toBe("prefs:prefs->chatsGenesis, descartado:prefs->chatsGenesisDescartado");
        expect(llamadas[0].eqs).toEqual([["user_id", "cuenta-1"]]);
        expect(merge).not.toHaveBeenCalled();
        expect(leerCopiaLocalChatsGenesis(a)).toEqual(buenas);
    });

    it("lo descartado se guarda en chatsGenesisDescartado en el MISMO parche que el resultado (máx. 20)", async () => {
        const previos = Array.from({ length: 20 }, (_, i) => ({ t: "antes", de: "chatsGenesis", valores: [i] }));
        const rota = { ...buenas, extra: "no lo entiendo" };
        const { cliente } = supabase({ user_settings: { data: { prefs: rota, descartado: previos }, error: null } });
        const merge = vi.fn(async (_p: Record<string, unknown>) => ({ ok: true }));
        await leerPrefsChatsGenesis({ cliente, uid, merge, almacen: almacen(), ahora });
        expect(merge).toHaveBeenCalledTimes(1);
        const parche = merge.mock.calls[0][0] as { chatsGenesis: unknown; chatsGenesisDescartado: { t: string; valores: unknown[] }[] };
        expect(parche.chatsGenesis).toEqual(buenas);
        expect(parche.chatsGenesisDescartado).toHaveLength(20);
        expect(parche.chatsGenesisDescartado[0].valores).toEqual([1]);
        const ultima = parche.chatsGenesisDescartado[19];
        expect(ultima.t).toBe("2026-11-13T10:00:00.000Z");
        expect(JSON.stringify(ultima.valores)).toContain("no lo entiendo");
    });

    it("si ese parche falla, el siguiente guardado lleva los descartes con él (el original nunca se pierde)", async () => {
        const { cliente } = supabase({ user_settings: { data: { prefs: { v: 1, raro: [1, 2, 3] }, descartado: null }, error: null } });
        await leerPrefsChatsGenesis({ cliente, uid, merge: async () => ({ ok: false, error: "sin red" }), almacen: almacen(), ahora });
        const merge = vi.fn(async (_p: Record<string, unknown>) => ({ ok: true }));
        await guardarPrefsChatsGenesis(buenas, { merge, almacen: almacen(), ahora });
        expect(JSON.stringify(merge.mock.calls[0][0].chatsGenesisDescartado)).toContain("[1,2,3]");
        await guardarPrefsChatsGenesis(buenas, { merge, almacen: almacen(), ahora });
        expect(merge.mock.calls[1][0]).toEqual({ chatsGenesis: buenas });
    });

    it("sin sesión, o si Supabase falla, devuelve la copia local sin lanzar", async () => {
        const a = almacen();
        a.datos.set(CLAVE_LOCAL, JSON.stringify({ prefs: buenas, en: 1 }));
        expect(await leerPrefsChatsGenesis({ cliente: supabase({}).cliente, uid: async () => null, almacen: a, ahora })).toEqual(buenas);
        const caido = supabase({ user_settings: { data: null, error: { message: "503" } } }).cliente;
        expect(await leerPrefsChatsGenesis({ cliente: caido, uid, almacen: a, ahora })).toEqual(buenas);
        expect(await leerPrefsChatsGenesis({ cliente: caido, uid, almacen: almacen(), ahora })).toEqual(prefsVacias());
    });

    it("guardar escribe la copia local primero, manda solo su clave y lanza si la cuenta no lo guardó", async () => {
        const a = almacen();
        const merge = vi.fn(async (_p: Record<string, unknown>) => ({ ok: false, error: "RLS" }));
        await expect(guardarPrefsChatsGenesis(buenas, { merge, almacen: a, ahora })).rejects.toThrow(/RLS/);
        expect(merge.mock.calls[0][0]).toEqual({ chatsGenesis: buenas });
        expect(leerCopiaLocalChatsGenesis(a)).toEqual(buenas);
    });
});
