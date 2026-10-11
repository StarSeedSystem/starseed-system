import { describe, expect, it } from "vitest";
import { crearPuertaA1 } from "../puerta-a1";
import {
    CLAVE_COLA,
    CLAVE_CONTADORES,
    CLAVE_URL,
    grupoDeRuta,
    COLA_MAX,
    SALUD_INICIAL,
    anotarSalud,
    destinoDeRespuesta,
    elegir,
    encolar,
    esDatosPuerta,
    leerCola,
    urlPuertaValida,
    vistaPuerta,
    type AlmacenPuerta,
    type DatosPuerta,
} from "../puerta-a1-tipos";

function almacenMemoria(): AlmacenPuerta & { datos: Map<string, string> } {
    const datos = new Map<string, string>();
    return {
        datos,
        getItem: (k) => datos.get(k) ?? null,
        setItem: (k, v) => void datos.set(k, v),
        removeItem: (k) => void datos.delete(k),
    };
}

type Manejador = (url: string, init?: RequestInit) => Response | Promise<Response> | "red";

function fetchFalso(manejar: Manejador) {
    const llamadas: { url: string; init?: RequestInit }[] = [];
    const f = async (url: string, init?: RequestInit) => {
        llamadas.push({ url, init });
        const r = await manejar(url, init);
        if (r === "red") throw new TypeError("Failed to fetch");
        return r;
    };
    return Object.assign(f, { llamadas });
}

const json = (estado: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { "content-type": "application/json" } });
const URL_PUERTA = "https://datos.prueba.example";

function montar(manejar: Manejador, extra: Partial<Parameters<typeof crearPuertaA1>[0]> = {}) {
    let t = Date.parse("2026-10-10T21:00:00Z");
    const reloj = Object.assign(() => t, { avanzar: (ms: number) => (t += ms) });
    const almacen = almacenMemoria();
    const f = fetchFalso(manejar);
    const p = crearPuertaA1({ fetch: f, almacen, ahora: reloj, url: URL_PUERTA, sesion: async () => "jwt-de-la-cuenta", ...extra });
    return { p, f, almacen, reloj };
}

