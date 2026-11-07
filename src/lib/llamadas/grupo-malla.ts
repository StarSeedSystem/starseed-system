/**
 * Llamadas de GRUPO sin internet: malla completa de WebRTC (GRP1107A · 2026-11-07) — PURO.
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Cierra el pendiente «Llamadas de grupo sin internet» de `architecture/datos-por-la-malla.md` §5.
 * Sin servidor no hay sesión ni canal común: cada PAR de aparatos se señaliza por SU enlace sin
 * internet (emparejado por código/QR o abierto solo entre dos apps nativas: `local:nativo-…`).
 * Si todos tienen enlace con todos, `MotorLlamada` (con `canalesDirectos`, `iceServers: []` y sin
 * `tema`) teje la malla completa: una RTCPeerConnection por cada otra persona, como siempre.
 *
 *  · `planGrupoMalla`   a quién suena (enlaces abiertos con aparatos de miembros del chat), quién
 *                       se queda fuera y por qué, tope de aparatos y si va con vídeo o solo voz;
 *  · `decidirMediosGrupo` degradación honesta: con más de `MAX_VIDEO_GRUPO_MALLA` aparatos o un
 *                       enlace que mide menos de lo que pide el vídeo, solo voz (y se dice);
 *  · protocolo del timbre por el enlace (`llg.inv` · `llg.res` · `llg.fin`) y su validación;
 *  · `paresSinEnlace`   qué parejas no se verán (sin enlace entre ellas): se dice, no se inventa.
 *
 * `uid` de un enlace es lo que DICE el otro aparato: sirve para enrutar, nunca para dar permisos.
 * Un aparato que no dice de quién es no recibe la invitación de un grupo.
 * Módulo PURO: sin red, sin DOM, sin `node:*`.
 */

/** Aparatos en una llamada de grupo sin servidor, contándome (cada uno manda su audio a todos). */
export const MAX_GRUPO_MALLA = 6;
/** Con más aparatos que estos, solo voz (cada uno subiría N−1 vídeos a la vez). */
export const MAX_VIDEO_GRUPO_MALLA = 4;
/** Lo que pide cada par con vídeo (vídeo ~640p + voz, en un sentido). */
export const KBPS_VIDEO_POR_PAR = 700;
/** Lo que pide la voz (Opus) por par: por debajo se avisa de que puede cortarse. */
export const KBPS_VOZ_POR_PAR = 64;
/** Prefijo de la sala de una llamada de grupo sin servidor (nunca es un uuid de sesión). */
export const PREFIJO_SALA_MALLA = "malla-grupo:";
/** Tiempo que suena la invitación en el otro aparato. */
export const ESPERA_INVITACION_MS = 45_000;
/** Una invitación más vieja que esto no suena (relojes desajustados: margen hacia delante). */
export const FRESCURA_INVITACION_MS = 120_000;
const ADELANTO_MAX_MS = 30_000;
const MAX_MIEMBROS_INVITACION = 64;

/** Lo mínimo de un enlace local vivo para decidir (sin funciones: se prueba sin navegador). */
export interface EnlaceGrupo {
    id: string;
    nombre: string;
    abierto: boolean;
    /** Cuenta que DICE tener el otro aparato. */
    uid?: string;
    /** Capacidad de salida medida (kbps); null/undefined = sin medir. */
    capacidadKbps?: number | null;
    rttMs?: number | null;
}

export interface InvitadoGrupo {
    enlaceId: string;
    uid: string;
    nombre: string;
}

export interface FueraGrupo {
    uid?: string;
    enlaceId?: string;
    nombre?: string;
    motivo: string;
}

export interface DecisionMediosGrupo {
    video: boolean;
    /** Por qué va solo con voz (si se pidió vídeo y no se puede). */
    motivo?: string;
    /** Avisos que no cambian la decisión (voz justa, capacidades sin medir). */
    avisos: string[];
}

export interface PlanGrupoMalla {
    ok: boolean;
    invitados: InvitadoGrupo[];
    fuera: FueraGrupo[];
    video: boolean;
    motivoMedios?: string;
    avisos: string[];
    /** Frase de la vía: «Mesh · Sin internet · malla completa · 3 aparatos · solo voz». */
    texto: string;
    /** Frase honesta cuando no hay a quién llamar. */
    aviso?: string;
}

