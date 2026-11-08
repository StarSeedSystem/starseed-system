"use client";

/**
 * Avisos de mensajes nuevos (NOT1108A · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Contrato: architecture/avisos-mensajes.md. Lógica pura: avisos-mensajes-logica.ts.
 *
 * Caso real (08-11): un mensaje de prueba de la Mac a la tableta por Mensajes › Neuronas llegó, pero nada
 * lo avisó: ni dentro del OS (estando en otra sección) ni en las notificaciones del aparato con la app en
 * segundo plano. Aquí se une lo que ya había, sin sistemas paralelos:
 *   · DENTRO del OS: el centro de notificaciones de siempre (`notifyFromApp`, app «messages», respeta sus
 *     permisos de Ajustes → Notificaciones) y un toast de sonner con «Abrir» que navega sin recargar.
 *   · SISTEMA: en la app nativa, `aviso_mensaje` de Rust (tauri-plugin-notification; Android: canal
 *     «Mensajes»); en la web/PWA, el service worker (`showNotification`, su clic abre el chat) o la API
 *     `Notification`. Solo con la app oculta, minimizada, sin foco o en segundo plano.
 *   · El contador de la pestaña «Neuronas» ya existía; el del icono de Mensajes del dock sale de aquí
 *     (`useNoLeidosMensajes`): no leídos de las neuronas (exactos, del buzón) + mensajes de chats que
 *     llegaron en esta sesión sin abrirlos.
 *   · Respeta el silencio por chat y la ventana de silencio de Ajustes de Mensajería.
 * Nunca lanza.
 */

import { toast } from "sonner";
import { getAppNotifyPref, notifyFromApp } from "./app-notify";
import {
    Vistos,
    decidirAviso,
    mismaRuta,
    rutaChat,
    rutaValida,
    textoAviso,
    type DecisionAviso,
    type MensajeEntrante,
    type Situacion,
} from "./avisos-mensajes-logica";
import { chatAbierto, fijarChatAbierto } from "./chat-abierto";
import { _reiniciarNoLeidos, quitarNoLeidoChat, sumarNoLeidoChat } from "./no-leidos-mensajes";
import { avisosNativos, type EstadoAvisosNativo, type EstadoOrigenLocal } from "@/lib/nativa/avisos-nativos";
import { esAppNativa } from "@/lib/nativa/puente";

export type { MensajeEntrante } from "./avisos-mensajes-logica";
export { rutaChat } from "./avisos-mensajes-logica";

/** La app del catálogo que firma los avisos (Ajustes → Notificaciones la deja silenciar entera). */
export const APP_MENSAJES = "messages";
const ICONO = "MessageSquare";
const vistos = new Vistos(500);

/* ══════════════════════════ Navegación ══════════════════════════ */

let navegador: ((ruta: string) => void) | null = null;

/** El montaje global registra el `router.push` de Next (abrir un chat sin recargar la página). */
export function fijarNavegador(fn: ((ruta: string) => void) | null): void {
    navegador = fn;
}

export function abrirRuta(ruta: string): void {
    if (!rutaValida(ruta) || typeof window === "undefined") return;
    try {
        if (mismaRuta(window.location, ruta)) return;
        if (navegador) navegador(ruta);
        else window.location.assign(ruta);
    } catch {
        /* sin navegación: el aviso sigue en el centro */
    }
}

/* ══════════════════════════ Silencio y situación ══════════════════════════ */

let uidCache: { uid: string | null; en: number } = { uid: null, en: 0 };
async function miUid(): Promise<string | null> {
    if (Date.now() - uidCache.en < 60_000) return uidCache.uid;
    try {
        const m = await import("@/lib/consumo/usuario");
        uidCache = { uid: (await m.uidActual()) ?? null, en: Date.now() };
    } catch {
        uidCache = { uid: null, en: Date.now() };
    }
    return uidCache.uid;
}

/** ¿Ese chat está silenciado ahora? (ajustes del chat o silencio de la sección; caché local de los ajustes). */
export async function chatSilenciado(clave: string): Promise<boolean> {
    try {
        const [{ fusionarConDefecto, ajustesEfectivos }, { LS_MENSAJERIA }] = await Promise.all([
            import("@/lib/mensajeria/ajustes"),
            import("@/lib/mensajeria/ajustes-tipos"),
        ]);
        const uid = await miUid();
        const crudo = localStorage.getItem(`${LS_MENSAJERIA}.${uid ?? "anon"}`);
        const a = fusionarConDefecto(crudo ? JSON.parse(crudo) : null);
        // Los chats del servidor se guardan por id de hilo; los de neuronas, por su clave (`n:…`, `c:…`).
        const hilo = clave.startsWith("dm:") ? clave.slice(3) : clave;
        return ajustesEfectivos(a, hilo, "dm").silenciado;
    } catch {
        return false;
    }
}

