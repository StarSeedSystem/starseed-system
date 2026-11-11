/**
 * Chat Director de Genesis · feed fusionado (PURO · Ola 1004)
 * ─────────────────────────────────────────────────────────────────────────────
 * Convierte a `MensajeDirector` las fuentes que alimentan el chat del Director:
 * el chat fundido (`director/chat.jsonl`), el canal común (`mando/canal.jsonl`),
 * los eventos del enjambre (`olas/eventos.jsonl`) y la bitácora del relevo
 * (`relevo/bitacora.jsonl`). Lo que no se entienda devuelve null o se ignora:
 * aquí nunca se lanza nada ni se toca disco o red.
 */

import {
    canalDeDirector,
    esDirectorDeConversacion,
    type CanalId,
    type EntregaDirector,
    type EstadoEntrega,
    type MensajeDirector,
    type RolMensaje,
} from "./chat-director-tipos";

function filaOk(fila: unknown): Record<string, unknown> | null {
    if (typeof fila !== "object" || fila === null) return null;
    return fila as Record<string, unknown>;
}

function textoDe(v: unknown): string {
    return typeof v === "string" ? v : "";
}

const TIPOS_EVENTO = new Set([
    "commit", "esperando_aprobacion", "aprobacion", "rechazada",
    "sin_cambios", "proveedor_caido", "arranque",
]);

/** Epoch en segundos: ISO con zona, o «2026-10-03 23:07:42» como hora local. Ilegible → 0. */
export function epochDe(t: string): number {
    if (typeof t !== "string" || t.trim() === "") return 0;
    const local = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(t.trim());
    if (local && !/[zZ]|[+-]\d{2}:\d{2}$/.test(t.trim())) {
        const ms = new Date(
            Number(local[1]), Number(local[2]) - 1, Number(local[3]),
            Number(local[4]), Number(local[5]), Number(local[6] || 0),
        ).getTime();
        return Number.isFinite(ms) ? ms / 1000 : 0;
    }
    const ms = Date.parse(t);
    return Number.isFinite(ms) ? ms / 1000 : 0;
}

/** Panel del Director al que suena un autor: verificador, supervisor, restaurador… */
export function rolDeDirector(quien: string, tipo?: string): string {
    const q = (typeof quien === "string" ? quien : "").toLowerCase();
    // (DIR1111G) Los directores de conversación que no son Claude (Hermes, ChatGPT…) eran «agente».
    if (["director-presidente", "hermes", "chatgpt", "codex", "antigravity"].includes(q)) return "dirección";
    if (["vigia", "vigia-medidores", "vigia-3d", "revision-opus", "director-opus", "verificar"].includes(q)) return "verificador";
    if (["director", "director-orquestacion", "astra"].includes(q) || q.startsWith("claude")) return "supervisor";
    if (["vigilante", "reconstruir", "curar", "desatascador"].includes(q)) return "restaurador";
    if (["guardia", "gobernador", "vigia-consumo", "freno"].includes(q)) return "protector";
    if (["enjambre", "eco", "orquestador", "reparto-nube"].includes(q)) return "procesos";
    if (tipo === "fallo_tests" || tipo === "fallo_tsc") return "pruebas";
    if (q.startsWith("informe") || ["director_suenos", "suenos"].includes(q)) return "informes";
    if (["uso", "consumo", "jev"].includes(q)) return "usos";
    return "agente";
}

/** Fila de `mando/canal.jsonl` ({t, epoch, quien, tipo, texto, tarea?}) → mensaje del feed. */
export function desdeCanal(fila: unknown): MensajeDirector | null {
    const f = filaOk(fila);
    if (!f) return null;
    const quien = textoDe(f.quien);
    const epoch = typeof f.epoch === "number" ? f.epoch : Number.NaN;
    const t = textoDe(f.t);
    if (quien === "" || (!Number.isFinite(epoch) && epochDe(t) === 0)) return null;
    const esAlex = quien.startsWith("alex") || quien === "telegram-puente";
    const tipoFila = textoDe(f.tipo);
    const tipo = tipoFila === "error" || tipoFila === "aviso" ? "aviso" : tipoFila === "hecho" ? "informe" : "mensaje";
    const m: MensajeDirector = {
        id: `cn-${Math.round((Number.isFinite(epoch) ? epoch : epochDe(t)) * 1000)}-${quien}`,
        t: t !== "" ? t : new Date(epoch * 1000).toISOString(),
        de: quien,
        rol: esAlex ? "alex" : "director",
        tipo,
        texto: textoDe(f.texto),
        canal: quien === "telegram-puente" ? "telegram" : "mando",
    };
    const tarea = textoDe(f.tarea);
    if (tarea !== "") m.tarea = tarea;
    return m;
}

