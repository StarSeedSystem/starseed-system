// Herramienta `diagrama.crear` (architecture/diagramas.md §3-2 y §4-F): arma el contexto del modelo y
// valida el HTML que devuelve. Skill MIT diagram-design (Cathryn Lavery, vendor/habilidades/diagram-design/).
// Módulo PURO: sin red, disco, DOM ni `any`.
import { TIPOS_DIAGRAMA, type TipoDiagrama } from "@/ai/astraura/habilidades/diagramas";
import { prepararDiagrama, type AislarDiagramaResultado } from "./aislar-diagrama";
import { sustituirFuentes, type FuenteDisponible } from "./fuentes-locales";
import { perfilDesdeTema, type PerfilDiagrama } from "./perfil-marca";

export const TAMANOS_DIAGRAMA = ["tarjeta", "resumen", "completa"] as const;
export type TamanoDiagrama = (typeof TAMANOS_DIAGRAMA)[number];
type Preset = { preset: string; lienzo: string; nodos: number; flechas: number };
const PRESETS: Record<TamanoDiagrama, Preset> = {
  tarjeta: { preset: "social-square", lienzo: "0 0 1080 1080", nodos: 5, flechas: 8 },
  resumen: { preset: "doc-inline", lienzo: "0 0 960 600", nodos: 9, flechas: 12 },
  completa: { preset: "doc-wide", lienzo: "0 0 1280 720", nodos: 9, flechas: 12 },
};
/** Perfil de marca de respaldo: la piel de la skill en modo claro. */
export const PERFIL_POR_DEFECTO: PerfilDiagrama = perfilDesdeTema({ vars: {} }, "light");

