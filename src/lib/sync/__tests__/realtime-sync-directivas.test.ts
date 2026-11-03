// @vitest-environment jsdom
/**
 * Directivas de automejora Meta^n por el sync de cuenta (MTN1027Cb, parte 3 de 3).
 *
 * La clave `starseed.capas.directivas.v1` (src/lib/astraura/capas/directivas-almacen.ts)
 * viaja con la cuenta en `user_settings.prefs`. Al BAJAR de otro medio el valor debe
 * pasar por `normalizarRegistroDirectivas` (lo que llega torcido no debe persistirse
 * tal cual) y sonar su evento `starseed:capas-directivas` (storage no suena en la
 * misma pestaña). Y si el saneo reparó algo, lo limpio se vuelve a subir, o este
 * medio quedaría bien y los demás con la basura.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ctl = vi.hoisted(() => ({
    uid: "u1" as string | null,
    lectura: (async () => ({ data: { prefs: {} }, error: null })) as () => Promise<{ data: unknown; error: unknown }>,
    parches: [] as Record<string, unknown>[],
}));

vi.mock("@/utils/supabase/client", () => {
    const chan: Record<string, unknown> = {};
    Object.assign(chan, { on: () => chan, subscribe: () => chan, send: async () => ({}) });
    const client = {
        auth: {
            getSession: async () => ({ data: { session: ctl.uid ? { user: { id: ctl.uid } } : null } }),
            getUser: async () => ({ data: ctl.uid ? { user: { id: ctl.uid } } : null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        },
        from: () => {
            const consulta = {
                select: () => consulta,
                eq: () => consulta,
                abortSignal: () => consulta,
                maybeSingle: () => ctl.lectura(),
            };
            return consulta;
        },
        channel: () => chan,
        removeChannel: () => {},
    };
    return { createClient: () => client };
});

vi.mock("@/lib/sync/user-prefs", () => ({
    recordarPrefsServidor: () => {},
    olvidarHuellasPrefs: () => {},
    mergeUserPrefs: async (patch: Record<string, unknown>) => {
        ctl.parches.push(patch);
        return { ok: true, atomic: true };
    },
}));

vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => ctl.uid }));
vi.mock("@/lib/consumo/lider-pestana", () => ({ esLider: () => true }));
vi.mock("@/lib/consumo/freno", () => ({ frenoActivo: () => false }));
vi.mock("@/lib/consumo/guardian", () => ({
    leerAvisoConsumo: () => ({ corte: false, corteHasta: null, frenoLocalHasta: null, diaAgotado: false }),
    senalEsencial: () => ({ esSenalEsencial: true }) as unknown as AbortSignal,
    suscribirConsumo: () => () => {},
}));

import { isSyncedKey } from "@/lib/sync/realtime-sync";
import {
    CLAVE_DIRECTIVAS,
    EVENTO_DIRECTIVAS,
    leerDirectivas,
} from "@/lib/astraura/capas/directivas-almacen";

type Motor = typeof import("@/lib/sync/realtime-sync");
let rs: Motor;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Una directiva de capa VÁLIDA (la forma que sana el almacén sin tocar nada). */
const buena = {
    capa: "juicio", version: 2, texto: "resume antes de responder",
    fecha: "2026-10-27", origen: "meta-n", estado: "activa",
};

/** El registro TORSIDO que un medio ajeno podría haber guardado tal cual. */
const registroTorcido = {
    juicio: {
        v: 1, capa: "juicio", activa: 2,
        historial: [buena, { texto: "sin versión ni fecha: se cae" }, "ni siquiera objeto"],
    },
    "clave-ajena": 42, // un valor inconexo del registro entero: se cae entero
};

/** Lo que debe quedar tras el saneo: la directiva con sus campos por defecto y solo eso. */
const registroSaneado = {
    juicio: {
        v: 1, capa: "juicio", activa: 2,
        historial: [{ ...buena, sha256: "", acierto: 0, base: 0, n: 0 }],
    },
};

describe("la clave de las directivas viaja con la cuenta", () => {
    it("el motor de sync la considera sincronizada (ni secreta ni local)", () => {
        expect(isSyncedKey(CLAVE_DIRECTIVAS)).toBe(true);
    });
});

describe("directivas que bajan de la cuenta", () => {
    const eventos: string[] = [];

    beforeAll(async () => {
        rs = await import("@/lib/sync/realtime-sync");
    });

    beforeEach(() => {
        rs.stopRealtimeSync();
        rs._reiniciarEstadoCuentaParaPruebas();
        localStorage.clear();
        ctl.uid = "u1";
        ctl.lectura = async () => ({ data: { prefs: {} }, error: null });
        ctl.parches = [];
        window.addEventListener(EVENTO_DIRECTIVAS, (e) => { eventos.push((e as Event).type); });
    });

    afterEach(() => {
        rs.stopRealtimeSync();
        window.removeEventListener(EVENTO_DIRECTIVAS, (e) => eventos.push((e as Event).type));
        eventos.length = 0;
    });

    afterAll(() => { localStorage.clear(); });

    it("un registro TORSIDO se sana ANTES de persistirse (queda lo válido, suena su evento)", { timeout: 10_000 }, async () => {
        ctl.lectura = async () => ({ data: { prefs: { [CLAVE_DIRECTIVAS]: registroTorcido } }, error: null });
        await rs.startRealtimeSync();
        await rs.esperarPullInicial(2000);
        expect(JSON.parse(localStorage.getItem(CLAVE_DIRECTIVAS)!)).toEqual(registroSaneado);
        expect(leerDirectivas("juicio")).toEqual(registroSaneado.juicio);
        expect(eventos).toEqual([EVENTO_DIRECTIVAS]); // la pestaña que aplicó el cambio ve el evento
    });

    it("lo saneado se vuelve a SUBIR: si quedara local, los demás medios tendrían la basura", { timeout: 10_000 }, async () => {
        ctl.lectura = async () => ({ data: { prefs: { [CLAVE_DIRECTIVAS]: registroTorcido } }, error: null });
        await rs.startRealtimeSync();
        await rs.esperarPullInicial(2000);
        await sleep(2400); // debounce de 2 s (contrato «consumo»)
        const subida = ctl.parches.find((p) => CLAVE_DIRECTIVAS in p);
        expect(subida).toBeTruthy();
        expect(subida![CLAVE_DIRECTIVAS]).toEqual(registroSaneado);
        expect(subida!.__meta).toHaveProperty(CLAVE_DIRECTIVAS);
    });

    it("un registro VÁLIDO de la cuenta se aplica tal cual y NO se reenvía arriba", { timeout: 10_000 }, async () => {
        ctl.lectura = async () => ({ data: { prefs: { [CLAVE_DIRECTIVAS]: registroSaneado } }, error: null });
        await rs.startRealtimeSync();
        await rs.esperarPullInicial(2000);
        expect(JSON.parse(localStorage.getItem(CLAVE_DIRECTIVAS)!)).toEqual(registroSaneado);
        await sleep(2400);
        expect(ctl.parches.find((p) => CLAVE_DIRECTIVAS in p)).toBeUndefined();
    });
});