describe("puerta-a1-tipos (puro)", () => {
    it("solo acepta https sin ruta ni credenciales (o localhost para probar)", () => {
        expect(urlPuertaValida("https://datos.1-2-3-4.sslip.io")).toBe("https://datos.1-2-3-4.sslip.io");
        expect(urlPuertaValida("https://datos.x.io/")).toBe("https://datos.x.io");
        expect(urlPuertaValida("http://datos.x.io")).toBeNull();
        expect(urlPuertaValida("https://u:p@datos.x.io")).toBeNull();
        expect(urlPuertaValida("https://datos.x.io/v1?x=1")).toBeNull();
        expect(urlPuertaValida("javascript:alert(1)")).toBeNull();
        expect(urlPuertaValida("http://127.0.0.1:8791")).toBe("http://127.0.0.1:8791");
        expect(urlPuertaValida(42)).toBeNull();
    });

    it("elige: apagada o sin URL → Supabase; sana reciente → puerta; tras fallo espera", () => {
        const t = 1_000_000;
        expect(elegir({ modo: "apagada" }, URL_PUERTA, { ...SALUD_INICIAL, ok: true, en: t }, t)).toBe("supabase");
        expect(elegir({ modo: "auto" }, null, SALUD_INICIAL, t)).toBe("supabase");
        expect(elegir({ modo: "auto" }, URL_PUERTA, SALUD_INICIAL, t)).toBe("probar");
        const sana = anotarSalud(SALUD_INICIAL, true, t);
        expect(elegir({ modo: "auto" }, URL_PUERTA, sana, t + 10_000)).toBe("puerta");
        expect(elegir({ modo: "auto" }, URL_PUERTA, sana, t + 31_000)).toBe("probar");
        const caida = anotarSalud(sana, false, t);
        expect(elegir({ modo: "auto" }, URL_PUERTA, caida, t + 30_000)).toBe("supabase");
        expect(elegir({ modo: "auto" }, URL_PUERTA, caida, t + 61_000)).toBe("probar");
        const dos = anotarSalud(caida, false, t);
        expect(dos.esperaHasta - t).toBe(120_000);
    });

    it("qué hacer con cada respuesta: un «no» de la puerta nunca se repite en Supabase", () => {
        expect(destinoDeRespuesta(200, true)).toBe("ok");
        expect(destinoDeRespuesta(null, true)).toBe("respaldo");
        expect(destinoDeRespuesta(503, false)).toBe("respaldo");
        expect(destinoDeRespuesta(429, true)).toBe("cola");
        expect(destinoDeRespuesta(429, false)).toBe("rechazo");
        for (const e of [400, 401, 403, 404, 413, 415]) expect(destinoDeRespuesta(e, true)).toBe("rechazo");
    });

    it("la cola tiene tope y sale la más vieja", () => {
        const a = almacenMemoria();
        for (let i = 0; i < COLA_MAX + 5; i++) encolar(a, { metodo: "POST", ruta: "/v1/bus/eventos", cuerpo: { i }, t: i });
        const c = leerCola(a);
        expect(c).toHaveLength(COLA_MAX);
        expect((c[0].cuerpo as { i: number }).i).toBe(5);
    });

    it("vista de Genesis: sana, sin HTTPS, réplica esperando la migración, ahorro medido", () => {
        const base: DatosPuerta = {
            version: 1,
            comprobado: "2026-10-10T21:00:00Z",
            ok: true,
            salud: { ok: true, jwks: "ok", caddy: "ok", replica: { activa: true, sin_migracion: true, pendientes: { eventos: 3, neuronas: 0, presencia: 0 }, hoy: 0 } },
            https: { ok: true, ms: 258 },
            hoy: { dia: "2026-10-10", servidas: 120, a_supabase: 4, ahorradas: 116, grupos: { neuronas: { servidas: 80, a_supabase: 0 }, bus: { servidas: 40, a_supabase: 0 }, jwks: { servidas: 0, a_supabase: 4 } } },
        };
        expect(esDatosPuerta(base)).toBe(true);
        expect(esDatosPuerta({ ok: true })).toBe(false);
        const v = vistaPuerta(base, Date.parse("2026-10-10T21:05:00Z"));
        expect(v.estado).toEqual({ texto: "Sana · 258 ms", tono: "ok" });
        expect(v.ahorradasHoy).toBe(116);
        expect(v.detalleHoy).toContain("neuronas 80");
        expect(v.replica.texto).toContain("migración");
        expect(v.viejo).toBe(false);
        expect(vistaPuerta({ ...base, https: { ok: false } }, Date.now()).estado.texto).toBe("Sin HTTPS");
        // (PDA1012) La JWKS en reposo (> 30 min sin sesiones) no es una avería: se recarga con la primera.
        const reposo = vistaPuerta({ ...base, salud: { ...base.salud!, jwks: "sin-claves" } }, Date.now()).estado;
        expect(reposo).toEqual({ texto: "Sana · 258 ms · claves de sesión en reposo", tono: "ok" });
        expect(vistaPuerta({ ...base, salud: null, motivo: "el servicio no responde" }, Date.now()).estado.tono).toBe("peligro");
    });
});