/** Fila de `olas/eventos.jsonl` → actualización del enjambre, o null si no interesa. */
export function desdeEvento(fila: unknown): MensajeDirector | null {
    const f = filaOk(fila);
    if (!f) return null;
    const tipo = textoDe(f.tipo);
    const texto = textoDe(f.texto);
    const admitido = TIPOS_EVENTO.has(tipo) || tipo.startsWith("fallo") || texto.startsWith("cola terminada");
    if (!admitido) return null;
    const t = textoDe(f.t);
    const tarea = textoDe(f.tarea);
    const m: MensajeDirector = {
        id: `ev-${t}-${tarea || ""}-${tipo}`,
        t,
        de: "enjambre",
        rol: "agente",
        tipo: "actualizacion",
        texto,
        canal: "mando",
        evento: tipo || (texto.startsWith("cola terminada") ? "cola_terminada" : ""),
    };
    if (tarea !== "") m.tarea = tarea;
    return m;
}

/** Fila de `relevo/bitacora.jsonl` ({t, quien, tipo, texto}) → mensaje del feed. */
export function desdeBitacora(fila: unknown): MensajeDirector | null {
    const f = filaOk(fila);
    if (!f) return null;
    const t = textoDe(f.t);
    const quien = textoDe(f.quien);
    if (t === "" || quien === "") return null;
    const rol: RolMensaje = quien.startsWith("claude") ? "director" : "agente";
    return {
        id: `rb-${t}-${quien}`,
        t,
        de: quien,
        rol,
        tipo: "mensaje",
        texto: textoDe(f.texto),
        canal: "mando",
    };
}

function esEntrega(r: unknown): r is EntregaDirector {
    const f = filaOk(r);
    return !!f && f.tipo === "entrega" && typeof f.de_id === "string" && typeof f.canal === "string"
        && typeof f.estado === "string" && typeof f.t === "string";
}

/** Manda el ÚLTIMO estado de cada (de_id, canal). */
export function plegarEntregas(
    registros: readonly unknown[],
): Record<string, Partial<Record<CanalId, EstadoEntrega>>> {
    const mapa: Record<string, Partial<Record<CanalId, EstadoEntrega>>> = {};
    for (const r of registros) {
        if (!esEntrega(r)) continue;
        const previo = mapa[r.de_id] || (mapa[r.de_id] = {});
        previo[r.canal] = r.estado;
    }
    return mapa;
}

/** (DIR1111G) El `detalle` del ÚLTIMO registro de entrega de cada (de_id, canal), si lo trae. */
export function plegarDetalles(
    registros: readonly unknown[],
): Record<string, Partial<Record<CanalId, string>>> {
    const mapa: Record<string, Partial<Record<CanalId, string>>> = {};
    for (const r of registros) {
        if (!esEntrega(r)) continue;
        const previo = mapa[r.de_id] || (mapa[r.de_id] = {});
        if (typeof r.detalle === "string" && r.detalle !== "") previo[r.canal] = r.detalle;
        else delete previo[r.canal];
    }
    for (const id of Object.keys(mapa)) if (Object.keys(mapa[id] || {}).length === 0) delete mapa[id];
    return mapa;
}

/** Fusión sin duplicados por id (gana el primero) y orden por `epochDe` ascendente, estable. */
export function fusionarFeed(
    ...listas: readonly (readonly MensajeDirector[])[]
): MensajeDirector[] {
    const vistos = new Set<string>();
    const salida: MensajeDirector[] = [];
    for (const lista of listas) {
        for (const m of lista) {
            if (!m || typeof m.id !== "string" || vistos.has(m.id)) continue;
            vistos.add(m.id);
            salida.push(m);
        }
    }
    return salida
        .map((m, i) => ({ m, i }))
        .sort((a, b) => {
            const d = epochDe(a.m.t) - epochDe(b.m.t);
            return d !== 0 ? d : a.i - b.i;
        })
        .map(({ m }) => m);
}

