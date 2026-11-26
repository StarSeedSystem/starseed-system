// ═══════════════════════════════════════════════════════════════════════════
// EJEMPLO: Uso de agent-reach desde una tarea del enjambre
// ═══════════════════════════════════════════════════════════════════════════
// Módulo PURO (sin node:*, sin side-effects). ≤120 líneas.
// Usa el cliente de integraciones que llama al proxy /api/agent-reach.
// ═══════════════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "@/lib/integrations/types";
import { web_search, read_web, read_youtube, read_github, health, interpretarRespuestaProxy } from "@/lib/integrations/clients/agent-reach";

export interface InvestigaInput { tema: string; fuentes?: ("web" | "youtube" | "github")[]; limite?: number; }
export interface FuenteResultado { tipo: "web" | "youtube" | "github"; query: string; ok: boolean; contenido?: string; items?: Array<{ title: string; url: string; text: string }>; error?: string; hint?: string; }
export interface InvestigaOutput { tema: string; fuentes: FuenteResultado[]; resumen: string; timestamp: string; }

function configPorDefecto(): IntegrationConfig { return { enabled: true }; }

async function buscarWeb(cfg: IntegrationConfig, q: string, n: number): Promise<FuenteResultado> {
  const r = await web_search(cfg, { q, limit: n });
  return { tipo: "web", query: q, ok: r.ok, contenido: r.ok ? r.data?.content : undefined, items: r.ok ? r.data?.items as FuenteResultado["items"] : undefined, error: r.ok ? undefined : r.error, hint: r.ok ? undefined : (r.data as { hint?: string })?.hint };
}

async function leerFuente(cfg: IntegrationConfig, url: string): Promise<FuenteResultado> {
  let r: IntegrationResult;
  if (url.includes("youtube.com") || url.includes("youtu.be")) { r = await read_youtube(cfg, { url }); return { tipo: "youtube", query: url, ok: r.ok, contenido: r.ok ? r.data?.content : undefined, error: r.ok ? undefined : r.error, hint: r.ok ? undefined : (r.data as { hint?: string })?.hint }; }
  if (url.includes("github.com")) { r = await read_github(cfg, { url }); return { tipo: "github", query: url, ok: r.ok, contenido: r.ok ? r.data?.content : undefined, error: r.ok ? undefined : r.error, hint: r.ok ? undefined : (r.data as { hint?: string })?.hint }; }
  r = await read_web(cfg, { url }); return { tipo: "web", query: url, ok: r.ok, contenido: r.ok ? r.data?.content : undefined, error: r.ok ? undefined : r.error, hint: r.ok ? undefined : (r.data as { hint?: string })?.hint };
}

export async function investigarConAgentReach(input: InvestigaInput): Promise<InvestigaOutput> {
  const cfg = configPorDefecto(), n = Math.min(20, Math.max(1, input.limite ?? 5)), fuentes = input.fuentes ?? ["web", "youtube", "github"], resultados: FuenteResultado[] = [];
  const vivo = await health(cfg); if (!vivo.ok) resultados.push({ tipo: "web", query: "health", ok: false, error: "agent-reach no disponible en la neurona", hint: vivo.data?.hint });
  if (fuentes.includes("web")) resultados.push(await buscarWeb(cfg, input.tema, n));
  if (fuentes.includes("youtube")) { const yt = await buscarWeb(cfg, `${input.tema} site:youtube.com`, Math.min(3, n)); resultados.push({ ...yt, tipo: "youtube" }); }
  if (fuentes.includes("github")) { const gh = await buscarWeb(cfg, `${input.tema} site:github.com`, Math.min(3, n)); resultados.push({ ...gh, tipo: "github" }); }
  const ok = resultados.filter((f) => f.ok), fallidas = resultados.filter((f) => !f.ok), lineas = [`## Investigación: ${input.tema}`, ``, `**Fuentes consultadas:** ${resultados.length} | **OK:** ${ok.length} | **Fallidas:** ${fallidas.length}`, ``];
  for (const f of ok) { const items = f.items?.length ?? 0; lineas.push(`- **${f.tipo}** («${f.query}»): ${items} resultados`); if (f.contenido) lineas.push(`  \`\`\`markdown\n${f.contenido.slice(0, 300)}...\n\`\`\``); }
  for (const f of fallidas) lineas.push(`- **${f.tipo}** («${f.query}»): ❌ ${f.error}${f.hint ? ` — ${f.hint}` : ""}`);
  lineas.push(``, `*Generado ${new Date().toISOString()} vía agent-reach proxy*`);
  return { tema: input.tema, fuentes: resultados, resumen: lineas.join("\n"), timestamp: new Date().toISOString() };
}

export function testInterpretarProxy(status: number, body: unknown): IntegrationResult { return interpretarRespuestaProxy(status, body); }