/** Las claves de los chats silenciados (para el respaldo nativo de la app). */
async function clavesSilenciadas(): Promise<string[]> {
    try {
        const [{ fusionarConDefecto, ajustesEfectivos }, { LS_MENSAJERIA }] = await Promise.all([
            import("@/lib/mensajeria/ajustes"),
            import("@/lib/mensajeria/ajustes-tipos"),
        ]);
        const uid = await miUid();
        const crudo = localStorage.getItem(`${LS_MENSAJERIA}.${uid ?? "anon"}`);
        const a = fusionarConDefecto(crudo ? JSON.parse(crudo) : null);
        return Object.keys(a.hilos)
            .filter((h) => ajustesEfectivos(a, h, "dm").silenciado)
            .map((h) => (h.startsWith("n:") || h.startsWith("c:") ? h : `dm:${h}`))
            .slice(0, 500);
    } catch {
        return [];
    }
}

function permisoWeb(): NotificationPermission | "no-soportado" {
    try {
        return typeof Notification === "undefined" ? "no-soportado" : Notification.permission;
    } catch {
        return "no-soportado";
    }
}

function situacion(clave: string, silenciado: boolean): Situacion {
    const visible = typeof document === "undefined" ? false : document.visibilityState === "visible";
    let enfocado = visible;
    try {
        enfocado = visible && document.hasFocus();
    } catch {
        /* sin hasFocus: vale con visible */
    }
    const pref = getAppNotifyPref(APP_MENSAJES);
    return {
        visible,
        enfocado,
        chatAbierto: chatAbierto(),
        silenciado,
        centroPermitido: pref.notifications,
        popupsPermitidos: pref.popups,
        // En la app nativa decide Rust con el permiso del sistema; en la web, el del navegador.
        sistemaDisponible: esAppNativa() || permisoWeb() === "granted",
    };
}

/* ══════════════════════════ Sistema ══════════════════════════ */

/** Notificación del sistema en la web/PWA: por el service worker (su clic abre el chat) o la API directa. */
async function notificarWeb(id: string, titulo: string, cuerpo: string, ruta: string, clave: string): Promise<{ ok: boolean; motivo?: string }> {
    if (permisoWeb() !== "granted") return { ok: false, motivo: "el navegador no dio permiso de notificaciones" };
    const opciones = { body: cuerpo, tag: `mensaje-${clave}`, icon: "/starseed-symbol-192.png", badge: "/icons/maskable-192.png", data: { ruta, id } } as NotificationOptions;
    try {
        const reg = typeof navigator !== "undefined" && navigator.serviceWorker ? await navigator.serviceWorker.getRegistration() : undefined;
        if (reg?.showNotification) {
            await reg.showNotification(titulo, opciones);
            return { ok: true };
        }
    } catch {
        /* sin SW: la API directa */
    }
    try {
        const n = new Notification(titulo, opciones);
        n.onclick = () => {
            try {
                window.focus();
            } catch {
                /* noop */
            }
            abrirRuta(ruta);
            n.close();
        };
        return { ok: true };
    } catch (e) {
        return { ok: false, motivo: e instanceof Error ? e.message : "el navegador no dejó mostrarla" };
    }
}

/* ══════════════════════════ Contador del dock ══════════════════════════ */

/** Al abrir un chat: deja de contar como no leído (y se apunta como «chat abierto»). */
export function marcarChatAbierto(clave: string | null): void {
    fijarChatAbierto(clave);
    quitarNoLeidoChat(clave);
}

export { useNoLeidosMensajes } from "./no-leidos-mensajes";

/* ══════════════════════════ Aviso de un mensaje ══════════════════════════ */

export interface ResultadoAvisoMensaje {
    decision: DecisionAviso;
    sistema: { ok: boolean; motivo?: string } | null;
}

/**
 * Avisa de un mensaje NUEVO (una vez por id). Lo llaman el buzón de la malla (neuronas y chats por la malla)
 * y el montaje global (chats del servidor). Devuelve lo que hizo, o null si ya se había avisado.
 */
