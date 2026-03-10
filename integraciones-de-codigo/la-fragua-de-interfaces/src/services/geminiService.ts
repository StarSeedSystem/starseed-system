import { GoogleGenAI, Type } from "@google/genai";
import { WidgetOntology } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateWidgetVisuals(prompt: string, layout: string, config: any): Promise<string[]> {
  const basePrompt = `A high-quality UI design mockup of a futuristic cyberdelic widget for StarSeed OS. Concept: "${prompt}". Layout style: ${layout}. Structural density: ${config.density}%. Symmetry: ${config.symmetry}%. Glassmorphism, glowing neon accents, dark background, highly detailed UI elements, holographic projections.`;
  
  const results: string[] = [];
  
  for (let i = 1; i <= 3; i++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: `${basePrompt} Variation ${i} with unique color palette and arrangement.` }]
        }
      });
      
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          results.push(`data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`);
          break; // Only need one image per variation
        }
      }
      
      // Add a delay between requests to avoid hitting rate limits (429 RESOURCE_EXHAUSTED)
      if (i < 3) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } catch (e) {
      console.error(`Error generating image ${i}:`, e);
      // If we hit a quota error, we might want to stop trying further to save time
      if (e instanceof Error && e.message.includes('429')) {
        console.warn("Rate limit exceeded, stopping further image generation.");
        break;
      }
    }
  }

  return results;
}

export async function generateWidgetOntology(prompt: string, layout: string, imageBase64: string): Promise<WidgetOntology> {
  const [prefix, base64Data] = imageBase64.split(',');
  const mimeType = prefix.match(/:(.*?);/)?.[1] || 'image/png';

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        },
        {
          text: `Actúa como el motor lógico Gemini del Sistema Operativo StarSeed. 
          El usuario quiere crear un widget basado en este prompt: "${prompt}". 
          
          IMPORTANTE: Analiza a detalle la imagen adjunta (prototipo visual seleccionado). 
          Extrae la paleta de colores predominante (themeColor).
          
          Genera el código HTML COMPLETO del widget (htmlCode) usando clases de Tailwind CSS.
          REGLAS ESTRICTAS PARA EL HTML:
          1. REPLICACIÓN VISUAL: El HTML debe recrear la interfaz de la imagen. Incluye textos descriptivos, números, iconos (usa SVGs en línea), gráficas visuales (usando divs con anchos porcentuales) y botones.
          2. ESTRUCTURA ROBUSTA: Usa flexbox (flex, flex-col, items-center, justify-between) o CSS Grid (grid, grid-cols-2, gap-4) para organizar los elementos. NO uses position absolute a menos que sea estrictamente necesario.
          3. VISIBILIDAD: Asegúrate de que el texto sea visible (text-white, text-gray-300). Los contenedores internos deben tener fondos sutiles (bg-white/5, bg-black/20) y bordes (border border-white/10) para separar la información.
          4. VARIABLES DE METAMORFOSIS: El contenedor principal (el div más externo del htmlCode) DEBE incluir este atributo style exacto:
             style="background-color: rgba(20, 20, 30, var(--widget-opacity)); backdrop-filter: blur(calc(var(--widget-blur) * 1px)); border-radius: calc(var(--widget-radius) * 1px); padding: 24px; width: 100%; min-height: 300px; display: flex; flex-direction: column; gap: 16px;"
          5. CONTENIDO OBLIGATORIO: El htmlCode NUNCA debe estar vacío. Debe contener una estructura completa y funcional basada en la imagen. Si la imagen es muy compleja, simplifícala en tarjetas legibles, pero SIEMPRE devuelve HTML válido.
          
          Genera la ontología de este widget en formato JSON.`
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Nombre del widget" },
          description: { type: Type.STRING, description: "Breve descripción filosófica o funcional" },
          themeColor: { type: Type.STRING, description: "Un color hex vibrante y ciberdélico (ej. #8b5cf6, #10b981, #f43f5e)" },
          htmlCode: { type: Type.STRING, description: "Código HTML puro con clases de Tailwind CSS que replica el diseño de la imagen. Usa flex, grid, text-white, bg-white/10, rounded-xl, etc. Incluye datos mock." }
        },
        required: ["title", "description", "themeColor", "htmlCode"]
      }
    }
  });

  try {
    return JSON.parse(response.text || "{}") as WidgetOntology;
  } catch (e) {
    console.error("Error parsing Gemini response", e);
    throw new Error("Fallo en la convergencia semántica.");
  }
}
