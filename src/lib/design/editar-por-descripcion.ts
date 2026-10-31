import type { NivelUi } from "../astraura/ui-permisos";
/**
 * Editar el diseño describiéndolo, con guardas (Ola 1018F · tarea N). Módulo PURO:
 * dice si un parche de tokens se puede proponer — lista blanca de tokens y variantes
 * (armonía.md, identidades.md), nunca ocultar ni desactivar un control esencial
 * (ui-permisos.ts), contraste AA ≥ 4,5:1, dianas de 44 px y anchos 360/768/1280/1920.
 */
export interface ParcheDiseno {
  tokens: Record<string, unknown>; // token admitido → valor; admite sufijo «@<ancho>» (p. ej. tipografia.escala@360)
  variantes?: string[]; // material o sombra pedidas
  ocultarOdesactivar?: string[]; // controles de UI a ocultar o desactivar: siempre se rechaza
}

/** Contexto del parche y resultado de la validación (se descarta entera si algo falla). */
export interface ContextoParche {
  ambito: "cuenta" | "perfil" | "pagina"; // «cuenta» alcanza a todos los perfiles: nunca se aplica solo
  nivel?: NivelUi; // resuelto por decidirUi; si falta manda «proponer» (ui-permisos.ts)
  fondo?: string; texto?: string; // colores reales, para medir el contraste AA si el parche los toca
}
export interface ResultadoParche {
  aplicable: boolean; // true solo si TODO el parche pasa las guardas y el nivel lo permite
  parcheSeguro: Record<string, string>; // tokens aceptados; vacío si no se puede proponer
  motivos: string[]; // una explicación en español por cada guarda incumplida
  nivel: NivelUi; // nivel con que la propuesta queda registrada, para confirmar
}

/** Anchos de pantalla que el OS comprueba siempre (fondos-shaders.md §4). */
export const ANCHOS_OBLIGADOS: readonly number[] = [360, 768, 1280, 1920];
const RADIOS = ["4", "12", "14", "20", "24", "28", "30", "32", "40", "42", "9999"]; const FIBS = ["2", "3", "5", "8", "13", "21", "34", "55", "89", "144"];

/** Lista blanca: familias de tokens y variantes; lo que no está aquí, no existe. */
export const TOKENS_PERMITIDOS: Record<string, readonly string[]> = {
  "color.texto": [], "color.acento": [], "color.superficie": [],
  "radio.tarjeta": RADIOS, "espaciado.bloque": FIBS,
  "material.global": ["cristal", "metal", "madera", "ninguno"],
  "sombra.interfaz": ["suave", "multicapa", "ninguna"],
  "tipografia.escala": ["1.25", "1.618"], "diana.altura": [],
};
const FAMILIAS = new Set(Object.keys(TOKENS_PERMITIDOS)), COLORES = new Set(["color.texto", "color.acento", "color.superficie"]);
const VARIANTES = new Set([...TOKENS_PERMITIDOS["material.global"], ...TOKENS_PERMITIDOS["sombra.interfaz"]]);
const n = (s: string): number => Number(s) || 0;
/** Parsea un color en hex (#rgb/#rrggbbaa), hsl() o HSL espaciado; null si no es color. */
export function colorARgb(valor: string): [number, number, number] | null {
  const v = valor.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v);
  if (hex) {
    const h = hex[1], ext = (s: string) => parseInt(s.length === 1 ? s + s : s, 16) / 255;
    return h.length === 3 ? [ext(h[0]), ext(h[1]), ext(h[2])] : [ext(h.slice(0, 2)), ext(h.slice(2, 4)), ext(h.slice(4, 6))];
  }
  // «hsl(270 80% 60%)», «hsla(270, 80%, 60%, 1)» o el formato espaciado de las vars CSS.
  const hsl = /(?:hsla?\(\s*)?(-?[0-9.]+)(?:deg)?\s*[, ]\s*([0-9.]+)%\s*[, ]\s*([0-9.]+)%/i.exec(v);
  if (!hsl) return null;
  const l = n(hsl[3]) / 100, a = (n(hsl[2]) / 100) * Math.min(l, 1 - l);
  const f = (i: number): number => l - a * Math.max(-1, Math.min((i + +hsl[1] / 30) % 12 - 3, 9 - (i + +hsl[1] / 30) % 12, 1));
  return [f(0), f(8), f(4)];
}

/** Luminancia relativa WCAG (0–1) y contraste entre dos colores (AA: ≥ 4,5). */
function luminancia(c: [number, number, number]): number {
  const lin = (x: number) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}
