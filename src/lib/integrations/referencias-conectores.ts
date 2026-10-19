// src/lib/integrations/referencias-conectores.ts
// Conectores oficiales (MCP y APIs) para la categoría de Referencias e Inspiración
// Task H de Ola 1018R: conectores oficiales (MCP y APIs)

export interface ReferenciaConector {
  id: string;
  nombre: string;
  tipo: string;
  url: string;
  requiere: string; // plan, OAuth, clave por NOMBRE de variable
  coste: 'gratis' | 'pago' | 'creditos';
  limites: string;
  avisos: string[];
}

/**
 * Datos de los conectores oficiales (MCP y APIs) para servicios de referencia e inspiración
 * Extraído de config/referencias-inspiracion.json
 */
export const REFERENCIAS_CONECTORES: ReferenciaConector[] = [
  { id: "higgsfield", nombre: "Higgsfield", tipo: "herramienta-ia", url: "https://higgsfield.ai/mcp", requiere: "plan de pago, OAuth", coste: "pago", limites: "Ver documentación de la API", avisos: ["scraping", "revender-acceso", "entrenar-otros-modelos-con-salidas"] },
  { id: "lottiefiles", nombre: "LottieFiles", tipo: "recursos-descargables", url: "https://lottiefiles.com", requiere: "cuenta (OAuth); gratis en todos los planes", coste: "pago", limites: "Ver documentación específica", avisos: ["scraping", "biblioteca-competidora", "menos-de-10-s-entre-peticiones"] },
  { id: "icons8", nombre: "Icons8", tipo: "recursos-descargables", url: "https://icons8.com", requiere: "vistas PNG gratis; SVG con plan de pago; API: renderer PNG/WebP gratis con atribución", coste: "pago", limites: "Ver documentación de la API", avisos: ["data-mining", "robots", "enmarcar"] },
  { id: "mobbin", nombre: "Mobbin", tipo: "galeria-inspiracion", url: "https://mobbin.com/", requiere: "MCP: plan Pro/Team/Enterprise (OAuth); 60 peticiones/60 s; API: plan Team/Enterprise", coste: "pago", limites: "60 peticiones/60 s (MCP)", avisos: ["scraping", "entrenar-ia", "repositorio-propio-con-resultados", "espejar"] },
  { id: "refero", nombre: "Refero", tipo: "galeria-inspiracion", url: "https://refero.design/", requiere: "plan Pro/Team/Lifetime", coste: "pago", limites: "Ver documentación específica", avisos: ["scraping", "extraccion-sistematica", "entrenar-ia", "crear-datasets"] },
  { id: "savee", nombre: "Savee", tipo: "galeria-inspiracion", url: "https://savee.com/", requiere: "plan de pago", coste: "pago", limites: "Ver documentación específica", avisos: ["scraping-sin-permiso", "descarga-masiva", "cache-mas-de-24h", "entrenar-ia", "crear-dataset-o-indice"] },
  { id: "60fps", nombre: "60fps.design", tipo: "galeria-inspiracion", url: "https://60fps.design", requiere: "suscripción MCP (29 $/mes); 120 peticiones/min, 2.000/día", coste: "pago", limites: "120 peticiones/min, 2.000/día", avisos: ["scraping", "descarga-masiva", "cachear-o-rehospedar", "entrenar-ia", "copiar-marca-o-assets"] },
  { id: "fontshare", nombre: "Fontshare (Indian Type Foundry)", tipo: "recursos-descargables", url: "https://www.fontshare.com", requiere: "ninguna (uso personal y comercial gratis; no revender ni redistribuir)", coste: "gratis", limites: "Ver documentación de la API", avisos: ["redistribuir-archivos", "revender"] },
  { id: "flaticon", nombre: "Flaticon", tipo: "recursos-descargables", url: "https://www.flaticon.com", requiere: "clave de API", coste: "pago", limites: "Ver documentación específica", avisos: ["scraping", "descargas-automaticas", "entrenar-ia", "redistribuir-como-pack"] }
];

/**
 * Obtiene el estado de un conector basado en su ID y el registro de conectados
 * @param id - Identificador del conector
 * @param conectados - Registro de IDs de conectores y su estado de conexión
 * @returns Estado del conector como string
 */
export function estadoConector(id: string, conectados: Record<string, boolean>): string {
  if (!REFERENCIAS_CONECTORES.some(conector => conector.id === id)) {
    return "desconocido";
  }
  
  if (!(id in conectados)) {
    return "desconocido";
  }
  
  return conectados[id] ? "conectado" : "desconectado";
}