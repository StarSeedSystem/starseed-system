/**
 * sesiones-vivas — tokens y enlaces, mapeo de filas, y el camino «la migración no está
 * aplicada» (Supabase simulado): mensaje en español, sin lanzar y sin reintentos en bucle.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type Resp = { data: unknown; error: unknown };
interface Llamada {
    op: string;
    tabla?: string;
    args: unknown[];
}

const falso = {
    uid: "11111111-1111-4111-8111-111111111111" as string | null,
    respuestas: [] as Resp[],
    llamadas: [] as Llamada[],
};

const LANZAR = { data: "__lanzar__", error: null } as Resp;

function siguiente(porDefecto: Resp): Promise<Resp> {
    const r = falso.respuestas.length > 0 ? (falso.respuestas.shift() as Resp) : porDefecto;
    if (r === LANZAR) return Promise.reject(new Error("red caída"));
    return Promise.resolve(r);
}

function constructor(tabla: string) {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "insert", "update", "eq", "neq", "order", "limit"]) {
        b[m] = (...args: unknown[]) => {
            falso.llamadas.push({ op: m, tabla, args });
            return b;
        };
    }
    b.single = () => siguiente({ data: null, error: null });
    b.maybeSingle = () => siguiente({ data: null, error: null });
    b.then = (ok: (v: Resp) => unknown, ko?: (e: unknown) => unknown) =>
        siguiente({ data: [], error: null }).then(ok, ko);
    return b;
}

vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        from: (tabla: string) => {
            falso.llamadas.push({ op: "from", tabla, args: [tabla] });
            return constructor(tabla);
        },
        rpc: (fn: string, args: unknown) => {
            falso.llamadas.push({ op: "rpc", args: [fn, args] });
            return siguiente({ data: [], error: null });
        },
        auth: {
            getSession: async () => ({ data: { session: falso.uid ? { user: { id: falso.uid } } : null } }),
        },
        channel: () => ({ on: () => ({}), subscribe: () => ({}), presenceState: () => ({}) }),
        removeChannel: () => {},
    }),
}));

import {
    MENSAJE_SIN_DESPLEGAR,
    bytesABase64Url,
    construirUrlPublica,
    contarPresentes,
    crearEnlacePublico,
    crearSesion,
    enlacePrivado,
    esFaltaDeEsquema,
    esRutaInterna,
    filaASesion,
    generarTokenPublico,
    invitar,
    obtenerSesion,
    reiniciarEstadoSesionesParaTests,
    revocarEnlacePublico,
    rutaConSesion,
    sesionVigente,
    terminarSesion,
    tipoVivoDe,
} from "@/lib/mensajeria/sesiones-vivas";

const YO = "11111111-1111-4111-8111-111111111111";
const OTRA = "22222222-2222-4222-8222-222222222222";
const TERCERA = "33333333-3333-4333-8333-333333333333";
const SID = "44444444-4444-4444-8444-444444444444";

function fila(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: SID,
        tipo: "vivo:pizarra",
        hilo_id: "55555555-5555-4555-8555-555555555555",
        creador: YO,
        titulo: "Plan del huerto",
        ref_id: "66666666-6666-4666-8666-666666666666",
        ruta: "/pizarra?board-space=66666666-6666-4666-8666-666666666666&engine=starseed",
        modo: "chat",
        permiso: "editar",
        invitados: [],
        token_publico: null,
        estado: "activa",
        creada: "2026-09-28T10:00:00.000Z",
        caduca: null,
        ...extra,
    };
}

beforeEach(() => {
    reiniciarEstadoSesionesParaTests();
    falso.uid = YO;
    falso.respuestas = [];
    falso.llamadas = [];
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("token del enlace público", () => {
    test("32 bytes aleatorios en base64url: 43 caracteres del alfabeto seguro, sin relleno", () => {
        const t = generarTokenPublico();
        expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(generarTokenPublico()).not.toBe(t);
    });

    test("usa crypto.getRandomValues con 32 bytes", () => {
        const espia = vi.spyOn(globalThis.crypto, "getRandomValues");
        generarTokenPublico();
        expect(espia).toHaveBeenCalledTimes(1);
        expect((espia.mock.calls[0][0] as Uint8Array).length).toBe(32);
    });

    test("base64url cambia + y / por - y _ y quita el =", () => {
        expect(bytesABase64Url(new Uint8Array([0xfb, 0xff]))).toBe("-_8");
        expect(bytesABase64Url(new Uint8Array([0xff, 0xfe, 0xfd]))).toBe("__79");
    });
});

describe("enlaces", () => {
    test("privado: /vivo/<id> para apps y /llamada/<id> para llamadas", () => {
        expect(enlacePrivado({ id: SID, tipo: "vivo:pizarra" })).toBe(`/vivo/${SID}`);
        expect(enlacePrivado({ id: SID, tipo: "llamada:video" })).toBe(`/llamada/${SID}`);
    });

    test("público: origen + ruta + ?t=token (sin barra doble)", () => {
        expect(construirUrlPublica("https://starseed-os.vercel.app/", { id: SID, tipo: "vivo:sala" }, "abc_-1"))
            .toBe(`https://starseed-os.vercel.app/vivo/${SID}?t=abc_-1`);
        expect(construirUrlPublica("https://x.org", { id: SID, tipo: "llamada:audio" }, "tok"))
            .toBe(`https://x.org/llamada/${SID}?t=tok`);
    });

    test("rutaConSesion respeta la query y el ancla que ya tenga la ruta", () => {
        expect(rutaConSesion("/escritorios", SID)).toBe(`/escritorios?sesion=${SID}`);
        expect(rutaConSesion("/pizarra?board-space=x", SID)).toBe(`/pizarra?board-space=x&sesion=${SID}`);
        expect(rutaConSesion("/a?b=1#c", SID)).toBe(`/a?b=1&sesion=${SID}#c`);
    });

    test("una ruta interna no puede salir del OS («//otro.sitio» es una URL externa)", () => {
        expect(esRutaInterna("/pizarra?board-space=x")).toBe(true);
        expect(esRutaInterna("/")).toBe(true);
        expect(esRutaInterna("//evil.example/x")).toBe(false);
        expect(esRutaInterna("/\\evil.example")).toBe(false);
        expect(esRutaInterna("https://evil.example")).toBe(false);
        expect(esRutaInterna("pizarra")).toBe(false);
        expect(esRutaInterna("/a\nb")).toBe(false);
        expect(filaASesion(fila({ ruta: "//evil.example" }), YO).ruta).toBeNull();
    });

    test("tipoVivoDe acepta «vivo:x» y «x», y rechaza llamadas y tipos inventados", () => {
        expect(tipoVivoDe("vivo:pizarra")).toBe("pizarra");
        expect(tipoVivoDe("escritorio")).toBe("escritorio");
        expect(tipoVivoDe("llamada:audio")).toBeNull();
        expect(tipoVivoDe("vivo:hackeo")).toBeNull();
    });
});

describe("filaASesion", () => {
    test("pasa de snake_case a camelCase", () => {
        const s = filaASesion(fila(), YO);
        expect(s).toMatchObject({
            id: SID,
            tipo: "vivo:pizarra",
            hiloId: "55555555-5555-4555-8555-555555555555",
            creador: YO,
            titulo: "Plan del huerto",
            refId: "66666666-6666-4666-8666-666666666666",
            modo: "chat",
            permiso: "editar",
            invitados: [],
            estado: "activa",
            creada: "2026-09-28T10:00:00.000Z",
            caduca: null,
        });
        expect(s.ruta?.startsWith("/pizarra")).toBe(true);
    });

    test("el token solo lo ve quien creó la sesión", () => {
        expect(filaASesion(fila({ token_publico: "secreto" }), YO).tokenPublico).toBe("secreto");
        expect(filaASesion(fila({ token_publico: "secreto" }), OTRA).tokenPublico).toBeNull();
        expect(filaASesion(fila({ token_publico: "secreto" }), null).tokenPublico).toBeNull();
    });

    test("valores raros caen a valores seguros", () => {
        const s = filaASesion(
            fila({ modo: "todos", permiso: "admin", invitados: [OTRA, "no-uuid", OTRA], ruta: "https://evil.example", estado: "rara", titulo: "" }),
            YO,
        );
        expect(s.modo).toBe("chat");
        expect(s.permiso).toBe("editar");
        expect(s.invitados).toEqual([OTRA]);
        expect(s.ruta).toBeNull();
        expect(s.estado).toBe("activa");
        expect(s.titulo).toBeNull();
    });

    test("sesionVigente: terminada o caducada no deja entrar", () => {
        const ahora = new Date("2026-09-28T12:00:00Z");
        expect(sesionVigente({ estado: "activa", caduca: null }, ahora)).toBe(true);
        expect(sesionVigente({ estado: "terminada", caduca: null }, ahora)).toBe(false);
        expect(sesionVigente({ estado: "activa", caduca: "2026-09-28T11:00:00Z" }, ahora)).toBe(false);
        expect(sesionVigente({ estado: "activa", caduca: "2026-09-28T13:00:00Z" }, ahora)).toBe(true);
    });
});

describe("servidor sin la migración", () => {
    test("reconoce tabla, función y columna ausentes", () => {
        expect(esFaltaDeEsquema({ code: "PGRST205", message: "Could not find the table" })).toBe(true);
        expect(esFaltaDeEsquema({ code: "42P01" })).toBe(true);
        expect(esFaltaDeEsquema({ code: "PGRST202", message: "Could not find the function public.unirse_sesion_publica" })).toBe(true);
        expect(esFaltaDeEsquema({ code: "42501", message: "permission denied" })).toBe(false);
        expect(esFaltaDeEsquema(null)).toBe(false);
    });

    test("crearSesion devuelve el aviso en español y no vuelve a llamar a la red", async () => {
        falso.respuestas.push({
            data: null,
            error: { code: "PGRST205", message: "Could not find the table 'public.os_sesiones_vivas' in the schema cache" },
        });
        const r = await crearSesion({ tipo: "vivo:pizarra", hiloId: null, titulo: "x", ruta: "/pizarra" });
        expect(r.sesion).toBeNull();
        expect(r.error).toBe(MENSAJE_SIN_DESPLEGAR);

        const antes = falso.llamadas.length;
        const r2 = await obtenerSesion(SID);
        expect(r2.error).toBe(MENSAJE_SIN_DESPLEGAR);
        expect(await invitar(SID, [OTRA])).toBe(MENSAJE_SIN_DESPLEGAR);
        expect((await crearEnlacePublico(SID)).error).toBe(MENSAJE_SIN_DESPLEGAR);
        expect(await terminarSesion(SID)).toBe(MENSAJE_SIN_DESPLEGAR);
        expect(falso.llamadas.length).toBe(antes);
    });

    test("la RPC ausente también da el aviso (enlace público)", async () => {
        falso.uid = null;
        falso.respuestas.push({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
        const r = await obtenerSesion(SID, "token");
        expect(r).toEqual({ sesion: null, error: MENSAJE_SIN_DESPLEGAR });
    });

    test("nunca lanza aunque el cliente explote", async () => {
        falso.respuestas.push(LANZAR);
        await expect(obtenerSesion(SID)).resolves.toMatchObject({ sesion: null });
    });
});

describe("API contra os_sesiones_vivas", () => {
    test("sin cuenta no se crea nada", async () => {
        falso.uid = null;
        const r = await crearSesion({ tipo: "vivo:pizarra" });
        expect(r.sesion).toBeNull();
        expect(r.error).toMatch(/Inicia sesión/);
        expect(falso.llamadas.find((l) => l.op === "insert")).toBeUndefined();
    });

    test("crearSesion inserta con creador = uid actual, sin token si no es pública", async () => {
        falso.respuestas.push({ data: fila({ modo: "invitados", invitados: [OTRA] }), error: null });
        const r = await crearSesion({
            tipo: "vivo:pizarra",
            hiloId: "55555555-5555-4555-8555-555555555555",
            titulo: "Plan del huerto",
            refId: "ref",
            ruta: "/pizarra?board-space=ref",
            invitados: [OTRA, YO, "basura"],
        });
        expect(r.error).toBeNull();
        expect(r.sesion?.invitados).toEqual([OTRA]);
        const insert = falso.llamadas.find((l) => l.op === "insert");
        expect(insert?.tabla).toBe("os_sesiones_vivas");
        const fila0 = insert?.args[0] as Record<string, unknown>;
        expect(fila0.creador).toBe(YO);
        expect(fila0.modo).toBe("invitados");
        expect(fila0.invitados).toEqual([OTRA]);
        expect(fila0.token_publico).toBeNull();
        expect(fila0.permiso).toBe("editar");
    });

    test("una sesión que nace pública lleva ya su token", async () => {
        falso.respuestas.push({ data: fila({ modo: "publico" }), error: null });
        await crearSesion({ tipo: "vivo:sala", acceso: { modo: "publico", permiso: "ver" } });
        const fila0 = falso.llamadas.find((l) => l.op === "insert")?.args[0] as Record<string, unknown>;
        expect(fila0.modo).toBe("publico");
        expect(fila0.permiso).toBe("ver");
        expect(String(fila0.token_publico)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    test("obtenerSesion con token usa la RPC unirse_sesion_publica", async () => {
        falso.uid = null;
        const { token_publico: _t, invitados: _i, ...deLaRpc } = fila({ modo: "publico" });
        falso.respuestas.push({ data: [deLaRpc], error: null });
        const r = await obtenerSesion(SID, "tok");
        const rpc = falso.llamadas.find((l) => l.op === "rpc");
        expect(rpc?.args).toEqual(["unirse_sesion_publica", { _id: SID, _token: "tok" }]);
        expect(r.sesion?.id).toBe(SID);
        expect(r.sesion?.tokenPublico).toBeNull();
        expect(r.sesion?.invitados).toEqual([]);
    });

    test("un enlace público que ya no vale: sin sesión y sin error", async () => {
        falso.respuestas.push({ data: [], error: null });
        expect(await obtenerSesion(SID, "viejo")).toEqual({ sesion: null, error: null });
    });

    test("un id que no es uuid ni llega a la red", async () => {
        const r = await obtenerSesion("../../etc");
        expect(r.sesion).toBeNull();
        expect(r.error).toMatch(/no es válido/);
        expect(falso.llamadas.length).toBe(0);
    });

    test("invitar suma sin repetir y pasa de «chat» a «invitados»", async () => {
        falso.respuestas.push({ data: { id: SID, tipo: "vivo:pizarra", modo: "chat", invitados: [OTRA], creador: YO }, error: null });
        falso.respuestas.push({ data: { id: SID }, error: null });
        expect(await invitar(SID, [OTRA, TERCERA, YO])).toBeNull();
        const update = falso.llamadas.find((l) => l.op === "update");
        expect(update?.args[0]).toEqual({ invitados: [OTRA, TERCERA], modo: "invitados" });
    });

    test("invitar en una sesión ajena no finge éxito (la RLS no actualiza ninguna fila)", async () => {
        falso.respuestas.push({ data: { id: SID, tipo: "vivo:pizarra", modo: "chat", invitados: [], creador: OTRA }, error: null });
        falso.respuestas.push({ data: null, error: null });
        expect(await invitar(SID, [TERCERA])).toMatch(/Solo quien abrió/);
    });

    test("crearEnlacePublico guarda token + modo público + permiso y devuelve la URL", async () => {
        falso.respuestas.push({ data: { id: SID, tipo: "vivo:pizarra" }, error: null });
        const r = await crearEnlacePublico(SID, "ver");
        expect(r.error).toBeNull();
        const cambios = falso.llamadas.find((l) => l.op === "update")?.args[0] as Record<string, unknown>;
        expect(cambios.modo).toBe("publico");
        expect(cambios.permiso).toBe("ver");
        expect(r.url).toMatch(new RegExp(`/vivo/${SID}\\?t=${String(cambios.token_publico)}$`));
    });

    test("crearEnlacePublico sin fila devuelta = no eres quien la creó", async () => {
        falso.respuestas.push({ data: null, error: null });
        const r = await crearEnlacePublico(SID);
        expect(r.url).toBeNull();
        expect(r.error).toMatch(/Solo quien abrió/);
    });

    test("revocar vuelve a «chat», o a «invitados» si hay invitados", async () => {
        falso.respuestas.push({ data: { id: SID, modo: "publico", invitados: [], creador: YO }, error: null });
        falso.respuestas.push({ data: { id: SID }, error: null });
        expect(await revocarEnlacePublico(SID)).toBeNull();
        expect(falso.llamadas.filter((l) => l.op === "update").at(-1)?.args[0]).toEqual({ token_publico: null, modo: "chat" });

        falso.respuestas.push({ data: { id: SID, modo: "publico", invitados: [OTRA], creador: YO }, error: null });
        falso.respuestas.push({ data: { id: SID }, error: null });
        expect(await revocarEnlacePublico(SID)).toBeNull();
        expect(falso.llamadas.filter((l) => l.op === "update").at(-1)?.args[0]).toEqual({ token_publico: null, modo: "invitados" });
    });

    test("terminarSesion marca «terminada» y anula el token", async () => {
        falso.respuestas.push({ data: { id: SID }, error: null });
        expect(await terminarSesion(SID)).toBeNull();
        expect(falso.llamadas.find((l) => l.op === "update")?.args[0]).toEqual({ estado: "terminada", token_publico: null });
    });
});

describe("presencia", () => {
    test("cuenta personas distintas (dos pestañas de la misma cuenta = una)", () => {
        expect(contarPresentes({})).toBe(0);
        expect(
            contarPresentes({
                tabA: [{ uid: YO }],
                tabB: [{ uid: YO }],
                tabC: [{ uid: OTRA }],
                anon: [{ uid: null }],
                vacia: [],
            }),
        ).toBe(3);
    });
});
