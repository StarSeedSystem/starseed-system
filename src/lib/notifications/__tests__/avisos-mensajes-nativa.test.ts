// @vitest-environment jsdom
/*
 * Avisos de mensajes nuevos en la APP INSTALADA (NOT1108A): cada mensaje nuevo se le cuenta a Rust
 * (`aviso_mensaje`, con `sistema` solo si la app está en segundo plano), pulsar la notificación abre su chat
 * (evento `starseed://aviso-abrir` o la ruta pendiente al volver) y el respaldo nativo recibe la config.
 *   NODE_ENV=test npx vitest run src/lib/notifications/__tests__/avisos-mensajes-nativa.test.ts
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { message: vi.fn() } }));
vi.mock("../app-notify", () => ({ notifyFromApp: () => ({ ok: true }), getAppNotifyPref: () => ({ notifications: true, popups: true }) }));
vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => "u1" }));
vi.mock("@/lib/neurons/neurons", () => ({ thisDeviceId: () => "neurona-tableta-01" }));
vi.mock("@/lib/realtime/realtime", () => ({ onTableChange: () => () => undefined }));
vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));

const llamadas: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
const respuestas: Record<string, unknown> = {};
const oyentes = new Map<string, (e: { payload: unknown }) => void>();

beforeAll(() => {
    (window as unknown as { __TAURI__: unknown }).__TAURI__ = {
        core: {
            invoke: async (cmd: string, args?: Record<string, unknown>) => {
                llamadas.push({ cmd, args });
                return respuestas[cmd] ?? null;
            },
        },
        event: {
            listen: async (ev: string, cb: (e: { payload: unknown }) => void) => {
                oyentes.set(ev, cb);
                return () => oyentes.delete(ev);
            },
        },
    };
});

let visible = "visible";
const navegar = vi.fn();

beforeEach(async () => {
    llamadas.length = 0;
    navegar.mockClear();
    visible = "visible";
    const A = await import("../avisos-mensajes");
    A._reiniciarParaPruebas();
    A.fijarNavegador(navegar);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visible });
    document.hasFocus = () => visible === "visible";
});

const espera = () => new Promise((r) => setTimeout(r, 0));

describe("app instalada", () => {
    it("a la vista: se le cuenta a Rust SIN aviso del sistema (así su respaldo no lo avisa)", async () => {
        const A = await import("../avisos-mensajes");
        respuestas.aviso_mensaje = { mostrada: false, motivo: "la web no pidió aviso del sistema" };
        await A.avisarMensajeEntrante({ id: "m1", clave: "n:mac", tipo: "neurona", titulo: "Mac", texto: "hola" });
        const c = llamadas.find((l) => l.cmd === "aviso_mensaje")!;
        expect(c.args).toEqual({ id: "m1", clave: "n:mac", titulo: "Mac", cuerpo: "hola", ruta: "/messages?vista=neuronas&neurona=n%3Amac", sistema: false });
    });

    it("en segundo plano: Rust lo enseña en el sistema", async () => {
        const A = await import("../avisos-mensajes");
        visible = "hidden";
        respuestas.aviso_mensaje = { mostrada: true, motivo: null };
        const r = await A.avisarMensajeEntrante({ id: "m2", clave: "n:mac", tipo: "neurona", titulo: "Mac", texto: "hola" });
        expect(llamadas.find((l) => l.cmd === "aviso_mensaje")!.args!.sistema).toBe(true);
        expect(r?.sistema).toEqual({ ok: true, motivo: undefined });
    });

    it("(LLA1108A) una llamada entrante con la app en segundo plano: «Llamada entrante de …» y al pulsar abre su chat", async () => {
        const A = await import("../avisos-mensajes");
        visible = "hidden";
        respuestas.aviso_mensaje = { mostrada: true, motivo: null };
        const r = await A.avisarLlamadaEntrante({ id: "ll1", clave: "n:mac", nombre: "MaggaBook", tipo: "audio" });
        const c = llamadas.find((l) => l.cmd === "aviso_mensaje")!;
        expect(c.args).toMatchObject({ id: "ll1", clave: "n:mac", titulo: "Llamada entrante de MaggaBook", ruta: "/messages?vista=neuronas&neurona=n%3Amac", sistema: true });
        expect(String(c.args!.cuerpo)).toMatch(/Llamada de voz\. Toca para abrir y contestar/);
        expect(r).toEqual({ sistema: true, ok: true, motivo: undefined });
        // Una sola vez aunque la llamada llegue por dos caminos.
        expect(await A.avisarLlamadaEntrante({ id: "ll1", clave: "n:mac", nombre: "MaggaBook", tipo: "audio" })).toBeNull();
    });

    it("(LLA1108A) con la app a la vista la llamada suena dentro (sin notificación del sistema), pero se le cuenta a Rust", async () => {
        const A = await import("../avisos-mensajes");
        respuestas.aviso_mensaje = { mostrada: false, motivo: "la web no pidió aviso del sistema" };
        const r = await A.avisarLlamadaEntrante({ id: "ll2", clave: "n:mac", nombre: "MaggaBook", tipo: "video" });
        expect(llamadas.find((l) => l.cmd === "aviso_mensaje")!.args!.sistema).toBe(false);
        expect(r).toEqual({ sistema: false });
    });

    it("un mensaje que ya estaba solo se apunta (una vez)", async () => {
        const A = await import("../avisos-mensajes");
        A.informarRecibido("m9", "n:mac");
        A.informarRecibido("m9", "n:mac");
        await espera();
        const c = llamadas.filter((l) => l.cmd === "aviso_mensaje");
        expect(c).toHaveLength(1);
        expect(c[0].args!.sistema).toBe(false);
    });

    it("pulsar la notificación abre el chat (evento) o, al volver, la ruta pendiente", async () => {
        const A = await import("../avisos-mensajes");
        respuestas.avisos_pendiente = "/messages?vista=neuronas&neurona=n%3Amac";
        const parar = A.iniciarAvisosMensajes();
        await espera();
        await espera();
        // Al arrancar (Android la abrió en frío desde la notificación): la pendiente.
        expect(navegar).toHaveBeenCalledWith("/messages?vista=neuronas&neurona=n%3Amac");
        // El respaldo nativo recibe su configuración.
        await espera();
        const cfg = llamadas.find((l) => l.cmd === "avisos_config");
        expect(cfg?.args).toEqual({ config: { neurona: "neurona-tableta-01", uid: "u1", silenciados: [], sistema: true } });
        // Evento de la app con la app viva.
        navegar.mockClear();
        oyentes.get("starseed://aviso-abrir")?.({ payload: "/messages?vista=mensajes&hilo=h7" });
        expect(navegar).toHaveBeenCalledWith("/messages?vista=mensajes&hilo=h7");
        // Una ruta que no es interna, nunca.
        navegar.mockClear();
        oyentes.get("starseed://aviso-abrir")?.({ payload: "https://evil.com" });
        expect(navegar).not.toHaveBeenCalled();
        parar();
    });

    it("estado: el de la app (permiso del sistema, canal) y el origen del servidor local", async () => {
        const A = await import("../avisos-mensajes");
        respuestas.avisos_estado = { plataforma: "android", permiso: "preguntar", canal: "mensajes", enfocada: null, pendiente: null, respaldo_nativo: true, ultimo_error: null };
        respuestas.origen_local_estado = { principal: 47610, ultimo_puerto: 47610, puertos_usados: [47611, 47610], cambios: 1, ultimo_rescate: "traído de 47611" };
        const e = await A.estadoNotificaciones();
        expect(e.medio).toBe("app-nativa");
        expect(e.nativo?.canal).toBe("mensajes");
        expect(e.origen?.principal).toBe(47610);
        // Permiso pedido una vez (Android 13+), no dos.
        localStorage.clear();
        await A.pedirPermisoUnaVez();
        await A.pedirPermisoUnaVez();
        expect(llamadas.filter((l) => l.cmd === "avisos_pedir_permiso")).toHaveLength(1);
    });
});
