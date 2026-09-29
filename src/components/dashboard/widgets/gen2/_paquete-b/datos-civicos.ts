"use client";
/**
 * Datos cívicos REALES del paquete B (Ontocracia) — Ola 0929.
 *
 * Fuente: el motor de decisiones del OS (tablas `proposals`, `proposal_votes`, `vote_delegations`,
 * `profiles`), el mismo que usan /network/politics y /decisiones. Cada cargador hace pocas
 * consultas acotadas (≤ 3) y lo comparte la caché del paquete: dos widgets en la misma pestaña
 * leen UNA vez. Los recuentos de aquí son VOCES DIRECTAS (una persona, una voz); el peso delegado
 * y el mérito los sella el servidor al resolver, y así se dice en la interfaz.
 *
 * Todo lo que no es red es PURO y se prueba sin DOM.
 */
import { createClient } from "@/utils/supabase/client";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface OpcionVoto { id: string; etiqueta: string }

export type EstadoPropuesta = "open" | "passed" | "rejected" | "expired" | "executed" | "failed";

export interface PropuestaViva {
    id: string;
    titulo: string;
    descripcion: string | null;
    ambito: string;
    ambitoRef: string | null;
    tipo: string;
    estado: EstadoPropuesta | string;
    /** ms */
    creada: number;
    /** Cierre de la votación (ms) o null si no consta. */
    cierra: number | null;
    resuelta: number | null;
    opciones: OpcionVoto[];
    /** true si es Sí / No / Abstención (sin variantes propias). */
    siNo: boolean;
    /** Voces directas por opción. */
    conteo: Record<string, number>;
    participantes: number;
    miVoto: string | null;
    umbral: number;
    minParticipantes: number;
    urgencia: string;
    /** Opción ganadora sellada por el servidor (propuestas cerradas). */
    ganadora: string | null;
    /** Ejecución del mandato (solo aprobadas/ejecutadas): lo que el Ejecutivo ha hecho con ella. */
    ejecucion: EjecucionMandato | null;
}

export type EstadoMandato = "pendiente" | "en_ejecucion" | "completado";
export interface EjecucionMandato {
    estado: EstadoMandato;
    /** 0-100 */
    progreso: number;
    responsable: string | null;
    informes: number;
    ultimoInforme: number | null;
}

export interface DatosAgora {
    uid: string | null;
    propuestas: PropuestaViva[];
}

export interface PersonaBreve { id: string; nombre: string; handle: string | null; avatar: string | null }

export interface DelegacionViva {
    id: string;
    tema: string;
    temaEtiqueta: string;
    delegado: PersonaBreve;
    creada: number;
    caduca: number;
}

export interface DatosDelegacion {
    uid: string | null;
    dadas: DelegacionViva[];
    /** Voces que otras personas te confían, por tema. */
    recibidas: { tema: string; temaEtiqueta: string; n: number }[];
    totalRecibidas: number;
}

// ── Constantes ───────────────────────────────────────────────────────────────

/** Ámbitos del Área Política (mismo criterio que /network/politics). */
export const AMBITOS_POLITICOS = ["global", "community", "page", "group", "account"] as const;
/** Las consultas judiciales viven en su pestaña: aquí no cuentan como legislación. */
export const TIPOS_JUDICIALES = ["consulta_constitucional", "impugnacion"] as const;

export const OPCIONES_SI_NO: OpcionVoto[] = [
    { id: "yes", etiqueta: "Sí" },
    { id: "no", etiqueta: "No" },
    { id: "abstain", etiqueta: "Abstención" },
];

export const ETIQUETA_ESTADO: Record<EstadoPropuesta, string> = {
    open: "En votación",
    passed: "Aprobada",
    rejected: "Rechazada",
    expired: "Caducada",
    executed: "Ejecutada",
    failed: "Fallida",
};

/** Color por estado (Trinity: esmeralda aprobada, carmesí rechazada, ámbar en ejecución). */
export const COLOR_ESTADO: Record<EstadoPropuesta, string> = {
    open: "#ff5c7a",
    passed: "#10b981",
    rejected: "#dc143c",
    expired: "#64748b",
    executed: "#a78bfa",
    failed: "#f59e0b",
};

