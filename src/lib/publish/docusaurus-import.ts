/**
 * Importador de una carpeta `docs/` de Docusaurus (DSN1025G · Ola 1025R).
 * Módulo PURO (sin `node:*` ni red): recibe los archivos ya cargados y NUNCA ejecuta nada.
 * Solo se aceptan `.md`; `.mdx` es código y `sidebars.*`, `docusaurus.config.*`, `.js/.ts/...`
 * son configuración que jamás se lee ni se ejecuta. El YAML se limita a `clave: valor`.
 */
import type { EduNode, EduNodeKind } from "@/lib/education/curriculum";
import { slugDoc, type ArchivoDocs } from "./docusaurus-export";

export interface DocImportado { ruta: string; id: string; titulo: string; cuerpo: string; orden: number | null; carpetas: string[] }
export interface CategoriaImportada { ruta: string; label: string; orden: number | null }
export interface ResultadoImport { docs: DocImportado[]; categorias: CategoriaImportada[]; rechazados: { path: string; motivo: string }[] }
const MAX_FILES = 500, MAX_BYTES = 200 * 1024;
const CONFIG = /^(sidebars|docusaurus\.config)\./i, CODIGO = /\.(js|jsx|ts|tsx|mjs|cjs)$/i;
const normalizar = (p: string): string => p.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^(\.\/|\/)+/, "");
const extension = (p: string): string => { const b = p.split("/").pop() ?? ""; const i = b.lastIndexOf("."); return i < 0 ? "" : b.slice(i).toLowerCase(); };
const motivoRechazo = (p: string): string | null => {
  const b = p.split("/").pop() ?? p, ext = extension(b);
  if (CONFIG.test(b) || CODIGO.test(ext)) return "configuración: nunca se lee ni se ejecuta";
  if (ext === ".mdx") return "MDX es código";
  return ext === ".md" ? null : "tipo no admitido";
};
type FrontMatter = Record<string, string>;
function leerFrontMatter(texto: string): { fm: FrontMatter; cuerpo: string } | { error: string } {
  const lineas = texto.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  if (lineas[0]?.trim() !== "---") return { fm: {}, cuerpo: texto };
  const cierre = lineas.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (cierre < 0) return { fm: {}, cuerpo: texto };
  const fm: FrontMatter = {};
  for (const cruda of lineas.slice(1, cierre)) {
    if (!cruda.trim()) continue;
    if (/^\s/.test(cruda) || /^-\s/.test(cruda.trim()) || /[&*]|!!/.test(cruda)) return { error: "YAML avanzado" };
    const corte = cruda.indexOf(":");
    if (corte < 1) return { error: "YAML avanzado" };
    const clave = cruda.slice(0, corte).trim().toLowerCase();
    if (!clave || /\s/.test(clave)) return { error: "YAML avanzado" };
    let valor = cruda.slice(corte + 1).trim();
    if (/^[|>]/.test(valor)) return { error: "YAML avanzado" };
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) valor = valor.slice(1, -1);
    fm[clave] = valor;
  }
  return { fm, cuerpo: lineas.slice(cierre + 1).join("\n") };
}
const limpiarCuerpo = (texto: string): string => texto
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
  .replace(/<[^>]*>/g, "").replace(/^\s*(?:import|export)\s.*$/gm, "")
  .replace(/\[([^\]]*)\]\(\s*javascript:[^)]*\)/gi, "$1").replace(/javascript:[^\s)"']+/gi, "")
  .replace(/\n{3,}/g, "\n\n").trim();
const sinMarcas = (texto: string): string => texto
  .replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
  .replace(/[`*_>#~]/g, "").replace(/\s+/g, " ").trim();
/**
 * Convierte la ruta relativa que entrega el selector de carpeta del navegador
 * («mi-sitio/docs/teoria/x.md») en la ruta que espera `leerDocusaurus`
 * («docs/teoria/x.md»): corta todo lo anterior al segmento `docs` y, si no lo
 * hay, se queda con la ruta tal cual. Solo mueve texto de ruta: nunca toca el
 * contenido del archivo ni ejecuta nada de él (el truco: el importador ya
 * descarta por su motivo todo lo que no sea `.md`).
 */
export function rutaDesdeCarpeta(ruta: string): string {
  const partes = ruta.replace(/\\/g, "/").split("/").filter(Boolean);
  const i = partes.indexOf("docs");
  return (i >= 0 ? partes.slice(i) : partes).join("/");
}
const tituloDe = (fm: FrontMatter, cuerpo: string, ruta: string): string => {
  if (fm.title || fm.sidebar_label) return fm.title || fm.sidebar_label;
  const h1 = cuerpo.match(/^#\s+(.+)$/m);
  return h1?.[1]?.trim() || (ruta.split("/").pop() ?? ruta).replace(/\.md$/i, "");
};
const numero = (v: string | undefined): number | null => (v && Number.isFinite(Number(v)) ? Number(v) : null);
const sinDocs = (p: string): string => p.replace(/^docs\//, "");
const carpetasDe = (p: string): string[] => { const partes = sinDocs(p).split("/"); partes.pop(); return partes.filter(Boolean); };
const nombreCarpeta = (ruta: string): string => {
  const seg = ruta.split("/").filter(Boolean).pop() ?? ruta, limpio = seg.replace(/[-_]+/g, " ").trim();
  return limpio ? limpio.charAt(0).toUpperCase() + limpio.slice(1) : "Documentos"; };
const compararOrden = (a: number | null, b: number | null): number =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a - b;
export function leerDocusaurus(archivos: ArchivoDocs[]): ResultadoImport {
  const docs: DocImportado[] = [], rechazados: { path: string; motivo: string }[] = [];
  const categorias = new Map<string, CategoriaImportada>(), vistos = new Set<string>(), enc = new TextEncoder();
  const ordenados = archivos.map((a) => ({ path: normalizar(a.path), content: a.content }))
    .sort((a, b) => a.path.localeCompare(b.path, "es"));
  for (const archivo of ordenados) {
    const path = archivo.path;
    if (vistos.has(path)) { rechazados.push({ path, motivo: "ruta duplicada" }); continue; }
    vistos.add(path);
    if ((path.split("/").pop() ?? "") === "_category_.json") {
      const ruta = sinDocs(path.split("/").slice(0, -1).join("/"));
      try {
        const dato = JSON.parse(archivo.content) as { label?: unknown; position?: unknown };
        if (ruta) categorias.set(ruta, {
          ruta, label: typeof dato.label === "string" && dato.label.trim() ? dato.label.trim() : nombreCarpeta(ruta),
          orden: typeof dato.position === "number" && Number.isFinite(dato.position) ? dato.position : null,
        });
      } catch { rechazados.push({ path, motivo: "JSON inválido" }); }
      continue;
    }
    const motivo = motivoRechazo(path);
    if (motivo) { rechazados.push({ path, motivo }); continue; }
    if (enc.encode(archivo.content).length > MAX_BYTES) { rechazados.push({ path, motivo: "supera los 200 KB" }); continue; }
    const leido = leerFrontMatter(archivo.content);
    if ("error" in leido) { rechazados.push({ path, motivo: leido.error }); continue; }
    if (docs.length >= MAX_FILES) { rechazados.push({ path, motivo: "límite de 500 archivos" }); continue; }
    const cuerpo = limpiarCuerpo(leido.cuerpo), titulo = tituloDe(leido.fm, cuerpo, path);
    docs.push({ ruta: path, id: leido.fm.id || slugDoc(titulo), titulo, cuerpo, orden: numero(leido.fm.sidebar_position), carpetas: carpetasDe(path) });
  }
  for (const doc of docs) for (let i = 0; i < doc.carpetas.length; i += 1) {
    const ruta = doc.carpetas.slice(0, i + 1).join("/");
    if (!categorias.has(ruta)) categorias.set(ruta, { ruta, label: nombreCarpeta(ruta), orden: null });
  }
  docs.sort((a, b) => compararOrden(a.orden, b.orden) || a.ruta.localeCompare(b.ruta, "es"));
  const lista = [...categorias.values()].sort((a, b) => compararOrden(a.orden, b.orden) || a.ruta.localeCompare(b.ruta, "es"));
  return { docs, categorias: lista, rechazados };
}
export function aNodosEdu(r: ResultadoImport): EduNode[] {
  const etiquetas = new Map(r.categorias.map((c) => [c.ruta, c.label]));
  const carpetas = new Map<string, string>(), nodos: EduNode[] = [];
  const crearCarpeta = (ruta: string, nivel: number, parentId: string | null): string => {
    const previo = carpetas.get(ruta);
    if (previo) return previo;
    const id = `docusaurus:carpeta:${ruta}`;
    const kind: EduNodeKind = nivel === 0 ? "category" : nivel === 1 ? "topic" : "subtopic";
    nodos.push({ id, kind, name: etiquetas.get(ruta) ?? nombreCarpeta(ruta), parentId, custom: true });
    carpetas.set(ruta, id);
    return id;
  };
  for (const doc of r.docs) {
    let parentId: string | null = null;
    doc.carpetas.forEach((_, i) => { parentId = crearCarpeta(doc.carpetas.slice(0, i + 1).join("/"), i, parentId); });
    nodos.push({ id: `docusaurus:${doc.ruta}`, kind: "subtopic", name: doc.titulo, blurb: sinMarcas(doc.cuerpo).slice(0, 280), parentId, custom: true });
  }
  return nodos;
}
