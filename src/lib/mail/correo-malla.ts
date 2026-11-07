/**
 * Correos por la malla: guardar y reenviar (GRP1107A · 2026-11-07) — PURO.
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Cierra el pendiente «Correos por la malla» de `architecture/datos-por-la-malla.md` §5.
 * Un correo @star.seed (o entre neuronas) que no puede salir por el servidor no se pierde:
 *
 *   1. se guarda CIFRADO en la bandeja de salida de este aparato («guardado»);
 *   2. viaja por la malla (enlace sin internet, red local de la app nativa, malla de la cuenta…)
 *      a la neurona del DESTINATARIO, que lo guarda y acusa («entregado»), y/o a una neurona
 *      VINCULADA DE TU CUENTA que lo guarda y lo sube al servidor cuando tenga internet
 *      («en tránsito»);
 *   3. cuando alguien de la cadena tiene internet, se sube al buzón con su id de malla
 *      (`meta.mallaId`): subirlo dos veces no lo duplica («en el servidor»).
 *
 * Recibos: enviado (salió por un enlace y su app acusó) · en tránsito · entregado · en el servidor.
 * El estado nunca retrocede. A una neurona de OTRA cuenta solo se le entrega si es destinataria;
 * de relevo solo sirven tus propias neuronas (el correo es tuyo). LoRa y el relé no llevan correos.
 * Módulo PURO: sin red, sin DOM, sin `node:*`.
 */

export const CANAL_CORREO_MALLA = "correo-malla";
/** Cuerpo máximo por la malla (cabe holgado en un mensaje de ~64 KiB del transporte). */
export const MAX_CUERPO_CORREO_MALLA = 48_000;
export const MAX_ASUNTO_CORREO_MALLA = 200;
export const MAX_DESTINATARIOS_MALLA = 20;
/** Reintentos: 15 s · 2ⁿ, como mucho cada 10 min. */
export const REINTENTO_BASE_MS = 15_000;
export const REINTENTO_MAX_MS = 10 * 60_000;

export type EstadoCorreoMalla = "guardado" | "en-transito" | "entregado" | "en-servidor";
export type TipoRecibo = "enviado" | "en-transito" | "entregado" | "en-servidor";

const RANGO: Record<EstadoCorreoMalla, number> = { guardado: 0, "en-transito": 1, entregado: 2, "en-servidor": 3 };

/** Por dónde viajó (lo mínimo para la pastilla de vía). */
export interface ViaCorreo {
    medio: string;
    enlaceId?: string;
    etiqueta: string;
    en: number;
}

export interface ReciboCorreo {
    tipo: TipoRecibo;
    /** Destinatario (entregado) o neurona de relevo (en tránsito) que acusa. */
    uid?: string;
    por: string;
    via?: ViaCorreo;
    en: number;
}

export interface CorreoMalla {
    /** Id estable: el mismo en todos los aparatos y en el servidor (`meta.mallaId`). */
    id: string;
    /** «sale»: lo escribí aquí; «entra»: soy destinatario; «relevo»: lo guardo para subirlo. */
    dir: "sale" | "entra" | "relevo";
    de: { uid: string; nombre: string; neurona?: string };
    para: string[];
    paraNombres?: Record<string, string>;
    asunto: string;
    cuerpo: string;
    creado: number;
    estado: EstadoCorreoMalla;
    /** Destinatarios que acusaron «entregado». */
    entregadoA: string[];
    recibos: ReciboCorreo[];
    /** Última vía por la que salió o llegó. */
    via?: ViaCorreo;
    /** Hilo del buzón en el servidor, cuando ya está. */
    hilo?: string;
    intentos: number;
    ultimoIntento?: number;
    aviso?: string;
}

/* ══════════════════════════ Protocolo ══════════════════════════ */

export interface MsgCorreo {
    t: "cm.correo";
    v: 1;
    id: string;
    de: { uid: string; nombre: string; neurona?: string };
    para: string[];
    paraNombres?: Record<string, string>;
    asunto: string;
    cuerpo: string;
    creado: number;
    /** «entrega» al destinatario; «relevo» a una neurona de mi cuenta para que lo suba. */
    modo: "entrega" | "relevo";
}