const ETIQUETA_AMBITO: Record<string, string> = {
    global: "Global",
    community: "Comunidad",
    page: "Página",
    group: "Grupo",
    account: "Cuenta",
    message: "Mensaje",
};

// ── Puros ────────────────────────────────────────────────────────────────────

const num = (v: unknown, def = 0): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
};
const ms = (iso: unknown): number | null => {
    if (typeof iso !== "string" || !iso) return null;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : null;
};

export function etiquetaAmbito(ambito: string): string {
    return ETIQUETA_AMBITO[ambito] ?? ambito;
}

export function etiquetaEstado(estado: string): string {
    return ETIQUETA_ESTADO[estado as EstadoPropuesta] ?? estado;
}

export function colorEstado(estado: string): string {
    return COLOR_ESTADO[estado as EstadoPropuesta] ?? "#94a3b8";
}

/** Etiqueta legible de un tema de delegación («community:barrio-norte» → «Comunidad · barrio-norte»). */
export function etiquetaTema(tema: string): string {
    const [ambito, ...resto] = String(tema).split(":");
    const ref = resto.join(":");
    const base = ambito === "global" ? "Toda la red" : etiquetaAmbito(ambito);
    return ref ? `${base} · ${ref}` : base;
}

interface FilaPropuesta {
    id: string;
    scope: string;
    scope_ref: string | null;
    title: string | null;
    description: string | null;
    kind: string | null;
    options: unknown;
    params: unknown;
    status: string | null;
    result: unknown;
    created_at: string | null;
    resolved_at?: string | null;
}

interface FilaVoto { proposal_id: string; voter: string; choice: string }

/** Una fila del motor → propuesta viva (con sus voces directas y tu voto). PURO. */
export function normalizarPropuesta(fila: FilaPropuesta, votos: FilaVoto[], uid: string | null): PropuestaViva {
    const opcionesCrudas = Array.isArray(fila.options) ? (fila.options as { id?: unknown; label?: unknown }[]) : [];
    const propias = opcionesCrudas
        .filter((o) => o && typeof o.id === "string" && typeof o.label === "string" && String(o.label).trim())
        .map((o) => ({ id: String(o.id), etiqueta: String(o.label).trim() }));
    const siNo = propias.length === 0;
    const opciones = siNo ? OPCIONES_SI_NO : propias;
    const params = (fila.params && typeof fila.params === "object" ? fila.params : {}) as Record<string, unknown>;
    const resultado = (fila.result && typeof fila.result === "object" ? fila.result : {}) as Record<string, unknown>;
    const creada = ms(fila.created_at) ?? 0;
    const minutos = num(params.votingMinutes, 0);
    const cierra = ms(params.votingEndsAt) ?? (minutos > 0 && creada ? creada + minutos * 60_000 : null);

    const conteo: Record<string, number> = {};
    for (const o of opciones) conteo[o.id] = 0;
    let participantes = 0;
    let miVoto: string | null = null;
    const propios = votos.filter((v) => v.proposal_id === fila.id);
    if (fila.status === "open" || !resultado.tally) {
        for (const v of propios) {
            conteo[v.choice] = (conteo[v.choice] ?? 0) + 1;
            participantes += 1;
        }
    } else {
        const tally = resultado.tally as { counts?: Record<string, unknown>; participants?: unknown };
        for (const [k, n] of Object.entries(tally.counts ?? {})) conteo[k] = num(n);
        participantes = num(tally.participants, propios.length);
    }
    if (uid) miVoto = propios.find((v) => v.voter === uid)?.choice ?? null;

    return {
        id: fila.id,
        titulo: (fila.title ?? "").trim() || "Propuesta sin título",
        descripcion: fila.description?.trim() || null,
        ambito: fila.scope,
        ambitoRef: fila.scope_ref ?? null,
        tipo: fila.kind ?? "decision",
        estado: fila.status ?? "open",
        creada,
        cierra,
        resuelta: ms(fila.resolved_at ?? null),
        opciones,
        siNo,
        conteo,
        participantes,
        miVoto,
        umbral: num(params.threshold, 50),
        minParticipantes: num(params.minParticipants, 1),
        urgencia: typeof params.urgency === "string" ? params.urgency : "normal",
        ganadora: typeof resultado.winningChoice === "string" ? resultado.winningChoice : null,
        ejecucion: ejecucionDe(fila.status ?? "", resultado),
    };
}

