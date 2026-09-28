/**
 * ajustes — funciones PURAS del contrato C7 sobre `AjustesMensajeria`/`AjustesHilo`
 * (ver `ajustes-tipos.ts`). Nada de red ni de `window` aquí: el almacén vivo está en
 * `ajustes-store.ts`.
 */
import {
    AJUSTES_DEFECTO,
    FONDOS_PRESET,
    type AjustesApariencia,
    type AjustesEfectivos,
    type AjustesHilo,
    type AjustesMensajeria,
    type AjustesNotificaciones,
    type CargaMultimedia,
    type Densidad,
    type FondoChat,
    type TamanoLetra,
    type TipoHilo,
} from "@/lib/mensajeria/ajustes-tipos";

// ─────────────────────────── Validadores pequeños ───────────────────────────

function esObjeto(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === "object" && !Array.isArray(v);
}
function cadena(v: unknown, def: string): string {
    return typeof v === "string" ? v : def;
}
function booleano(v: unknown, def: boolean): boolean {
    return typeof v === "boolean" ? v : def;
}
function esCargaMultimedia(v: unknown): v is CargaMultimedia {
    return v === "siempre" || v === "wifi" || v === "nunca";
}
function esTamanoLetra(v: unknown): v is TamanoLetra {
    return v === "s" || v === "m" || v === "l" || v === "xl";
}
function esDensidad(v: unknown): v is Densidad {
    return v === "compacta" || v === "comoda";
}
function esOrdenLista(v: unknown): v is AjustesMensajeria["chats"]["ordenLista"] {
    return v === "reciente" || v === "no-leidos" || v === "nombre";
}
function esCalidadSubida(v: unknown): v is AjustesMensajeria["chats"]["calidadSubida"] {
    return v === "optimizada" || v === "original";
}
function esMostrarEnLinea(v: unknown): v is AjustesMensajeria["privacidad"]["mostrarEnLinea"] {
    return v === "todos" || v === "nadie";
}
function esEscribirme(v: unknown): v is AjustesMensajeria["privacidad"]["escribirme"] {
    return v === "todos" || v === "contactos";
}
function esVistaCorreo(v: unknown): v is AjustesMensajeria["correos"]["vista"] {
    return v === "conversacion" || v === "lista";
}
function esHora(v: unknown): v is string {
    return typeof v === "string" && /^\d{2}:\d{2}$/.test(v);
}

// ─────────────────────────── Fondo ───────────────────────────

function fusionarFondo(v: unknown, def: FondoChat): FondoChat {
    if (!esObjeto(v)) return def;
    if (v.tipo === "ninguno") return { tipo: "ninguno" };
    if (v.tipo === "preset" && typeof v.id === "string") return { tipo: "preset", id: v.id };
    if (v.tipo === "color" && typeof v.color === "string") return { tipo: "color", color: v.color };
    if (v.tipo === "imagen" && typeof v.url === "string") return { tipo: "imagen", url: v.url };
    return def;
}

function fondoParcialValido(v: unknown): FondoChat | undefined {
    if (!esObjeto(v)) return undefined;
    if (v.tipo === "ninguno") return { tipo: "ninguno" };
    if (v.tipo === "preset" && typeof v.id === "string") return { tipo: "preset", id: v.id };
    if (v.tipo === "color" && typeof v.color === "string") return { tipo: "color", color: v.color };
    if (v.tipo === "imagen" && typeof v.url === "string") return { tipo: "imagen", url: v.url };
    return undefined;
}

// ─────────────────────────── Apariencia (completa y parcial) ───────────────────────────

function fusionarApariencia(v: unknown, def: AjustesApariencia): AjustesApariencia {
    if (!esObjeto(v)) return { ...def };
    return {
        fondo: fusionarFondo(v.fondo, def.fondo),
        tamanoLetra: esTamanoLetra(v.tamanoLetra) ? v.tamanoLetra : def.tamanoLetra,
        colorBurbuja: cadena(v.colorBurbuja, def.colorBurbuja),
        densidad: esDensidad(v.densidad) ? v.densidad : def.densidad,
        mostrarHora: booleano(v.mostrarHora, def.mostrarHora),
        formato24h: booleano(v.formato24h, def.formato24h),
    };
}