export interface MsgRecibo {
    t: "cm.recibo";
    v: 1;
    id: string;
    tipo: "en-transito" | "entregado" | "en-servidor";
    uid: string;
    nombre: string;
    hilo?: string;
}

export type MsgCorreoMalla = MsgCorreo | MsgRecibo;

function texto(v: unknown, max: number): string | null {
    if (typeof v !== "string") return null;
    // eslint-disable-next-line no-control-regex
    const limpio = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
    return limpio.length > 0 && limpio.length <= max ? limpio : null;
}

function idValido(v: unknown): v is string {
    return typeof v === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(v);
}

/** Lee lo que llega por la malla. Null si no es del protocolo o está mal formado. Pura. */
export function leerMensajeCorreo(x: unknown): MsgCorreoMalla | null {
    if (!x || typeof x !== "object") return null;
    const o = x as Record<string, unknown>;
    if (o.v !== 1 || !idValido(o.id)) return null;
    if (o.t === "cm.correo") {
        const de = (o.de && typeof o.de === "object" ? o.de : null) as Record<string, unknown> | null;
        const deUid = texto(de?.uid, 80);
        if (!deUid) return null;
        if (!Array.isArray(o.para) || !o.para.length || o.para.length > MAX_DESTINATARIOS_MALLA) return null;
        const para: string[] = [];
        for (const u of o.para) {
            const limpio = texto(u, 80);
            if (!limpio) return null;
            if (!para.includes(limpio)) para.push(limpio);
        }
        const asunto = texto(o.asunto, MAX_ASUNTO_CORREO_MALLA) ?? "(sin asunto)";
        const cuerpo = typeof o.cuerpo === "string" && o.cuerpo.length <= MAX_CUERPO_CORREO_MALLA ? o.cuerpo : null;
        const creado = typeof o.creado === "number" && Number.isFinite(o.creado) ? o.creado : null;
        const modo = o.modo === "entrega" || o.modo === "relevo" ? o.modo : null;
        if (cuerpo === null || creado === null || !modo) return null;
        let paraNombres: Record<string, string> | undefined;
        if (o.paraNombres && typeof o.paraNombres === "object") {
            paraNombres = {};
            for (const u of para) {
                const n = texto((o.paraNombres as Record<string, unknown>)[u], 60);
                if (n) paraNombres[u] = n;
            }
        }
        const neurona = texto(de?.neurona, 80);
        return {
            t: "cm.correo",
            v: 1,
            id: o.id as string,
            de: { uid: deUid, nombre: texto(de?.nombre, 60) ?? "Alguien", ...(neurona ? { neurona } : {}) },
            para,
            ...(paraNombres && Object.keys(paraNombres).length ? { paraNombres } : {}),
            asunto,
            cuerpo,
            creado,
            modo,
        };
    }
    if (o.t === "cm.recibo") {
        const tipo = o.tipo === "en-transito" || o.tipo === "entregado" || o.tipo === "en-servidor" ? o.tipo : null;
        const uid = texto(o.uid, 80);
        if (!tipo || !uid) return null;
        const hilo = texto(o.hilo, 80);
        return { t: "cm.recibo", v: 1, id: o.id as string, tipo, uid, nombre: texto(o.nombre, 60) ?? "Alguien", ...(hilo ? { hilo } : {}) };
    }
    return null;
}

/** El mensaje que sale por la malla para un correo guardado. Pura. */
export function mensajeDeCorreo(c: CorreoMalla, modo: "entrega" | "relevo"): MsgCorreo {
    return {
        t: "cm.correo",
        v: 1,
        id: c.id,
        de: c.de,
        para: c.para,
        ...(c.paraNombres ? { paraNombres: c.paraNombres } : {}),
        asunto: c.asunto,
        cuerpo: c.cuerpo,
        creado: c.creado,
        modo,
    };
}

/* ══════════════════════════ Crear ══════════════════════════ */

