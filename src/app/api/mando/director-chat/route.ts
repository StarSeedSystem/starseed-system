/**
 * /api/mando/director-chat · Ola 1004 (solo local: el guardián devuelve 404 fuera)
 * ─────────────────────────────────────────────────────────────────────────────
 * GET `?desde=&limite=` → feed fusionado del Director (`leerFeedDirector`).
 * POST «decir» | «responder» | «reenviar»: publica el mensaje de Alex y, si el
 * modelo va por la API, lo llama con el contexto del proyecto y publica la
 * respuesta; si es un motor (claude-cowork, claude-mac, hermes, chatgpt) deja
 * la entrega «pendiente» para el cartero. Jamás devuelve claves ni rutas.
 */

import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";

import { construirMensajeSistema, type FuenteContexto } from "@/lib/mando/agente-puente";
import {
    leerFeedDirector,
    publicarEntrega,
    publicarMensaje,
    rutaChatDirector,
} from "@/lib/mando/chat-director";
import { historialParaModelo, pedidoDeAccion } from "@/lib/mando/chat-director-respuesta";
import { canalesQueEsperan, motorDe, type MensajeDirector } from "@/lib/mando/chat-director-tipos";
import { guardianMando } from "@/lib/mando/guardian";
import { llamarModelo, partirModelo, type MensajeModelo } from "@/lib/mando/modelos-disponibles";

export const dynamic = "force-dynamic";

const RECORTE_FUENTE = 16000;

export async function GET(req: Request): Promise<Response> {
    const bloqueo = await guardianMando(req);
    if (bloqueo) return bloqueo;
    const url = new URL(req.url);
    const desde = url.searchParams.get("desde") || undefined;
    const limiteCrudo = Number(url.searchParams.get("limite") || 0);
    const limite = Number.isFinite(limiteCrudo) && limiteCrudo > 0 ? limiteCrudo : undefined;
    return Response.json(await leerFeedDirector({ desde, limite }));
}

/** Contexto del proyecto para la dirección; si una fuente falla, se omite. */
async function mensajeSistema(): Promise<string> {
    const fuentes: FuenteContexto[] = [];
    for (const [nombre, ruta] of [
        ["PUENTE-DE-MANDO.md", "PUENTE-DE-MANDO.md"],
        ["memory/orquestacion-economica.md", path.join("memory", "orquestacion-economica.md")],
    ] as const) {
        try {
            const contenido = (await readFile(path.join(process.cwd(), ruta), "utf8")).slice(0, RECORTE_FUENTE);
            if (contenido.trim() !== "") fuentes.push({ nombre, contenido });
        } catch { /* fuente ausente: se sigue sin ella */ }
    }
    return construirMensajeSistema(fuentes);
}

export async function POST(req: Request): Promise<Response> {
    const bloqueo = await guardianMando(req);
    if (bloqueo) return bloqueo;
    let cuerpo: unknown = null;
    try {
        cuerpo = await req.json();
    } catch { /* cuerpo ilegible: lo valida pedidoDeAccion */ }
    const pedido = pedidoDeAccion(cuerpo);
    if ("error" in pedido) return Response.json({ error: pedido.error }, { status: 400 });

    if (pedido.accion === "reenviar") {
        const { mensajes } = await leerFeedDirector({ limite: 500 });
        const original = mensajes.find((m: MensajeDirector) => m.id === pedido.reenviar);
        const carpeta = path.dirname(rutaChatDirector());
        for (const canal of pedido.canales) {
            await publicarEntrega(pedido.reenviar, canal, "pendiente");
            if (original && canalesQueEsperan([canal]).length > 0) {
                const bandeja = path.join(carpeta, "bandeja", `${canal}.jsonl`);
                await appendFile(bandeja, JSON.stringify(original) + "\n", "utf8").catch(() => {});
            }
        }
        return Response.json({ ok: true });
    }

    let texto = pedido.accion === "decir" ? pedido.texto : "";
    let respondeA: string | undefined;
    if (pedido.accion === "responder") {
        const { mensajes } = await leerFeedDirector({ limite: 500 });
        const original = mensajes.find((m: MensajeDirector) => m.id === pedido.respondeA);
        texto = `Responde a: ${(original?.texto || "").slice(0, 200)}`;
        respondeA = pedido.respondeA;
    }

    const modelo = pedido.modelo;
    const motor = motorDe(modelo);
    const pedidos = pedido.accion === "decir" ? pedido.canales : [];
    const canales = motor !== "api" && !pedidos.includes(motor) ? [...pedidos, motor] : pedidos;
    const mensaje = await publicarMensaje({
        de: "alex", rol: "alex", tipo: "mensaje", canal: "mando",
        canales, modelo, texto, ...(respondeA ? { respondeA } : {}),
    });

    if (motor !== "api") {
        await publicarEntrega(mensaje.id, motor, "pendiente");
        return Response.json({ pendiente: true, mensaje });
    }

    const inicio = Date.now();
    try {
        const [{ mensajes }, sistema] = await Promise.all([leerFeedDirector({ limite: 60 }), mensajeSistema()]);
        const turnos: MensajeModelo[] = [
            { rol: "system", texto: sistema },
            ...historialParaModelo(mensajes),
            { rol: "user", texto },
        ];
        const r = await llamarModelo(modelo, turnos, { maxTokens: 2500, timeoutMs: 90000 });
        const respuesta = await publicarMensaje({
            de: r.proveedor || partirModelo(modelo).proveedor,
            rol: "director", tipo: "respuesta", canal: "mando", modelo,
            texto: r.texto, ...(respondeA ? { respondeA } : {}),
            uso: {
                segundos: Math.round((Date.now() - inicio) / 1000),
                ...(r.tokens ? { tokensEntrada: r.tokens.entrada, tokensSalida: r.tokens.salida } : {}),
            },
        });
        return Response.json({ ok: true, mensaje, respuesta });
    } catch (e) {
        const motivo = e instanceof Error ? e.message : "Error desconocido del modelo.";
        await publicarMensaje({
            de: "sistema", rol: "sistema", tipo: "aviso", canal: "mando", modelo,
            texto: `El modelo no pudo responder: ${motivo}`,
        }).catch(() => {});
        return Response.json({ ok: false, error: motivo, mensaje }, { status: 502 });
    }
}
