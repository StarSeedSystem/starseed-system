/**
 * Acciones de las apps en vivo: el adjunto que viaja en el mensaje y el flujo compartir →
 * recurso + sesión + acceso, incluido el «si la sesión falla, el recurso nuevo se borra».
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const sesiones = vi.hoisted(() => ({
    crearSesion: vi.fn(),
    invitar: vi.fn(),
    crearEnlacePublico: vi.fn(),
    revocarEnlacePublico: vi.fn(),
    terminarSesion: vi.fn(),
}));
vi.mock("@/lib/mensajeria/sesiones-vivas", async (original) => ({
    ...(await original<typeof import("@/lib/mensajeria/sesiones-vivas")>()),
    ...sesiones,
    origenActual: () => "https://os.test",
}));

const dm = vi.hoisted(() => ({ listMembers: vi.fn(), createDm: vi.fn(), sendMessage: vi.fn() }));
vi.mock("@/lib/messages/dm", () => dm);

const espacios = vi.hoisted(() => ({
    createSpace: vi.fn(),
    inviteToSpace: vi.fn(),
    updateSpaceMeta: vi.fn(),
    listOwnedSpaces: vi.fn(),
    deleteSpace: vi.fn(),
}));
vi.mock("@/lib/spaces/spaces", () => espacios);

vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));

import type { SesionViva } from "@/lib/mensajeria/formato-tipos";
import { CATALOGO_VIVO } from "@/components/messages/vivo/catalogo-vivo";
import {
    avisarPorMensaje,
    compartirVivo,
    construirAdjuntoVivo,
    cuerpoMensajeVivo,
    esAdjuntoVivo,
    terminarVivo,
} from "@/components/messages/vivo/acciones-vivo";

const YO = "11111111-1111-4111-8111-111111111111";
const OTRA = "22222222-2222-4222-8222-222222222222";
const TERCERA = "33333333-3333-4333-8333-333333333333";
const SID = "44444444-4444-4444-8444-444444444444";
const HILO = "55555555-5555-4555-8555-555555555555";

function sesion(extra: Partial<SesionViva> = {}): SesionViva {
    return {
        id: SID,
        tipo: "vivo:pizarra",
        hiloId: HILO,
        creador: YO,
        titulo: "Plan del huerto",
        refId: "sp1",
        ruta: "/pizarra?board-space=sp1&engine=starseed",
        modo: "chat",
        permiso: "editar",
        invitados: [],
        tokenPublico: null,
        estado: "activa",
        creada: "2026-09-28T10:00:00Z",
        caduca: null,
        ...extra,
    };
}

beforeEach(() => {
    for (const f of [...Object.values(sesiones), ...Object.values(dm), ...Object.values(espacios)]) f.mockReset();
    dm.listMembers.mockResolvedValue([
        { threadId: HILO, userId: YO, role: "owner", joinedAt: "" },
        { threadId: HILO, userId: OTRA, role: "member", joinedAt: "" },
    ]);
    espacios.inviteToSpace.mockResolvedValue(true);
    espacios.updateSpaceMeta.mockResolvedValue(true);
});

describe("adjunto", () => {
    test("construirAdjuntoVivo arma un AdjuntoVivo válido", () => {
        const a = construirAdjuntoVivo(sesion());
        expect(a).toEqual({
            kind: "vivo",
            tipoVivo: "pizarra",
            sesionId: SID,
            route: "/pizarra?board-space=sp1&engine=starseed",
            name: "Plan del huerto",
            permiso: "editar",
        });
        expect(esAdjuntoVivo(a)).toBe(true);
    });

    test("sin ruta o con tipo de llamada no hay adjunto de app", () => {
        expect(construirAdjuntoVivo(sesion({ ruta: null }))).toBeNull();
        expect(construirAdjuntoVivo(sesion({ tipo: "llamada:audio" }))).toBeNull();
    });

    test("esAdjuntoVivo rechaza adjuntos mal formados", () => {
        expect(esAdjuntoVivo({ kind: "vivo" })).toBe(false);
        expect(esAdjuntoVivo({ kind: "vivo", sesionId: SID, route: "https://evil", tipoVivo: "pizarra" } as never)).toBe(false);
        expect(esAdjuntoVivo({ kind: "vivo", sesionId: SID, route: "//evil.example", tipoVivo: "pizarra" } as never)).toBe(false);
        expect(esAdjuntoVivo({ kind: "image", url: "x" })).toBe(false);
        expect(esAdjuntoVivo(null)).toBe(false);
    });

    test("el texto plano del mensaje es «Etiqueta: título»", () => {
        expect(cuerpoMensajeVivo(CATALOGO_VIVO.pizarra, "Plan")).toBe("Pizarra: Plan");
    });
});

describe("compartirVivo", () => {
    test("crea el espacio, abre la sesión y da acceso a los del chat (menos a mí)", async () => {
        espacios.createSpace.mockResolvedValue({ id: "sp1" });
        sesiones.crearSesion.mockResolvedValue({ sesion: sesion(), error: null });
        const r = await compartirVivo({
            hiloId: HILO,
            entrada: CATALOGO_VIVO.pizarra,
            titulo: "Plan del huerto",
            modo: "chat",
            permiso: "editar",
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(sesiones.crearSesion).toHaveBeenCalledWith(expect.objectContaining({
            tipo: "vivo:pizarra",
            hiloId: HILO,
            refId: "sp1",
            ruta: "/pizarra?board-space=sp1&engine=starseed",
            acceso: { modo: "chat", permiso: "editar" },
            invitados: [],
        }));
        expect(espacios.inviteToSpace).toHaveBeenCalledTimes(1);
        expect(espacios.inviteToSpace).toHaveBeenCalledWith("sp1", OTRA, "editor");
        expect(r.body).toBe("Pizarra: Plan del huerto");
        expect(r.adjunto.sesionId).toBe(SID);
        expect(r.urlPublica).toBeNull();
        expect(r.avisos).toEqual([]);
    });

    test("con invitados: acceso para el chat y para los elegidos", async () => {
        espacios.createSpace.mockResolvedValue({ id: "sp1" });
        sesiones.crearSesion.mockResolvedValue({ sesion: sesion({ modo: "invitados", invitados: [TERCERA] }), error: null });
        await compartirVivo({
            hiloId: HILO,
            entrada: CATALOGO_VIVO.pizarra,
            titulo: "x",
            modo: "invitados",
            permiso: "ver",
            invitados: [TERCERA, "no-es-uuid"],
        });
        expect(sesiones.crearSesion.mock.calls[0][0].invitados).toEqual([TERCERA]);
        const invitadas = espacios.inviteToSpace.mock.calls.map((c) => c[1]).sort();
        expect(invitadas).toEqual([OTRA, TERCERA].sort());
    });

    test("público: abre la lectura del espacio y devuelve la URL con token", async () => {
        espacios.createSpace.mockResolvedValue({ id: "sp1" });
        sesiones.crearSesion.mockResolvedValue({ sesion: sesion({ modo: "publico", tokenPublico: "tok" }), error: null });
        const r = await compartirVivo({ hiloId: HILO, entrada: CATALOGO_VIVO.pizarra, titulo: "x", modo: "publico", permiso: "editar" });
        expect(espacios.updateSpaceMeta).toHaveBeenCalledWith("sp1", { access: "public" });
        expect(r.ok && r.urlPublica).toBe(`https://os.test/vivo/${SID}?t=tok`);
    });

    test("si la sesión no se abre, el espacio recién creado se borra y el error llega tal cual", async () => {
        espacios.createSpace.mockResolvedValue({ id: "sp9" });
        sesiones.crearSesion.mockResolvedValue({ sesion: null, error: "Las sesiones en vivo aún no están activadas en este servidor" });
        const r = await compartirVivo({ hiloId: HILO, entrada: CATALOGO_VIVO.escritorio, titulo: "x", modo: "chat", permiso: "editar" });
        expect(r).toEqual({ ok: false, error: "Las sesiones en vivo aún no están activadas en este servidor" });
        expect(espacios.deleteSpace).toHaveBeenCalledWith("sp9");
    });

    test("compartir uno existente no crea ni borra nada", async () => {
        sesiones.crearSesion.mockResolvedValue({ sesion: null, error: "fallo" });
        await compartirVivo({
            hiloId: HILO,
            entrada: CATALOGO_VIVO.pizarra,
            titulo: "",
            existente: { refId: "mio", titulo: "Mi pizarra", ruta: "/pizarra?board-space=mio&engine=starseed" },
            modo: "chat",
            permiso: "editar",
        });
        expect(espacios.createSpace).not.toHaveBeenCalled();
        expect(espacios.deleteSpace).not.toHaveBeenCalled();
        expect(sesiones.crearSesion.mock.calls[0][0].titulo).toBe("Mi pizarra");
    });

    test("un tipo no disponible no se comparte y explica por qué", async () => {
        const r = await compartirVivo({ hiloId: HILO, entrada: CATALOGO_VIVO.documento, titulo: "x", modo: "chat", permiso: "editar" });
        expect(r.ok).toBe(false);
        expect(!r.ok && r.error).toBe(CATALOGO_VIVO.documento.motivo);
        expect(sesiones.crearSesion).not.toHaveBeenCalled();
    });

    test("avisa si alguien del chat se quedó sin acceso al contenido", async () => {
        espacios.createSpace.mockResolvedValue({ id: "sp1" });
        espacios.inviteToSpace.mockResolvedValue(false);
        sesiones.crearSesion.mockResolvedValue({ sesion: sesion(), error: null });
        const r = await compartirVivo({ hiloId: HILO, entrada: CATALOGO_VIVO.pizarra, titulo: "x", modo: "chat", permiso: "editar" });
        expect(r.ok && r.avisos.length).toBe(1);
    });
});

describe("avisos y fin", () => {
    test("avisarPorMensaje manda la tarjeta por mensaje directo a cada invitada (no a mí)", async () => {
        dm.createDm.mockResolvedValue({ ok: true, thread: { id: "t1" } });
        dm.sendMessage.mockResolvedValue({ id: "m1" });
        const n = await avisarPorMensaje(sesion(), [OTRA, YO, TERCERA]);
        expect(n).toBe(2);
        expect(dm.createDm).toHaveBeenCalledTimes(2);
        expect(dm.sendMessage.mock.calls[0][1].attachments[0]).toMatchObject({ kind: "vivo", sesionId: SID });
    });

    test("terminar una sesión pública cierra también la lectura pública del espacio", async () => {
        sesiones.terminarSesion.mockResolvedValue(null);
        expect(await terminarVivo(sesion({ modo: "publico" }))).toBeNull();
        expect(espacios.updateSpaceMeta).toHaveBeenCalledWith("sp1", { access: "invite" });
    });
});
