/**
 * Prueba obligatoria del contrato (`architecture/colmena-relevo-contenedores.md` §5): Genesis en el A1
 * va detrás de Caddy y con sesión; desde fuera y sin sesión responde 401 o 403, NUNCA 200.
 *
 * Supabase va simulado y las peticiones llevan las cabeceras que de verdad pone Caddy con
 * `reverse_proxy 127.0.0.1:9002` + `header_up X-Real-IP {remote_host}`: el Host público se conserva,
 * y añade `X-Forwarded-For/-Proto/-Host`. Next solo ve conexiones desde el bucle local, por eso el
 * servicio lleva `STARSEED_PUBLICO=1` (2026-10-20 · COL1012Md-d1). Direcciones y nombres de ejemplo
 * (rangos de documentación), nunca los reales.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const llamadas = { getUserToken: 0, getUserCookie: 0, rpc: 0 };
let miembro = true;
let rpcCaido = false;
/** Cómo responde Supabase a un token: usuario válido, rechazo claro o fallo del medio. */
let respuestaToken: "valido" | "rechazo" | "medio" = "valido";
/** Usuario de la cookie de sesión (el navegador en genesis.<host>); null = sin cookie. */
let usuarioCookie: string | null = null;
/** Qué pasa cuando la cookie no da usuario: no hay sesión (se resuelve en local) o Supabase la rechaza (cuesta una petición). */
let cookieSinUsuario: "sin-sesion" | "rechazada" = "sin-sesion";

function rpcSimulado() {
    return async () => {
        llamadas.rpc += 1;
        return rpcCaido ? { data: null, error: new Error("rpc caído") } : { data: miembro, error: null };
    };
}

vi.mock("@supabase/supabase-js", () => ({
    createClient: () => ({
        auth: {
            getUser: async (token?: string) => {
                llamadas.getUserToken += 1;
                if (respuestaToken === "medio") {
                    return { data: { user: null }, error: Object.assign(new Error("sin red"), { name: "AuthRetryableFetchError", status: 0 }) };
                }
                if (respuestaToken === "rechazo") {
                    return { data: { user: null }, error: Object.assign(new Error("token rechazado"), { name: "AuthApiError", status: 401 }) };
                }
                return { data: { user: { id: `cuenta-${token?.length ?? 0}` } }, error: null };
            },
        },
        rpc: rpcSimulado(),
    }),
}));

vi.mock("@/utils/supabase/server", () => ({
    createClient: async () => ({
        auth: {
            getUser: async () => {
                llamadas.getUserCookie += 1;
                if (usuarioCookie) return { data: { user: { id: usuarioCookie } }, error: null };
                const error =
                    cookieSinUsuario === "rechazada"
                        ? Object.assign(new Error("sesión rechazada"), { name: "AuthApiError", status: 400 })
                        : Object.assign(new Error("Auth session missing!"), { name: "AuthSessionMissingError", status: 400 });
                return { data: { user: null }, error };
            },
        },
        rpc: rpcSimulado(),
    }),
}));

/** JWT de forma válida montado en tiempo de ejecución (sin firma real), con la caducidad indicada. */
function jwt(sufijo: string, expSegundos = Math.floor(Date.now() / 1000) + 3600): string {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    return [b64({ alg: "none" }), b64({ sub: sufijo, exp: expSegundos }), `firma${sufijo}`].join(".");
}

/** Una petición tal como la entrega Caddy a Next en el A1. */
function porCaddy(extra: Record<string, string> = {}) {
    return new Request("http://127.0.0.1:9002/api/mando/latido", {
        headers: {
            host: "genesis.nodo.example",
            "x-real-ip": "203.0.113.9",
            "x-forwarded-for": "203.0.113.9",
            "x-forwarded-host": "genesis.nodo.example",
            "x-forwarded-proto": "https",
            ...extra,
        },
    });
}

/** Cabecera `Cookie` con la cookie de sesión de Supabase tal como la pone el navegador (`sb-<proyecto>-auth-token`). */
function cookieSesion(valor: string): string {
    return `sb-proyecto-auth-token=${valor}`;
}