export type FiltroFeed = "todo" | "direccion" | "conversacion" | "informes" | "enjambre" | "usos";

/**
 * (DIR1111G) ¿Es DIRECCIÓN? Lo que se hablan Alex y los directores y los informes clave de
 * los directores, sin el ruido de rutina del enjambre. Decidido con los datos de
 * `chat.jsonl` (2026-11-11): de 15 567 mensajes, 3 eran de Alex y ~600 de directores de
 * conversación (claude-cowork, hermes); el resto eran servicios automáticos que firman
 * «director-…» con rol «director». Y 91 de las últimas respuestas de Hermes contestaban
 * avisos del desatascador (no a Alex): esas tampoco son dirección.
 *
 * Cuenta: (1) todo lo de Alex; (2) todo lo del canal «director-presidente» o marcado como
 * síntesis; (3) lo que publica un director de conversación, salvo una respuesta a algo que
 * se ve y no es de Alex; (4) la respuesta de un modelo por la API a un mensaje de Alex.
 */
export function esDireccion(
    m: MensajeDirector,
    porId: ReadonlyMap<string, MensajeDirector> = new Map(),
): boolean {
    if (!m) return false;
    if (m.rol === "alex") return true;
    if (m.canal === "director-presidente" || m.sintesis === true) return true;
    if (m.tipo === "uso" || m.tipo === "actualizacion") return false;
    const original = m.respondeA ? porId.get(m.respondeA) : undefined;
    if (m.tipo === "respuesta" && original && original.rol !== "alex") return false;
    if (esDirectorDeConversacion(m.de)) return true;
    return m.tipo === "respuesta" && m.rol === "director" && !!original && original.rol === "alex";
}

function indice(mensajes: readonly MensajeDirector[]): Map<string, MensajeDirector> {
    const mapa = new Map<string, MensajeDirector>();
    for (const m of mensajes) if (m && typeof m.id === "string") mapa.set(m.id, m);
    return mapa;
}

/** Recorta el feed por pestaña: dirección, conversación, informes y avisos, enjambre o usos. */
export function filtrarFeed(
    mensajes: readonly MensajeDirector[],
    filtro: FiltroFeed,
): MensajeDirector[] {
    if (filtro === "todo") return [...mensajes];
    if (filtro === "direccion") {
        const porId = indice(mensajes);
        return mensajes.filter((m) => esDireccion(m, porId));
    }
    return mensajes.filter((m) => {
        if (filtro === "conversacion") {
            return m.rol === "alex" || (m.id.startsWith("md-") && (m.tipo === "mensaje" || m.tipo === "respuesta"));
        }
        if (filtro === "informes") return m.tipo === "informe" || m.tipo === "aviso";
        if (filtro === "enjambre") return m.tipo === "actualizacion";
        return m.tipo === "uso";
    });
}

// ── Filtros de cada pestaña (DIR1111G) ─────────────────────────────────────────
// Una fila de chips bajo las pestañas; uno activo por pestaña. Cada opción sale de un
// campo que el feed trae de verdad (autor, canal, tipo, evento, hora) y solo se ofrece
// si deja algo y no lo deja todo igual: un chip sin nada detrás no se pinta.

export const FILTRO_TODOS = "todos";

export interface OpcionFiltro {
    id: string;
    etiqueta: string;
    cuenta: number;
}

const HORA_S = 3600;

/** Medianoche local del día de `ahoraMs`, en segundos. */
function inicioDelDia(ahoraMs: number): number {
    const d = new Date(ahoraMs);
    d.setHours(0, 0, 0, 0);
    return d.getTime() / 1000;
}