export function contraste(texto: string, fondo: string): number | null {
  const lt = colorARgb(texto), lf = colorARgb(fondo);
  if (!lt || !lf) return null;
  return (Math.max(luminancia(lt), luminancia(lf)) + 0.05) / (Math.min(luminancia(lt), luminancia(lf)) + 0.05);
}

/** Valida un token (con su «@<ancho>» opcional) o añade el motivo a la lista. */
function validarValor(clave: string, valor: unknown, motivos: string[]): string | null {
  const at = clave.lastIndexOf("@");
  let token = clave, ancho: number | null = null;
  if (at >= 0) {
    ancho = Number(clave.slice(at + 1)); token = clave.slice(0, at);
    if (!(ancho > 0) || !ANCHOS_OBLIGADOS.includes(ancho)) { motivos.push(`Ancho de «${clave}» fuera de la matriz del OS: solo se comprueba ${ANCHOS_OBLIGADOS.join(", ")}.`);
      return null;
    }
  }
  if (!FAMILIAS.has(token) || (ancho !== null && COLORES.has(token))) {
    motivos.push(`«${clave}» no es un token de la lista blanca: ${[...FAMILIAS].join(", ")}.`); return null;
  }
  const texto = String(valor ?? "").trim().replace(/px$/i, "");
  if (token === "diana.altura" && (!Number.isFinite(Number(texto)) || Number(texto) < 44)) {
    motivos.push(`Diana táctil «${clave}: ${texto}» por debajo de los 44 px mínimos del OS.`); return null; }
  if (COLORES.has(token)) {
    if (!colorARgb(texto)) motivos.push(`El color de «${clave}» no se entiende: ni hex, ni rgb, ni hsl.`); else return texto;
    return null;
  }
  const v = TOKENS_PERMITIDOS[token];
  if (!v.includes(texto)) { motivos.push(`«${texto}» no es una variante de «${token}»; solo: ${v.join(", ")}.`);
    return null; }
  // Escala 1,25 en pantallas estrechas (armonía.md); φ es de tablet y escritorio.
  if (token === "tipografia.escala" && ancho !== null && ancho <= 430 && Number(texto) > 1.25) {
    motivos.push(`Escala ${texto} sobresale a ${ancho} px: allí la escala tipográfica es como máximo 1,25.`); return null; }
  return texto;
}

/** La puerta completa: si algo falla, el parche entero se descarta y se dice por qué. */
export function validarParcheDiseno(parche: unknown, contexto: ContextoParche): ResultadoParche {
  const motivos: string[] = [];
  let nivel: NivelUi = contexto.nivel ?? "proponer";
  if (nivel === "aplicar" && contexto.ambito === "cuenta") { nivel = "proponer"; // ui-permisos.ts: nunca se aplica solo
    motivos.push("El ámbito «cuenta» afecta a todos los perfiles y nunca se aplica solo: queda como propuesta.");
  }
  if (nivel === "nada") motivos.push("El nivel registrado es «nada»: este parche no se puede ni proponer.");
  const p = typeof parche === "object" && parche !== null && !Array.isArray(parche) ? (parche as ParcheDiseno) : undefined;
  if (!p || p.tokens === undefined) { motivos.push("No se entendió el parche: faltan o están rotos sus tokens."); }
  for (const v of p?.variantes ?? []) if (!VARIANTES.has(v)) motivos.push(`Variante «${v}» fuera de la lista blanca; el parche entero se descarta.`);
  if (p?.ocultarOdesactivar?.length) motivos.push(`Ocultar o desactivar «${p.ocultarOdesactivar.join(", ")}» está prohibido: ningún control esencial se toca.`);
  const parcheSeguro: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(p?.tokens ?? {})) {
    const seguro = validarValor(clave, valor, motivos);
    if (seguro !== null) parcheSeguro[clave.replace(/@\d+$/, "")] = seguro;
  }
  const c = contexto.texto && contexto.fondo ? contraste(contexto.texto, contexto.fondo) : null;
  if (c === null && contexto.texto && contexto.fondo) motivos.push("El contraste no se pudo medir: un color no se entiende (ni hex, ni rgb, ni hsl).");
  else if (c !== null && c < 4.5) motivos.push(`Contraste insuficiente: ${c.toFixed(2)}:1 y AA pide 4,5:1. Se descarta el cambio de color.`);
  const aplicable = motivos.length === 0 && nivel !== "nada";
  return aplicable ? { aplicable, parcheSeguro, motivos, nivel } : { aplicable: false, parcheSeguro: {}, motivos, nivel };
}
