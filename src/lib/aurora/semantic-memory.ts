"use client";

import { type AiMessage } from "@/lib/aurora/conversations";
import { categorizeEntries } from "@/lib/aurora/chat-auto-categorize";
import { auroraGenerateContent } from "@/lib/aurora/generate-content";
import { createMemory } from "@/lib/memory-vault";
import { listBrains, saveBrain } from "@/lib/brains/brains";

/**
 * Cache local para evitar extracciones duplicadas de la misma conversación en la misma sesión.
 * Guardamos el último timestamp procesado para un convId.
 */
const processedMap = new Map<string, number>();

/**
 * Evalúa un segmento de conversación y, si tiene suficiente sustancia,
 * extrae una "Memoria Semántica" (resumen y temas), la guarda en la
 * bóveda de memorias local, y la asigna inteligentemente al Cerebro correspondiente.
 * 
 * @param convId ID único de la conversación unificada
 * @param messages Array de mensajes de la conversación
 */
export async function extractSemanticMemory(convId: string, messages: AiMessage[]): Promise<void> {
    if (!messages || messages.length === 0) return;

    // Solo extraemos si hay un mínimo de intercambios sustanciales.
    // Filtrar por mensajes de usuario para asegurar que hay input humano.
    const userMessages = messages.filter(m => m.role === "user");
    if (userMessages.length < 5) return; // Umbral inicial

    const lastMsgTs = messages[messages.length - 1].ts;
    const lastProcessed = processedMap.get(convId) || 0;
    
    // Si ya procesamos recientemente, evitamos sobrecargar (ej. debounce de 1 hora de mensajes)
    if (lastMsgTs - lastProcessed < 1000 * 60 * 60) return;

    processedMap.set(convId, lastMsgTs);

    try {
        // 1. Categorización heurística rápida (Categoría principal y Título)
        const entries = messages.map(m => ({ role: m.role === "user" ? "user" : "aurora", text: m.text }));
        const categoryResult = categorizeEntries(entries);
        const { category, title } = categoryResult;

        // 2. Extracción Semántica Profunda (LLM)
        // Pedimos a la IA que sintetice la conversación en formato Markdown.
        // Limitamos los mensajes a los últimos 20 para no saturar el prompt.
        const recentMessages = messages.slice(-20);
        const conversationText = recentMessages.map(m => `${m.role === "user" ? "Tú" : "Aurora"}: ${m.text}`).join("\n\n");
        const prompt = `Analiza la siguiente conversación y extrae una "Memoria Semántica" concisa.\n` +
                       `Escribe un párrafo resumiendo el contexto, los datos importantes mencionados, ` +
                       `y las preferencias o decisiones que el usuario haya establecido.\n` +
                       `Formato esperado: Markdown ligero.\n\nConversación:\n${conversationText}`;

        const res = await auroraGenerateContent({
            kind: "texto",
            prompt,
            context: "Extracción automática de recuerdos a largo plazo de la conversación en segundo plano."
        });

        if (!res.ok || !res.text) {
            console.warn("[SemanticMemory] Falló la extracción LLM:", res.error);
            return;
        }

        const summary = res.text;

        // 3. Crear el Documento de Memoria Local (Memory Vault)
        const doc = createMemory({
            name: title || `Memoria de Chat (${category})`,
            category: category, // ej. 'sistema', 'educacion', 'gobernanza'
            markdown: summary,
            tags: ["auto-memory", category, "chat-sync"]
        });

        // 4. Sincronización Inteligente con Cerebros (Brains)
        const brains = await listBrains();
        if (brains && brains.length > 0) {
            // Buscamos un cerebro que encaje semánticamente con la categoría, 
            // o que contenga la categoría en su nombre/descripción.
            let targetBrain = brains.find(b => 
                b.name.toLowerCase().includes(category) || 
                b.description.toLowerCase().includes(category)
            );

            // Fallback: usar el cerebro principal/personal (bindScope: true)
            if (!targetBrain) {
                targetBrain = brains.find(b => b.includes?.bindScope) || brains[0];
            }

            if (targetBrain) {
                // Añadir a las memorias del cerebro
                const currentMemories = targetBrain.includes?.memories || [];
                if (!currentMemories.includes(doc.id)) {
                    await saveBrain({
                        ...targetBrain,
                        includes: {
                            ...targetBrain.includes,
                            memories: [...currentMemories, doc.id]
                        }
                    });
                    console.log(`[SemanticMemory] Memoria '${doc.id}' sincronizada con el cerebro '${targetBrain.name}'.`);
                }
            }
        }
    } catch (e) {
        console.error("[SemanticMemory] Error en pipeline:", e);
    }
}