export async function avisarMensajeEntrante(m: MensajeEntrante): Promise<ResultadoAvisoMensaje | null> {
    if (typeof window === "undefined" || !m?.id || !m.clave) return null;
    if (!vistos.apuntar(m.id)) return null;
    const silenciado = await chatSilenciado(m.clave);
    const decision = decidirAviso(m, situacion(m.clave, silenciado));
    const ruta = rutaChat(m.clave);
    const { titulo, cuerpo } = textoAviso(m);
    if (m.tipo === "dm" && chatAbierto() !== m.clave && decision.motivo !== "leyendo") {
        sumarNoLeidoChat(m.clave);
    }
    if (decision.centro) {
        // El centro de siempre (persistido, campana); el toast lo pone abajo este módulo (navega sin recargar).
        notifyFromApp({ appId: APP_MENSAJES, title: titulo, body: cuerpo, icon: ICONO, actions: [{ label: "Abrir", href: ruta }], dedupeKey: m.id, popup: false });
    }
    if (decision.toast) {
        try {
            toast.message(titulo, { description: cuerpo, action: { label: "Abrir", onClick: () => abrirRuta(ruta) } });
        } catch {
            /* sin toaster montado */
        }
    }
    let sistema: ResultadoAvisoMensaje["sistema"] = null;
    if (esAppNativa()) {
        // Siempre se le cuenta a la app (con o sin aviso): así su respaldo nativo no lo avisa otra vez.
        const r = await avisosNativos().avisar({ id: m.id, clave: m.clave, titulo, cuerpo, ruta, sistema: decision.sistema });
        sistema = decision.sistema ? (r.ok ? { ok: r.valor.mostrada, motivo: r.valor.motivo ?? undefined } : { ok: false, motivo: r.motivo }) : null;
    } else if (decision.sistema) {
        sistema = await notificarWeb(m.id, titulo, cuerpo, ruta, m.clave);
    }
    return { decision, sistema };
}

/** Un mensaje que ya estaba (llegó por otro camino): solo se le cuenta a la app nativa, sin avisar. */
export function informarRecibido(id: string, clave: string): void {
    if (!id || !esAppNativa() || vistos.contiene(id)) return;
    vistos.apuntar(id);
    void avisosNativos().avisar({ id, clave, titulo: "", cuerpo: "", ruta: rutaChat(clave), sistema: false });
}

/* ══════════════════════════ Permisos, estado y prueba ══════════════════════════ */

export interface EstadoNotificaciones {
    medio: "app-nativa" | "web";
    /** El de la app nativa (permiso del sistema, canal de Android, pendiente…). */
    nativo: EstadoAvisosNativo | null;
    /** El del navegador (en la app nativa también existe, pero no se usa). */
    web: NotificationPermission | "no-soportado";
    /** Hay service worker activo (en la web: la notificación del sistema abre el chat al pulsarla). */
    sw: boolean;
    /** El origen del servidor local (app nativa con servidor local). */
    origen: EstadoOrigenLocal | null;
    /** Permisos de la app «Mensajes» en Ajustes → Notificaciones. */
    centro: boolean;
    popups: boolean;
}

export async function estadoNotificaciones(): Promise<EstadoNotificaciones> {
    const nativa = esAppNativa();
    let sw = false;
    try {
        sw = !!(typeof navigator !== "undefined" && navigator.serviceWorker && (await navigator.serviceWorker.getRegistration()));
    } catch {
        sw = false;
    }
    const pref = getAppNotifyPref(APP_MENSAJES);
    let nativo: EstadoAvisosNativo | null = null;
    let origen: EstadoOrigenLocal | null = null;
    if (nativa) {
        const a = avisosNativos();
        const [e, o] = await Promise.all([a.estado(), a.origen()]);
        nativo = e.ok ? e.valor : null;
        origen = o.ok ? o.valor : null;
    }
    return { medio: nativa ? "app-nativa" : "web", nativo, web: permisoWeb(), sw, origen, centro: pref.notifications, popups: pref.popups };
}

/** Pide el permiso del sistema (app nativa: Android 13+ enseña su diálogo; web: el del navegador). */
export async function pedirPermisoNotificaciones(): Promise<string> {
    if (esAppNativa()) {
        const r = await avisosNativos().pedirPermiso();
        return r.ok ? r.valor : r.motivo;
    }
    try {
        if (typeof Notification === "undefined") return "no-soportado";
        return await Notification.requestPermission();
    } catch {
        return permisoWeb();
    }
}

