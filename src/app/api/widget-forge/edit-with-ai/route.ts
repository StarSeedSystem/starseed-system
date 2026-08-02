import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@/utils/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";

export async function POST(req: NextRequest) {
    // ── SEGURIDAD (Adenda 131) ────────────────────────────────────────────────
    // Exige sesión ANTES de tocar la API key de pago (Gemini).
    let userId: string;
    try {
        const supabase = await createClient();
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
            return NextResponse.json(
                { error: "Necesitas iniciar sesión para editar con IA." },
                { status: 401 },
            );
        }
        userId = data.user.id;
    } catch {
        return NextResponse.json({ error: "No se pudo verificar la sesión." }, { status: 401 });
    }
    // Rate-limit por usuario (clave=userId; sin IP, falsificable vía XFF). Gemini de pago: 20 / 10 min.
    const rl = rateLimit(`wf-edit-with-ai:${userId}`, 20, 10 * 60 * 1000);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: "Demasiadas solicitudes. Inténtalo más tarde." },
            { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
        );
    }

    try {
        const { currentHtml, editInstruction, context } = await req.json();

        if (!editInstruction?.trim()) {
            return NextResponse.json({ error: "Edit instruction is required" }, { status: 400 });
        }

        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json({
                error: "GEMINI_API_KEY no configurada. Agrega la variable en .env",
            }, { status: 500 });
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-05-20",
            contents: {
                parts: [{
                    text: `Eres el editor de widgets AI del Sistema StarSeed.

CONTEXTO: ${context || "Widget del dashboard"}

HTML ACTUAL DEL WIDGET:
\`\`\`html
${currentHtml}
\`\`\`

INSTRUCCIÓN DEL USUARIO: "${editInstruction}"

REGLAS DE EDICIÓN:
1. PRESERVA la estructura general del widget (no reescribas todo desde cero)
2. MANTÉN el style del contenedor principal con las variables CSS (--widget-opacity, --widget-blur, --widget-radius)
3. Si el usuario pide agregar un elemento (gráfica, botón, sección), INSERTAR sin eliminar lo existente
4. Si pide cambiar colores, actualiza TODOS los acentos de forma coherente
5. Si pide agregar animaciones, incluye @keyframes en un <style> tag
6. Si pide datos o funcionalidad, usa datos mock realistas
7. SIEMPRE devuelve el HTML COMPLETO modificado (no solo un fragmento)
8. Usa CSS inline o <style> tags (no clases de Tailwind externas)
9. Mantén el diseño ciberdélico (fondos oscuros, acentos vibrantes, glassmorphism)

Devuelve el HTML modificado y un resumen de los cambios.`
                }],
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        htmlCode: { type: Type.STRING, description: "HTML completo del widget modificado" },
                        changeSummary: { type: Type.STRING, description: "Resumen en español de lo que cambió" },
                    },
                    required: ["htmlCode", "changeSummary"],
                },
            },
        });

        const parsed = JSON.parse(response.text || "{}");
        return NextResponse.json({ success: true, ...parsed });
    } catch (error: any) {
        console.error("Widget forge edit error:", error);
        return NextResponse.json({ error: error.message || "Edit failed" }, { status: 500 });
    }
}