function aparienciaParcialValida(v: unknown): Partial<AjustesApariencia> | undefined {
    if (!esObjeto(v)) return undefined;
    const out: Partial<AjustesApariencia> = {};
    const fondo = fondoParcialValido(v.fondo);
    if (fondo) out.fondo = fondo;
    if (esTamanoLetra(v.tamanoLetra)) out.tamanoLetra = v.tamanoLetra;
    if (typeof v.colorBurbuja === "string") out.colorBurbuja = v.colorBurbuja;
    if (esDensidad(v.densidad)) out.densidad = v.densidad;
    if (typeof v.mostrarHora === "boolean") out.mostrarHora = v.mostrarHora;
    if (typeof v.formato24h === "boolean") out.formato24h = v.formato24h;
    return Object.keys(out).length ? out : undefined;
}

// ─────────────────────────── Notificaciones (completa y parcial) ───────────────────────────

function fusionarNotificaciones(v: unknown, def: AjustesNotificaciones): AjustesNotificaciones {
    if (!esObjeto(v)) return { ...def };
    return {
        activas: booleano(v.activas, def.activas),
        sonido: booleano(v.sonido, def.sonido),
        vistaPrevia: booleano(v.vistaPrevia, def.vistaPrevia),
        silencioHasta: v.silencioHasta === null || typeof v.silencioHasta === "string" ? (v.silencioHasta as string | null) : def.silencioHasta,
    };
}

function notificacionesParcialValida(v: unknown): Partial<AjustesNotificaciones> | undefined {
    if (!esObjeto(v)) return undefined;
    const out: Partial<AjustesNotificaciones> = {};
    if (typeof v.activas === "boolean") out.activas = v.activas;
    if (typeof v.sonido === "boolean") out.sonido = v.sonido;
    if (typeof v.vistaPrevia === "boolean") out.vistaPrevia = v.vistaPrevia;
    if (v.silencioHasta === null || typeof v.silencioHasta === "string") out.silencioHasta = v.silencioHasta as string | null;
    return Object.keys(out).length ? out : undefined;
}

function fusionarHorasSilencio(
    v: unknown,
    def: AjustesMensajeria["notificaciones"]["horasSilencio"],
): AjustesMensajeria["notificaciones"]["horasSilencio"] {
    if (!esObjeto(v)) return { ...def };
    return {
        activo: booleano(v.activo, def.activo),
        desde: esHora(v.desde) ? v.desde : def.desde,
        hasta: esHora(v.hasta) ? v.hasta : def.hasta,
    };
}

// ─────────────────────────── Secciones de nivel 1 ───────────────────────────

function fusionarChats(v: unknown, def: AjustesMensajeria["chats"]): AjustesMensajeria["chats"] {
    if (!esObjeto(v)) return { ...def, apariencia: { ...def.apariencia } };
    return {
        apariencia: fusionarApariencia(v.apariencia, def.apariencia),
        enviarConEnter: booleano(v.enviarConEnter, def.enviarConEnter),
        vistaPreviaEnlaces: booleano(v.vistaPreviaEnlaces, def.vistaPreviaEnlaces),
        cargarMultimedia: esCargaMultimedia(v.cargarMultimedia) ? v.cargarMultimedia : def.cargarMultimedia,
        calidadSubida: esCalidadSubida(v.calidadSubida) ? v.calidadSubida : def.calidadSubida,
        ordenLista: esOrdenLista(v.ordenLista) ? v.ordenLista : def.ordenLista,
        fijadosArriba: booleano(v.fijadosArriba, def.fijadosArriba),
    };
}

