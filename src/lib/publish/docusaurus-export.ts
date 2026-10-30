/**
 * Exportador a `docs/` de Docusaurus (DSN1025F · Ola 1025R).
 * Módulo PURO (sin `node:*`, red ni reloj): escribe solo `.md` y `_category_.json`;
 * nunca `.mdx`, `.js`, `sidebars.*` ni `docusaurus.config.*`. El texto se escapa
 * para que Docusaurus no lo trate como código MDX.
 */
import type { TemaGuia } from "@/lib/onboarding/guia-temas-sistema";
import type { EduNode } from "@/lib/education/curriculum";

export interface ArchivoDocs { path: string; content: string }
export interface EntradaDoc {
  id: string; titulo: string; cuerpo: string;
  grupo?: string; orden?: number; descripcion?: string;
}

const MAX_DOCS = 500;
const MAX_BYTES = 200 * 1024;
const MARCA = "\n\n_(Documento recortado: supera los 200 KB.)_";
const enc = new TextEncoder();
const bytes = (texto: string): number => enc.encode(texto).length;

export function escaparMd(texto: string): string {
  return texto.replace(/\{/g, "&#123;").replace(/\}/g, "&#125;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .split("\n").map((l) => l.startsWith("import ") ? `&#105;${l.slice(1)}` : l.startsWith("export ") ? `&#101;${l.slice(1)}` : l).join("\n");
}

export function slugDoc(texto: string): string {
  const limpio = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return limpio || "documento";
}

const unico = (base: string, usados: Set<string>): string => {
  if (!usados.has(base)) { usados.add(base); return base; }
  let n = 2; while (usados.has(`${base}-${n}`)) n += 1;
  const slug = `${base}-${n}`; usados.add(slug); return slug;
};

function frontMatter(id: string, titulo: string, posicion: number, descripcion?: string): string {
  const lineas = ["---", `id: ${JSON.stringify(id)}`, `title: ${JSON.stringify(titulo)}`, `sidebar_position: ${posicion}`];
  if (descripcion) lineas.push(`description: ${JSON.stringify(descripcion)}`);
  return [...lineas, "---", ""].join("\n");
}

function recortar(content: string, path: string, avisos: string[]): string {
  if (bytes(content) <= MAX_BYTES) return content;
  avisos.push(`\`${path}\` supera los 200 KB y se ha recortado.`);
  const limite = MAX_BYTES - bytes(MARCA); let trozo = ""; let total = 0;
  for (const caracter of content) { const peso = bytes(caracter); if (total + peso > limite) break; trozo += caracter; total += peso; }
  return trozo + MARCA;
}

function construirLeeme(avisos: string[]): string {
  const lista = avisos.length ? avisos.map((a) => `- ${a}`).join("\n") : "- Ninguno: todo cabe en los límites.";
  return [
    "# LEEME · Cómo llevar esta carpeta a Docusaurus",
    "Esta salida es **solo Markdown puro** (`.md` y `_category_.json`). No incluye `sidebars.js`, `docusaurus.config.*` ni archivos `.mdx`: la barra lateral se autogenera con el `sidebars.js` por defecto.",
    "## Pasos manuales",
    "1. Crea el sitio con Node 20 o superior: `npm create docusaurus@latest sitio classic`.",
    "2. Copia la carpeta `docs/` dentro de `sitio/`.",
    "3. En `docusaurus.config.js` añade `markdown: { format: 'detect' }` para que el texto se lea como Markdown y no como MDX.",
    "4. Si no quieres el aviso de versiones nuevas de su CLI, ejecuta con `NO_UPDATE_NOTIFIER=1`.",
    "Nada se despliega sin la palabra de Alex: construir y publicar el sitio es un paso manual.",
    `## Avisos de esta exportación\n\n${lista}`,
  ].join("\n\n") + "\n";
}

export function docusaurusDesdeEntradas(entradas: EntradaDoc[], opciones: { raiz?: string } = {}): ArchivoDocs[] {
  const limpia = (opciones.raiz ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const base = limpia ? `${limpia}/` : "", avisos: string[] = [], carpetas = new Map<string, Set<string>>(), out: ArchivoDocs[] = [];
  if (entradas.length > MAX_DOCS) avisos.push(`Se han exportado ${MAX_DOCS} de ${entradas.length} documentos: el límite es ${MAX_DOCS}.`);
  entradas.slice(0, MAX_DOCS).forEach((entrada, indice) => {
    const grupoSlug = entrada.grupo && entrada.grupo.trim() ? slugDoc(entrada.grupo) : "", dir = grupoSlug ? `docs/${grupoSlug}` : "docs";
    const usados = carpetas.get(dir) ?? new Set<string>(); carpetas.set(dir, usados);
    const slug = unico(slugDoc(entrada.titulo || entrada.id), usados), path = `${base}${dir}/${slug}.md`;
    const pos = typeof entrada.orden === "number" && Number.isFinite(entrada.orden) ? Math.trunc(entrada.orden) : indice + 1;
    const content = frontMatter(slug, entrada.titulo, pos, entrada.descripcion) + `${escaparMd(entrada.cuerpo ?? "")}\n`;
    out.push({ path, content: recortar(content, path, avisos) });
  });
  out.push({ path: `${base}LEEME-DOCUSAURUS.md`, content: construirLeeme(avisos) });
  return out;
}

export function docusaurusDesdeGuia(temas: readonly TemaGuia[], titulo: string): ArchivoDocs[] {
  const entradas: EntradaDoc[] = temas.map((tema, indice) => ({
    id: tema.key, titulo: tema.titulo, grupo: titulo, orden: indice + 1,
    cuerpo: [tema.cuerpo, "", ...tema.puntos.map((punto) => `- ${punto}`), "", `Dónde: ${tema.ruta}`, "", `Pregunta a Astraura: ${tema.preguntaAurora}`].join("\n"),
  }));
  return docusaurusDesdeEntradas(entradas);
}

export function docusaurusDesdeEdu(nodos: EduNode[]): ArchivoDocs[] {
  const ids = new Set(nodos.map((n) => n.id)), hijos = new Map<string, EduNode[]>(), raices: EduNode[] = [];
  for (const n of nodos) {
    if (n.parentId && ids.has(n.parentId) && n.parentId !== n.id) { const l = hijos.get(n.parentId) ?? []; l.push(n); hijos.set(n.parentId, l); } else raices.push(n);
  }
  const cmp = (a: EduNode, b: EduNode) => a.name.localeCompare(b.name, "es");
  raices.sort(cmp); for (const l of hijos.values()) l.sort(cmp);
  const avisos: string[] = [], out: ArchivoDocs[] = [], carpetas = new Map<string, Set<string>>(), vistos = new Set<string>();
  let documentos = 0, recortado = false;
  const visitar = (nodo: EduNode, dir: string, pos: number) => {
    if (vistos.has(nodo.id)) return; vistos.add(nodo.id);
    if (documentos >= MAX_DOCS) { recortado = true; return; }
    const usados = carpetas.get(dir) ?? new Set<string>(); carpetas.set(dir, usados);
    const slug = unico(slugDoc(nodo.name || nodo.id), usados), path = `${dir}/${slug}.md`;
    out.push({ path, content: recortar(frontMatter(slug, nodo.name, pos, nodo.blurb) + `${escaparMd(nodo.blurb ?? "")}\n`, path, avisos) });
    documentos += 1;
    const propios = hijos.get(nodo.id) ?? []; if (!propios.length) return;
    const carpeta = `${dir}/${slug}`;
    out.push({ path: `${carpeta}/_category_.json`, content: `${JSON.stringify({ label: nodo.name, position: pos, collapsed: false })}\n` });
    propios.forEach((hijo, indice) => visitar(hijo, carpeta, indice + 1));
  };
  raices.forEach((nodo, indice) => visitar(nodo, "docs", indice + 1));
  if (recortado) avisos.push(`Se han exportado ${documentos} documentos: el límite es ${MAX_DOCS}.`);
  out.push({ path: "LEEME-DOCUSAURUS.md", content: construirLeeme(avisos) });
  return out;
}