const GRUPOS_EVENTO: { id: string; etiqueta: string; prueba: (e: string) => boolean }[] = [
    { id: "fallos", etiqueta: "Fallos", prueba: (e) => e.startsWith("fallo") || e === "rechazada" },
    { id: "commits", etiqueta: "Commits", prueba: (e) => e === "commit" },
    { id: "aprobacion", etiqueta: "Aprobaciones", prueba: (e) => e === "esperando_aprobacion" || e === "aprobacion" },
    { id: "proveedores", etiqueta: "Proveedores caídos", prueba: (e) => e === "proveedor_caido" },
    { id: "colas", etiqueta: "Colas terminadas", prueba: (e) => e === "cola_terminada" },
];

const NOMBRES_CORTOS: Record<string, string> = {
    "claude-cowork": "Claude (Cowork)",
    "claude-mac": "Claude (Mac)",
    hermes: "Hermes",
    chatgpt: "ChatGPT",
    codex: "ChatGPT (Codex)",
    antigravity: "Antigravity",
};

/** Nombre corto de un autor del feed para un chip. */
export function nombreDeAutor(de: string): string {
    if (de === "director-presidente") return "Director presidente";
    if (de === "alex") return "Alex";
    return NOMBRES_CORTOS[de] ?? de;
}

/** Autores de `mensajes` (que cumplan `cumple`) por número de mensajes, de más a menos. */
function autores(mensajes: readonly MensajeDirector[], cumple: (m: MensajeDirector) => boolean): [string, number][] {
    const cuenta = new Map<string, number>();
    for (const m of mensajes) if (cumple(m)) cuenta.set(m.de, (cuenta.get(m.de) ?? 0) + 1);
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** ¿Cumple `m` el filtro `id` de la pestaña? `porId` resuelve a quién contesta cada respuesta. */
function cumpleFiltro(
    m: MensajeDirector,
    id: string,
    ahoraMs: number,
    porId: ReadonlyMap<string, MensajeDirector>,
): boolean {
    if (id === FILTRO_TODOS || id === "") return true;
    if (id === "presidente") {
        return m.canal === "director-presidente" || m.de === "director-presidente"
            || (m.rol === "alex" && (m.canales ?? []).includes("director-presidente"));
    }
    if (id === "sintesis") return m.sintesis === true;
    if (id === "alex") return m.rol === "alex";
    if (id === "sin-enjambre") return m.tipo !== "actualizacion";
    if (id === "t:hora") return epochDe(m.t) >= ahoraMs / 1000 - HORA_S;
    if (id === "t:hoy") return epochDe(m.t) >= inicioDelDia(ahoraMs);
    if (id === "t:7d") return epochDe(m.t) >= ahoraMs / 1000 - 7 * 24 * HORA_S;
    if (id.startsWith("tipo:")) return m.tipo === id.slice(5);
    if (id.startsWith("evento:")) {
        const grupo = GRUPOS_EVENTO.find((g) => g.id === id.slice(7));
        return !!grupo && grupo.prueba(m.evento ?? "");
    }
    if (id.startsWith("director:")) {
        // Un director: lo que dice, lo que contestó como presidente y lo que Alex le escribió.
        const d = id.slice(9);
        if (m.de === d) return true;
        if (m.eleccion && m.eleccion.proveedor === (d === "claude-mac" || d.startsWith("claude") ? "claude" : d)) return true;
        const canal = canalDeDirector(d);
        if (m.rol === "alex" && canal && (m.canales ?? []).includes(canal)) return true;
        if (m.rol === "alex") {
            for (const otro of porId.values()) if (otro.respondeA === m.id && otro.de === d) return true;
        }
        return false;
    }
    if (id.startsWith("de:")) return m.de === id.slice(3);
    return true;
}

/** Aplica el filtro `id` a los mensajes YA recortados por la pestaña. */
export function aplicarFiltro(
    mensajes: readonly MensajeDirector[],
    id: string,
    ahoraMs: number = Date.now(),
): MensajeDirector[] {
    if (!id || id === FILTRO_TODOS) return [...mensajes];
    const porId = indice(mensajes);
    return mensajes.filter((m) => cumpleFiltro(m, id, ahoraMs, porId));
}

/**
 * Los chips de la pestaña para los mensajes que ya muestra: el primero es siempre «Todos».
 * Solo se ofrece un chip que deja algo y no deja lo mismo que «Todos». `activo` se añade
 * aunque hoy no deje nada, para que se vea qué filtro está puesto y se pueda quitar.
 */
export function opcionesDeFiltro(
    pestana: FiltroFeed,
    mensajes: readonly MensajeDirector[],
    ahoraMs: number = Date.now(),
    activo?: string,
): OpcionFiltro[] {
    const total = mensajes.length;
    const porId = indice(mensajes);
    const contar = (id: string) => mensajes.filter((m) => cumpleFiltro(m, id, ahoraMs, porId)).length;
    const candidatas: { id: string; etiqueta: string }[] = [];
    const tiempo = [
        { id: "t:hora", etiqueta: "Última hora" },
        { id: "t:hoy", etiqueta: "Hoy" },
        { id: "t:7d", etiqueta: "7 días" },
    ];
    if (pestana === "todo") {
        candidatas.push({ id: "sin-enjambre", etiqueta: "Sin el enjambre" }, ...tiempo.slice(0, 2));
    } else if (pestana === "direccion") {
        candidatas.push({ id: "presidente", etiqueta: "Director presidente" });
        for (const [de] of autores(mensajes, (m) => esDirectorDeConversacion(m.de) && m.de !== "director-presidente").slice(0, 5)) {
            candidatas.push({ id: `director:${de}`, etiqueta: nombreDeAutor(de) });
        }
        candidatas.push({ id: "sintesis", etiqueta: "Solo síntesis" });
    } else if (pestana === "conversacion") {
        candidatas.push({ id: "alex", etiqueta: "Solo tuyos" });
        for (const [de] of autores(mensajes, (m) => m.rol !== "alex" && m.tipo === "respuesta").slice(0, 4)) {
            candidatas.push({ id: `de:${de}`, etiqueta: nombreDeAutor(de) });
        }
    } else if (pestana === "informes") {
        candidatas.push({ id: "tipo:informe", etiqueta: "Informes" }, { id: "tipo:aviso", etiqueta: "Avisos" });
        for (const [de] of autores(mensajes, () => true).slice(0, 4)) {
            candidatas.push({ id: `de:${de}`, etiqueta: nombreDeAutor(de) });
        }
    } else if (pestana === "enjambre") {
        for (const g of GRUPOS_EVENTO) candidatas.push({ id: `evento:${g.id}`, etiqueta: g.etiqueta });
        candidatas.push(tiempo[0]!);
    } else {
        candidatas.push(tiempo[1]!, tiempo[2]!);
    }
    const salida: OpcionFiltro[] = [{ id: FILTRO_TODOS, etiqueta: pestana === "direccion" ? "Todos los directores" : "Todos", cuenta: total }];
    let cuentaTiempo = -1;
    for (const c of candidatas) {
        const cuenta = contar(c.id);
        // Dos cortes por hora que dejan lo mismo son uno solo («Hoy» = «Última hora»).
        const repetido = c.id.startsWith("t:") && cuenta === cuentaTiempo;
        const util = cuenta > 0 && cuenta < total && !repetido;
        if (util || c.id === activo) salida.push({ ...c, cuenta });
        if (util && c.id.startsWith("t:")) cuentaTiempo = cuenta;
    }
    if (activo && activo !== FILTRO_TODOS && !salida.some((o) => o.id === activo)) {
        salida.push({ id: activo, etiqueta: etiquetaDeFiltro(activo), cuenta: contar(activo) });
    }
    return salida;
}

/** Etiqueta legible de un id de filtro guardado (para el aviso de lista vacía). */
export function etiquetaDeFiltro(id: string): string {
    if (id === "presidente") return "Director presidente";
    if (id === "sintesis") return "Solo síntesis";
    if (id === "alex") return "Solo tuyos";
    if (id === "sin-enjambre") return "Sin el enjambre";
    if (id === "t:hora") return "Última hora";
    if (id === "t:hoy") return "Hoy";
    if (id === "t:7d") return "7 días";
    if (id === "tipo:informe") return "Informes";
    if (id === "tipo:aviso") return "Avisos";
    if (id.startsWith("evento:")) return GRUPOS_EVENTO.find((g) => g.id === id.slice(7))?.etiqueta ?? id;
    if (id.startsWith("director:")) return nombreDeAutor(id.slice(9));
    if (id.startsWith("de:")) return nombreDeAutor(id.slice(3));
    return id;
}