const CLAVE_PERMISO_PEDIDO = "starseed.avisos-mensajes.permiso-pedido.v1";

/**
 * En la app instalada, la primera vez que se abre Mensajes: si el sistema aún no decidió (Android 13+ pide
 * POST_NOTIFICATIONS en tiempo de ejecución), se pide UNA vez. En la web no se pide solo (los navegadores lo
 * castigan): para eso está «Probar notificaciones» en Ajustes.
 */
export async function pedirPermisoUnaVez(): Promise<void> {
    if (!esAppNativa() || typeof localStorage === "undefined") return;
    try {
        if (localStorage.getItem(CLAVE_PERMISO_PEDIDO)) return;
        const e = await avisosNativos().estado();
        if (!e.ok || e.valor.permiso !== "preguntar") return;
        localStorage.setItem(CLAVE_PERMISO_PEDIDO, new Date().toISOString());
        await avisosNativos().pedirPermiso();
    } catch {
        /* sin almacenamiento o sin puente: se pedirá desde Ajustes */
    }
}

/**
 * «Probar notificaciones»: el aviso DENTRO del OS ahora y una notificación del SISTEMA (aunque la app esté a la
 * vista, para comprobarla). Devuelve lo que pasó con cada una.
 */
export async function probarNotificaciones(): Promise<{ dentro: boolean; sistema: { ok: boolean; motivo?: string } }> {
    const id = `prueba-${Date.now().toString(36)}`;
    const clave = "n:prueba";
    const ruta = "/messages?vista=neuronas";
    const titulo = "StarSeed · prueba";
    const cuerpo = "Así llega un mensaje nuevo. Púlsala para abrir Mensajes › Neuronas.";
    const dentro = notifyFromApp({ appId: APP_MENSAJES, title: titulo, body: cuerpo, icon: ICONO, actions: [{ label: "Abrir", href: ruta }], dedupeKey: id, popup: false }).ok;
    try {
        toast.message(titulo, { description: cuerpo, action: { label: "Abrir", onClick: () => abrirRuta(ruta) } });
    } catch {
        /* sin toaster */
    }
    if (esAppNativa()) {
        const r = await avisosNativos().avisar({ id, clave, titulo, cuerpo, ruta, sistema: true });
        return { dentro, sistema: r.ok ? { ok: r.valor.mostrada, motivo: r.valor.motivo ?? undefined } : { ok: false, motivo: r.motivo } };
    }
    if (permisoWeb() === "default") await pedirPermisoNotificaciones();
    return { dentro, sistema: await notificarWeb(id, titulo, cuerpo, ruta, clave) };
}

/* ══════════════════════════ Arranque global ══════════════════════════ */

/**
 * Al volver a la app: la ruta de una notificación pulsada que la web no llegó a oír (Android la abre en frío;
 * Rust la guarda `PENDIENTE_VALIDA_MS`). En la web la abre el propio service worker (o `onclick`).
 */
async function abrirPendiente(): Promise<void> {
    if (!esAppNativa()) return;
    const r = await avisosNativos().pendiente();
    if (r.ok && r.valor && rutaValida(r.valor)) abrirRuta(r.valor);
}

async function configurarNativa(): Promise<void> {
    if (!esAppNativa()) return;
    let neurona: string | null = null;
    try {
        neurona = (await import("@/lib/neurons/neurons")).thisDeviceId() || null;
    } catch {
        neurona = null;
    }
    const pref = getAppNotifyPref(APP_MENSAJES);
    await avisosNativos().configurar({ neurona, uid: await miUid(), silenciados: await clavesSilenciadas(), sistema: pref.popups });
}

