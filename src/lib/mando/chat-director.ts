/**
 * Chat Director de Genesis · lector y escritor del lado del servidor (Ola 1004)
 * ─────────────────────────────────────────────────────────────────────────────
 * Cola de archivo única `starseed_memory_root/mando/director/chat.jsonl`
 * (append-only, una línea JSON por registro), fusión con `canal.jsonl`,
 * `olas/eventos.jsonl` y `relevo/bitacora.jsonl`, y publicación de mensajes y
 * entregas (copia a la bandeja de los canales que no contestan al momento).
 * La lógica pura vive en `chat-director-feed.ts` y `chat-director-tipos.ts`.
 */

import { appendFile, mkdir, open } from "node:fs/promises";
import path from "node:path";

import {
    desdeBitacora,
    desdeCanal,
    desdeEvento,
    epochDe,
    fusionarFeed,
    plegarEntregas,
} from "./chat-director-feed";
import {
    canalesQueEsperan,
    ultimoModeloDirector,
    type CanalId,
    type EstadoEntrega,
    type MensajeDirector,
} from "./chat-director-tipos";
import { raizDelProyecto } from "./raiz";

const MAX_TEXTO = 20000;

/** Patrones que jamás entran en el chat: se tachan antes de escribir. */
const PATRONES_CLAVE: readonly RegExp[] = [
    /\bsk-(?:proj-|or-|ant-)?[A-Za-z0-9_-]{8,}/g,
    /\bgsk_[A-Za-z0-9_-]{8,}/g,
    /\bnvapi-[A-Za-z0-9_-]{8,}/g,
    /\bgh[opsu]_[A-Za-z0-9_]{8,}/g,
    /\bAIza[A-Za-z0-9_-]{20,}/g,
    /\bBearer\s+[A-Za-z0-9._~+/=-]{10,}/gi,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g,
];

function tachar(texto: string): string {
    let salida = texto;
    for (const re of PATRONES_CLAVE) salida = salida.replace(re, "••••");
    return salida;
}

export function rutaChatDirector(): string {
    return path.join(raizDelProyecto(), "starseed_memory_root", "mando", "director", "chat.jsonl");
}

/** Lee solo los últimos `maxBytes` de una cola; descarta la primera línea cortada. */
export async function leerCola(ruta: string, maxBytes = 262144): Promise<string[]> {
    let fh: Awaited<ReturnType<typeof open>> | null = null;
    try {
        fh = await open(ruta, "r");
        const { size } = await fh.stat();
        const inicio = Math.max(0, size - maxBytes);
        const bufer = Buffer.alloc(size - inicio);
        await fh.read(bufer, 0, bufer.length, inicio);
        await fh.close();
        fh = null;
        let texto = bufer.toString("utf8");
        if (inicio > 0) {
            const corte = texto.indexOf("\n");
            texto = corte === -1 ? "" : texto.slice(corte + 1);
        }
        return texto.split("\n").filter((l) => l.trim() !== "");
    } catch {
        if (fh) await fh.close().catch(() => {});
        return [];
    }
}

function parsear(lineas: readonly string[]): unknown[] {
    const out: unknown[] = [];
    for (const l of lineas) {
        try {
            out.push(JSON.parse(l));
        } catch { /* línea rota: se ignora */ }
    }
    return out;
}

/** Feed completo del Director: chat + canal + eventos + bitácora, filtrado y acotado. */
export async function leerFeedDirector(
    opc: { desde?: string; limite?: number } = {},
): Promise<{
    mensajes: MensajeDirector[];
    entregas: ReturnType<typeof plegarEntregas>;
    ultimoModelo: string;
}> {
    const mem = path.join(raizDelProyecto(), "starseed_memory_root");
    const [lChat, lCanal, lEventos, lBitacora] = await Promise.all([
        leerCola(path.join(mem, "mando", "director", "chat.jsonl")),
        leerCola(path.join(mem, "mando", "canal.jsonl")),
        leerCola(path.join(mem, "olas", "eventos.jsonl")),
        leerCola(path.join(mem, "relevo", "bitacora.jsonl")),
    ]);
    const registros = parsear(lChat);
    const mensajesChat = registros.filter(
        (r): r is MensajeDirector =>
            !!r && typeof r === "object" && (r as { tipo?: unknown }).tipo !== "entrega",
    );
    const entregas = plegarEntregas(registros);
    const fusion = fusionarFeed(
        mensajesChat,
        parsear(lCanal).map(desdeCanal).filter((m): m is MensajeDirector => !!m),
        parsear(lEventos).map(desdeEvento).filter((m): m is MensajeDirector => !!m),
        parsear(lBitacora).map(desdeBitacora).filter((m): m is MensajeDirector => !!m),
    );
    const desdeEpoch = opc.desde ? epochDe(opc.desde) : 0;
    const filtrados = desdeEpoch > 0 ? fusion.filter((m) => epochDe(m.t) > desdeEpoch) : fusion;
    const limite = typeof opc.limite === "number" && opc.limite > 0 ? opc.limite : 150;
    return {
        mensajes: filtrados.slice(-limite),
        entregas,
        ultimoModelo: ultimoModeloDirector(fusion),
    };
}

function idNuevo(): string {
    return `md-${Date.now()}-${Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0")}`;
}

/** Publica un mensaje y deja copia en la bandeja de los canales que no contestan al momento. */
export async function publicarMensaje(
    m: Omit<MensajeDirector, "id" | "t"> & Partial<Pick<MensajeDirector, "id" | "t">>,
): Promise<MensajeDirector> {
    const t = typeof m.t === "string" && m.t !== "" ? m.t : new Date().toISOString();
    const mensaje: MensajeDirector = {
        ...m,
        id: typeof m.id === "string" && m.id !== "" ? m.id : idNuevo(),
        t,
        texto: tachar(m.texto || "").slice(0, MAX_TEXTO),
    };
    const ruta = rutaChatDirector();
    const carpeta = path.dirname(ruta);
    await mkdir(carpeta, { recursive: true });
    await appendFile(ruta, JSON.stringify(mensaje) + "\n", "utf8");
    for (const canal of canalesQueEsperan(mensaje.canales || [])) {
        const bandeja = path.join(carpeta, "bandeja", `${canal}.jsonl`);
        await mkdir(path.dirname(bandeja), { recursive: true });
        await appendFile(bandeja, JSON.stringify(mensaje) + "\n", "utf8");
        await publicarEntrega(mensaje.id, canal, "pendiente");
    }
    return mensaje;
}

/** Anota el estado de entrega de un mensaje en un canal (manda el último). */
export async function publicarEntrega(
    de_id: string,
    canal: CanalId,
    estado: EstadoEntrega,
    detalle?: string,
): Promise<void> {
    const ruta = rutaChatDirector();
    await mkdir(path.dirname(ruta), { recursive: true });
    const registro: Record<string, unknown> = {
        tipo: "entrega", de_id, canal, estado, t: new Date().toISOString(),
    };
    if (typeof detalle === "string" && detalle !== "") registro.detalle = tachar(detalle);
    await appendFile(ruta, JSON.stringify(registro) + "\n", "utf8");
}
