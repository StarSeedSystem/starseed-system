// @vitest-environment jsdom
/**
 * dm-formato.test.ts — mockea el cliente de Supabase para probar el "fallback"
 * de la columna `os_dm_messages.formato`: si la base viva aún no la tiene
 * (42703 / mensaje con "formato"), `sendMessage`/`listMessages` reintentan UNA
 * vez sin pedirla y el módulo deja de solicitarla el resto de la sesión.
 *
 * Cada test recarga el módulo (`vi.resetModules()` + import dinámico) para que
 * el flag interno `formatoDisponible` empiece siempre en `true`.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

interface FilaResultado {
    data: unknown;
    error: unknown;
}

function crearBuilder(
    resolver: () => FilaResultado,
    registros: { inserts: unknown[]; selects: unknown[]; updates: unknown[] },
) {
    const builder: {
        insert: (p: unknown) => typeof builder;
        update: (p: unknown) => typeof builder;
        select: (cols?: unknown) => typeof builder;
        eq: (...a: unknown[]) => typeof builder;
        order: (...a: unknown[]) => typeof builder;
        limit: (...a: unknown[]) => typeof builder;
        maybeSingle: () => Promise<FilaResultado>;
        single: () => Promise<FilaResultado>;
        then: (resolve: (v: FilaResultado) => void, reject?: (e: unknown) => void) => Promise<void>;
    } = {
        insert: (p) => {
            registros.inserts.push(p);
            return builder;
        },
        update: (p) => {
            registros.updates.push(p);
            return builder;
        },
        select: (cols) => {
            registros.selects.push(cols);
            return builder;
        },
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => resolver(),
        single: async () => resolver(),
        then: (resolve, reject) => Promise.resolve(resolver()).then(resolve, reject),
    };
    return builder;
}

function crearClienteMock(secuencia: FilaResultado[]) {
    const registros = { inserts: [] as unknown[], selects: [] as unknown[], updates: [] as unknown[] };
    let llamada = 0;
    const resolver = (): FilaResultado => {
        const r = secuencia[Math.min(llamada, secuencia.length - 1)];
        llamada++;
        return r;
    };
    const builder = crearBuilder(resolver, registros);
    return {
        registros,
        client: {
            auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
            from: () => builder,
        },
    };
}

let clienteActual: unknown = null;
vi.mock("@/utils/supabase/client", () => ({
    createClient: () => clienteActual,
}));

const FILA_BASE = {
    id: "m1",
    thread_id: "t1",
    sender: "u1",
    body: "hola",
    attachments: [],
    reply_to: null,
    kind: "user",
    edited_at: null,
    deleted: false,
    created_at: "2026-09-01T00:00:00.000Z",
};

const ERROR_COLUMNA_FORMATO = { code: "42703", message: 'column "formato" of relation "os_dm_messages" does not exist' };

async function cargarDmFresco() {
    vi.resetModules();
    return import("@/lib/messages/dm");
}

beforeEach(() => {
    clienteActual = null;
});

describe("sendMessage: formato disponible", () => {
    test("incluye `formato` en el insert y lo devuelve en el mensaje normalizado", async () => {
        const mock = crearClienteMock([{ data: { ...FILA_BASE, formato: { v: 1, estilo: { negrita: true } } }, error: null }]);
        clienteActual = mock.client;
        const { sendMessage } = await cargarDmFresco();

        const enviado = await sendMessage("t1", { body: "hola", formato: { v: 1, estilo: { negrita: true } } });

        expect(mock.registros.inserts).toHaveLength(1);
        expect(mock.registros.inserts[0]).toHaveProperty("formato");
        expect(enviado?.formato).toEqual({ v: 1, estilo: { negrita: true } });
    });
});

describe("sendMessage: la columna `formato` todavía no existe", () => {
    test("reintenta UNA vez sin `formato` y el mensaje se envía igual (con su body de texto plano)", async () => {
        const mock = crearClienteMock([
            { data: null, error: ERROR_COLUMNA_FORMATO },
            { data: FILA_BASE, error: null },
        ]);
        clienteActual = mock.client;
        const { sendMessage } = await cargarDmFresco();

        const enviado = await sendMessage("t1", { body: "hola", formato: { v: 1, estilo: { negrita: true } } });

        expect(mock.registros.inserts).toHaveLength(2);
        expect(mock.registros.inserts[0]).toHaveProperty("formato");
        expect(mock.registros.inserts[1]).not.toHaveProperty("formato");
        expect(enviado).not.toBeNull();
        expect(enviado?.body).toBe("hola");
        expect(enviado?.formato).toBeNull();
    });

    test("tras el primer fallo, deja de pedir `formato` en envíos posteriores (mismo módulo)", async () => {
        const primero = crearClienteMock([
            { data: null, error: ERROR_COLUMNA_FORMATO },
            { data: FILA_BASE, error: null },
        ]);
        clienteActual = primero.client;
        const { sendMessage } = await cargarDmFresco();
        await sendMessage("t1", { body: "primero", formato: { v: 1 } });
        expect(primero.registros.inserts[1]).not.toHaveProperty("formato");

        const segundo = crearClienteMock([{ data: { ...FILA_BASE, body: "segundo" }, error: null }]);
        clienteActual = segundo.client;
        await sendMessage("t1", { body: "segundo", formato: { v: 1 } });

        // Ya no vuelve a intentarlo con `formato`: un solo insert, sin la columna.
        expect(segundo.registros.inserts).toHaveLength(1);
        expect(segundo.registros.inserts[0]).not.toHaveProperty("formato");
    });

    test("un mensaje SIN formato nunca lo incluye en el insert (comportamiento inalterado)", async () => {
        const mock = crearClienteMock([{ data: FILA_BASE, error: null }]);
        clienteActual = mock.client;
        const { sendMessage } = await cargarDmFresco();

        await sendMessage("t1", { body: "sin formato" });

        expect(mock.registros.inserts).toHaveLength(1);
        expect(mock.registros.inserts[0]).not.toHaveProperty("formato");
    });
});

describe("listMessages: la columna `formato` todavía no existe", () => {
    test("reintenta UNA vez sin pedir la columna y devuelve los mensajes con formato: null", async () => {
        const mock = crearClienteMock([
            { data: null, error: ERROR_COLUMNA_FORMATO },
            { data: [FILA_BASE], error: null },
        ]);
        clienteActual = mock.client;
        const { listMessages } = await cargarDmFresco();

        const mensajes = await listMessages("t1");

        expect(mock.registros.selects).toHaveLength(2);
        expect(String(mock.registros.selects[0])).toContain("formato");
        expect(String(mock.registros.selects[1])).not.toContain("formato");
        expect(mensajes).toHaveLength(1);
        expect(mensajes[0].formato).toBeNull();
    });

    test("cuando la columna sí existe, la pide y normaliza el `formato` de cada fila", async () => {
        const mock = crearClienteMock([{ data: [{ ...FILA_BASE, formato: { v: 1, doc: { bloques: [] } } }], error: null }]);
        clienteActual = mock.client;
        const { listMessages } = await cargarDmFresco();

        const mensajes = await listMessages("t1");

        expect(String(mock.registros.selects[0])).toContain("formato");
        expect(mensajes[0].formato).toEqual({ v: 1, doc: { bloques: [] } });
    });
});
