import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";

export async function POST(req: NextRequest) {
    try {
        const { prompt, layout, structureConfig } = await req.json();

        if (!prompt?.trim()) {
            return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
        }

        if (!process.env.GEMINI_API_KEY) {
            // Return 3 pre-built demo variations (images)
            return NextResponse.json({
                success: true,
                variations: getDemoVariations(prompt),
                isDemoMode: true,
            });
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        const variationPrompts = [
            "Estilo Compacto y Denso: Interfaz HUD Sci-Fi con múltiples métricas pequeñas tipo grid, colores oscuros con acentos violeta brillante (#8b5cf6), estilo glassmorphism.",
            "Estilo Expandido y Gráfico: Panel de control moderno dashboard con gráficos grandes, tipografía limpia, colores oscuros con acentos verde esmeralda (#10b981), estilo neomorfismo oscuro.",
            "Estilo Minimalista Holográfico: Tarjeta flotante muy limpia, solo datos esenciales, líneas finas brillantes, colores oscuros con acentos rojo neón (#f43f5e), estética cyber-etérea."
        ];

        const variations: Array<{ title: string; description: string; themeColor: string; imageUrl: string }> = [];
        const themeColors = ["#8b5cf6", "#10b981", "#f43f5e"];
        const baseTitle = prompt.slice(0, 30) || "Widget";

        // Generate 3 image variations in parallel to save time
        const imagePromises = variationPrompts.map(async (vp, index) => {
            try {
                const response = await ai.models.generateImages({
                    model: 'imagen-3.0-generate-001',
                    prompt: `Diseño UI/UX de alta calidad para un Widget web. Concepto: ${prompt}. Layout preferido: ${layout}. Aspecto: ${vp}. Solo el diseño del componente aislado sobre fondo neutro oscuro, renderizado 3D fotorrealista de la interfaz UX.`,
                    config: {
                        numberOfImages: 1,
                        outputMimeType: 'image/png',
                        aspectRatio: '16:9',
                    },
                });

                if (response.generatedImages && response.generatedImages.length > 0) {
                    const base64Image = response.generatedImages[0].image?.imageBytes;
                    if (base64Image) {
                        return {
                            title: `${baseTitle} — Opción ${index + 1}`,
                            description: vp.split(':')[0], // Gets "Estilo Compacto y Denso", etc.
                            themeColor: themeColors[index],
                            imageUrl: `data:image/png;base64,${base64Image}`
                        };
                    }
                }
            } catch (e: any) {
                console.error(`Error generating image variation ${index}:`, e?.message);
            }
            return null;
        });

        const results = await Promise.all(imagePromises);
        
        for (const res of results) {
            if (res) variations.push(res);
        }

        if (variations.length === 0) {
            // All failed — return demo variations
            return NextResponse.json({
                success: true,
                variations: getDemoVariations(prompt),
                isDemoMode: true,
            });
        }

        return NextResponse.json({ success: true, variations });
    } catch (error: any) {
        console.error("Widget forge generate-visuals error:", error);
        return NextResponse.json({
            success: true,
            variations: getDemoVariations(prompt || "Widget"),
            isDemoMode: true,
        });
    }
}

// Fallback SVGs URL generator to ensure Phase 2 has visible variations even if API keys are missing/restricted
function getSvgFallback(type: 1|2|3) {
    let svg = '';
    if (type === 1) svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400" style="background:#0a0e27;font-family:sans-serif;"><rect x="40" y="40" width="520" height="320" rx="20" fill="rgba(255,255,255,0.02)" stroke="#8b5cf6" stroke-width="2"/><circle cx="300" cy="180" r="60" fill="transparent" stroke="#8b5cf6" stroke-width="8" stroke-dasharray="100 40" transform="rotate(25 300 180)"/><text x="300" y="300" fill="#fff" font-size="24" text-anchor="middle" font-weight="bold">Diseño Compacto</text><text x="300" y="330" fill="rgba(255,255,255,0.5)" font-size="14" text-anchor="middle">Modo Fallback / Demo</text></svg>`;
    else if (type === 2) svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400" style="background:#0a0e27;font-family:sans-serif;"><rect x="40" y="40" width="520" height="320" rx="20" fill="rgba(255,255,255,0.02)" stroke="#10b981" stroke-width="2"/><rect x="100" y="100" width="400" height="120" rx="10" fill="rgba(16,185,129,0.1)" stroke="#10b981" stroke-width="1"/><rect x="100" y="240" width="190" height="80" rx="10" fill="rgba(255,255,255,0.05)"/><rect x="310" y="240" width="190" height="80" rx="10" fill="rgba(255,255,255,0.05)"/><text x="120" y="140" fill="#10b981" font-size="18" font-weight="bold">Diseño Expandido</text><text x="120" y="170" fill="rgba(255,255,255,0.5)" font-size="14">Modo Fallback / Demo</text></svg>`;
    else svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400" style="background:#0a0e27;font-family:sans-serif;"><rect x="150" y="40" width="300" height="320" rx="20" fill="rgba(255,255,255,0.02)" stroke="#f43f5e" stroke-width="2"/><path d="M 200 200 L 250 150 L 350 250 L 400 120" fill="none" stroke="#f43f5e" stroke-width="4"/><circle cx="400" cy="120" r="6" fill="#f43f5e"/><text x="300" y="290" fill="#fff" font-size="20" text-anchor="middle" font-weight="bold">Minimalista</text><text x="300" y="320" fill="rgba(255,255,255,0.5)" font-size="12" text-anchor="middle">Modo Fallback / Demo</text></svg>`;
    const base64Svg = Buffer.from(svg).toString('base64');
    return `data:image/svg+xml;base64,${base64Svg}`;
}

function getDemoVariations(prompt: string) {
    const title = prompt ? prompt.slice(0, 30) : "Widget";
    return [
        {
            title: `${title} — Compacto (Demo)`,
            description: "Esquema geométrico base de demostración.",
            themeColor: "#8b5cf6",
            imageUrl: getSvgFallback(1),
        },
        {
            title: `${title} — Expandido (Demo)`,
            description: "Representación estructurada de métricas.",
            themeColor: "#10b981",
            imageUrl: getSvgFallback(2),
        },
        {
            title: `${title} — Minimal (Demo)`,
            description: "Distribución asimétrica de componentes.",
            themeColor: "#f43f5e",
            imageUrl: getSvgFallback(3),
        },
    ];
}