/** Estado de ejecución de un mandato (mismo criterio que getExecution del Ejecutivo). PURO. */
export function ejecucionDe(estado: string, resultado: Record<string, unknown>): EjecucionMandato | null {
    if (estado !== "passed" && estado !== "executed") return null;
    const e = (resultado.execution && typeof resultado.execution === "object" ? resultado.execution : {}) as Record<string, unknown>;
    const informes = Array.isArray(e.reports) ? (e.reports as { at?: unknown }[]) : [];
    const ult = informes.map((r) => (typeof r?.at === "string" ? Date.parse(r.at) : NaN)).filter((n) => Number.isFinite(n));
    let est: EstadoMandato = e.status === "en_ejecucion" || e.status === "completado" ? e.status : "pendiente";
    let progreso = typeof e.progress === "number" && Number.isFinite(e.progress) ? Math.max(0, Math.min(100, e.progress)) : 0;
    if (estado === "executed" && est !== "completado") { est = "completado"; progreso = 100; }
    return {
        estado: est,
        progreso,
        responsable: typeof e.responsibleLabel === "string" && e.responsibleLabel.trim() ? e.responsibleLabel.trim() : null,
        informes: informes.length,
        ultimoInforme: ult.length ? Math.max(...ult) : null,
    };
}

export interface TiempoPropuesta {
    /** ms que quedan (0 si cerró). */
    restanteMs: number;
    /** Fracción de la votación que QUEDA (1 recién abierta → 0 al cerrar). */
    fraccion: number;
    /** «2 d 4 h», «3 h», «45 min», «cerrada», «sin plazo». */
    texto: string;
    urgente: boolean;
    abierta: boolean;
}

/** Cuánto le queda a una votación (PURO). */
export function tiempoDe(p: Pick<PropuestaViva, "estado" | "creada" | "cierra">, ahora = Date.now()): TiempoPropuesta {
    const abierta = p.estado === "open";
    if (!abierta) return { restanteMs: 0, fraccion: 0, texto: "cerrada", urgente: false, abierta: false };
    if (!p.cierra) return { restanteMs: Infinity, fraccion: 1, texto: "sin plazo", urgente: false, abierta: true };
    const restante = Math.max(0, p.cierra - ahora);
    const total = Math.max(1, p.cierra - (p.creada || p.cierra - 1));
    const fraccion = Math.max(0, Math.min(1, restante / total));
    return { restanteMs: restante, fraccion, texto: duracionCorta(restante), urgente: restante > 0 && restante < 6 * 3_600_000, abierta: true };
}

/** «2 d 4 h», «5 h», «12 min», «cierra ya». PURO. */
export function duracionCorta(msRestantes: number): string {
    if (!(msRestantes > 0)) return "cierra ya";
    const min = Math.floor(msRestantes / 60_000);
    if (min < 60) return `${Math.max(1, min)} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} h`;
    const d = Math.floor(h / 24);
    const hr = h % 24;
    return hr ? `${d} d ${hr} h` : `${d} d`;
}

/** Abiertas primero (la que antes cierra arriba), luego las resueltas más recientes. PURO. */
export function ordenarAgora(lista: PropuestaViva[]): PropuestaViva[] {
    return [...lista].sort((a, b) => {
        const ao = a.estado === "open" ? 0 : 1, bo = b.estado === "open" ? 0 : 1;
        if (ao !== bo) return ao - bo;
        if (ao === 0) return (a.cierra ?? Infinity) - (b.cierra ?? Infinity);
        return (b.resuelta ?? b.creada) - (a.resuelta ?? a.creada);
    });
}

