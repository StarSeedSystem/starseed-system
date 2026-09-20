import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { raizDelProyecto } from "@/lib/mando/raiz";

export interface MensajeAgente {
    t: string;
    de: string;
    texto: string;
    entregado?: string;
    leido?: string;
}

export function sanearIdAgente(id: string): string {
    const seguro = id.replace(/[^A-Za-z0-9_-]/g, "_").replace(/^_+|_+$/g, "");
    return seguro.length > 0 ? seguro : "sin-id";
}

export function parsearLineasMensajes(contenidoJsonl: string): MensajeAgente[] {
    const salida: MensajeAgente[] = [];
    const lineas = contenidoJsonl.split("\n");
    for (const l of lineas) {
        const trimmed = l.trim();
        if (!trimmed) continue;
        try {
            const m = JSON.parse(trimmed) as Partial<MensajeAgente>;
            if (m && typeof m.texto === "string" && m.texto.trim()) {
                salida.push({
                    t: typeof m.t === "string" ? m.t : new Date().toISOString(),
                    de: typeof m.de === "string" ? m.de : "alex",
                    texto: m.texto.trim().slice(0, 2000),
                    ...(typeof m.entregado === "string" ? { entregado: m.entregado } : {}),
                    ...(typeof m.leido === "string" ? { leido: m.leido } : {}),
                });
            }
        } catch {}
    }
    return salida;
}

export async function leerMensajesAgente(id: string): Promise<MensajeAgente[]> {
    const seguro = sanearIdAgente(id);
    const ruta = path.join(raizDelProyecto(), "starseed_memory_root", "olas", "mensajes", `${seguro}.jsonl`);
    try {
        const contenido = await readFile(ruta, "utf-8");
        return parsearLineasMensajes(contenido);
    } catch {
        return [];
    }
}

export async function guardarMensajeAgente(id: string, texto: string, de = "alex"): Promise<MensajeAgente> {
    const seguro = sanearIdAgente(id);
    const dir = path.join(raizDelProyecto(), "starseed_memory_root", "olas", "mensajes");
    await mkdir(dir, { recursive: true });
    const ruta = path.join(dir, `${seguro}.jsonl`);
    const msgs = await leerMensajesAgente(id);
    const nuevo = crearMensajeObjeto(texto, de);
    msgs.push(nuevo);
    const contenido = msgs.map((m) => JSON.stringify(m)).join("\n") + "\n";
    const tmpRuta = `${ruta}.${Date.now()}.tmp`;
    await writeFile(tmpRuta, contenido, "utf-8");
    await rename(tmpRuta, ruta);
    return nuevo;
}

export function crearMensajeObjeto(texto: string, de = "alex", ahoraIso?: string): MensajeAgente {
    const t = ahoraIso ?? new Date().toISOString();
    return { t, de, texto: texto.trim().slice(0, 2000) };
}

export function formatearEstadoMensaje(m: MensajeAgente): string {
    if (m.leido) return `leído por el agente ${m.leido.slice(11, 16)}`;
    if (m.entregado) return `entregado al worktree ${m.entregado.slice(11, 16)}`;
    return "enviado";
}