describe("crearPuertaA1 (elección automática y respaldo)", () => {
    it("puerta sana: la usa, con la sesión, y cuenta una petición ahorrada", async () => {
        const { p, f } = montar((url) => (url.endsWith("/salud") ? json(200, { ok: true }) : json(200, { neuronas: [{ neurona: "mac-1", en_linea: true }] })));
        let respaldo = 0;
        const r = await p.neuronas(async () => {
            respaldo += 1;
            return { neuronas: [] };
        });
        expect(r.via).toBe("puerta");
        expect(r.datos?.neuronas[0].neurona).toBe("mac-1");
        expect(respaldo).toBe(0);
        const llamada = f.llamadas.find((l) => l.url.endsWith("/v1/neuronas"));
        expect((llamada?.init?.headers as Record<string, string>).authorization).toBe("Bearer jwt-de-la-cuenta");
        expect(llamada?.init?.credentials).toBe("omit");
        expect(p.contadores().porPuerta).toBe(1);
        // La salud se reutiliza: diez operaciones = una sola sonda.
        for (let i = 0; i < 10; i++) await p.neuronas();
        expect(f.llamadas.filter((l) => l.url.endsWith("/salud"))).toHaveLength(1);
    });

    it("puerta caída: va a Supabase por el respaldo y no insiste durante la espera", async () => {
        const { p, f, reloj } = montar(() => "red");
        const r = await p.neuronas(async () => ({ neuronas: [] }));
        expect(r.via).toBe("supabase");
        const n = f.llamadas.length;
        await p.neuronas(async () => ({ neuronas: [] }));
        expect(f.llamadas.length).toBe(n);
        expect(p.contadores().porSupabase).toBe(2);
        reloj.avanzar(61_000);
        await p.neuronas(async () => ({ neuronas: [] }));
        expect(f.llamadas.length).toBe(n + 1); // vuelve a probar
    });

    it("una operación que da 5xx se repite en Supabase y marca la puerta como caída", async () => {
        const { p } = montar((url) => (url.endsWith("/salud") ? json(200, { ok: true }) : json(503, { error: "sin claves" })));
        const r = await p.latirNeurona({ neurona: "mac-1" }, async () => "supabase-ok");
        expect(r).toMatchObject({ via: "supabase", datos: "supabase-ok" });
        expect((await p.salud()).ok).toBe(false);
    });

    it("un 403 de la puerta no se salta yendo a Supabase", async () => {
        const { p } = montar((url) => (url.endsWith("/salud") ? json(200, { ok: true }) : json(403, { error: "solo miembros de MetaGenesis" })));
        let respaldo = 0;
        const r = await p.arriendo(async () => {
            respaldo += 1;
            return null;
        });
        expect(r).toMatchObject({ via: "rechazo", estado: 403, error: "solo miembros de MetaGenesis" });
        expect(respaldo).toBe(0);
    });

    it("nunca se pierde una escritura: puerta y Supabase caídas → cola; al volver se vacía sola", async () => {
        let viva = false;
        const recibidas: unknown[] = [];
        const { p, almacen, reloj } = montar((url, init) => {
            if (!viva) return "red";
            if (url.endsWith("/salud")) return json(200, { ok: true });
            recibidas.push(JSON.parse(String(init?.body)));
            return json(200, { id: recibidas.length });
        });
        const roto = async () => {
            throw new Error("402 restringido");
        };
        expect((await p.publicarEvento({ quien: "genesis", tipo: "aviso", texto: "uno" }, roto)).via).toBe("cola");
        expect((await p.publicarEvento({ quien: "genesis", tipo: "aviso", texto: "dos" }, roto)).via).toBe("cola");
        expect(leerCola(almacen)).toHaveLength(2);
        viva = true;
        reloj.avanzar(61_000);
        const r = await p.publicarEvento({ quien: "genesis", tipo: "aviso", texto: "tres" });
        expect(r.via).toBe("puerta");
        await p.vaciarCola();
        expect(recibidas.map((e) => (e as { texto: string }).texto)).toEqual(["tres", "uno", "dos"]);
        expect(almacen.datos.has(CLAVE_COLA)).toBe(false);
    });

    it("apagada en esta neurona: todo a Supabase y ni una petición a la puerta", async () => {
        const { p, f } = montar(() => json(200, { ok: true }));
        p.fijarModo("apagada");
        const r = await p.freno(async () => ({ activo: false }));
        expect(r.via).toBe("supabase");
        expect(f.llamadas).toHaveLength(0);
        p.fijarModo("auto");
        expect((await p.freno(async () => null)).via).toBe("puerta");
    });

    it("sin URL publicada (o sin sesión) es exactamente como antes: Supabase", async () => {
        const { p, f } = montar(() => json(200, { ok: true }), { url: undefined, leerUrl: async () => null });
        expect(await p.configurada()).toBe(false);
        expect((await p.neuronas(async () => ({ neuronas: [] }))).via).toBe("supabase");
        expect(f.llamadas).toHaveLength(0);
        const sinSesion = montar((u) => (u.endsWith("/salud") ? json(200, { ok: true }) : json(200, {})), { sesion: async () => null });
        expect((await sinSesion.p.neuronas(async () => ({ neuronas: [] }))).via).toBe("supabase");
    });

    it("la URL publicada se lee una vez y se guarda 6 h en el aparato", async () => {
        let lecturas = 0;
        const { p, reloj } = montar((u) => (u.endsWith("/salud") ? json(200, { ok: true }) : json(200, {})), {
            url: undefined,
            leerUrl: async () => {
                lecturas += 1;
                return URL_PUERTA;
            },
        });
        await p.freno();
        await p.freno();
        expect(lecturas).toBe(1);
        reloj.avanzar(6 * 3_600_000 + 1);
        await p.freno();
        expect(lecturas).toBe(2);
    });

    it("una puerta que tarda más del límite cuenta como caída", async () => {
        const { p } = montar(
            (url, init) =>
                new Promise<Response>((resolver, rechazar) => {
                    if (url.endsWith("/salud")) return resolver(json(200, { ok: true }));
                    init?.signal?.addEventListener("abort", () => rechazar(new DOMException("abortado", "AbortError")));
                }),
            { timeoutMs: 50 },
        );
        const r = await p.neuronas(async () => ({ neuronas: [] }));
        expect(r.via).toBe("supabase");
    });

    it("(PDA1012) «no hay puerta» se vuelve a mirar a los 30 min, no a las 6 h", async () => {
        let lecturas = 0;
        let publicada: string | null = null;
        const { p, reloj } = montar((u) => (u.endsWith("/salud") ? json(200, { ok: true }) : json(200, {})), {
            url: undefined,
            leerUrl: async () => {
                lecturas += 1;
                return publicada;
            },
        });
        expect(await p.configurada()).toBe(false);
        publicada = URL_PUERTA; // Alex enciende `os_puerta_datos.activa`
        reloj.avanzar(10 * 60_000);
        expect(await p.configurada()).toBe(false);
        expect(lecturas).toBe(1);
        reloj.avanzar(21 * 60_000);
        expect(await p.configurada()).toBe(true);
        expect(lecturas).toBe(2);
    });

    it("(PDA1012) sin sesión o sin red no se guarda «no hay puerta»: al minuto se vuelve a mirar", async () => {
        let lecturas = 0;
        let respuesta: () => Promise<string | null | undefined> = async () => undefined; // pestaña sin sesión
        const { p, almacen, reloj } = montar((u) => (u.endsWith("/salud") ? json(200, { ok: true }) : json(200, {})), {
            url: undefined,
            leerUrl: async () => {
                lecturas += 1;
                return respuesta();
            },
        });
        expect(await p.configurada()).toBe(false);
        expect(almacen.datos.has(CLAVE_URL)).toBe(false);
        expect(await p.configurada()).toBe(false);
        expect(lecturas).toBe(1); // dentro del minuto no se vuelve a preguntar
        respuesta = async () => {
            throw new Error("sin red");
        };
        reloj.avanzar(61_000);
        expect(await p.configurada()).toBe(false);
        expect(lecturas).toBe(2);
        expect(almacen.datos.has(CLAVE_URL)).toBe(false);
        respuesta = async () => URL_PUERTA; // ya con sesión y red
        reloj.avanzar(61_000);
        expect(await p.configurada()).toBe(true);
        expect(lecturas).toBe(3);
    });

    it("(PDA1012) cuenta por grupo de ruta: neuronas, presencia y freno por la puerta o por Supabase", async () => {
        const { p, almacen, reloj } = montar((u) => (u.endsWith("/salud") ? json(200, { ok: true }) : json(200, { neuronas: [], presencia: [], freno: null })));
        await p.neuronas(async () => ({ neuronas: [] }));
        await p.freno(async () => ({}));
        await p.presencia(["00000000-0000-0000-0000-000000000001"], async () => []);
        p.fijarModo("apagada");
        await p.freno(async () => ({ activo: false }));
        const c = JSON.parse(almacen.datos.get(CLAVE_CONTADORES) ?? "{}");
        expect(c.porGrupo.neuronas).toEqual({ puerta: 1, supabase: 0 });
        expect(c.porGrupo.presencia).toEqual({ puerta: 1, supabase: 0 });
        expect(c.porGrupo.freno).toEqual({ puerta: 1, supabase: 1 });
        expect(grupoDeRuta("/v1/neuronas/latido")).toBe("neuronas");
        expect(grupoDeRuta("/salud")).toBe("otros");
        reloj.avanzar(24 * 3_600_000);
        expect(p.contadores().porGrupo).toEqual({});
    });
});

