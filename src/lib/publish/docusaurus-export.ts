/**
 * Exportador Docusaurus (DSN1025F · Ola 1025R): convierte entradas, temas de guía («TemaGuia»)
 * y nodos de educación («EduNode») en una carpeta `docs/` de Markdown PURO que un sitio creado
 * a mano con `npm create docusaurus` lee tal cual. El OS NUNCA ejecuta Docusaurus ni exporta
 * `.mdx`, `sidebars.*` ni `docusaurus.config.*`. Módulo PURO: sin `node:*`, sin red, sin reloj.
 */

import type { EduNode } from "@/lib/education/curriculum";
import type { TemaGuia } from "@/lib/onboarding/guia-temas-sistema";

export interface ArchivoDocs {
  path: string;
  content: string;
}

export interface EntradaDoc {
  id: string;
  titulo: string;
  cuerpo: string;
  grupo?: string;
  orden?: number;
  descripcion?: string;
}

/** Tope de documentos por exportación (lo que pasa se avisa en el LEEME). */
const MAX_DOCS = 500;
/** Tope de tamaño por documento, en bytes (200 KB). */
const MAX_BYTES = 200 * 1024;

const Q = (v: string): string => JSON.stringify(v);

export function escaparMd(texto: string): string {
  const limpio = texto
    .replaceAll("{", "&#123;")
    .replaceAll("}", "&#125;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  // Primera letra de una línea «import »/«export » como entidad: que Docusaurus (MDX) no la tome por código.
  return limpio
    .replace(/^export /gim, (m) => `&#101;${m.slice(1)}`)
    .replace(/^import /gim, (m) => `&#105;${m.slice(1)}`);
}

export function slugDoc(texto: string): string {
  const base = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "doc";
}

function peso(texto: string): number {
  return new TextEncoder().encode(texto).length;
}

/** Recorta a 200 KB (bytes reales) sin partir un carácter multibyte. */
function recortarA200kb(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  if (bytes.length <= MAX_BYTES) return texto;
  let fin = MAX_BYTES;
  while ((bytes[fin] & 0xc0) === 0x80) fin -= 1;
  return new TextDecoder().decode(bytes.slice(0, fin));
}

function frontMatter(id: string, titulo: string, orden: number, descripcion?: string): string {
  const lineas = ["---", `id: ${Q(id)}`, `title: ${Q(titulo)}`, `sidebar_position: ${orden}`];
  if (descripcion && descripcion.trim()) lineas.push(`description: ${Q(descripcion)}`);
  return `${lineas.join("\n")}\n---\n`;
}

function categoriaJson(label: string, position: number): string {
  return `${JSON.stringify({ label, position, collapsed: false }, null, 2)}\n`;
}

interface BorradorDoc {
  path: string;
  id: string;
  titulo: string;
  orden: number;
  descripcion?: string;
  cuerpo: string;
}

/** `{ path, label, position }` de cada carpeta con `_category_.json`; el orden del Map se respeta. */
type Carpeta = { path: string; label: string; position: number };

function limpiarRaiz(raiz?: string): string {
  const r = (raiz ?? "docs").trim().replace(/^\/+|\/+$/g, "");
  return r || "docs";
}

/** Sufijo «-2», «-3» cuando un slug ya existe en la misma carpeta (determinista). */
function slugUnico(carpeta: string, base: string, usados: Map<string, Map<string, number>>): string {
  const porCarpeta = usados.get(carpeta) ?? new Map<string, number>();
  usados.set(carpeta, porCarpeta);
  const n = (porCarpeta.get(base) ?? 0) + 1;
  porCarpeta.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}

function textoLeeme(origen: string, recortados: string[], omitidos: number): string {
  const notas: string[] = [];
  if (recortados.length > 0) {
    notas.push(`- Recortados al tope de 200 KB por documento: ${recortados.join(", ")}.`);
  }
  if (omitidos > 0) {
    notas.push(`- Se omitieron ${omitidos} documentos por el tope de ${MAX_DOCS} por exportación.`);
  }
  return [
    "# LEEME · exportación de StarSeed OS para Docusaurus",
    "",
    `Esta carpeta nace de exportar ${origen}. Es Markdown puro, sin código ejecutable; el OS NO ejecuta Docusaurus: crear y construir el sitio es un paso MANUAL y tuyo (Node 20+):`,
    "",
    "1. `npm create docusaurus@latest sitio classic`",
    "2. Copia la carpeta `docs/` de esta exportación dentro del sitio.",
    "3. En el `docusaurus.config.js` del sitio añade `markdown: { format: 'detect' }`, para que los textos no se interpreten como MDX.",
    "4. Si quieres silenciar el aviso de versiones de su CLI: exporta `NO_UPDATE_NOTIFIER=1`.",
    "5. Nada se despliega ni se publica sin la palabra de Alex.",
    "",
    "La barra lateral se autogenera con el `sidebars.js` por defecto de Docusaurus: aquí no se exporta ningún código de configuración.",
    "Los textos van escapados (`{` → `&#123;`, `<` → `&lt;`; la primera letra de las líneas «import»/«export» como entidad) para que nada se lea como MDX.",
    ...notas,
    "",
  ].join("\n");
}

function ensamblar(
  borradores: BorradorDoc[],
  carpetas: Map<string, Carpeta>,
  pedidas: number,
  origen: string,
): ArchivoDocs[] {
  const salida: ArchivoDocs[] = [];
  for (const c of carpetas.values()) {
    salida.push({ path: `${c.path}/_category_.json`, content: categoriaJson(c.label, c.position) });
  }
  const recortados: string[] = [];
  const maximo = Math.min(borradores.length, MAX_DOCS);
  for (let k = 0; k < maximo; k += 1) {
    const d = borradores[k];
    const cuerpo = `${escaparMd(d.cuerpo).trimEnd()}\n`;
    if (peso(cuerpo) > MAX_BYTES) recortados.push(d.titulo);
    salida.push({ path: d.path, content: frontMatter(d.id, d.titulo, d.orden, d.descripcion) + recortarA200kb(cuerpo) });
  }
  const omitidos = pedidas - maximo;
  salida.push({ path: "LEEME-DOCUSAURUS.md", content: textoLeeme(origen, recortados, omitidos) });
  return salida;
}

export function docusaurusDesdeEntradas(
  entradas: EntradaDoc[],
  opciones?: { raiz?: string },
): ArchivoDocs[] {
  const raiz = limpiarRaiz(opciones?.raiz);
  const conIndice = entradas.map((e, i) => ({ e, i }));
  // Orden estable: primero por `orden`, manteniendo el orden de entrada entre iguales.
  conIndice.sort(
    (a, b) =>
      (a.e.orden ?? Number.MAX_SAFE_INTEGER) - (b.e.orden ?? Number.MAX_SAFE_INTEGER) || a.i - b.i,
  );
  const carpetas = new Map<string, Carpeta>();
  const usados = new Map<string, Map<string, number>>();
  const borradores: BorradorDoc[] = [];
  for (const { e } of conIndice) {
    const titulo = e.titulo.trim();
    if (!titulo) continue;
    const grupo = e.grupo?.trim() ?? "";
    const carpeta = grupo ? `${raiz}/${slugDoc(grupo)}` : raiz;
    if (grupo && !carpetas.has(carpeta)) {
      carpetas.set(carpeta, { path: carpeta, label: grupo, position: carpetas.size + 1 });
    }
    const slug = slugUnico(carpeta, slugDoc(titulo), usados);
    borradores.push({
      path: `${carpeta}/${slug}.md`,
      id: e.id.trim() || slug,
      titulo,
      orden: borradores.length + 1,
      descripcion: e.descripcion,
      cuerpo: e.cuerpo,
    });
  }
  return ensamblar(borradores, carpetas, entradas.length, `un grupo de ${borradores.length} documentos`);
}

export function docusaurusDesdeGuia(temas: readonly TemaGuia[], titulo: string): ArchivoDocs[] {
  const carpeta = `docs/${slugDoc(titulo)}`;
  const carpetas = new Map<string, Carpeta>([
    [carpeta, { path: carpeta, label: titulo, position: 1 }],
  ]);
  const usados = new Map<string, Map<string, number>>();
  const borradores = temas.map((t, i): BorradorDoc => {
    const slug = slugUnico(carpeta, slugDoc(t.titulo), usados);
    const cuerpo = [
      t.cuerpo,
      "",
      ...t.puntos.map((p) => `- ${p}`),
      "",
      `Dónde: ${t.ruta}`,
      `Pregunta a Astraura: ${t.preguntaAurora}`,
    ].join("\n");
    return {
      path: `${carpeta}/${slug}.md`,
      id: slug,
      titulo: t.titulo,
      orden: i + 1,
      cuerpo,
    };
  });
  return ensamblar(borradores, carpetas, temas.length, `la guía «${titulo}»`);
}

export function docusaurusDesdeEdu(nodos: EduNode[]): ArchivoDocs[] {
  const raiz = "docs";
  const hijos = new Map<string | null, EduNode[]>();
  for (const n of nodos) {
    const padre = n.parentId ?? null;
    hijos.set(padre, [...(hijos.get(padre) ?? []), n]);
  }
  const carpetas = new Map<string, Carpeta>();
  const usados = new Map<string, Map<string, number>>();
  const borradores: BorradorDoc[] = [];
  const DESCRIPTO_NADA = "Este nodo todavía no tiene una descripción escrita.";
  const recorrer = (lista: EduNode[], carpeta: string): void => {
    lista.forEach((nodo, i) => {
      const slug = slugUnico(carpeta, slugDoc(nodo.name.trim() || nodo.id), usados);
      const hijosNodo = hijos.get(nodo.id) ?? [];
      const cuerpo = nodo.blurb?.trim() ? nodo.blurb : DESCRIPTO_NADA;
      if (hijosNodo.length > 0) {
        const carpetaNodo = `${carpeta}/${slug}`;
        carpetas.set(carpetaNodo, { path: carpetaNodo, label: nodo.name, position: i + 1 });
        borradores.push({
          path: `${carpetaNodo}/${slug}.md`,
          id: slug,
          titulo: nodo.name,
          orden: i + 1,
          cuerpo,
        });
        recorrer(hijosNodo, carpetaNodo);
      } else {
        borradores.push({ path: `${carpeta}/${slug}.md`, id: slug, titulo: nodo.name, orden: i + 1, cuerpo });
      }
    });
  };
  recorrer(hijos.get(null) ?? [], raiz);
  return ensamblar(borradores, carpetas, nodos.length, `el árbol de educación (${borradores.length} nodos)`);
}