/** Una petición de un proceso del propio A1 al puerto de Genesis (sin pasar por Caddy): un SSRF, por ejemplo. */
function desdeElPropioA1(extra: Record<string, string> = {}) {
    return new Request("http://127.0.0.1:9002/api/mando/latido", { headers: { host: "127.0.0.1:9002", ...extra } });
}

describe("Genesis en el A1 tras Caddy: sesión obligatoria", () => {
    beforeEach(() => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("STARSEED_MANDO", "1");
        vi.stubEnv("STARSEED_PUBLICO", "1");
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.example");
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-de-prueba");
        llamadas.getUserToken = 0;
        llamadas.getUserCookie = 0;
        llamadas.rpc = 0;
        miembro = true;
        rpcCaido = false;
        respuestaToken = "valido";
        usuarioCookie = null;
        cookieSinUsuario = "sin-sesion";
        vi.resetModules();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
    });

    describe("sin sesión", () => {
        it("desde fuera, sin cookie ni token → 401 (nunca 200)", async () => {
            const { guardianMando } = await import("../guardian");
            const r = await guardianMando(porCaddy());
            expect(r?.status).toBe(401);
            expect(llamadas.rpc).toBe(0);
        });

        it("una petición del propio A1 a 127.0.0.1 tampoco pasa: publicado, nada es local", async () => {
            const { guardianMando } = await import("../guardian");
            expect((await guardianMando(desdeElPropioA1()))?.status).toBe(401);
        });

        it("ni con Host localhost ni con la variable del modo local: el servicio publicado no se fía del bucle", async () => {
            vi.stubEnv("STARSEED_LOCAL", "1");
            const { guardianMando } = await import("../guardian");
            expect((await guardianMando(desdeElPropioA1({ host: "localhost:9002" })))?.status).toBe(401);
        });

        it("control: el mismo bucle local SIN publicar (la Mac) sigue pasando sin sesión", async () => {
            vi.stubEnv("STARSEED_PUBLICO", "");
            const { guardianMando } = await import("../guardian");
            expect(await guardianMando(desdeElPropioA1({ host: "localhost:9002" }))).toBeNull();
        });

        it("sin la consola encendida (sin STARSEED_MANDO) responde 404 y no pregunta a nadie", async () => {
            vi.stubEnv("STARSEED_MANDO", "");
            const { guardianMando } = await import("../guardian");
            expect((await guardianMando(porCaddy()))?.status).toBe(404);
            expect(llamadas).toEqual({ getUserToken: 0, getUserCookie: 0, rpc: 0 });
        });
    });

    describe("con la cookie de sesión del navegador", () => {
        it("miembro de MetaGenesis → pasa", async () => {
            usuarioCookie = "cuenta-miembro";
            const { guardianMando } = await import("../guardian");
            expect(await guardianMando(porCaddy({ cookie: "sb-sesion=valor" }))).toBeNull();
        });

        it("cuenta sin pertenencia → 403", async () => {
            usuarioCookie = "cuenta-ajena";
            miembro = false;
            const { guardianMando } = await import("../guardian");
            expect((await guardianMando(porCaddy({ cookie: "sb-sesion=valor" })))?.status).toBe(403);
        });

        it("si no se puede comprobar la pertenencia → 503, nunca se deja pasar", async () => {
            usuarioCookie = "cuenta-miembro";
            rpcCaido = true;
            const { guardianMando } = await import("../guardian");
            expect((await guardianMando(porCaddy({ cookie: "sb-sesion=valor" })))?.status).toBe(503);
        });
    });

    describe("con Authorization: Bearer (MetaGenesis desde otra neurona)", () => {
        it("miembro → pasa; no miembro → 403", async () => {
            const { guardianMando } = await import("../guardian");
            expect(await guardianMando(porCaddy({ authorization: `Bearer ${jwt("miembro")}` }))).toBeNull();
            miembro = false;
            expect((await guardianMando(porCaddy({ authorization: `Bearer ${jwt("ajeno")}` })))?.status).toBe(403);
        });

        it("token malformado → 401 sin llamar a Supabase", async () => {
            const { guardianMando } = await import("../guardian");
            for (const roto of ["x".repeat(40), "abcdefghij.klmnopqrst", "aaaaaaaaaa.bbbbbbbbbb.", `${jwt("a")}.sobra`]) {
                const r = await guardianMando(porCaddy({ authorization: `Bearer ${roto}` }));
                expect(r?.status, roto).toBe(401);
            }
            expect(llamadas).toEqual({ getUserToken: 0, getUserCookie: 0, rpc: 0 });
        });

        it("token caducado → 401 sin llamar a Supabase", async () => {
            const { guardianMando } = await import("../guardian");
            const r = await guardianMando(porCaddy({ authorization: `Bearer ${jwt("viejo", Math.floor(Date.now() / 1000) - 60)}` }));
            expect(r?.status).toBe(401);
            expect(await r?.json()).toEqual({ error: "Tu sesión ha caducado. Vuelve a iniciar sesión." });
            expect(llamadas).toEqual({ getUserToken: 0, getUserCookie: 0, rpc: 0 });
        });

        it("token que Supabase rechaza: 401, y en los 10 s siguientes no se vuelve a preguntar", async () => {
            vi.useFakeTimers({ toFake: ["Date"] });
            vi.setSystemTime(new Date("2026-10-20T10:00:00Z"));
            respuestaToken = "rechazo";
            const { guardianMando } = await import("../guardian");
            const token = jwt("falso", Math.floor(Date.now() / 1000) + 3600);
            for (let i = 0; i < 5; i += 1) {
                expect((await guardianMando(porCaddy({ authorization: `Bearer ${token}` })))?.status).toBe(401);
            }
            expect(llamadas.getUserToken).toBe(1);
            // Pasados los 10 s se vuelve a comprobar (la cuenta pudo arreglarse): una llamada más.
            vi.setSystemTime(new Date("2026-10-20T10:00:11Z"));
            expect((await guardianMando(porCaddy({ authorization: `Bearer ${token}` })))?.status).toBe(401);
            expect(llamadas.getUserToken).toBe(2);
        });

        it("un fallo del medio (sin red) no se recuerda: el siguiente intento vuelve a preguntar y entra", async () => {
            respuestaToken = "medio";
            const { guardianMando } = await import("../guardian");
            const token = jwt("bueno");
            expect((await guardianMando(porCaddy({ authorization: `Bearer ${token}` })))?.status).toBe(401);
            respuestaToken = "valido";
            expect(await guardianMando(porCaddy({ authorization: `Bearer ${token}` }))).toBeNull();
            expect(llamadas.getUserToken).toBe(2);
        });
    });

    describe("freno por IP: cuota de Supabase (capa 2)", () => {
        const IP_ATACANTE = { "x-real-ip": "198.51.100.7", "x-forwarded-for": "198.51.100.7" };

        /** Un JWT falso pero bien formado y con exp futuro, distinto cada vez: lo que no atrapa la capa 1. */
        const falso = (i: number) => jwt(`falso-${i}`);

        it("tras FALLOS_POR_IP rechazos de Supabase, esa IP recibe 429 con Retry-After y ya no cuesta peticiones", async () => {
            vi.useFakeTimers({ toFake: ["Date"] });
            vi.setSystemTime(new Date("2026-10-20T10:00:00Z"));
            respuestaToken = "rechazo";
            const { guardianMando, FALLOS_POR_IP } = await import("../guardian");
            for (let i = 0; i < FALLOS_POR_IP; i += 1) {
                expect((await guardianMando(porCaddy({ ...IP_ATACANTE, authorization: `Bearer ${falso(i)}` })))?.status).toBe(401);
            }
            expect(llamadas.getUserToken).toBe(FALLOS_POR_IP);
            const r = await guardianMando(porCaddy({ ...IP_ATACANTE, authorization: `Bearer ${falso(999)}` }));
            expect(r?.status).toBe(429);
            expect(Number(r?.headers.get("retry-after"))).toBeGreaterThan(0);
            for (let i = 0; i < 10; i += 1) {
                expect((await guardianMando(porCaddy({ ...IP_ATACANTE, authorization: `Bearer ${falso(1000 + i)}` })))?.status).toBe(429);
            }
            expect(llamadas.getUserToken).toBe(FALLOS_POR_IP);
        });

        it("otra IP no paga por la del atacante, y pasada la ventana la frenada vuelve a preguntar", async () => {
            vi.useFakeTimers({ toFake: ["Date"] });
            vi.setSystemTime(new Date("2026-10-20T10:00:00Z"));
            respuestaToken = "rechazo";
            const { guardianMando, FALLOS_POR_IP, VENTANA_FALLOS_MS } = await import("../guardian");
            for (let i = 0; i <= FALLOS_POR_IP; i += 1) await guardianMando(porCaddy({ ...IP_ATACANTE, authorization: `Bearer ${falso(i)}` }));
            expect((await guardianMando(porCaddy({ ...IP_ATACANTE, authorization: `Bearer ${falso(500)}` })))?.status).toBe(429);
            const antes = llamadas.getUserToken;
            // Un miembro legítimo desde otra IP: Supabase le contesta (aquí, rechazo simulado → 401, nunca 429).
            const otra = { "x-real-ip": "192.0.2.50", "x-forwarded-for": "192.0.2.50" };
            expect((await guardianMando(porCaddy({ ...otra, authorization: `Bearer ${falso(600)}` })))?.status).toBe(401);
            expect(llamadas.getUserToken).toBe(antes + 1);
            // Pasada la ventana, la IP frenada vuelve a poder preguntar.
            vi.setSystemTime(new Date(Date.now() + VENTANA_FALLOS_MS + 1_000));
            expect((await guardianMando(porCaddy({ ...IP_ATACANTE, authorization: `Bearer ${falso(700)}` })))?.status).toBe(401);
            expect(llamadas.getUserToken).toBe(antes + 2);
        });

        it("lo ya verificado sigue pasando aunque la IP esté frenada: no cuesta nada", async () => {
            vi.useFakeTimers({ toFake: ["Date"] });
            vi.setSystemTime(new Date("2026-10-20T10:00:00Z"));
            const { guardianMando, FALLOS_POR_IP } = await import("../guardian");
            const bueno = jwt("miembro-bueno");
            expect(await guardianMando(porCaddy({ ...IP_ATACANTE, authorization: `Bearer ${bueno}` }))).toBeNull();
            respuestaToken = "rechazo";
            for (let i = 0; i <= FALLOS_POR_IP; i += 1) await guardianMando(porCaddy({ ...IP_ATACANTE, authorization: `Bearer ${falso(i)}` }));
            expect((await guardianMando(porCaddy({ ...IP_ATACANTE, authorization: `Bearer ${falso(900)}` })))?.status).toBe(429);
            const llamadasAntes = { ...llamadas };
            expect(await guardianMando(porCaddy({ ...IP_ATACANTE, authorization: `Bearer ${bueno}` }))).toBeNull();
            expect(llamadas).toEqual(llamadasAntes);
        });

        it("también cuenta la vía de la cookie: una sesión que Supabase rechaza una y otra vez", async () => {
            cookieSinUsuario = "rechazada";
            const { guardianMando, FALLOS_POR_IP } = await import("../guardian");
            for (let i = 0; i < FALLOS_POR_IP; i += 1) {
                expect((await guardianMando(porCaddy({ ...IP_ATACANTE, cookie: `sb-sesion=valor${i}` })))?.status).toBe(401);
            }
            expect(llamadas.getUserCookie).toBe(FALLOS_POR_IP);
            expect((await guardianMando(porCaddy({ ...IP_ATACANTE, cookie: "sb-sesion=otro" })))?.status).toBe(429);
            expect(llamadas.getUserCookie).toBe(FALLOS_POR_IP);
        });

        it("un miembro con cookie de sesión desde una IP frenada sigue entrando; otra sesión por cookie de esa IP, no", async () => {
            usuarioCookie = "cuenta-miembro";
            const { guardianMando, FALLOS_POR_IP } = await import("../guardian");
            // El miembro entra una vez (cuesta getUser + rpc) y queda recordado por la huella de su cookie.
            expect(await guardianMando(porCaddy({ ...IP_ATACANTE, cookie: cookieSesion("sesion-del-miembro") }))).toBeNull();
            // Un atacante tras la misma IP (CGNAT, oficina) agota el presupuesto de rechazos.
            usuarioCookie = null;
            cookieSinUsuario = "rechazada";
            for (let i = 0; i < FALLOS_POR_IP; i += 1) {
                expect((await guardianMando(porCaddy({ ...IP_ATACANTE, cookie: cookieSesion(`falsa-${i}`) })))?.status).toBe(401);
            }
            expect((await guardianMando(porCaddy({ ...IP_ATACANTE, cookie: cookieSesion("falsa-nueva") })))?.status).toBe(429);
            // El miembro, con su misma cookie ya verificada, sigue pasando y no cuesta ni una petición.
            const antes = { ...llamadas };
            expect(await guardianMando(porCaddy({ ...IP_ATACANTE, cookie: cookieSesion("sesion-del-miembro") }))).toBeNull();
            expect(llamadas).toEqual(antes);
        });

        it("no cuesta peticiones repetidas: la cookie ya verificada se recuerda 60 s y también el «no eres miembro»", async () => {
            vi.useFakeTimers({ toFake: ["Date"] });
            vi.setSystemTime(new Date("2026-10-20T10:00:00Z"));
            const { guardianMando } = await import("../guardian");
            usuarioCookie = "cuenta-miembro";
            for (let i = 0; i < 6; i += 1) expect(await guardianMando(porCaddy({ cookie: cookieSesion("miembro") }))).toBeNull();
            expect(llamadas).toEqual({ getUserToken: 0, getUserCookie: 1, rpc: 1 });
            miembro = false;
            for (let i = 0; i < 6; i += 1) expect((await guardianMando(porCaddy({ cookie: cookieSesion("ajena") })))?.status).toBe(403);
            expect(llamadas).toEqual({ getUserToken: 0, getUserCookie: 2, rpc: 2 });
            // Pasados los 60 s se vuelve a comprobar (la membresía pudo cambiar o la sesión revocarse).
            miembro = true;
            vi.setSystemTime(new Date("2026-10-20T10:01:01Z"));
            expect(await guardianMando(porCaddy({ cookie: cookieSesion("miembro") }))).toBeNull();
            expect(llamadas).toEqual({ getUserToken: 0, getUserCookie: 3, rpc: 3 });
        });

        it("la huella es la de la cookie de sesión: otras cookies no la tiran, un trozo distinto sí; y una sesión rechazada no se recuerda", async () => {
            usuarioCookie = "cuenta-miembro";
            const { guardianMando } = await import("../guardian");
            const trozos = (b: string) => `sb-proyecto-auth-token.0=aaa; otra=1; sb-proyecto-auth-token.1=${b}`;
            expect(await guardianMando(porCaddy({ cookie: trozos("bbb") }))).toBeNull();
            expect(await guardianMando(porCaddy({ cookie: `analitica=${Date.now()}; ${trozos("bbb")}` }))).toBeNull();
            expect(llamadas.getUserCookie).toBe(1);
            expect(await guardianMando(porCaddy({ cookie: trozos("ccc") }))).toBeNull();
            expect(llamadas.getUserCookie).toBe(2);
            // Una sesión que Supabase rechaza cuesta una petición cada vez (nunca se da por buena de memoria).
            usuarioCookie = null;
            cookieSinUsuario = "rechazada";
            for (let i = 0; i < 3; i += 1) expect((await guardianMando(porCaddy({ cookie: cookieSesion("rota") })))?.status).toBe(401);
            expect(llamadas.getUserCookie).toBe(5);
        });

        it("no cuentan los visitantes sin sesión (no cuestan nada) ni los fallos del medio (no son del cliente)", async () => {
            const { guardianMando, FALLOS_POR_IP } = await import("../guardian");
            for (let i = 0; i < FALLOS_POR_IP * 2; i += 1) {
                expect((await guardianMando(porCaddy(IP_ATACANTE)))?.status).toBe(401);
            }
            respuestaToken = "medio";
            for (let i = 0; i < FALLOS_POR_IP * 2; i += 1) {
                expect((await guardianMando(porCaddy({ ...IP_ATACANTE, authorization: `Bearer ${falso(i)}` })))?.status).toBe(401);
            }
        });

        it("los tokens basura de la capa 1 no gastan el presupuesto del freno", async () => {
            const { guardianMando, FALLOS_POR_IP } = await import("../guardian");
            for (let i = 0; i < FALLOS_POR_IP * 2; i += 1) {
                expect((await guardianMando(porCaddy({ ...IP_ATACANTE, authorization: `Bearer ${"x".repeat(30 + i)}` })))?.status).toBe(401);
            }
            respuestaToken = "rechazo";
            expect((await guardianMando(porCaddy({ ...IP_ATACANTE, authorization: `Bearer ${falso(1)}` })))?.status).toBe(401);
            expect(llamadas.getUserToken).toBe(1);
        });

        it("sin ninguna cabecera de IP no se frena (la sesión sigue siendo obligatoria igual)", async () => {
            respuestaToken = "rechazo";
            const { guardianMando, FALLOS_POR_IP } = await import("../guardian");
            for (let i = 0; i < FALLOS_POR_IP + 5; i += 1) {
                expect((await guardianMando(desdeElPropioA1({ authorization: `Bearer ${falso(i)}` })))?.status).toBe(401);
            }
            expect(llamadas.getUserToken).toBe(FALLOS_POR_IP + 5);
        });
    });
});