/** Un correo nuevo para la bandeja de salida. Recorta y dice si algo no cabe. Pura. */
export function nuevoCorreoMalla(e: {
    id: string;
    de: CorreoMalla["de"];
    para: Array<{ uid: string; nombre?: string }>;
    asunto: string;
    cuerpo: string;
    ahora: number;
}): { ok: true; correo: CorreoMalla } | { ok: false; motivo: string } {
    const para = Array.from(new Set(e.para.map((p) => p.uid).filter((u) => !!u && u !== e.de.uid)));
    if (!para.length) return { ok: false, motivo: "Añade al menos un destinatario." };
    if (para.length > MAX_DESTINATARIOS_MALLA) return { ok: false, motivo: `Por la malla, un correo va a ${MAX_DESTINATARIOS_MALLA} personas como mucho.` };
    if (e.cuerpo.length > MAX_CUERPO_CORREO_MALLA) return { ok: false, motivo: `Por la malla el cuerpo cabe hasta ${MAX_CUERPO_CORREO_MALLA.toLocaleString("es")} caracteres; los adjuntos van por el chat o la pestaña «Neuronas».` };
    if (!idValido(e.id)) return { ok: false, motivo: "Id de correo no válido." };
    const paraNombres: Record<string, string> = {};
    for (const p of e.para) if (p.nombre && para.includes(p.uid)) paraNombres[p.uid] = p.nombre.slice(0, 60);
    return {
        ok: true,
        correo: {
            id: e.id,
            dir: "sale",
            de: e.de,
            para,
            ...(Object.keys(paraNombres).length ? { paraNombres } : {}),
            asunto: (e.asunto.trim() || "(sin asunto)").slice(0, MAX_ASUNTO_CORREO_MALLA),
            cuerpo: e.cuerpo,
            creado: e.ahora,
            estado: "guardado",
            entregadoA: [],
            recibos: [],
            intentos: 0,
        },
    };
}

/* ══════════════════════════ Rutas ══════════════════════════ */

/** Lo mínimo de un `EnlaceDisponible` del transporte universal. */
export interface EnlaceCorreo {
    id: string;
    tipo: string;
    etiqueta: string;
    abierto: boolean;
    /** Cuenta que DICE tener el otro aparato. */
    uid?: string;
    rttMs?: number | null;
}

export type PasoCorreo =
    | { tipo: "servidor" }
    | { tipo: "entrega"; enlaceId: string; etiqueta: string; medio: string; uid: string }
    | { tipo: "relevo"; enlaceId: string; etiqueta: string; medio: string };

export interface RutasCorreo {
    pasos: PasoCorreo[];
    descartados: Array<{ enlaceId?: string; etiqueta?: string; motivo: string }>;
    /** Frase honesta si ahora no sale por ningún sitio (se queda guardado y se reintenta). */
    aviso?: string;
}

/** Medio (para la pastilla) de un tipo de enlace del transporte universal. */
export function medioDeTipo(tipo: string): string {
    if (tipo === "local" || tipo === "nativo") return "local";
    if (tipo === "cuenta" || tipo === "par") return "p2p-internet";
    return tipo;
}

const NO_LLEVAN = new Set(["rele", "lora"]);