function fusionarPrivacidad(v: unknown, def: AjustesMensajeria["privacidad"]): AjustesMensajeria["privacidad"] {
    if (!esObjeto(v)) return { ...def };
    return {
        mostrarEnLinea: esMostrarEnLinea(v.mostrarEnLinea) ? v.mostrarEnLinea : def.mostrarEnLinea,
        confirmacionesLectura: booleano(v.confirmacionesLectura, def.confirmacionesLectura),
        mostrarEscribiendo: booleano(v.mostrarEscribiendo, def.mostrarEscribiendo),
        escribirme: esEscribirme(v.escribirme) ? v.escribirme : def.escribirme,
    };
}

function fusionarNotifSeccion(v: unknown, def: AjustesMensajeria["notificaciones"]): AjustesMensajeria["notificaciones"] {
    if (!esObjeto(v)) {
        return {
            mensajes: { ...def.mensajes },
            grupos: { ...def.grupos },
            correos: { ...def.correos },
            horasSilencio: { ...def.horasSilencio },
        };
    }
    return {
        mensajes: fusionarNotificaciones(v.mensajes, def.mensajes),
        grupos: fusionarNotificaciones(v.grupos, def.grupos),
        correos: fusionarNotificaciones(v.correos, def.correos),
        horasSilencio: fusionarHorasSilencio(v.horasSilencio, def.horasSilencio),
    };
}

function fusionarCorreos(v: unknown, def: AjustesMensajeria["correos"]): AjustesMensajeria["correos"] {
    if (!esObjeto(v)) return { ...def };
    return {
        firma: cadena(v.firma, def.firma),
        vista: esVistaCorreo(v.vista) ? v.vista : def.vista,
        cargarImagenesRemotas: booleano(v.cargarImagenesRemotas, def.cargarImagenesRemotas),
        confirmarEnvio: booleano(v.confirmarEnvio, def.confirmarEnvio),
    };
}

function fusionarAurora(v: unknown, def: AjustesMensajeria["aurora"]): AjustesMensajeria["aurora"] {
    if (!esObjeto(v)) return { ...def };
    return {
        activaPorDefecto: booleano(v.activaPorDefecto, def.activaPorDefecto),
        responderMenciones: booleano(v.responderMenciones, def.responderMenciones),
    };
}

// ─────────────────────────── Hilos (overrides parciales) ───────────────────────────

function fusionarHilo(v: unknown): AjustesHilo | null {
    if (!esObjeto(v)) return null;
    const out: AjustesHilo = {};
    if (typeof v.apodo === "string") out.apodo = v.apodo;
    const apariencia = aparienciaParcialValida(v.apariencia);
    if (apariencia) out.apariencia = apariencia;
    const notificaciones = notificacionesParcialValida(v.notificaciones);
    if (notificaciones) out.notificaciones = notificaciones;
    if (typeof v.fijado === "boolean") out.fijado = v.fijado;
    if (typeof v.archivado === "boolean") out.archivado = v.archivado;
    if (typeof v.restringido === "boolean") out.restringido = v.restringido;
    if (typeof v.confirmacionesLectura === "boolean") out.confirmacionesLectura = v.confirmacionesLectura;
    if (typeof v.vistaPreviaEnlaces === "boolean") out.vistaPreviaEnlaces = v.vistaPreviaEnlaces;
    if (esCargaMultimedia(v.cargarMultimedia)) out.cargarMultimedia = v.cargarMultimedia;
    if (v.vaciadoEn === null || typeof v.vaciadoEn === "string") out.vaciadoEn = v.vaciadoEn as string | null;
    if (Array.isArray(v.etiquetas)) out.etiquetas = v.etiquetas.filter((x): x is string => typeof x === "string");
    if (typeof v.actualizado === "string") out.actualizado = v.actualizado;
    return out;
}

function fusionarHilos(v: unknown): Record<string, AjustesHilo> {
    if (!esObjeto(v)) return {};
    const out: Record<string, AjustesHilo> = {};
    for (const [id, val] of Object.entries(v)) {
        const h = fusionarHilo(val);
        if (h) out[id] = h;
    }
    return out;
}