describe("esFalloTransitorio", () => {
    it("distingue lo del medio de un rechazo del token", async () => {
        const { esFalloTransitorio } = await import("../guardian");
        expect(esFalloTransitorio(Object.assign(new Error("x"), { name: "AuthRetryableFetchError" }))).toBe(true);
        expect(esFalloTransitorio({ status: 0 })).toBe(true);
        expect(esFalloTransitorio({ status: 429 })).toBe(true);
        expect(esFalloTransitorio({ status: 503 })).toBe(true);
        expect(esFalloTransitorio({ status: 401 })).toBe(false);
        expect(esFalloTransitorio({ status: 403 })).toBe(false);
        expect(esFalloTransitorio(new Error("sin sesión"))).toBe(false);
        expect(esFalloTransitorio(null)).toBe(false);
        expect(esFalloTransitorio("texto")).toBe(false);
    });
});

describe("modo ligero de una neurona (sin publicar): lo que cambió en /api/voz/motores", () => {
    beforeEach(() => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("STARSEED_LOCAL", "1");
        vi.stubEnv("STARSEED_MANDO", "");
        vi.stubEnv("STARSEED_PUBLICO", "");
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.example");
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-de-prueba");
        llamadas.getUserToken = 0;
        llamadas.getUserCookie = 0;
        llamadas.rpc = 0;
        usuarioCookie = null;
        cookieSinUsuario = "sin-sesion";
        vi.resetModules();
    });
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("con STARSEED_LOCAL=1 y sin STARSEED_MANDO, la propia máquina pasa sin sesión (antes esa ruta daba 404)", async () => {
        const { guardianMando } = await import("../guardian");
        expect(await guardianMando(desdeElPropioA1({ host: "localhost:9002" }))).toBeNull();
    });

    it("desde otro aparato de la red local, aunque la neurona esté en modo ligero, hace falta sesión", async () => {
        const { guardianMando } = await import("../guardian");
        const r = await guardianMando(new Request("http://192.0.2.20:9002/api/voz/motores", { headers: { host: "192.0.2.20:9002" } }));
        expect(r?.status).toBe(401);
    });
});
