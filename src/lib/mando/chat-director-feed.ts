/**
 * Chat Director del Mando · feed fusionado (PURO · Ola 1004)
 * ─────────────────────────────────────────────────────────────────────────────
 * Convierte a `MensajeDirector` las fuentes que alimentan el chat del Director:
 * el chat fundido (`director/chat.jsonl`), el canal común (`mando/canal.jsonl`),
 * los eventos del enjambre (`olas/eventos.jsonl`) y la bitácora del relevo
 * (`relevo/bitacora.jsonl`). Lo que no se entienda devuelve null o se ignora:
 * aquí nunca se lanza nada ni se toca disco o red.
 */

import type {
    CanalId,
    EntregaDirector,
    EstadoEntrega,
    MensajeDirector,
    RolMensaje,
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
    if (["vigia", "vigia-medidores", "revision-opus", "director-opus", "verificar"].includes(q)) return "verificador";
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

export type FiltroFeed = "todo" | "conversacion" | "informes" | "enjambre" | "usos";

/** Recorta el feed: conversación, informes y avisos, actualizaciones del enjambre o usos. */
export function filtrarFeed(
    mensajes: readonly MensajeDirector[],
    filtro: FiltroFeed,
): MensajeDirector[] {
    if (filtro === "todo") return [...mensajes];
    return mensajes.filter((m) => {
        if (filtro === "conversacion") {
            return m.rol === "alex" || (m.id.startsWith("md-") && (m.tipo === "mensaje" || m.tipo === "respuesta"));
        }
        if (filtro === "informes") return m.tipo === "informe" || m.tipo === "aviso";
        if (filtro === "enjambre") return m.tipo === "actualizacion";
        return m.tipo === "uso";
    });
}
