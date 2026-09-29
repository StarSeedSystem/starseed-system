// @vitest-environment jsdom
/**
 * Estado de la cuenta en el motor de sync (2026-09-29, persistencia entre medios).
 *
 * El fallo de fondo: cada medio arranca con su localStorage vacío y las ventanas que se abren
 * solas decidían a los 400–1.200 ms, ANTES de que terminara la primera bajada de la cuenta →
 * «nunca visto». Y si esa lectura fallaba (guardián, 402, red), `readCloudPrefs` devolvía `{}`
 * en silencio, con lo que además TODO lo local parecía «ausente de la cuenta» y se re-subía.
 *
 * Aquí se prueba:
 *  · `esperarPullInicial`: sin sesión / motor apagado / corte 402 / freno remoto → inmediato;
 *    con sesión espera al pull; con un pull que nunca llega respeta el plazo;
 *  · una lectura fallida NO sube nada y deja el estado honesto `sin-conexion`;
 *  · una lectura buena marca `sincronizado`, fusiona los avisos con lo local y los re-sube;
 *  · la lectura de arranque usa la señal esencial del guardián;
 *  · al cerrarse el corte se relee UNA vez (por evento, sin sondeo) y la cuenta vuelve a ser fiable;
 *  · cerrar sesión → `sin-sesion`; cambiar de cuenta → `pendiente` otra vez.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ctl = vi.hoisted(() => ({
    uid: "u1" as string | null,
    /** Qué devuelve la lectura de user_settings.prefs. */
    lectura: (async () => ({ data: { prefs: {} }, error: null })) as () => Promise<{ data: unknown; error: unknown }>,
    lecturas: 0,
    senalesRecibidas: [] as unknown[],
    corte: false,
    freno: false,
    oyentesGuardian: new Set<() => void>(),
    authCb: null as null | ((evento: string, sesion: { user: { id: string } } | null) => void),
    parches: [] as Record<string, unknown>[],
}));

