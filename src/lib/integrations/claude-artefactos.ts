// Integraciones · Artefactos de Claude y conector MCP de Genesis (Ola 1019G · GCA1019X).
// Contrato: architecture/genesis-conectores-abiertos.md §8. Módulo PURO: sin red, reloj,
// disco ni claves. El token NUNCA entra aquí: solo se nombra.
import type { LibraryPackage } from "@/lib/library/packages";

export const ACCION_ABRIR_EN_CLAUDE = "Abrir en Claude";
export const CAPACIDAD_MCP = "mcp";
export const NOMBRE_CONECTOR_CLAUDE = "Genesis";

/** Un paso para conectar el Genesis del ámbito con claude.ai. */
export interface PasoConectorClaude {
  titulo: string;
  detalle: string;
  /** URL que este paso invita a copiar (nunca un token). */
  copiar?: string;
}

const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const RUTA_ARTEFACTO_RE = /^https:\/\/claude\.ai\/artifact\/([A-Za-z0-9_-]+)$/;
const RUTA_ARTEFACTO_CODIGO_RE = /^https:\/\/claude\.ai\/code\/artifact\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Quita las barras finales para comparar la misma dirección sin ruido. */
function sinBarraFinal(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Identificador del artefacto (el de la URL) o null si no es un enlace válido. */
export function identificadorDeArtefacto(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const limpia = url.trim();
  if (!limpia || CONTROL_RE.test(limpia)) return null;
  const sinBarra = sinBarraFinal(limpia);
  const codigo = RUTA_ARTEFACTO_CODIGO_RE.exec(sinBarra);
  if (codigo) return codigo[1].toLowerCase();
  const simple = RUTA_ARTEFACTO_RE.exec(sinBarra);
  return simple ? simple[1] : null;
}

/** Título visible: el que da la persona o uno corto derivado del identificador. */
function tituloLimpio(titulo: string | null | undefined, id: string): string {
  const texto = typeof titulo === "string" ? titulo.trim() : "";
  return texto || `Artefacto de Claude · ${id.slice(0, 8)}`;
}

/** ¿Es un enlace de artefacto de Claude de los dos formatos admitidos? */
export function esEnlaceArtefacto(url: string | null | undefined): boolean {
  return identificadorDeArtefacto(url) !== null;
}

/** Paquete de Biblioteca para un artefacto de Claude; null si la URL no vale. */
export function paqueteDeArtefacto(
  url: string,
  titulo?: string | null,
): LibraryPackage | null {
  const id = identificadorDeArtefacto(url);
  if (!id) return null;
  const externalUrl = sinBarraFinal(url.trim());
  const name = tituloLimpio(titulo, id);
  return {
    id: `claude-artefacto-${id}`,
    kind: "app",
    name,
    description: `${name}: artefacto de Claude que se abre fuera del OS. Guardarlo solo deja el enlace en la Biblioteca y ofrece «${ACCION_ABRIR_EN_CLAUDE}»; no se ejecuta aquí.`,
    icon: "Sparkles",
    tags: ["claude", "artefacto", "mcp", "biblioteca"],
    version: "1.0.0",
    author: "Claude",
    sourceRepoId: "claude",
    free: true,
    payload: { externalUrl, accion: ACCION_ABRIR_EN_CLAUDE, capacidad: CAPACIDAD_MCP, identificador: id, correAqui: false },
  };
}

/** Valida la URL MCP (https, sin usuario/contraseña, query ni fragmento): una clave pegada por error jamás se copia. */
export function urlMcpSegura(urlMcp: string | null | undefined): string | null {
  if (typeof urlMcp !== "string") return null;
  const limpia = urlMcp.trim();
  if (!limpia || CONTROL_RE.test(limpia)) return null;
  try {
    const url = new URL(limpia);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (url.search || url.hash) return null;
    return limpia;
  } catch {
    return null;
  }
}

/** Pasos para añadir la URL MCP de un ámbito como conector en claude.ai. */
export function pasosConectorClaude(
  urlMcp: string | null | undefined,
): PasoConectorClaude[] {
  const url = urlMcpSegura(urlMcp);
  if (!url) return [];
  return [
    { titulo: "Copia la URL MCP de tu Genesis", detalle: "Es la dirección del Genesis de este ámbito. El token va aparte: no lo pegues en la URL ni lo compartas.", copiar: url },
    { titulo: "Añádela en claude.ai", detalle: `En claude.ai abre Ajustes › Conectores › Añadir conector personalizado, pega la URL y llámalo «${NOMBRE_CONECTOR_CLAUDE}».` },
    { titulo: "Autoriza el ámbito", detalle: "Pega el token del ámbito en el campo de autenticación del conector. Vive en la bóveda y no se muestra aquí." },
    { titulo: "Actívalo en chats y Cowork", detalle: "Marca el conector en el chat o en Cowork para que Claude lea tareas, agentes y medidores de tu Genesis." },
    { titulo: "Úsalo desde un artefacto", detalle: `Declara la capacidad \`${CAPACIDAD_MCP}\` y usa \`watchTool\` para leer y \`callTool\` para actuar, siempre con las credenciales de quien lo mira.` },
  ];
}
