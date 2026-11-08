// @vitest-environment jsdom
/*
 * Avisos de mensajes nuevos en el NAVEGADOR/PWA (NOT1108A): toast dentro del OS con «Abrir», el centro de
 * notificaciones de siempre, la notificación del sistema con la API del navegador (su clic abre el chat),
 * el silencio por chat, la deduplicación y el contador del icono de Mensajes.
 *   NODE_ENV=test npx vitest run src/lib/notifications/__tests__/avisos-mensajes-web.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastMessage = vi.fn();
vi.mock("sonner", () => ({ toast: { message: (...a: unknown[]) => toastMessage(...a) } }));
const notify = vi.fn((_x: unknown) => ({ ok: true, toCenter: true }));
const pref = { notifications: true, popups: true };
vi.mock("../app-notify", () => ({ notifyFromApp: (x: unknown) => notify(x), getAppNotifyPref: () => ({ ...pref }) }));
vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => "u1" }));

import * as A from "../avisos-mensajes";
import { noLeidosChatsSesion } from "../no-leidos-mensajes";

let visible = "visible";
let foco = true;
const navegar = vi.fn();
const creadas: Array<{ titulo: string; o: NotificationOptions; onclick?: () => void }> = [];

class NotificacionDeMentira {
    static permission: NotificationPermission = "granted";
    static requestPermission = vi.fn(async () => NotificacionDeMentira.permission);
    onclick?: () => void;
    constructor(titulo: string, o: NotificationOptions) {
        creadas.push({ titulo, o, onclick: undefined });
        const yo = creadas[creadas.length - 1];
        Object.defineProperty(this, "onclick", { set: (f) => (yo.onclick = f), get: () => yo.onclick });
    }
    close() {}
}

beforeEach(() => {
    visible = "visible";
    foco = true;
    pref.notifications = true;
    pref.popups = true;
    toastMessage.mockClear();
    notify.mockClear();
    navegar.mockClear();
    creadas.length = 0;
    localStorage.clear();
    A._reiniciarParaPruebas();
    A.fijarNavegador(navegar);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visible });
    document.hasFocus = () => foco;
    vi.stubGlobal("Notification", NotificacionDeMentira);
});
afterEach(() => vi.unstubAllGlobals());

const msg = (id: string, clave = "n:mac", tipo: A.MensajeEntrante["tipo"] = "neurona") => ({ id, clave, tipo, titulo: "Mac de Alex", texto: "hola" });

describe("dentro del OS", () => {
    it("en otra sección: toast con «Abrir» (navega sin recargar) y el centro de notificaciones", async () => {
        const r = await A.avisarMensajeEntrante(msg("m1"));
        expect(r?.decision.motivo).toBe("a-la-vista");
        expect(toastMessage).toHaveBeenCalledTimes(1);
        const [titulo, opciones] = toastMessage.mock.calls[0] as [string, { description: string; action: { onClick: () => void } }];
        expect(titulo).toBe("Mac de Alex");
        expect(opciones.description).toBe("hola");
        opciones.action.onClick();
        expect(navegar).toHaveBeenCalledWith("/messages?vista=neuronas&neurona=n%3Amac");
        expect(notify).toHaveBeenCalledWith(expect.objectContaining({ appId: "messages", popup: false, dedupeKey: "m1" }));
        expect(creadas).toHaveLength(0);
    });

    it("leyendo ese chat: nada", async () => {
        A.marcarChatAbierto("n:mac");
        const r = await A.avisarMensajeEntrante(msg("m2"));
        expect(r?.decision.motivo).toBe("leyendo");
        expect(toastMessage).not.toHaveBeenCalled();
        expect(notify).not.toHaveBeenCalled();
    });

    it("un mismo mensaje (llegó por dos caminos) se avisa una vez", async () => {
        expect(await A.avisarMensajeEntrante(msg("m3"))).not.toBeNull();
        expect(await A.avisarMensajeEntrante(msg("m3"))).toBeNull();
        expect(toastMessage).toHaveBeenCalledTimes(1);
    });

    it("chat silenciado en Ajustes de Mensajería: nada", async () => {
        localStorage.setItem("starseed.mensajeria.ajustes.v1.u1", JSON.stringify({ hilos: { "hilo-9": { notificaciones: { silencioHasta: "siempre" } } } }));
        visible = "hidden";
        const r = await A.avisarMensajeEntrante(msg("m4", "dm:hilo-9", "dm"));
        expect(r?.decision.motivo).toBe("silenciado");
        expect(creadas).toHaveLength(0);
        expect(toastMessage).not.toHaveBeenCalled();
    });
});

describe("del sistema (app en segundo plano)", () => {
    it("pestaña oculta: notificación del navegador; su clic enfoca y abre el chat", async () => {
        visible = "hidden";
        foco = false;
        const r = await A.avisarMensajeEntrante(msg("m5"));
        expect(r?.decision).toMatchObject({ sistema: true, toast: false, centro: true });
        expect(r?.sistema).toEqual({ ok: true });
        expect(creadas).toHaveLength(1);
        expect(creadas[0].titulo).toBe("Mac de Alex");
        expect((creadas[0].o.data as { ruta: string }).ruta).toBe("/messages?vista=neuronas&neurona=n%3Amac");
        creadas[0].onclick?.();
        expect(navegar).toHaveBeenCalledWith("/messages?vista=neuronas&neurona=n%3Amac");
    });

    it("sin permiso del navegador: no se intenta (el centro sí)", async () => {
        NotificacionDeMentira.permission = "denied";
        visible = "hidden";
        const r = await A.avisarMensajeEntrante(msg("m6"));
        expect(r?.decision.sistema).toBe(false);
        expect(creadas).toHaveLength(0);
        expect(notify).toHaveBeenCalled();
        NotificacionDeMentira.permission = "granted";
    });
});

describe("contador del icono de Mensajes", () => {
    it("los chats del servidor suman hasta abrirlos", async () => {
        await A.avisarMensajeEntrante(msg("d1", "dm:h1", "dm"));
        await A.avisarMensajeEntrante(msg("d2", "dm:h1", "dm"));
        await A.avisarMensajeEntrante(msg("d3", "dm:h2", "dm"));
        expect(noLeidosChatsSesion()).toBe(3);
        A.marcarChatAbierto("dm:h1");
        expect(noLeidosChatsSesion()).toBe(1);
        // Con el chat abierto y a la vista, un mensaje nuevo no suma.
        await A.avisarMensajeEntrante(msg("d4", "dm:h1", "dm"));
        expect(noLeidosChatsSesion()).toBe(1);
    });
});

describe("estado y prueba (navegador)", () => {
    it("dice el medio y el permiso del navegador; «Probar» lanza los dos avisos", async () => {
        const e = await A.estadoNotificaciones();
        expect(e).toMatchObject({ medio: "web", nativo: null, web: "granted", centro: true, popups: true });
        const p = await A.probarNotificaciones();
        expect(p.dentro).toBe(true);
        expect(p.sistema.ok).toBe(true);
        expect(toastMessage).toHaveBeenCalled();
        expect(creadas[0].titulo).toBe("StarSeed · prueba");
    });
});