export interface ResumenCivico {
    abiertas: number;
    porVotar: number;
    votadas: number;
    /** Resueltas en los últimos 30 días, por estado final. */
    aprobadas30: number;
    rechazadas30: number;
    /** Tu participación en las abiertas (0-1) o null si no hay abiertas. */
    participacion: number | null;
    /** La abierta que antes cierra. */
    proxima: PropuestaViva | null;
}

export function resumenCivico(lista: PropuestaViva[], ahora = Date.now()): ResumenCivico {
    const abiertas = lista.filter((p) => p.estado === "open");
    const votadas = abiertas.filter((p) => p.miVoto !== null).length;
    const hace30 = ahora - 30 * 86_400_000;
    const recientes = lista.filter((p) => p.estado !== "open" && (p.resuelta ?? p.creada) >= hace30);
    return {
        abiertas: abiertas.length,
        porVotar: abiertas.length - votadas,
        votadas,
        aprobadas30: recientes.filter((p) => p.estado === "passed" || p.estado === "executed").length,
        rechazadas30: recientes.filter((p) => p.estado === "rejected" || p.estado === "expired" || p.estado === "failed").length,
        participacion: abiertas.length ? votadas / abiertas.length : null,
        proxima: ordenarAgora(abiertas)[0] ?? null,
    };
}

/** Reparto de voces de una propuesta en %, en el orden de sus opciones. PURO. */
export function reparto(p: Pick<PropuestaViva, "opciones" | "conteo">): { id: string; etiqueta: string; n: number; pct: number }[] {
    const total = p.opciones.reduce((s, o) => s + (p.conteo[o.id] ?? 0), 0);
    return p.opciones.map((o) => {
        const n = p.conteo[o.id] ?? 0;
        return { id: o.id, etiqueta: o.etiqueta, n, pct: total ? n / total : 0 };
    });
}

/**
 * La propuesta tal y como queda con tu voto recién emitido (antes de que la red lo confirme):
 * mueve tu voz de la opción anterior a la nueva sin inventar a nadie más. PURO.
 */
export function conVotoLocal(p: PropuestaViva, opcion: string | undefined): PropuestaViva {
    if (!opcion || opcion === p.miVoto || p.estado !== "open") return p;
    const conteo = { ...p.conteo };
    if (p.miVoto) conteo[p.miVoto] = Math.max(0, (conteo[p.miVoto] ?? 0) - 1);
    conteo[opcion] = (conteo[opcion] ?? 0) + 1;
    return { ...p, conteo, miVoto: opcion, participantes: p.miVoto ? p.participantes : p.participantes + 1 };
}

/** Etiqueta de la opción que votaste («Sí», «Opción A»…). */
export function etiquetaOpcion(p: Pick<PropuestaViva, "opciones">, id: string | null): string | null {
    if (!id) return null;
    return p.opciones.find((o) => o.id === id)?.etiqueta ?? id;
}

// ── Red (acotada, tolerante) ─────────────────────────────────────────────────

/** Ágora: las 40 propuestas políticas más recientes + voces de las abiertas + tus votos. */
export async function cargarAgora(uid: string | null): Promise<DatosAgora> {
    const sb = createClient();
    const { data, error } = await sb
        .from("proposals")
        .select("id, scope, scope_ref, title, description, kind, options, params, status, result, created_at, resolved_at")
        .in("scope", AMBITOS_POLITICOS as unknown as string[])
        .order("created_at", { ascending: false })
        .limit(40);
    if (error) throw new Error("No se pudo leer el Ágora ahora mismo.");
    const filas = ((data as FilaPropuesta[] | null) ?? []).filter((f) => !(TIPOS_JUDICIALES as readonly string[]).includes(f.kind ?? ""));
    const abiertas = filas.filter((f) => f.status === "open").map((f) => f.id);
    const cerradas = filas.filter((f) => f.status !== "open").map((f) => f.id);
    let votos: FilaVoto[] = [];
    try {
        const [r1, r2] = await Promise.all([
            abiertas.length
                ? sb.from("proposal_votes").select("proposal_id, voter, choice").in("proposal_id", abiertas).limit(3000)
                : Promise.resolve({ data: [], error: null }),
            uid && cerradas.length
                ? sb.from("proposal_votes").select("proposal_id, voter, choice").eq("voter", uid).in("proposal_id", cerradas).limit(200)
                : Promise.resolve({ data: [], error: null }),
        ]);
        votos = [...(((r1 as { data: FilaVoto[] | null }).data) ?? []), ...(((r2 as { data: FilaVoto[] | null }).data) ?? [])];
    } catch {
        votos = [];
    }
    return { uid, propuestas: ordenarAgora(filas.map((f) => normalizarPropuesta(f, votos, uid))) };
}