export interface OpcionesPedido {
  peticion: string; tipo?: string; perfil: PerfilDiagrama | string; tamano: TamanoDiagrama | string; animado: boolean;
}
export interface PedidoDiagrama {
  ok: boolean; tipo: TipoDiagrama; tamano: TamanoDiagrama; animado: boolean; rutaGuia: string;
  instrucciones: string; avisos: string[];
}
const normal = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
/** Señales de la petición → tipo, en orden de prioridad (la última es el respaldo). */
const SENALES: [RegExp, string][] = [
  [/flujo|decisi[oó]n|rama|algoritmo/, "flowchart"], [/secuencia|mensaje|protocolo/, "sequence"],
  [/estado|transici[oó]n|guardia/, "state"], [/entidad|relaci[oó]n|modelo de datos|base de datos/, "er"],
  [/gantt|cronograma|hito/, "gantt"], [/sankey|reparto de|cantidad que se divide/, "sankey"],
  [/dependencia|paquete/, "dependency"], [/capas|pila|nivel/, "layers"],
  [/organigrama|equipo|qui[eé]n posee/, "org-chart"], [/tiempo|historia|incidente/, "timeline"],
  [/kanban|trabajo en curso|wip/, "kanban"], [/cuadrante|prioriz/, "quadrant"],
  [/radar|capacidad|evaluaci/, "radar"], [/arquitectura|componente|infraestructura|sistema/, "architecture"],
];
/** Elige el tipo por id o nombre; si no llega, lo deduce de la petición; si tampoco, arquitectura. */
export function elegirTipo(peticion: string, tipo?: string): { tipo: TipoDiagrama; aviso?: string } {
  const pedido = normal(tipo ?? "");
  if (pedido) {
    const hallado = TIPOS_DIAGRAMA.find((t) => t.id === pedido || normal(t.nombre) === pedido);
    if (hallado) return { tipo: hallado };
    return { tipo: TIPOS_DIAGRAMA[0], aviso: `Tipo «${tipo}» desconocido: uso ${TIPOS_DIAGRAMA[0].nombre}.` };
  }
  const id = SENALES.find(([re]) => re.test(normal(peticion)))?.[1];
  return { tipo: TIPOS_DIAGRAMA.find((t) => t.id === id) ?? TIPOS_DIAGRAMA[0] };
}
/** Perfil compacto para el prompt; un texto se usa tal cual. */
function resumenPerfil(perfil: PerfilDiagrama | string): string {
  if (typeof perfil === "string") return perfil.trim();
  const c = perfil.colores, f = perfil.fuentes, t = perfil.trazos, r = perfil.radios;
  return `Modo ${perfil.modo}. Papeles: paper ${c.paper}, paper-2 ${c["paper-2"]}. Tinta: ink ${c.ink}, ink-strong ${c["ink-strong"]}, muted ${c.muted}, soft ${c.soft}. Filetes: rule ${c.rule}, rule-solid ${c["rule-solid"]}. Foco (1–2): accent ${c.accent}, accent-tint ${c["accent-tint"]}; enlaces: link ${c.link}. Fuentes: serif ${f.serif}; sans ${f.sans}; mono ${f.mono}. Trazos ${t.thin}/${t.default}/${t.strong}; radios ${r.sm}/${r.md}/${r.lg}px.`;
}
/** Arma el contexto del modelo: tipo, guía del tipo, perfil de marca, tamaño, movimiento y reglas. */
export function pedidoDiagrama({ peticion, tipo: pedido, perfil, tamano, animado }: OpcionesPedido): PedidoDiagrama {
  const avisos: string[] = [];
  const { tipo, aviso } = elegirTipo(peticion, pedido);
  if (aviso) avisos.push(aviso);
  const limpio = (peticion ?? "").trim();
  if (!limpio) avisos.push("Falta la petición: sin ella no se puede dibujar.");
  const t = (TAMANOS_DIAGRAMA as readonly string[]).includes(tamano) ? (tamano as TamanoDiagrama) : "resumen";
  if (t !== tamano) avisos.push(`Tamaño «${tamano}» desconocido: uso ${t}.`);
  const p = PRESETS[t], guia = `vendor/habilidades/diagram-design/references/type-${tipo.id}.md`;
  const movimiento = animado
    ? `Animación: data-motion-mode="reveal" (o "step" con controles) según references/animation.md; máximo 8 pasos y 12 elementos, y el HTML estático completo antes de animar. El iframe llevará sandbox="allow-scripts", sin allow-same-origin.`
    : `Sin animación: data-motion-mode="none", estático y sin <script>.`;
  const instrucciones = [
    "Eres Astraura dibujando un diagrama con la skill Diagram Design (Cathryn Lavery, licencia MIT, copia en vendor/habilidades/diagram-design/).",
    `Petición: ${limpio || "(sin petición)"}`,
    `Tipo elegido: ${tipo.nombre} (${tipo.id}). ${tipo.frase}`,
    `Lee antes de dibujar la guía del tipo: ${guia}; y references/primitives-core.md, references/style-guide.md, references/output-spec.md y references/semantic-patterns.md.`,
    `Lienzo ${p.preset}: viewBox «${p.lienzo}». Presupuesto: ≤ ${p.nodos} nodos, ≤ ${p.flechas} flechas y ≤ 2 acentos.`,
    `Perfil de marca (usa estos roles, no inventes colores): ${resumenPerfil(perfil)}`,
    movimiento,
    `Entrega UN documento HTML autocontenido con <!DOCTYPE html>, <html lang="es" data-diagrama="${tipo.id}">, <head>, <body> y el <svg> en línea; devuelve solo el HTML, sin explicaciones.`,
    "Seguridad: nada de red ni recursos externos (sin <link>, @import, url(http…), Google Fonts ni <img> remoto); fuentes del OS. Prohibidos <iframe>, <object>, <embed>, <form>, on*=, javascript: y meta refresh. Máximo 2 MB.",
    "Accesibilidad y estilo: SVG con <title> y <desc>, conectores ortogonales, etiquetas enmascaradas y sin sombras; densidad 4/10. No incluyas datos privados de la persona.",
  ].join("\n");
  return { ok: avisos.length === 0, tipo, tamano: t, animado, rutaGuia: guia, instrucciones, avisos };
}
export interface OpcionesRecibir { fuentes?: FuenteDisponible[]; permitirAnimacion?: boolean }
export interface DiagramaRecibido extends AislarDiagramaResultado { tipo: string | null }
const RE_CERCO = /```(?:html|htm)\s*\r?\n([\s\S]*?)```/i;
const RE_TIPO = /data-diagrama(?:-tipo)?\s*=\s*["']([a-z0-9-]+)["']|<!--\s*diagram-design\s+tipo:\s*([a-z0-9-]+)/i;
/** Saca el documento HTML de la respuesta: cerco markdown, prosa alrededor o un <svg> suelto. */
function extraerHtml(respuesta: string): { html: string; motivos: string[] } {
  const cerco = RE_CERCO.exec((respuesta ?? "").trim());
  const texto = (cerco ? cerco[1] : (respuesta ?? "")).trim();
  const fin = texto.toLowerCase().lastIndexOf("</html>"), doctype = texto.search(/<!doctype\s+html/i);
  if (doctype >= 0) return { html: fin > doctype ? texto.slice(doctype, fin + 7) : texto.slice(doctype), motivos: [] };
  const html = texto.search(/<html\b/i);
  if (html >= 0) return {
    html: fin > html ? texto.slice(html, fin + 7) : texto.slice(html),
    motivos: ["añadido <!DOCTYPE html> a un documento sin doctype"],
  };
  const svg = texto.search(/<svg\b/i), cierre = texto.toLowerCase().lastIndexOf("</svg>");
  if (svg < 0) return { html: "", motivos: ["no encontré HTML de diagrama en la respuesta"] };
  return {
    html: `<!DOCTYPE html>\n<html lang="es"><head><meta charset="utf-8"><title>Diagrama</title></head><body>${texto.slice(svg, cierre > svg ? cierre + 6 : undefined)}</body></html>`,
    motivos: ["envuelto un <svg> suelto en un documento HTML"],
  };
}
/** Extrae el HTML, sustituye las fuentes remotas por las del OS y lo valida para el iframe aislado. */
export function recibirDiagrama(respuesta: string, opciones: OpcionesRecibir = {}): DiagramaRecibido {
  const { html, motivos } = extraerHtml(respuesta);
  const declarado = RE_TIPO.exec(html), crudo = declarado ? declarado[1] ?? declarado[2] ?? null : null;
  const tipo = crudo && TIPOS_DIAGRAMA.some((t) => t.id === crudo) ? crudo : null;
  if (html && !tipo) motivos.push("el HTML no declara un data-diagrama conocido");
  if (!html) return { ok: false, sandbox: "", tipo, motivos };
  const conFuentes = sustituirFuentes(html, opciones.fuentes ?? []);
  const animado = opciones.permitirAnimacion ?? /<script\b|data-motion-mode\s*=\s*["']?(?:reveal|step|loop)/i.test(conFuentes);
  const r = prepararDiagrama(conFuentes, { permitirAnimacion: animado });
  return { ...r, tipo, motivos: [...motivos, ...r.motivos] };
}
