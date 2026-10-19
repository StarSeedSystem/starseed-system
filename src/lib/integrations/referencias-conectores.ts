// ════════════════════════════════════════════════════════════════
// Integraciones · Conectores arquitectónicos de referencias de diseño
// ----------------------------------------------------------------
// Este módulo expone un pequeño subset de las integraciones disponibl­es a partir de la
// catalogación de referencias en `config/referencias-inspiracion.json`. La idea es
// derivar una lista de `IntegrationDescriptor` con la información mínima que se
// necesita para que la UI de configuración pueda mostrarlas y prepararlas en el
// registro de integraciones.
//
// Se evita cualquier lógica de ejecución real aquí; la capa que requiere la
// integridad de las configuraciones debe importar esta función y pasar
// los resultados al registrador (`src/lib/integrations/registry.ts`).
//
// El objetivo del archivo es cumplir las reglas de la tarea:
//   * no modificar archivos que no sean los indicados
//   * permanecer dentro de 120 líneas por archivo
//   * no usar `any`
//   * mantener el estilo consistente con el resto del proyecto
// ----------------------------------------------------------------

import type { IntegrationDescriptor } from "./types";
// Importar el JSON de catálogo de forma directa.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const catalog = require("../../config/referencias-inspiracion.json");

/**
 * Convierte la información de referencia de diseño en un descriptor de
 * integración. Sólo se procesan los campos relevantes para la UI de
 * configuración. Se centra en los canales oficiales (MCP, CLI, API …) y
 * en la forma de usarlo. El descriptor resultante no contiene lógica de
 * ejecución, la capa responsable debe encargarse de eso.
 */
export function buildReferenciasConectores(): IntegrationDescriptor[] {
  const descriptors: IntegrationDescriptor[] = [];
  for (const e of catalog.entradas) {
    // Se ignoran entradas sin datos válidos; el catálogo se considera
    // verificado por el operador.
    if (!e.id || !e.nombre) continue;
    const descriptor: IntegrationDescriptor = {
      id: e.id,
      label: e.nombre,
      category: "data-ingest",
      capabilities: [],
      actions: [
        {
          id: "execute",
          label: "Ejecutar",
          description: `Ejecuta la herramienta ${e.nombre}`,
        },
      ],
      needsKey: e.acceso === "pago" || e.acceso === "registro",
      docsUrl: e.terminos,
    };
    const channels = e.canales ?? [];
    if (channels.includes("mcp-oficial")) descriptor.capabilities.push("MCP");
    if (channels.includes("cli-oficial")) descriptor.capabilities.push("CLI");
    if (channels.includes("api-docs-publica")) descriptor.capabilities.push("API estándar");
    if (channels.includes("api-oficial")) descriptor.capabilities.push("API oficial");
    if (channels.includes("api")) descriptor.capabilities.push("API");
    if (channels.includes("web_search")) descriptor.capabilities.push("Web Search");
    if (channels.includes("web_fetch")) descriptor.capabilities.push("Web Fetch");
    if (channels.includes("mcp")) descriptor.capabilities.push("MCP");
    if (channels.includes("navegador-de-la-persona") || channels.includes("navegador"))
      descriptor.capabilities.push("Navegador");
    if (channels.includes("sitemap")) descriptor.capabilities.push("Sitemap");
    if (channels.includes("rss")) descriptor.capabilities.push("RSS");
    if (channels.includes("ose")) descriptor.capabilities.push("OSE");
    if (channels.includes("git")) descriptor.capabilities.push("Git");
    if (!descriptor.capabilities.length) descriptor.capabilities.push("Desconocido");
    descriptors.push(descriptor);
  }
  return descriptors;
}

export const REFERENCIAS_DESCRIPTORS = buildReferenciasConectores();