interface FilaDelegacion {
    id: string;
    delegator_user: string;
    delegate_user: string;
    topic: string;
    created_at: string | null;
    expires_at: string;
}

/** Delegaciones que has dado (activas) y voces que te confían. Sin sesión → vacío honesto. */
export async function cargarDelegaciones(uid: string | null): Promise<DatosDelegacion> {
    if (!uid) return { uid: null, dadas: [], recibidas: [], totalRecibidas: 0 };
    const sb = createClient();
    const ahoraIso = new Date().toISOString();
    const [dadasR, recibidasR] = await Promise.all([
        sb.from("vote_delegations")
            .select("id, delegator_user, delegate_user, topic, created_at, expires_at")
            .eq("delegator_user", uid).is("revoked_at", null).gt("expires_at", ahoraIso)
            .order("created_at", { ascending: false }).limit(24),
        sb.from("vote_delegations")
            .select("topic")
            .eq("delegate_user", uid).is("revoked_at", null).gt("expires_at", ahoraIso)
            .limit(500),
    ]);
    if (dadasR.error && recibidasR.error) throw new Error("No se pudieron leer tus delegaciones.");
    const dadasFilas = ((dadasR.data as FilaDelegacion[] | null) ?? []).filter((d) => d.delegate_user && d.delegate_user !== uid);
    const ids = Array.from(new Set(dadasFilas.map((d) => d.delegate_user)));
    const perfiles: Record<string, { display_name?: string | null; handle?: string | null; avatar_url?: string | null }> = {};
    if (ids.length) {
        try {
            const { data } = await sb.from("profiles").select("user_id, display_name, handle, avatar_url").in("user_id", ids);
            for (const p of (data as { user_id: string; display_name: string | null; handle: string | null; avatar_url: string | null }[] | null) ?? []) perfiles[p.user_id] = p;
        } catch { /* sin perfiles: se muestra el identificador corto */ }
    }
    const dadas: DelegacionViva[] = dadasFilas.map((d) => {
        const p = perfiles[d.delegate_user];
        return {
            id: d.id,
            tema: d.topic,
            temaEtiqueta: etiquetaTema(d.topic),
            delegado: {
                id: d.delegate_user,
                nombre: p?.display_name?.trim() || (p?.handle ? `@${p.handle}` : `Persona ${d.delegate_user.slice(0, 6)}`),
                handle: p?.handle ?? null,
                avatar: p?.avatar_url ?? null,
            },
            creada: ms(d.created_at) ?? 0,
            caduca: ms(d.expires_at) ?? 0,
        };
    });
    const porTema = new Map<string, number>();
    for (const r of (recibidasR.data as { topic: string }[] | null) ?? []) porTema.set(r.topic, (porTema.get(r.topic) ?? 0) + 1);
    const recibidas = Array.from(porTema.entries()).map(([tema, n]) => ({ tema, temaEtiqueta: etiquetaTema(tema), n })).sort((a, b) => b.n - a.n);
    return { uid, dadas, recibidas, totalRecibidas: recibidas.reduce((s, r) => s + r.n, 0) };
}

/** Fracción de vida que le queda a una delegación (para su anillo) y texto. PURO. */
export function vidaDelegacion(d: Pick<DelegacionViva, "creada" | "caduca">, ahora = Date.now()): { fraccion: number; texto: string } {
    const total = Math.max(1, d.caduca - (d.creada || d.caduca - 1));
    const resta = Math.max(0, d.caduca - ahora);
    return { fraccion: Math.max(0, Math.min(1, resta / total)), texto: duracionCorta(resta) };
}
