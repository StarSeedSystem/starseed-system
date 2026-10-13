/**
 * MetaGenesis autónoma · firmar órdenes en el SERVIDOR (OPA1011, 2026-10-10). Solo servidor.
 * ─────────────────────────────────────────────────────────────────────────────
 * En modo bus la orden viaja por `relevo_eventos`, que cualquiera con la clave anónima puede
 * escribir: por eso los nodos solo ejecutan órdenes con una firma HMAC-SHA256 válida
 * (`STARSEED_LANZADOR_SECRETO`, el mismo secreto que ya usa el lanzador de la nube). La firma
 * nunca sale del servidor: el navegador manda su sesión, aquí se comprueba que la cuenta es
 * miembro de MetaGenesis (`es_metagenesis()`), se valida la orden con la lista blanca, se limita
 * a 20 por hora y cuenta, y se publica firmada. Sin el secreto en este servidor se dice tal cual
 * (503 con `sinSecreto`): la salida limpia es aplicar la migración de tablas (orden por RLS).
 * Ruta: `src/app/api/metagenesis/orden/route.ts`. Pruebas: `__tests__/remoto-orden-servidor.test.ts`.
 */

import { createHash, createHmac, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
    esAccion,
    esDestino,
    esDestinoPara,
    isoSinMs,
    textoAFirmar,
    validarArgs,
    ACCIONES,
    type ArgsOrden,
    type OrdenFirmada,
    type OrdenSinFirma,
} from "@/lib/metagenesis/remoto-nodos";

export const ORDENES_POR_HORA = 20;

export function firmarOrden(o: Pick<OrdenSinFirma, "accion" | "para" | "t" | "nonce" | "args">, secreto: string): string {
    return createHmac("sha256", secreto).update(textoAFirmar(o), "utf8").digest("hex");
}

export interface DepsOrden {
    verificarUsuario: (token: string) => Promise<{ id: string } | null>;
    /** true/false; null = no se pudo comprobar (nunca se deja pasar por error). */
    esMiembro: (token: string) => Promise<boolean | null>;
    insertarBus: (fila: { quien: string; tipo: string; tarea: null; texto: string; datos: OrdenFirmada }) => Promise<boolean>;
    secreto: string;
    ahora: () => number;
    nonce?: () => string;
}

export interface RespuestaOrden {
    status: number;
    body: { ok: boolean; nonce?: string; error?: string; sinSecreto?: boolean };
}

/** Cuántas órdenes ha mandado cada cuenta en la última hora (memoria del proceso). */
const recientes = new Map<string, number[]>();

export function _reiniciarLimites(): void {
    recientes.clear();
}

export function tokenDeCabecera(valor: string | null | undefined): string | null {
    const m = (valor ?? "").match(/^Bearer\s+([A-Za-z0-9._~+/=-]{20,})$/);
    return m ? m[1] : null;
}

export async function procesarOrden(cuerpo: unknown, token: string | null, deps: DepsOrden): Promise<RespuestaOrden> {
    if (!token) return { status: 401, body: { ok: false, error: "Necesitas iniciar sesión." } };
    const usuario = await deps.verificarUsuario(token).catch(() => null);
    if (!usuario) return { status: 401, body: { ok: false, error: "Tu sesión no es válida: vuelve a entrar." } };
    const miembro = await deps.esMiembro(token).catch(() => null);
    if (miembro === null) return { status: 503, body: { ok: false, error: "No se pudo comprobar tu acceso a MetaGenesis." } };
    if (!miembro) return { status: 403, body: { ok: false, error: "MetaGenesis es solo para desarrolladores de StarSeed OS con permiso." } };

    const c = (cuerpo ?? {}) as { accion?: unknown; para?: unknown; args?: unknown };
    if (!esAccion(c.accion)) return { status: 400, body: { ok: false, error: "Acción no admitida." } };
    const para = c.para === undefined ? "lider" : c.para;
    // esDestinoPara (no esDestino a pelo): desconectar/contenedor NUNCA van a «lider»/«todos»/
    // un medio genérico, solo a un id de nodo — la misma regla que aplica el nodo de Python.
    if (!esDestino(para) || !esDestinoPara(c.accion, para)) return { status: 400, body: { ok: false, error: "Destino no válido." } };
    const args = (c.args ?? {}) as ArgsOrden;
    const mal = validarArgs(c.accion, args);
    if (mal) return { status: 400, body: { ok: false, error: mal } };

    const ahora = deps.ahora();
    const hora = (recientes.get(usuario.id) ?? []).filter((t) => ahora - t < 3600_000);
    if (hora.length >= ORDENES_POR_HORA) {
        return { status: 429, body: { ok: false, error: "Demasiadas órdenes en una hora: espera un poco." } };
    }
    if (!deps.secreto) {
        return {
            status: 503,
            body: {
                ok: false,
                sinSecreto: true,
                error:
                    "Este servidor no puede firmar órdenes todavía. Se arregla aplicando la migración de MetaGenesis (las órdenes van entonces por la base de datos) o poniendo el secreto del lanzador en este servidor.",
            },
        };
    }
    const sinFirma: OrdenSinFirma = {
        v: "1",
        accion: c.accion,
        para,
        t: isoSinMs(ahora),
        nonce: deps.nonce ? deps.nonce() : randomBytes(12).toString("base64url"),
        por: `cuenta:${createHash("sha256").update(usuario.id).digest("hex").slice(0, 10)}`,
        args,
    };
    const orden: OrdenFirmada = { ...sinFirma, firma: firmarOrden(sinFirma, deps.secreto) };
    const ok = await deps
        .insertarBus({ quien: "metagenesis-web", tipo: "mg_orden", tarea: null, texto: `orden ${ACCIONES[c.accion].etiqueta} para ${para}`, datos: orden })
        .catch(() => false);
    if (!ok) return { status: 502, body: { ok: false, error: "No se pudo publicar la orden en el bus." } };
    recientes.set(usuario.id, [...hora, ahora]);
    return { status: 200, body: { ok: true, nonce: orden.nonce } };
}

/** Las dependencias de verdad (Supabase con el token de la persona; secreto del entorno). */
export function depsDeEntorno(): DepsOrden {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    const cliente = (token?: string) =>
        createClient(url, anon, {
            auth: { persistSession: false, autoRefreshToken: false },
            ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
        });
    return {
        verificarUsuario: async (token) => {
            if (!url || !anon) return null;
            const { data, error } = await cliente(token).auth.getUser(token);
            return error || !data.user ? null : { id: data.user.id };
        },
        esMiembro: async (token) => {
            if (!url || !anon) return null;
            const { data, error } = await cliente(token).rpc("es_metagenesis");
            return error ? null : data === true;
        },
        insertarBus: async (fila) => {
            if (!url || !anon) return false;
            const { error } = await cliente().from("relevo_eventos").insert(fila);
            return !error;
        },
        secreto: process.env.STARSEED_LANZADOR_SECRETO ?? "",
        ahora: () => Date.now(),
    };
}