/** Chats del servidor: un mensaje nuevo de otra persona en cualquier hilo (una suscripción por sesión). */
function escucharChatsServidor(): () => void {
    let baja: (() => void) | null = null;
    let vivo = true;
    const hilos = new Map<string, { correo: boolean; titulo: string | null }>();
    const nombres = new Map<string, string>();
    void (async () => {
        const uid = await miUid();
        if (!uid || !vivo) return;
        const [{ onTableChange }, { createClient }] = await Promise.all([import("@/lib/realtime/realtime"), import("@/utils/supabase/client")]);
        if (!vivo) return;
        baja = onTableChange<{ id?: string; thread_id?: string; sender?: string; body?: string; deleted?: boolean; meta?: unknown }>(
            "os_dm_messages",
            { event: "INSERT" },
            (p) => {
                const fila = (p as { new?: { id?: string; thread_id?: string; sender?: string; body?: string; deleted?: boolean } }).new;
                if (!fila?.id || !fila.thread_id || !fila.sender || fila.sender === uid || fila.deleted) return;
                void (async () => {
                    let hilo = hilos.get(fila.thread_id!);
                    if (!hilo) {
                        try {
                            const { data } = await createClient().from("os_dm_threads").select("id,kind,title,meta").eq("id", fila.thread_id!).maybeSingle();
                            const meta = (data as { meta?: { mail?: boolean } | null } | null)?.meta;
                            hilo = { correo: meta?.mail === true, titulo: (data as { kind?: string; title?: string | null } | null)?.kind === "group" ? ((data as { title?: string | null }).title ?? null) : null };
                        } catch {
                            hilo = { correo: false, titulo: null };
                        }
                        hilos.set(fila.thread_id!, hilo);
                    }
                    if (hilo.correo) return; // Correos tiene su propia bandeja
                    let quien = nombres.get(fila.sender!);
                    if (!quien) {
                        try {
                            const perfiles = await (await import("@/lib/social/os-profiles")).fetchProfilesByIds([fila.sender!]);
                            quien = perfiles[fila.sender!]?.displayName || "Alguien";
                        } catch {
                            quien = "Alguien";
                        }
                        nombres.set(fila.sender!, quien);
                    }
                    await avisarMensajeEntrante({
                        id: `dm:${fila.id}`,
                        clave: `dm:${fila.thread_id}`,
                        tipo: "dm",
                        titulo: hilo.titulo ? `${quien} · ${hilo.titulo}` : quien,
                        texto: (fila.body || "").trim() || "Te envió algo.",
                    });
                })();
            },
        );
    })();
    return () => {
        vivo = false;
        baja?.();
    };
}

let montajes = 0;
let parar: (() => void) | null = null;

/**
 * Engancha lo global (una vez por pestaña, con cuenta de referencias): abrir el chat de una notificación
 * pulsada (evento de la app nativa, mensaje del service worker o al volver a la app), los chats del servidor
 * y la configuración del respaldo nativo.
 */
export function iniciarAvisosMensajes(): () => void {
    montajes += 1;
    if (montajes > 1 || typeof window === "undefined") {
        return () => {
            montajes = Math.max(0, montajes - 1);
        };
    }
    const bajas: Array<() => void> = [];
    if (esAppNativa()) {
        void avisosNativos()
            .alAbrir((ruta) => abrirRuta(ruta))
            .then((b) => bajas.push(b));
        void configurarNativa();
        const t = setInterval(() => void configurarNativa(), 60_000);
        bajas.push(() => clearInterval(t));
    }
    const alMensajeSw = (e: MessageEvent) => {
        const d = e.data as { type?: unknown; ruta?: unknown } | null;
        if (d && d.type === "starseed:abrir-ruta" && rutaValida(d.ruta)) abrirRuta(d.ruta);
    };
    try {
        navigator.serviceWorker?.addEventListener("message", alMensajeSw);
        bajas.push(() => navigator.serviceWorker?.removeEventListener("message", alMensajeSw));
    } catch {
        /* sin service worker */
    }
    const alVolver = () => {
        if (document.visibilityState === "visible") void abrirPendiente();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    bajas.push(() => document.removeEventListener("visibilitychange", alVolver), () => window.removeEventListener("focus", alVolver));
    // Al abrir la app desde una notificación (Android en frío, PWA): la ruta pendiente.
    void abrirPendiente();
    bajas.push(escucharChatsServidor());
    parar = () => {
        for (const b of bajas.splice(0)) {
            try {
                b();
            } catch {
                /* noop */
            }
        }
    };
    return () => {
        montajes = Math.max(0, montajes - 1);
        if (montajes === 0 && parar) {
            parar();
            parar = null;
        }
    };
}

/** Solo pruebas: olvida lo avisado y los contadores. */
export function _reiniciarParaPruebas(): void {
    _reiniciarNoLeidos();
    uidCache = { uid: null, en: 0 };
    fijarChatAbierto(null);
    (vistos as unknown as { cola: string[] }).cola = [];
}
