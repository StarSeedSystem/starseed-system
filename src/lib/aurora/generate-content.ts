"use client";

// src/lib/aurora/generate-content.ts
// ─────────────────────────────────────────────────────────────────────────────
// AURORA GENERATIVA para el Lienzo de Creación (composer de publicaciones).
//
// Wrapper delgado sobre `astrauraChat` (router gratis-primero + failover ya
// existente en `@/ai/astraura/router` — sin claves nuevas, sin infraestructura
// nueva) con system prompts específicos por tipo de contenido: texto de una
// publicación, código ejecutable (modo Código del Creador de Layouts),
// estructura completa de un layout (array de bloques), o el contenido de UN
// bloque individual. Reutilizado por:
//   · el botón global "Generar con Aurora" del composer (modo clásico),
//   · el botón global del Creador de Layouts (genera la estructura completa),
//   · el botón POR BLOQUE del Creador de Layouts (genera/regenera ese bloque),
//   · el Modo Código libre (genera un documento HTML/CSS/JS completo).
//
// Filosofía del repo: nunca lanza; degrada a `{ ok:false, error }` legible.
// ─────────────────────────────────────────────────────────────────────────────

import { astrauraChat } from "@/ai/astraura/router";
import type { ChatMessage } from "@/ai/providers/types";

export type AuroraGenerateKind = "texto" | "codigo" | "layout" | "bloque";

export interface AuroraGenerateInput {
    /** Petición del usuario en lenguaje natural (qué quiere generar). */
    prompt: string;
    /** Tipo de contenido a generar (ajusta el system prompt + el modelo). */
    kind: AuroraGenerateKind;
    /** Contexto adicional libre: tipo de publicación, área, tipo de bloque… */
    context?: string;
    /** Contenido previo, para regenerar/mejorar en vez de partir de cero. */
    previous?: string;
    onStatus?: (status: string) => void;
}

export interface AuroraGenerateResult {
    ok: boolean;
    text?: string;
    error?: string;
}

function systemPromptFor(kind: AuroraGenerateKind, context?: string): string {
    const ctx = context ? `\n\nContexto de la publicación: ${context}` : "";
    switch (kind) {
        case "codigo":
            return (
                "Eres Aurora, el exocórtex de StarSeed OS, generando CÓDIGO para el " +
                "Modo Código del Lienzo de Creación Universal. Devuelve ÚNICAMENTE un " +
                "documento HTML autocontenido y completo (empezando en <!doctype html> " +
                "y terminando en </html>), con el CSS dentro de <style> y el JS dentro " +
                "de <script> — SIN explicaciones, SIN backticks de markdown, SIN texto " +
                "fuera del HTML. El resultado se ejecuta tal cual dentro de un iframe " +
                "sandbox (\"allow-scripts\", origen opaco, sin acceso a cookies/redes " +
                "sensibles). Escribe código profesional, accesible, responsive y con " +
                "buen diseño visual (usa CSS moderno; evita dependencias externas salvo " +
                "que sean imprescindibles y públicas)." + ctx
            );
        case "layout":
            return (
                "Eres Aurora, el exocórtex de StarSeed OS, generando la ESTRUCTURA de " +
                "un layout para el Creador de Layouts del Lienzo de Creación. Devuelve " +
                "ÚNICAMENTE un array JSON válido (sin explicaciones, sin backticks) de " +
                "bloques con esta forma exacta: " +
                '[{"type":"texto|media|codigo|embed|boton|separador|columnas2|columnas3|tarjeta","content":"..."}]. ' +
                '"content" es el texto/HTML/URL de ese bloque según su tipo (para ' +
                '"media"/"embed" usa una URL de ejemplo o una descripción breve si no ' +
                "hay una real). Sé coherente con la intención pedida y con el contexto." + ctx
            );
        case "bloque":
            return (
                "Eres Aurora, el exocórtex de StarSeed OS, generando el CONTENIDO de UN " +
                "bloque dentro de un layout del Lienzo de Creación. Devuelve ÚNICAMENTE " +
                "el contenido de ese bloque (texto, o fragmento de HTML/CSS/JS si el " +
                "bloque es de código), SIN explicaciones y SIN backticks de markdown." + ctx
            );
        case "texto":
        default:
            return (
                "Eres Aurora, el exocórtex de StarSeed OS, ayudando a redactar el " +
                "cuerpo de una publicación en el Lienzo de Creación Universal. Escribe " +
                "en español, tono cercano y claro, listo para publicar (markdown ligero " +
                "si aporta: negrita, listas, títulos). Devuelve ÚNICAMENTE el texto, " +
                "sin explicaciones ni comillas envolventes." + ctx
            );
    }
}

/** Quita un posible envoltorio ```lang ... ``` que el modelo añada pese al prompt. */
function stripCodeFences(text: string): string {
    const trimmed = text.trim();
    const fence = /^```[a-zA-Z0-9]*\n([\s\S]*?)\n?```$/;
    const m = trimmed.match(fence);
    return m ? m[1].trim() : trimmed;
}

/**
 * Genera contenido con Aurora (vía `astrauraChat`, gratis-primero + failover)
 * para el Lienzo de Creación. Nunca lanza: `{ ok:false, error }` legible ante
 * cualquier fallo (sin red, sin fuentes disponibles, respuesta vacía…).
 */
export async function auroraGenerateContent(
    input: AuroraGenerateInput,
): Promise<AuroraGenerateResult> {
    const prompt = (input.prompt || "").trim();
    if (!prompt) return { ok: false, error: "Escribe qué quieres generar." };

    const messages: ChatMessage[] = [
        { role: "system", content: systemPromptFor(input.kind, input.context) },
    ];
    if (input.previous && input.previous.trim()) {
        messages.push({
            role: "user",
            content: `Contenido actual a mejorar/regenerar (parte de aquí si tiene sentido):\n\n${input.previous.slice(0, 6000)}`,
        });
    }
    messages.push({ role: "user", content: prompt });

    try {
        const isCodeLike = input.kind === "codigo" || input.kind === "layout";
        const res = await astrauraChat({
            messages,
            taskHint: isCodeLike ? "code" : "creative",
            temperature: isCodeLike ? 0.4 : 0.75,
            onStatus: input.onStatus,
        });
        const text = (res?.text || "").trim();
        if (!text) return { ok: false, error: "Aurora no devolvió contenido esta vez." };
        return { ok: true, text: stripCodeFences(text) };
    } catch (e: any) {
        return { ok: false, error: e?.message || "No se pudo generar contenido." };
    }
}