/** Fusión profunda de `p` (cualquier valor, típicamente lo leído de la nube/localStorage) sobre `AJUSTES_DEFECTO`. Ignora campos de tipo incorrecto. */
export function fusionarConDefecto(p: unknown): AjustesMensajeria {
    const v = esObjeto(p) ? p : {};
    return {
        v: 1,
        chats: fusionarChats(v.chats, AJUSTES_DEFECTO.chats),
        privacidad: fusionarPrivacidad(v.privacidad, AJUSTES_DEFECTO.privacidad),
        notificaciones: fusionarNotifSeccion(v.notificaciones, AJUSTES_DEFECTO.notificaciones),
        correos: fusionarCorreos(v.correos, AJUSTES_DEFECTO.correos),
        aurora: fusionarAurora(v.aurora, AJUSTES_DEFECTO.aurora),
        hilos: fusionarHilos(v.hilos),
        actualizado: typeof v.actualizado === "string" ? v.actualizado : AJUSTES_DEFECTO.actualizado,
    };
}

// ─────────────────────────── Silencio ───────────────────────────

function minutosDeHora(hhmm: string): number {
    const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10) || 0);
    return (h % 24) * 60 + (m % 60);
}

/** Ventana [desde,hasta) en minutos del día, cruzando medianoche si `hasta` <= `desde`. */
function dentroDeVentana(desde: string, hasta: string, ahora: Date): boolean {
    const d = minutosDeHora(desde);
    const h = minutosDeHora(hasta);
    const actual = ahora.getHours() * 60 + ahora.getMinutes();
    if (d === h) return false; // ventana vacía: se ignora en vez de "silenciado todo el día" por datos raros
    if (d < h) return actual >= d && actual < h;
    return actual >= d || actual < h; // cruza medianoche (p.ej. 23:00 → 07:00)
}

/** `true` si `n` está silenciado AHORA MISMO: por `silencioHasta` ("siempre" o una fecha futura) o por la ventana de `horas`. */
export function estaSilenciado(
    n: AjustesNotificaciones,
    ahora: Date = new Date(),
    horas?: AjustesMensajeria["notificaciones"]["horasSilencio"],
): boolean {
    if (n.silencioHasta === "siempre") return true;
    if (n.silencioHasta) {
        const hasta = Date.parse(n.silencioHasta);
        if (!Number.isNaN(hasta) && hasta > ahora.getTime()) return true;
    }
    if (horas?.activo && dentroDeVentana(horas.desde, horas.hasta, ahora)) return true;
    return false;
}

/** Opciones del selector rápido "silenciar durante…". */
export const OPCIONES_SILENCIO: { id: string; etiqueta: string; hasta: (ahora: Date) => string }[] = [
    { id: "1h", etiqueta: "1 hora", hasta: (ahora) => new Date(ahora.getTime() + 60 * 60 * 1000).toISOString() },
    { id: "8h", etiqueta: "8 horas", hasta: (ahora) => new Date(ahora.getTime() + 8 * 60 * 60 * 1000).toISOString() },
    { id: "1sem", etiqueta: "1 semana", hasta: (ahora) => new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString() },
    { id: "siempre", etiqueta: "Siempre", hasta: () => "siempre" },
];

// ─────────────────────────── Apariencia derivada ───────────────────────────

export function fondoCss(f: FondoChat): string {
    if (f.tipo === "ninguno") return "transparent";
    if (f.tipo === "preset") {
        const preset = FONDOS_PRESET.find((p) => p.id === f.id);
        return preset ? preset.css : "transparent";
    }
    if (f.tipo === "color") return f.color;
    if (f.tipo === "imagen") {
        const segura = f.url.startsWith("https://") || f.url.startsWith("/");
        return segura ? `url("${f.url}") center/cover` : "transparent";
    }
    return "transparent";
}

export function tamanoLetraPx(t: TamanoLetra): number {
    switch (t) {
        case "s":
            return 13;
        case "m":
            return 15;
        case "l":
            return 17;
        case "xl":
            return 20;
        default:
            return 15;
    }
}