vi.mock("@/utils/supabase/client", () => {
    const chan: Record<string, unknown> = {};
    Object.assign(chan, { on: () => chan, subscribe: () => chan, send: async () => ({}) });
    const client = {
        auth: {
            getSession: async () => ({ data: { session: ctl.uid ? { user: { id: ctl.uid } } : null } }),
            getUser: async () => ({ data: { user: ctl.uid ? { id: ctl.uid } : null } }),
            onAuthStateChange: (cb: typeof ctl.authCb) => {
                ctl.authCb = cb;
                return { data: { subscription: { unsubscribe() {} } } };
            },
        },
        from: () => {
            const consulta = {
                select: () => consulta,
                eq: () => consulta,
                abortSignal: (s: unknown) => {
                    ctl.senalesRecibidas.push(s);
                    return consulta;
                },
                maybeSingle: () => {
                    ctl.lecturas++;
                    return ctl.lectura();
                },
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
vi.mock("@/lib/consumo/freno", () => ({ frenoActivo: () => ctl.freno }));
vi.mock("@/lib/consumo/guardian", () => ({
    leerAvisoConsumo: () => ({ corte: ctl.corte, corteHasta: null, frenoLocalHasta: null, diaAgotado: false }),
    senalEsencial: () => ({ esSenalEsencial: true }) as unknown as AbortSignal,
    suscribirConsumo: (cb: () => void) => {
        ctl.oyentesGuardian.add(cb);
        return () => {
            ctl.oyentesGuardian.delete(cb);
        };
    },
}));

const AVISOS = "starseed.avisos.vistos.v1";
const CURSOR = "starseed.cursorfx.v1"; // clave sincronizada cualquiera
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Motor = typeof import("../realtime-sync");
let rs: Motor;

// Un solo módulo para todo el archivo: el motor parchea `Storage.prototype.setItem` y ese parche
// sobrevive a `vi.resetModules()`; con varias copias del módulo, las viejas seguirían subiendo cosas.
beforeAll(async () => {
    rs = await import("../realtime-sync");
});

beforeEach(() => {
    rs.stopRealtimeSync();
    rs._reiniciarEstadoCuentaParaPruebas();
    localStorage.clear();
    ctl.uid = "u1";
    ctl.lectura = async () => ({ data: { prefs: {} }, error: null });
    ctl.lecturas = 0;
    ctl.senalesRecibidas = [];
    ctl.corte = false;
    ctl.freno = false;
    ctl.oyentesGuardian.clear();
    ctl.authCb = null;
    ctl.parches = [];
});

afterEach(() => {
    rs.stopRealtimeSync();
});

afterAll(() => {
    localStorage.clear();
});

/** Deja un valor LOCAL «de antes de arrancar»: escribe y descarta la subida que el parche programó. */
function sembrarLocal(clave: string, valor: unknown): void {
    localStorage.setItem(clave, JSON.stringify(valor));
    rs.stopRealtimeSync();
}

describe("esperarPullInicial", () => {
    it("sin sesión: resuelve al instante y lo local es la verdad", async () => {
        ctl.uid = null;
        const r = await rs.esperarPullInicial(5000);
        expect(r).toEqual({ estado: "sin-sesion", fiable: true });
    });

    it("con el motor apagado por el usuario: sin espera, lo local manda", async () => {
        localStorage.setItem(rs.REALTIME_SYNC_TOGGLE_KEY, "off");
        const r = await rs.esperarPullInicial(5000);
        expect(r).toEqual({ estado: "sin-sesion", fiable: true });
    });

    it("con el cortacircuitos 402 abierto: sin-conexion al instante (no espera un pull que no saldrá)", async () => {
        ctl.corte = true;
        const t0 = Date.now();
        const r = await rs.esperarPullInicial(5000);
        expect(r).toEqual({ estado: "sin-conexion", fiable: false });
        expect(Date.now() - t0).toBeLessThan(500);
    });

    it("con el freno remoto activo: sin-conexion al instante", async () => {
        ctl.freno = true;
        const r = await rs.esperarPullInicial(5000);
        expect(r).toEqual({ estado: "sin-conexion", fiable: false });
    });

    it("con sesión espera a que termine el primer pull y entonces es fiable", async () => {
        let soltar!: () => void;
        ctl.lectura = () =>
            new Promise((res) => {
                soltar = () => res({ data: { prefs: { [CURSOR]: { v: 1 } } }, error: null });
            });
        await rs.startRealtimeSync();
        let resuelta = false;
        const espera = rs.esperarPullInicial(5000).then((r) => {
            resuelta = true;
            return r;
        });
        await sleep(30);
        expect(resuelta).toBe(false); // el pull sigue en vuelo
        expect(rs.getEstadoCuentaPrefs()).toBe("pendiente");
        soltar();
        expect(await espera).toEqual({ estado: "sincronizado", fiable: true });
        // Lo de la cuenta YA estaba en localStorage cuando se resolvió la espera.
        expect(JSON.parse(localStorage.getItem(CURSOR)!)).toEqual({ v: 1 });
    });

    it("si el pull nunca llega respeta el plazo y NO dice que sea fiable", async () => {
        ctl.lectura = () => new Promise(() => {});
        await rs.startRealtimeSync();
        const t0 = Date.now();
        const r = await rs.esperarPullInicial(80);
        expect(r).toEqual({ estado: "pendiente", fiable: false });
        expect(Date.now() - t0).toBeGreaterThanOrEqual(70);
        expect(Date.now() - t0).toBeLessThan(1000);
    });

    it("tras terminar, las siguientes esperas son inmediatas", async () => {
        await rs.startRealtimeSync();
        await rs.esperarPullInicial(2000);
        const t0 = Date.now();
        const r = await rs.esperarPullInicial(5000);
        expect(r.fiable).toBe(true);
        expect(Date.now() - t0).toBeLessThan(200);
    });
});

describe("la lectura de arranque", () => {
    it("usa la señal ESENCIAL del guardián (no cae por el presupuesto local)", async () => {
        await rs.startRealtimeSync();
        await rs.esperarPullInicial(2000);
        expect(ctl.senalesRecibidas.length).toBeGreaterThan(0);
        expect(ctl.senalesRecibidas[0]).toEqual({ esSenalEsencial: true });
    });

    it("una lectura FALLIDA deja sin-conexion y NO sube lo local «porque la cuenta no lo tiene»", async () => {
        sembrarLocal(CURSOR, { v: "local" });
        ctl.lectura = async () => ({ data: null, error: { message: "402" } });
        await rs.startRealtimeSync();
        const r = await rs.esperarPullInicial(2000);
        expect(r).toEqual({ estado: "sin-conexion", fiable: false });
        expect(rs.getEstadoCuentaPrefs()).toBe("sin-conexion");
        await sleep(2300); // pasa el debounce de subida
        expect(ctl.parches).toEqual([]); // antes: `{}` ⇒ todo parecía ausente y se reenviaba
        expect(JSON.parse(localStorage.getItem(CURSOR)!)).toEqual({ v: "local" });
    });

    it("una excepción de red también deja sin-conexion (nunca «sincronizado»)", async () => {
        ctl.lectura = async () => {
            throw new Error("net::ERR_INTERNET_DISCONNECTED");
        };
        await rs.startRealtimeSync();
        expect((await rs.esperarPullInicial(2000)).estado).toBe("sin-conexion");
    });

    it("una cuenta sin preferencias todavía es una lectura BUENA (sincronizado)", async () => {
        ctl.lectura = async () => ({ data: null, error: null });
        await rs.startRealtimeSync();
        expect((await rs.esperarPullInicial(2000)).estado).toBe("sincronizado");
    });
});

describe("avisos vistos: fusión con lo local", () => {
    const local = { v: 1, ids: { a149: { estado: "hecho", ts: 5 } }, porNeurona: {} };
    const cuenta = { v: 1, ids: { guia: { estado: "visto", ts: 6 } }, porNeurona: {} };

    it("no pisa lo local con lo de la cuenta: se unen, y lo local nuevo se vuelve a subir", { timeout: 10_000 }, async () => {
        sembrarLocal(AVISOS, local);
        ctl.lectura = async () => ({ data: { prefs: { [AVISOS]: cuenta, __meta: { [AVISOS]: 1 } } }, error: null });
        await rs.startRealtimeSync();
        await rs.esperarPullInicial(2000);
        const guardado = JSON.parse(localStorage.getItem(AVISOS)!);
        expect(Object.keys(guardado.ids).sort()).toEqual(["a149", "guia"]);
        await sleep(2400);
        const subida = ctl.parches.find((p) => AVISOS in p);
        expect(subida).toBeTruthy();
        expect(Object.keys((subida![AVISOS] as { ids: object }).ids).sort()).toEqual(["a149", "guia"]);
    });

    it("con la cuenta idéntica a lo local no hay nada que re-subir", { timeout: 10_000 }, async () => {
        sembrarLocal(AVISOS, cuenta);
        // La cuenta lleva una marca más nueva que la local (lo normal: otro medio subió después).
        const marcaCuenta = Date.now() + 60_000;
        ctl.lectura = async () => ({ data: { prefs: { [AVISOS]: cuenta, __meta: { [AVISOS]: marcaCuenta } } }, error: null });
        await rs.startRealtimeSync();
        await rs.esperarPullInicial(2000);
        await sleep(2400);
        expect(ctl.parches.find((p) => AVISOS in p)).toBeUndefined();
    });
});

describe("recuperar la cuenta sin sondeo", () => {
    it("al cerrarse el corte se relee UNA vez y la cuenta vuelve a ser fiable", async () => {
        ctl.corte = true;
        ctl.lectura = async () => ({ data: null, error: { message: "402" } });
        await rs.startRealtimeSync();
        await rs.esperarPullInicial(2000);
        expect(rs.getEstadoCuentaPrefs()).toBe("sin-conexion");
        expect(ctl.oyentesGuardian.size).toBe(1); // armado por evento, no por temporizador
        const lecturasAntes = ctl.lecturas;

        // El corte sigue abierto: un aviso del guardián NO relee.
        for (const o of Array.from(ctl.oyentesGuardian)) o();
        await sleep(20);
        expect(ctl.lecturas).toBe(lecturasAntes);

        // Se cierra el corte y la cuenta responde: una sola lectura y sincronizado.
        ctl.corte = false;
        ctl.lectura = async () => ({ data: { prefs: { [CURSOR]: { v: 9 } } }, error: null });
        for (const o of Array.from(ctl.oyentesGuardian)) o();
        await sleep(50);
        expect(ctl.lecturas).toBe(lecturasAntes + 1);
        expect(rs.getEstadoCuentaPrefs()).toBe("sincronizado");
        expect(JSON.parse(localStorage.getItem(CURSOR)!)).toEqual({ v: 9 });
        expect(ctl.oyentesGuardian.size).toBe(0); // desarmado: no queda escucha viva
    });

    it("cuandoCuentaFiable llama UNA vez cuando la cuenta pasa a ser fiable", async () => {
        ctl.corte = true;
        ctl.lectura = async () => ({ data: null, error: { message: "402" } });
        await rs.startRealtimeSync();
        const cb = vi.fn();
        rs.cuandoCuentaFiable(cb, 200);
        await sleep(300);
        expect(cb).not.toHaveBeenCalled(); // sin conexión: no se decide a ciegas

        ctl.corte = false;
        ctl.lectura = async () => ({ data: { prefs: {} }, error: null });
        for (const o of Array.from(ctl.oyentesGuardian)) o();
        await sleep(60);
        expect(cb).toHaveBeenCalledTimes(1);
        // Un cambio posterior no vuelve a llamar.
        window.dispatchEvent(new CustomEvent(rs.SYNC_CUENTA_EVENT, { detail: { estado: "sincronizado" } }));
        expect(cb).toHaveBeenCalledTimes(1);
    });

    it("cuandoCuentaFiable llama de inmediato si ya es fiable y se puede cancelar", async () => {
        await rs.startRealtimeSync();
        await rs.esperarPullInicial(2000);
        const cb = vi.fn();
        rs.cuandoCuentaFiable(cb);
        await sleep(10);
        expect(cb).toHaveBeenCalledTimes(1);

        ctl.corte = true;
        rs._reiniciarEstadoCuentaParaPruebas();
        const cb2 = vi.fn();
        const cancelar = rs.cuandoCuentaFiable(cb2, 50);
        cancelar();
        await sleep(100);
        expect(cb2).not.toHaveBeenCalled();
    });
});

describe("ciclo de sesión", () => {
    it("cerrar sesión → sin-sesion; volver a entrar → pendiente hasta el nuevo pull", async () => {
        await rs.startRealtimeSync();
        await rs.esperarPullInicial(2000);
        expect(rs.getEstadoCuentaPrefs()).toBe("sincronizado");
        const estados: string[] = [];
        window.addEventListener(rs.SYNC_CUENTA_EVENT, (e) => estados.push((e as CustomEvent).detail.estado));

        ctl.uid = null;
        ctl.authCb?.("SIGNED_OUT", null);
        expect(rs.getEstadoCuentaPrefs()).toBe("sin-sesion");

        ctl.uid = "u2";
        ctl.authCb?.("SIGNED_IN", { user: { id: "u2" } });
        await sleep(50);
        expect(estados).toEqual(["sin-sesion", "pendiente", "sincronizado"]);
    });

    it("otra cuenta: lo bajado de la anterior ya no vale, vuelve a pendiente", async () => {
        await rs.startRealtimeSync();
        await rs.esperarPullInicial(2000);
        const estados: string[] = [];
        window.addEventListener(rs.SYNC_CUENTA_EVENT, (e) => estados.push((e as CustomEvent).detail.estado));
        ctl.uid = "u3";
        ctl.authCb?.("SIGNED_IN", { user: { id: "u3" } });
        await sleep(50);
        expect(estados).toEqual(["pendiente", "sincronizado"]);
    });

    it("startRealtimeSync sin sesión deja sin-sesion (las ventanas deciden ya)", async () => {
        ctl.uid = null;
        await rs.startRealtimeSync();
        expect(rs.getEstadoCuentaPrefs()).toBe("sin-sesion");
    });
});
