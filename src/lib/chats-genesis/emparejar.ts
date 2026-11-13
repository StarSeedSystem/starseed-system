/**
 * Chats de Genesis · la mitad del aparato al emparejar (contrato GEN1114 §3.3, §3.9 y §8.1).
 *
 * Sin `node:*`. El aparato crea su clave, manda la solicitud a la puerta y enseña el código; Alex lo
 * teclea en la Mac (con la contraseña de administrador). Aquí no se empareja nada: solo se pide y
 * se pregunta. Lo que diga la puerta («emparejado», el nivel) es INFORMATIVO: si mintiera, la
 * primera entrada la rechazaría la Mac.
 *
 * Las dos peticiones van DIRECTAS a la puerta, una vez: nada pasa por la cola local del adaptador
 * (que reintenta los POST a espaldas de la persona).
 */

import type { PuertaA1 } from "@/lib/datos/puerta-a1";
import {
    actualizarEstadoAparato,
    aparatoLocal,
    crearClaveAparato,
    ErrorFirma,
    MAX_NOMBRE_APARATO,
    deB64url,
    spkiDelAparato,
    type AparatoLocal,
} from "./firma-aparato";
import { crearPuertaDirecta, type FetchLike } from "./puerta-chats";

export const RUTA_APARATOS = "/v1/genesis/aparatos";
export const TIEMPO_APARATOS_MS = 10_000;
/** Cada cuánto pregunta el aparato mientras espera a la Mac (§3.3, paso 4). */
export const CONSULTA_CADA_MS = 5_000;
export const MAX_SPKI_BYTES = 200;

export type Plataforma = "navegador" | "app-nativa";

export interface ClienteAparatos {
    solicitar(a: { spki: string; nombre: string; plataforma: Plataforma }): Promise<
        { ok: true; solicitud: number; caduca: string } | { ok: false; estado: number; codigo?: string; error: string }
    >;
    estado(huella: string): Promise<{ estado: string; t: string | null; nivel?: "texto" | "completo" } | null>;
}

export interface OpcionesClienteAparatos {
    puerta?: PuertaA1;
    fetch?: FetchLike;
    /** Pruebas: URL base, sesión y reloj. */
    url?: () => Promise<string | null>;
    sesion?: () => Promise<string | null>;
    ahora?: () => number;
}

const ESTADOS = new Set(["pendiente", "emparejado", "rechazado", "caducada", "revocado", "desconocido"]);

const POR_CODIGO: Record<string, string> = {
    "solicitud-limite": "Ya hay 3 solicitudes pendientes para tu cuenta: espera a que caduquen (15 min) o confírmalas en la Mac",
    "no-miembro": "Tu cuenta no tiene acceso a MetaGenesis",
};

function esObjeto(x: unknown): x is Record<string, unknown> {
    return !!x && typeof x === "object" && !Array.isArray(x);
}

/** ¿Corre dentro de la app nativa (Tauri)? Solo cambia la etiqueta: la clave vive igual en el WebView. */
export function plataformaActual(): Plataforma {
    try {
        const w = globalThis as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
        return w.__TAURI__ || w.__TAURI_INTERNALS__ ? "app-nativa" : "navegador";
    } catch {
        return "navegador";
    }
}