// ─────────────────────────── Ajustes efectivos (sección + hilo) ───────────────────────────

export function ajustesEfectivos(
    a: AjustesMensajeria,
    hiloId: string | null,
    tipo: TipoHilo,
    ahora: Date = new Date(),
): AjustesEfectivos {
    const hilo = hiloId ? a.hilos[hiloId] : undefined;
    const notifBase = tipo === "dm" ? a.notificaciones.mensajes : tipo === "grupo" ? a.notificaciones.grupos : a.notificaciones.correos;
    const notificaciones: AjustesNotificaciones = hilo?.notificaciones ? { ...notifBase, ...hilo.notificaciones } : notifBase;
    const apariencia: AjustesApariencia = hilo?.apariencia ? { ...a.chats.apariencia, ...hilo.apariencia } : a.chats.apariencia;
    const silenciado = estaSilenciado(notificaciones, ahora, a.notificaciones.horasSilencio);

    return {
        apariencia,
        notificaciones,
        silenciado,
        confirmacionesLectura: hilo?.confirmacionesLectura ?? a.privacidad.confirmacionesLectura,
        vistaPreviaEnlaces: hilo?.vistaPreviaEnlaces ?? a.chats.vistaPreviaEnlaces,
        cargarMultimedia: hilo?.cargarMultimedia ?? a.chats.cargarMultimedia,
        enviarConEnter: a.chats.enviarConEnter,
        fijado: hilo?.fijado ?? false,
        archivado: hilo?.archivado ?? false,
        restringido: hilo?.restringido ?? false,
        vaciadoEn: hilo?.vaciadoEn ?? null,
        apodo: hilo?.apodo ?? null,
    };
}

// ─────────────────────────── Fusión LWW de dos documentos (dispositivos distintos) ───────────────────────────

function ganadorHilo(x: AjustesHilo, y: AjustesHilo): AjustesHilo {
    const tx = Date.parse(x.actualizado ?? "") || 0;
    const ty = Date.parse(y.actualizado ?? "") || 0;
    if (tx !== ty) return tx > ty ? x : y;
    return JSON.stringify(x) <= JSON.stringify(y) ? x : y;
}

function fusionarHilosLWW(x: Record<string, AjustesHilo>, y: Record<string, AjustesHilo>): Record<string, AjustesHilo> {
    const ids = new Set([...Object.keys(x), ...Object.keys(y)]);
    const out: Record<string, AjustesHilo> = {};
    for (const id of ids) {
        const hx = x[id];
        const hy = y[id];
        out[id] = hx && hy ? ganadorHilo(hx, hy) : (hx ?? hy);
    }
    return out;
}

/**
 * Fusiona dos documentos completos de ajustes (típicamente local ↔ nube). Las
 * SECCIONES (chats/privacidad/notificaciones/correos/aurora) se toman EN BLOQUE
 * del documento con `actualizado` más reciente; los HILOS se fusionan uno a uno
 * por su propio `actualizado` (así un cambio de un hilo en un dispositivo no
 * pisa el cambio de OTRO hilo hecho en el otro dispositivo).
 */
export function fusionarDocsAjustes(a: AjustesMensajeria, b: AjustesMensajeria): AjustesMensajeria {
    const ta = Date.parse(a.actualizado) || 0;
    const tb = Date.parse(b.actualizado) || 0;
    let masReciente: AjustesMensajeria;
    if (ta !== tb) masReciente = tb > ta ? b : a;
    else masReciente = JSON.stringify(a) <= JSON.stringify(b) ? a : b;

    return {
        v: 1,
        chats: masReciente.chats,
        privacidad: masReciente.privacidad,
        notificaciones: masReciente.notificaciones,
        correos: masReciente.correos,
        aurora: masReciente.aurora,
        hilos: fusionarHilosLWW(a.hilos, b.hilos),
        actualizado: ta >= tb ? a.actualizado : b.actualizado,
    };
}