function medida(n: number | null | undefined): number | null {
    return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Con vídeo o solo voz. `aparatos` cuenta el mío. `enlaces`: los de la llamada con su capacidad
 * medida (los sin medir no bajan a voz, pero se dice que no se midieron). Pura.
 */
export function decidirMediosGrupo(
    pedido: "audio" | "video",
    aparatos: number,
    enlaces: Array<Pick<EnlaceGrupo, "nombre" | "capacidadKbps">>,
): DecisionMediosGrupo {
    const avisos: string[] = [];
    for (const e of enlaces) {
        const c = medida(e.capacidadKbps);
        if (c !== null && c < KBPS_VOZ_POR_PAR) avisos.push(`El enlace con ${e.nombre} mide ${Math.round(c)} kbps: la voz puede cortarse.`);
    }
    if (pedido === "audio") return { video: false, avisos };
    if (aparatos > MAX_VIDEO_GRUPO_MALLA) {
        return {
            video: false,
            motivo: `Sois ${aparatos} aparatos: sin servidor cada uno manda su vídeo a todos los demás; con más de ${MAX_VIDEO_GRUPO_MALLA}, solo voz.`,
            avisos,
        };
    }
    const justo = enlaces.find((e) => {
        const c = medida(e.capacidadKbps);
        return c !== null && c < KBPS_VIDEO_POR_PAR;
    });
    if (justo) {
        return {
            video: false,
            motivo: `El enlace con ${justo.nombre} mide ${Math.round(medida(justo.capacidadKbps) ?? 0)} kbps y el vídeo pide unos ${KBPS_VIDEO_POR_PAR} por persona: solo voz.`,
            avisos,
        };
    }
    const sinMedir = enlaces.filter((e) => medida(e.capacidadKbps) === null).map((e) => e.nombre);
    if (sinMedir.length) avisos.push(`Capacidad sin medir con ${sinMedir.join(", ")}: si el vídeo se congela, apágalo.`);
    return { video: true, avisos };
}

/** «Mesh · Sin internet · malla completa · 3 aparatos · solo voz». Pura. */
export function textoViaGrupo(aparatos: number, video: boolean): string {
    return `Mesh · Sin internet · malla completa · ${aparatos} ${aparatos === 1 ? "aparato" : "aparatos"} · ${video ? "voz y vídeo" : "solo voz"}`;
}

function compararEnlace(a: EnlaceGrupo, b: EnlaceGrupo): number {
    const ra = medida(a.rttMs);
    const rb = medida(b.rttMs);
    if (ra !== null && rb !== null && ra !== rb) return ra - rb;
    if (ra !== null && rb === null) return -1;
    if (ra === null && rb !== null) return 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * planGrupoMalla — a quién suena una llamada de grupo sin servidor. Pura y determinista.
 * Suena en cada enlace ABIERTO con un aparato que dice ser de un miembro del chat (también los
 * otros aparatos de mi cuenta, como un teléfono que suena en todos). Hasta `MAX_GRUPO_MALLA − 1`.
 */
export function planGrupoMalla(e: {
    miembros: string[];
    miUid: string | null;
    enlaces: EnlaceGrupo[];
    pedido: "audio" | "video";
}): PlanGrupoMalla {
    const miembros = new Set(e.miembros.filter(Boolean));
    if (e.miUid) miembros.add(e.miUid);
    const fuera: FueraGrupo[] = [];
    const candidatos: EnlaceGrupo[] = [];
    const vistos = new Set<string>();
    for (const l of e.enlaces) {
        if (vistos.has(l.id)) continue;
        vistos.add(l.id);
        if (!l.abierto) {
            fuera.push({ enlaceId: l.id, nombre: l.nombre, ...(l.uid ? { uid: l.uid } : {}), motivo: "el enlace ya no está abierto" });
            continue;
        }
        if (!l.uid) {
            fuera.push({ enlaceId: l.id, nombre: l.nombre, motivo: "ese aparato no dice de quién es: no se le invita a un grupo" });
            continue;
        }
        if (!miembros.has(l.uid)) {
            fuera.push({ enlaceId: l.id, nombre: l.nombre, uid: l.uid, motivo: "ese aparato es de alguien que no está en este chat" });
            continue;
        }
        candidatos.push(l);
    }
    candidatos.sort(compararEnlace);
    const cupo = MAX_GRUPO_MALLA - 1;
    const elegidos = candidatos.slice(0, cupo);
    for (const l of candidatos.slice(cupo)) {
        fuera.push({ enlaceId: l.id, nombre: l.nombre, uid: l.uid, motivo: `sin servidor la llamada admite ${MAX_GRUPO_MALLA} aparatos a la vez` });
    }
    // Quien tiene enlace pero no cupo ya está dicho arriba; aquí, solo quien no tiene ninguno.
    const conEnlace = new Set(candidatos.map((l) => l.uid as string));
    const otros = Array.from(miembros).filter((u) => u !== e.miUid).sort();
    for (const u of otros) {
        if (!conEnlace.has(u)) fuera.push({ uid: u, motivo: "no hay enlace sin internet con su aparato (vinculadlos con «Vincular sin internet»)" });
    }
    const invitados: InvitadoGrupo[] = elegidos.map((l) => ({ enlaceId: l.id, uid: l.uid as string, nombre: l.nombre }));
    const aparatos = invitados.length + 1;
    const medios = decidirMediosGrupo(e.pedido, aparatos, elegidos);
    if (!invitados.length) {
        return {
            ok: false,
            invitados,
            fuera,
            video: false,
            avisos: medios.avisos,
            texto: "",
            aviso: "una llamada de grupo sin servidor va por los enlaces sin internet con los aparatos de cada miembro, y no hay ninguno abierto: vinculadlos con «Vincular sin internet» (entre apps nativas vinculadas en la misma red se abre solo).",
        };
    }
    return {
        ok: true,
        invitados,
        fuera,
        video: medios.video,
        ...(medios.motivo ? { motivoMedios: medios.motivo } : {}),
        avisos: medios.avisos,
        texto: textoViaGrupo(aparatos, medios.video),
    };
}

/* ══════════════════════════ Sala ══════════════════════════ */

/** Sala de la llamada (la comparten todos: el canal de cada enlace filtra por ella). Pura. */
export function salaGrupoMalla(hiloId: string, aleatorio: string): string {
    const h = hiloId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60) || "chat";
    const a = aleatorio.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || "0";
    return `${PREFIJO_SALA_MALLA}${h}:${a}`;
}

export function esSalaGrupoMalla(s: unknown): s is string {
    return typeof s === "string" && s.startsWith(PREFIJO_SALA_MALLA) && s.length <= 120 && /^[A-Za-z0-9_:-]+$/.test(s);
}

/* ══════════════════════════ Protocolo del timbre por el enlace ══════════════════════════ */

export interface InvitacionGrupo {
    t: "llg.inv";
    v: 1;
    /** Sala. */
    s: string;
    /** Hilo del chat (para abrirlo y para sus ajustes). */
    h: string;
    tc: "dm" | "grupo";
    tipo: "audio" | "video";
    video: boolean;
    de: { uid: string; nombre: string };
    miembros: string[];
    titulo?: string;
    ts: number;
}

export interface RespuestaGrupo {
    t: "llg.res";
    v: 1;
    s: string;
    si: boolean;
    de: { uid: string; nombre: string };
    /** Miembros con los que este aparato tiene enlace abierto (para decir qué parejas no se verán). */
    alcanza: string[];
    motivo?: string;
}

export interface FinGrupo {
    t: "llg.fin";
    v: 1;
    s: string;
    de: { uid: string };
}

export type MensajeGrupo = InvitacionGrupo | RespuestaGrupo | FinGrupo;

function texto(v: unknown, max: number): string | null {
    if (typeof v !== "string") return null;
    // eslint-disable-next-line no-control-regex
    const limpio = v.replace(/[\u0000-\u001f\u007f]/g, "").trim();
    return limpio.length > 0 && limpio.length <= max ? limpio : null;
}

function listaUids(v: unknown): string[] | null {
    if (!Array.isArray(v) || v.length > MAX_MIEMBROS_INVITACION) return null;
    const out: string[] = [];
    for (const x of v) {
        const u = texto(x, 80);
        if (!u) return null;
        if (!out.includes(u)) out.push(u);
    }
    return out;
}

/**
 * Lee lo que llega por un enlace (texto o ya parseado). Null si no es del protocolo o está mal
 * formado. Una invitación vieja (o del futuro lejano) no vale. Pura.
 */
export function leerMensajeGrupo(data: unknown, ahora: number): MensajeGrupo | null {
    let o: unknown = data;
    if (typeof data === "string") {
        if (!data.startsWith('{"t":"llg.')) return null;
        try {
            o = JSON.parse(data);
        } catch {
            return null;
        }
    }
    if (!o || typeof o !== "object") return null;
    const m = o as Record<string, unknown>;
    if (m.v !== 1 || !esSalaGrupoMalla(m.s)) return null;
    const de = (m.de && typeof m.de === "object" ? m.de : null) as Record<string, unknown> | null;
    const deUid = texto(de?.uid, 80);
    if (!deUid) return null;
    if (m.t === "llg.inv") {
        const h = texto(m.h, 80);
        const tipo = m.tipo === "audio" || m.tipo === "video" ? m.tipo : null;
        const tc = m.tc === "dm" || m.tc === "grupo" ? m.tc : null;
        const miembros = listaUids(m.miembros);
        const ts = typeof m.ts === "number" && Number.isFinite(m.ts) ? m.ts : null;
        if (!h || !tipo || !tc || !miembros || ts === null) return null;
        if (ahora - ts > FRESCURA_INVITACION_MS || ts - ahora > ADELANTO_MAX_MS) return null;
        const titulo = texto(m.titulo, 80);
        return {
            t: "llg.inv",
            v: 1,
            s: m.s,
            h,
            tc,
            tipo,
            video: tipo === "video" && m.video === true,
            de: { uid: deUid, nombre: texto(de?.nombre, 60) ?? "Alguien" },
            miembros,
            ...(titulo ? { titulo } : {}),
            ts,
        };
    }
    if (m.t === "llg.res") {
        const alcanza = listaUids(m.alcanza ?? []);
        if (!alcanza || typeof m.si !== "boolean") return null;
        const motivo = texto(m.motivo, 200);
        return { t: "llg.res", v: 1, s: m.s, si: m.si, de: { uid: deUid, nombre: texto(de?.nombre, 60) ?? "Alguien" }, alcanza, ...(motivo ? { motivo } : {}) };
    }
    if (m.t === "llg.fin") return { t: "llg.fin", v: 1, s: m.s, de: { uid: deUid } };
    return null;
}

/**
 * ¿Suena esta invitación aquí? Solo si soy miembro, quien llama es miembro y el enlace por el que
 * llegó DICE ser de quien llama (nadie llama en nombre de otro por un enlace ajeno). Pura.
 */
export function admitirInvitacion(inv: InvitacionGrupo, ctx: { miUid: string | null; uidEnlace?: string; enLlamada: boolean }): { ok: true } | { ok: false; motivo: string } {
    if (!ctx.miUid) return { ok: false, motivo: "sin cuenta en este aparato" };
    if (!inv.miembros.includes(ctx.miUid)) return { ok: false, motivo: "no estás entre los miembros de esa llamada" };
    if (!inv.miembros.includes(inv.de.uid)) return { ok: false, motivo: "quien llama no está entre los miembros" };
    if (!ctx.uidEnlace || ctx.uidEnlace !== inv.de.uid) return { ok: false, motivo: "el enlace no es del aparato de quien llama" };
    if (ctx.enLlamada) return { ok: false, motivo: "ya estás en otra llamada" };
    return { ok: true };
}

/**
 * Parejas de participantes que NO tienen enlace entre sí (no se verán ni oirán entre ellas).
 * `alcanza` de cada uno: miembros con los que tiene enlace abierto (de su `llg.res`, o los míos).
 * Una pareja cuenta como enlazada si cualquiera de los dos dice alcanzar al otro. Pura.
 */
export function paresSinEnlace(participantes: Array<{ uid: string; nombre: string; alcanza: string[] }>): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    const lista = [...participantes].sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
    for (let i = 0; i < lista.length; i += 1) {
        for (let j = i + 1; j < lista.length; j += 1) {
            const a = lista[i];
            const b = lista[j];
            if (a.uid === b.uid) continue;
            if (!a.alcanza.includes(b.uid) && !b.alcanza.includes(a.uid)) out.push([a.nombre, b.nombre]);
        }
    }
    return out;
}

/** «Ana y Luis no tienen enlace sin internet entre sí: no se oirán entre ellos.» Pura. */
export function avisoParesSinEnlace(pares: Array<[string, string]>): string | null {
    if (!pares.length) return null;
    const frases = pares.slice(0, 3).map(([a, b]) => `${a} y ${b}`);
    const resto = pares.length > 3 ? ` (y ${pares.length - 3} parejas más)` : "";
    return `${frases.join(", ")}${resto} no tienen enlace sin internet entre sí: no se oirán entre ellos (vinculadlos con «Vincular sin internet»).`;
}