export function crearClienteAparatos(op: OpcionesClienteAparatos = {}): ClienteAparatos {
    const directa = crearPuertaDirecta({ puerta: op.puerta, fetch: op.fetch, url: op.url, sesion: op.sesion, ahora: op.ahora });

    async function solicitar(a: { spki: string; nombre: string; plataforma: Plataforma }) {
        const forma = (error: string) => ({ ok: false as const, estado: 400, codigo: "forma", error });
        if (!esObjeto(a) || typeof a.spki !== "string" || !/^[A-Za-z0-9_-]+$/.test(a.spki)) return forma("Clave pública no válida");
        let largo = 0;
        try {
            largo = deB64url(a.spki).length;
        } catch {
            return forma("Clave pública no válida");
        }
        if (largo < 1 || largo > MAX_SPKI_BYTES) return forma("Clave pública no válida");
        const nombre = typeof a.nombre === "string" ? a.nombre.trim() : "";
        if (!nombre || [...nombre].length > MAX_NOMBRE_APARATO) return forma("Pon un nombre de 1 a 60 caracteres");
        if (a.plataforma !== "navegador" && a.plataforma !== "app-nativa") return forma("Plataforma no válida");
        const d = await directa.destino();
        if ("error" in d) return { ok: false as const, estado: d.estado, error: d.error };
        const r = await directa.pedir(
            `${d.base}${RUTA_APARATOS}/solicitud`,
            {
                method: "POST",
                headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${d.jwt}` },
                body: JSON.stringify({ spki: a.spki, nombre, plataforma: a.plataforma }),
            },
            TIEMPO_APARATOS_MS,
        );
        if ("motivo" in r) {
            return { ok: false as const, estado: 0, error: r.motivo === "tiempo" ? "La puerta del A1 no contestó a tiempo" : "No se pidió: la puerta de datos del A1 no responde" };
        }
        if (r.estado >= 200 && r.estado < 300) {
            const c = esObjeto(r.cuerpo) ? r.cuerpo : {};
            const solicitud = Number(c.solicitud);
            const caduca = typeof c.caduca === "string" && Number.isFinite(Date.parse(c.caduca)) ? c.caduca : null;
            if (Number.isInteger(solicitud) && solicitud > 0 && caduca) return { ok: true as const, solicitud, caduca };
            return { ok: false as const, estado: r.estado, codigo: "sin-id", error: "La puerta contestó sin el número de la solicitud" };
        }
        const t = directa.textoError(r.cuerpo, r.estado);
        const error = (t.codigo && POR_CODIGO[t.codigo]) || t.error;
        return t.codigo ? { ok: false as const, estado: r.estado, codigo: t.codigo, error } : { ok: false as const, estado: r.estado, error };
    }

    async function estado(huella: string) {
        if (typeof huella !== "string" || !/^[0-9a-f]{64}$/.test(huella)) return null;
        const d = await directa.destino();
        if ("error" in d) return null;
        const r = await directa.pedir(
            `${d.base}${RUTA_APARATOS}/estado?huella=${huella}`,
            { method: "GET", headers: { accept: "application/json", authorization: `Bearer ${d.jwt}` } },
            TIEMPO_APARATOS_MS,
        );
        if ("motivo" in r || r.estado < 200 || r.estado >= 300 || !esObjeto(r.cuerpo)) return null;
        const c = r.cuerpo;
        if (typeof c.estado !== "string" || !ESTADOS.has(c.estado)) return null;
        const t = typeof c.t === "string" && Number.isFinite(Date.parse(c.t)) ? c.t : null;
        const fuera: { estado: string; t: string | null; nivel?: "texto" | "completo" } = { estado: c.estado, t };
        if (c.nivel === "texto" || c.nivel === "completo") fuera.nivel = c.nivel;
        return fuera;
    }

    return { solicitar, estado };
}

// ── el recorrido entero, para la tarjeta de emparejar ────────────────────────────────────────

export type ResultadoEmparejar =
    | { ok: true; aparato: AparatoLocal; caduca: string }
    | { ok: false; codigo: string; error: string; aparato: AparatoLocal | null };

/**
 * Pide emparejar ESTE aparato: crea la clave si hace falta (o reutiliza la que espera, de la misma
 * cuenta), manda la solicitud y la deja «pendiente». Nunca toca una clave ya emparejada. Lo llama
 * la tarjeta «Emparejar este aparato» cuando la persona pulsa el botón.
 */
export async function pedirEmparejar(
    cliente: ClienteAparatos,
    a: { nombre: string; cuenta: string; plataforma?: Plataforma; ahora?: number },
): Promise<ResultadoEmparejar> {
    let aparato = await aparatoLocal();
    if (aparato?.estado === "emparejado") return { ok: false, codigo: "ya-emparejado", error: "Este aparato ya está emparejado", aparato };
    let spki: string | null = null;
    const mismaCuenta = aparato && aparato.cuenta.toLowerCase() === String(a.cuenta).trim().toLowerCase();
    try {
        if (aparato && mismaCuenta && aparato.estado !== "revocado") {
            spki = await spkiDelAparato();
        }
        if (!spki) {
            const creada = await crearClaveAparato(a.nombre, a.cuenta);
            aparato = creada.aparato;
            spki = creada.spki;
        }
    } catch (e) {
        const codigo = e instanceof ErrorFirma ? e.codigo : "fallo";
        return { ok: false, codigo, error: e instanceof Error ? e.message : "No se pudo crear la clave", aparato };
    }
    const r = await cliente.solicitar({ spki: spki!, nombre: a.nombre.trim(), plataforma: a.plataforma ?? plataformaActual() });
    if (!r.ok) return { ok: false, codigo: r.codigo ?? `http-${r.estado}`, error: r.error, aparato };
    const desde = new Date(a.ahora ?? Date.now()).toISOString();
    const nuevo = await actualizarEstadoAparato({ estado: "pendiente", solicitud: r.solicitud, desde }, aparato!.huella);
    if (!nuevo) return { ok: false, codigo: "clave-perdida", error: "La clave de este aparato desapareció mientras se pedía", aparato: null };
    return { ok: true, aparato: nuevo, caduca: r.caduca };
}

/**
 * Pregunta a la puerta cómo va y lo guarda. Reglas (la puerta solo informa):
 *  · «emparejado» → emparejado, con el nivel que diga (sin nivel, «texto»);
 *  · «revocado» → revocado;
 *  · «rechazado» o «caducada» → vuelve a «sin emparejar» (la clave se queda para pedir otra vez);
 *  · «desconocido» con la clave ya emparejada NO la baja (la puerta olvida las solicitudes a los 30 días).
 */
export async function consultarEmparejamiento(cliente: ClienteAparatos): Promise<AparatoLocal | null> {
    const a = await aparatoLocal();
    if (!a) return null;
    const r = await cliente.estado(a.huella);
    if (!r) return a;
    switch (r.estado) {
        case "emparejado":
            return (await actualizarEstadoAparato({ estado: "emparejado", nivel: r.nivel === "completo" ? "completo" : "texto", ...(r.t ? { desde: r.t } : {}) }, a.huella)) ?? a;
        case "revocado":
            return (await actualizarEstadoAparato({ estado: "revocado", ...(r.t ? { desde: r.t } : {}) }, a.huella)) ?? a;
        case "rechazado":
        case "caducada":
            return a.estado === "pendiente" ? (await actualizarEstadoAparato({ estado: "sin-emparejar" }, a.huella)) ?? a : a;
        case "desconocido":
            return a.estado === "pendiente" ? (await actualizarEstadoAparato({ estado: "sin-emparejar" }, a.huella)) ?? a : a;
        default:
            return a;
    }
}