function porLatencia(a: EnlaceCorreo, b: EnlaceCorreo): number {
    const ra = typeof a.rttMs === "number" && Number.isFinite(a.rttMs) ? a.rttMs : null;
    const rb = typeof b.rttMs === "number" && Number.isFinite(b.rttMs) ? b.rttMs : null;
    if (ra !== null && rb !== null && ra !== rb) return ra - rb;
    if (ra !== null && rb === null) return -1;
    if (ra === null && rb !== null) return 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * rutasCorreo — por dónde sale ahora un correo guardado. Pura y determinista.
 *  · Con internet y sesión: el servidor (y nada más: es el buzón).
 *  · Sin servidor: a la neurona de cada destinatario que aún no lo tenga (un enlace por persona,
 *    el de menor latencia medida) y, si falta alguien o el buzón aún no lo tiene, a UNA neurona
 *    de tu cuenta de relevo (si ninguna lo tiene ya).
 */
export function rutasCorreo(e: {
    correo: Pick<CorreoMalla, "para" | "entregadoA" | "estado" | "recibos">;
    enlaces: EnlaceCorreo[];
    internet: boolean;
    sesion: boolean;
    miUid: string;
    /**
     * Medios elegidos en «Medio de transmisión» de Correos (null = automático): «correo» es el
     * buzón; «local», «wifi-local», «p2p-internet», «turn», la malla.
     */
    permitidos?: string[] | null;
}): RutasCorreo {
    const c = e.correo;
    if (c.estado === "en-servidor") return { pasos: [], descartados: [] };
    const permitido = (medio: string) =>
        !e.permitidos || e.permitidos.includes(medio) || (medio === "p2p-internet" && (e.permitidos.includes("wifi-local") || e.permitidos.includes("turn")));
    const descartados: RutasCorreo["descartados"] = [];
    if (e.internet && e.sesion) {
        if (permitido("correo")) return { pasos: [{ tipo: "servidor" }], descartados: [] };
        descartados.push({ motivo: "el buzón del servidor no está entre los medios elegidos para Correos" });
    }
    const utiles: EnlaceCorreo[] = [];
    const vistos = new Set<string>();
    for (const l of e.enlaces) {
        if (vistos.has(l.id)) continue;
        vistos.add(l.id);
        if (NO_LLEVAN.has(l.tipo)) {
            descartados.push({ enlaceId: l.id, etiqueta: l.etiqueta, motivo: l.tipo === "lora" ? "LoRa solo lleva mensajes cortos" : "el relé del servidor necesita internet" });
            continue;
        }
        if (!l.abierto) {
            descartados.push({ enlaceId: l.id, etiqueta: l.etiqueta, motivo: "no está abierto ahora" });
            continue;
        }
        if (!l.uid) {
            descartados.push({ enlaceId: l.id, etiqueta: l.etiqueta, motivo: "ese aparato no dice de quién es: un correo no se entrega a ciegas" });
            continue;
        }
        if (!permitido(medioDeTipo(l.tipo))) {
            descartados.push({ enlaceId: l.id, etiqueta: l.etiqueta, motivo: "no está entre los medios elegidos para Correos" });
            continue;
        }
        utiles.push(l);
    }
    utiles.sort(porLatencia);
    const pasos: PasoCorreo[] = [];
    const faltan = c.para.filter((u) => !c.entregadoA.includes(u));
    for (const u of faltan) {
        const l = utiles.find((x) => x.uid === u);
        if (l) pasos.push({ tipo: "entrega", enlaceId: l.id, etiqueta: l.etiqueta, medio: medioDeTipo(l.tipo), uid: u });
    }
    const usados = new Set(pasos.map((p) => (p.tipo === "servidor" ? "" : p.enlaceId)));
    for (const l of utiles) {
        if (usados.has(l.id)) continue;
        if (l.uid !== e.miUid && !c.para.includes(l.uid as string)) descartados.push({ enlaceId: l.id, etiqueta: l.etiqueta, motivo: "es de otra cuenta y no es destinataria: no lleva tu correo" });
    }
    const yaEnRelevo = c.recibos.some((r) => r.tipo === "en-transito");
    const quedanSinEntregar = faltan.some((u) => !pasos.some((p) => p.tipo === "entrega" && p.uid === u));
    if (!yaEnRelevo) {
        const relevo = utiles.find((l) => l.uid === e.miUid);
        if (relevo) pasos.push({ tipo: "relevo", enlaceId: relevo.id, etiqueta: relevo.etiqueta, medio: medioDeTipo(relevo.tipo) });
    }
    let aviso: string | undefined;
    if (!pasos.length && faltan.length > 0) {
        aviso = yaEnRelevo
            ? quedanSinEntregar
                ? "En tránsito: una neurona tuya lo guarda y lo subirá al buzón cuando tenga internet."
                : undefined
            : "Sin internet y sin enlace con la neurona del destinatario ni con otra neurona tuya: queda guardado (cifrado) en este aparato y sale solo en cuanto haya un camino.";
    }
    return { pasos, descartados, ...(aviso ? { aviso } : {}) };
}

/* ══════════════════════════ Recibos y estado ══════════════════════════ */

function subir(actual: EstadoCorreoMalla, nuevo: EstadoCorreoMalla): EstadoCorreoMalla {
    return RANGO[nuevo] > RANGO[actual] ? nuevo : actual;
}

/** Apunta un recibo. El estado nunca retrocede; un recibo repetido no cuenta dos veces. Pura. */
export function aplicarRecibo(c: CorreoMalla, r: ReciboCorreo & { hilo?: string }): CorreoMalla {
    const repetido = c.recibos.some((x) => x.tipo === r.tipo && x.uid === r.uid);
    if (repetido && !(r.tipo === "en-servidor" && r.hilo && !c.hilo)) return c;
    const recibos = repetido ? c.recibos : [...c.recibos, r].slice(-40);
    let entregadoA = c.entregadoA;
    let estado = c.estado;
    if (r.tipo === "entregado" && r.uid && c.para.includes(r.uid) && !entregadoA.includes(r.uid)) {
        entregadoA = [...entregadoA, r.uid];
        if (c.para.every((u) => entregadoA.includes(u))) estado = subir(estado, "entregado");
    } else if (r.tipo === "en-transito") {
        estado = subir(estado, "en-transito");
    } else if (r.tipo === "en-servidor") {
        estado = "en-servidor";
    }
    return {
        ...c,
        recibos,
        entregadoA,
        estado,
        ...(r.via ? { via: r.via } : {}),
        ...(r.tipo === "en-servidor" && r.hilo ? { hilo: r.hilo } : {}),
        ...(estado === "en-servidor" || estado === "entregado" ? { aviso: undefined } : {}),
    };
}

/** ¿Toca volver a intentarlo? (15 s · 2ⁿ, ≤ 10 min; nunca si ya está en el servidor). Pura. */
export function tocaReintento(c: Pick<CorreoMalla, "estado" | "intentos" | "ultimoIntento" | "dir">, ahora: number): boolean {
    if (c.estado === "en-servidor") return false;
    if (c.dir === "entra") return false;
    if (!c.ultimoIntento) return true;
    const espera = Math.min(REINTENTO_MAX_MS, REINTENTO_BASE_MS * 2 ** Math.max(0, c.intentos - 1));
    return ahora - c.ultimoIntento >= espera;
}

/**
 * ¿Qué hago con un correo que llega por la malla? Pura.
 *  · soy destinatario → lo guardo («entra») y acuso «entregado»;
 *  · es mío (otra neurona de mi cuenta) en modo relevo → lo guardo («relevo») y acuso «en tránsito»;
 *  · si no, nada (ni se acusa: no se confirma a extraños que existo).
 * `uidEnlace`: lo que dice el aparato por el que llegó; tiene que ser quien lo firma como remitente
 * (nadie entrega correos en nombre de otro por un enlace ajeno).
 */
export function decidirEntrada(
    msg: MsgCorreo,
    ctx: { miUid: string | null; uidEnlace?: string; yaLoTengo: boolean },
): { accion: "guardar"; dir: "entra" | "relevo"; recibo: MsgRecibo["tipo"] } | { accion: "acusar"; recibo: MsgRecibo["tipo"] } | { accion: "ignorar"; motivo: string } {
    if (!ctx.miUid) return { accion: "ignorar", motivo: "sin cuenta en este aparato" };
    if (!ctx.uidEnlace || ctx.uidEnlace !== msg.de.uid) return { accion: "ignorar", motivo: "el enlace no es del aparato del remitente" };
    if (msg.para.includes(ctx.miUid)) {
        return ctx.yaLoTengo ? { accion: "acusar", recibo: "entregado" } : { accion: "guardar", dir: "entra", recibo: "entregado" };
    }
    if (msg.modo === "relevo" && msg.de.uid === ctx.miUid) {
        return ctx.yaLoTengo ? { accion: "acusar", recibo: "en-transito" } : { accion: "guardar", dir: "relevo", recibo: "en-transito" };
    }
    return { accion: "ignorar", motivo: "no es para esta cuenta" };
}

/** Un correo recibido o de relevo, desde su mensaje. Pura. */
export function correoDesdeMensaje(msg: MsgCorreo, dir: "entra" | "relevo", via: ViaCorreo | undefined, ahora: number): CorreoMalla {
    return {
        id: msg.id,
        dir,
        de: msg.de,
        para: msg.para,
        ...(msg.paraNombres ? { paraNombres: msg.paraNombres } : {}),
        asunto: msg.asunto,
        cuerpo: msg.cuerpo,
        creado: msg.creado,
        estado: dir === "entra" ? "entregado" : "en-transito",
        entregadoA: [],
        recibos: [{ tipo: dir === "entra" ? "entregado" : "en-transito", por: "este aparato", ...(via ? { via } : {}), en: ahora }],
        ...(via ? { via } : {}),
        intentos: 0,
    };
}

/** Quita de la bandeja de la malla los recibidos que ya están en el buzón del servidor. Pura. */
export function fusionarConServidor(locales: CorreoMalla[], mallaIdsServidor: Iterable<string>): CorreoMalla[] {
    const en = new Set(mallaIdsServidor);
    return locales.filter((c) => !(c.dir === "entra" && en.has(c.id)));
}

/* ══════════════════════════ Textos ══════════════════════════ */

function nombreDe(c: CorreoMalla, uid: string): string {
    return c.paraNombres?.[uid] ?? "un destinatario";
}

/** Frase del estado para la tarjeta del correo. Pura. */
export function textoEstadoCorreo(c: CorreoMalla): string {
    if (c.dir === "entra") return c.estado === "en-servidor" ? "También en tu buzón @star.seed" : "Recibido por la malla (guardado cifrado en este aparato)";
    if (c.dir === "relevo") return c.estado === "en-servidor" ? "Subido al buzón @star.seed desde este aparato" : "Lo guarda este aparato para subirlo al buzón en cuanto haya internet";
    switch (c.estado) {
        case "en-servidor":
            return "En el buzón @star.seed";
        case "entregado":
            return c.para.length === 1 ? `Entregado a ${nombreDe(c, c.para[0])} por la malla` : `Entregado por la malla a los ${c.para.length} destinatarios`;
        case "en-transito": {
            const relevo = [...c.recibos].reverse().find((r) => r.tipo === "en-transito");
            const parte = c.entregadoA.length ? ` · entregado a ${c.entregadoA.length} de ${c.para.length}` : "";
            return `En tránsito: lo lleva ${relevo?.por ?? "una neurona tuya"} hasta el buzón${parte}`;
        }
        default:
            return c.entregadoA.length ? `Entregado a ${c.entregadoA.length} de ${c.para.length}; el resto, guardado y esperando camino` : "Guardado cifrado en este aparato · esperando camino";
    }
}

/** Las marcas de recibo en orden (enviado → en tránsito → entregado → en el servidor). Pura. */
export function marcasRecibo(c: CorreoMalla): Array<{ tipo: TipoRecibo; hecho: boolean; texto: string }> {
    const tiene = (t: TipoRecibo) => c.recibos.some((r) => r.tipo === t);
    return [
        { tipo: "enviado", hecho: tiene("enviado") || RANGO[c.estado] > 0 || c.entregadoA.length > 0, texto: "Enviado" },
        { tipo: "en-transito", hecho: tiene("en-transito"), texto: "En tránsito" },
        { tipo: "entregado", hecho: c.estado === "entregado" || c.entregadoA.length > 0 || (c.estado === "en-servidor" && tiene("entregado")), texto: c.entregadoA.length && c.entregadoA.length < c.para.length ? `Entregado (${c.entregadoA.length}/${c.para.length})` : "Entregado" },
        { tipo: "en-servidor", hecho: c.estado === "en-servidor", texto: "En el servidor" },
    ];
}
