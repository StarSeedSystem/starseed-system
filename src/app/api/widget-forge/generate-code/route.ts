import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";

const FALLBACK_HTML = `<div style="background-color: rgba(20, 20, 30, var(--widget-opacity, 0.85)); backdrop-filter: blur(calc(var(--widget-blur, 12) * 1px)); border-radius: calc(var(--widget-radius, 20) * 1px); padding: 24px; width: 100%; min-height: 200px; display: flex; flex-direction: column; gap: 16px; border: 1px solid rgba(255,255,255,0.08);">
<style>
@keyframes pulse-glow { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
@keyframes slide-up { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
</style>
<div style="display:flex;align-items:center;gap:12px;">
<div style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#8b5cf6,#6366f1);display:flex;align-items:center;justify-content:center;">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
</div>
<div>
<h3 style="color:white;font-size:16px;font-weight:600;margin:0;">Widget Generado</h3>
<p style="color:rgba(255,255,255,0.4);font-size:11px;margin:0;font-family:monospace;">STARSEED // FRAGUA v1.0</p>
</div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;animation:slide-up 0.5s ease-out;">
<div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:16px;border:1px solid rgba(255,255,255,0.06);">
<p style="color:rgba(255,255,255,0.4);font-size:10px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px 0;">Métrica A</p>
<p style="color:white;font-size:24px;font-weight:300;margin:0;">1,204</p>
</div>
<div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:16px;border:1px solid rgba(255,255,255,0.06);">
<p style="color:rgba(255,255,255,0.4);font-size:10px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px 0;">Métrica B</p>
<p style="color:#8b5cf6;font-size:24px;font-weight:300;margin:0;animation:pulse-glow 3s infinite;">99.8%</p>
</div>
</div>
<p style="color:rgba(255,255,255,0.3);font-size:11px;text-align:center;margin:0;">Configura tu GEMINI_API_KEY para generar widgets personalizados</p>
</div>`;

export async function POST(req: NextRequest) {
    try {
        const { prompt, layout, imageUrl } = await req.json();

        if (!prompt?.trim()) {
            return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
        }

        if (!process.env.GEMINI_API_KEY) {
            // Return fallback widget instead of error
            return NextResponse.json({
                success: true,
                title: prompt.slice(0, 40) || "Widget",
                description: "Widget de demostración (configura GEMINI_API_KEY para generación completa)",
                themeColor: "#8b5cf6",
                htmlCode: FALLBACK_HTML,
                isFallback: true,
            });
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        // Build content parts
        const parts: any[] = [];

        if (imageUrl && imageUrl.startsWith("data:")) {
            const [prefix, base64Data] = imageUrl.split(",");
            const mimeType = prefix.match(/:(.*?);/)?.[1] || "image/png";
            parts.push({ inlineData: { data: base64Data, mimeType } });
        }

        parts.push({
            text: `Actúa como un desarrollador Frontend/UX/UI de élite especialista en interfaces "Glassmorphism" y visualizaciones de datos para el Sistema Operativo StarSeed.
Objetivo: TRADUCIR el diseño visual proporcionado (la imagen) en un Widget web 100% funcional, interactivo y con físicas animadas.

PROMPT DEL USUARIO: "${prompt}"
LAYOUT PREFERIDO: ${layout || "Fluido Radial"}

REGLAS DE TRADUCCIÓN (OBLIGATORIAS):

1. CONTENEDOR PRINCIPAL: El div más externo DEBE tener este style exacto:
   style="background-color: rgba(20, 20, 30, var(--widget-opacity, 0.85)); backdrop-filter: blur(calc(var(--widget-blur, 12) * 1px)); border-radius: calc(var(--widget-radius, 20) * 1px); padding: 24px; width: 100%; min-height: 200px; display: flex; flex-direction: column; gap: 16px; border: 1px solid rgba(255,255,255,0.08); overflow: hidden; position: relative;"

2. TRADUCCIÓN FIEL: Observa la imagen y extrae la estructura, los colores dominantes, los tipos de gráficos (barras, radiales, grids) y reconstrúyelo en HTML/CSS estructurado.

3. ANIMACIONES Y 3D (ESENCIAL): Incluye un <style> tag DENTRO del HTML con lógicas impactantes:
   - Añade @keyframes para rotaciones suaves, pulsos de brillo (glow-pulse), o fill de barras.
   - Utiliza texturas radiales \`background: radial-gradient(...)\` para simular profundidad.
   - Añade hover states profundos (\`transform: translateY(-2px) scale(1.02); box-shadow: ...\`) a las tarjetas internas.

4. CONTENIDO RICO: 
   - Genera datos mock REALISTAS congruentes con la imagen (Ej: si parece un monitor de red, usa "Latencia: 12ms", "Paquetes: 1.2M").
   - Utiliza SVGs inline altamente estéticos y precisos. NUNCA uses URLs externas.

5. PALETA CIBERDÉLICA Y COHERENCIA: Extrae el "accent color" de la imagen proporcionada (ej: verde neón, violeta intenso) y úsalo coherentemente para textos destacados, bordes glow y gradientes.

6. ESTRUCTURA SOFISTICADA:
   - Usa flexbox/grid avanzado para un acomodo perfecto. 
   - Textos: color blanco puro para valores crudos, \`rgba(255,255,255,0.4)\` para etiquetas.

Genera la respuesta como JSON con: title, description, themeColor, htmlCode.
El htmlCode DEBE ser un string de HTML completo, funcional y deslumbrante que al renderizarse se vea TAN INCREÍBLE o MEJOR que el diseño de la imagen original.`,
        });

        const response = await ai.models.generateContent({
            model: "gemini-1.5-pro",
            contents: { parts },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING, description: "Nombre descriptivo del widget en español" },
                        description: { type: Type.STRING, description: "Descripción funcional en español (1-2 frases)" },
                        themeColor: { type: Type.STRING, description: "Color hex vibrante dominante extraído del diseño (#8b5cf6, #10b981, etc.)" },
                        htmlCode: { type: Type.STRING, description: "Código HTML puro renderizando el diseño visual con CSS avanzado, grid, micro-interacciones hover y estilos inline." },
                    },
                    required: ["title", "description", "themeColor", "htmlCode"],
                },
            },
        });

        const text = response.text || "{}";
        const parsed = JSON.parse(text);

        // Validate we got actual HTML
        if (!parsed.htmlCode || parsed.htmlCode.length < 50) {
            parsed.htmlCode = FALLBACK_HTML;
            parsed.title = parsed.title || prompt.slice(0, 40);
        }

        return NextResponse.json({ success: true, ...parsed });
    } catch (error: any) {
        console.error("Widget forge generate-code error:", error);
        // Return fallback instead of error to keep UX smooth
        return NextResponse.json({
            success: true,
            title: "Widget (Error de Generación)",
            description: "No se pudo conectar con Gemini. Widget de demostración.",
            themeColor: "#f43f5e",
            htmlCode: FALLBACK_HTML,
            isFallback: true,
        });
    }
}
