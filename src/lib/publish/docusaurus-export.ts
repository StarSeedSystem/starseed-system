/**
 * Exportador Docusaurus (DSN1025F · Ola 1025R).
 * ═══════════════════════════════════════════
 * El OS NO ejecuta Docusaurus: solo escribe la carpeta `docs/` en Markdown PURO que
 * Docusaurus lee, para llevarla a un sitio creado a mano con `npm create docusaurus`.
 * Módulo PURO: sin `node:*`, sin red, sin reloj. Ficha `lib-docusaurus`
 * (config/repos-libreria-1025.json) y apartado 3.5 de architecture/repos-libreria-1025.md.
 */
import type { TemaGuia } from "@/lib/onboarding/guia-temas-sistema";
import type { EduNode } from "@/lib/education/curriculum";

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

const MAX_DOCS = 500;
const MAX_BYTES = 200 * 1024;
const ENTIDADES: Record<string, string> = {
  "{": "&#123;", "}": "&#125;", "<": "&lt;", ">": "&gt;",
};

/** Escapa `{}`, `<>` y la primera letra de líneas «import »/«export » para que Docusaurus no las trate como código MDX. */
export function escaparMd(texto: string): string {
  return texto.split("\n").map((linea) => {
    const conLetra = linea.replace(/^(import |export )/, (encabezado) =>
      `&#1${encabezado[0] === "i" ? "05" : "01"};${encabezado.slice(1)}`,
    );
    return conLetra.replace(/[{}<>]/g, (caracter) => ENTIDADES[caracter] ?? caracter);
  }).join("\n");
}

/** Slug en minúsculas ASCII: sin acentos, nada que no sea letra/número como «-». */
export function slugDoc(texto: string): string {
  const base = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base : "documento";
}

function frontMatter(campo: Record<string, string | number>): string {
  return Object.entries(campo)
    .map(([clave, valor]) => `${clave}: ${JSON.stringify(valor)}`)
    .join("\n");
}

function cuerpoConFrontMatter(
  id: string,
  titulo: string,
  cuerpo: string,
  orden?: number,
  descripcion?: string,
): string {
  const campo: Record<string, string | number> = { id, title: titulo };
  if (orden !== undefined) campo.sidebar_position = orden;
  if (descripcion) campo.description = descripcion;
  return `---\n${frontMatter(campo)}\n---\n\n${escaparMd(cuerpo)}\n`;
}

/** Registro de slugs por carpeta: el segundo «malla» pasa a «malla-2», el tercero a «malla-3»… */
function crearRegistroSlugs(): (texto: string) => string {
  const usados = new Map<string, number>();
  return (texto: string) => {
    const base = slugDoc(texto);
    const siguiente = (usados.get(base) ?? 0) + 1;
    usados.set(base, siguiente);
    return siguiente === 1 ? base : `${base}-${siguiente}`;
  };
}

/** Recorta a 200 000 caracteres el cuerpo de un documento (los avisos van en el LEEME). */
function recortar(contenido: string, aviso: { recortados: number }): string {
  if (contenido.length > MAX_BYTES) {
    aviso.recortados += 1;
    return `${contenido.slice(0, MAX_BYTES)}\n`;
  }
  return contenido;
}

export function docusaurusDesdeEntradas(
  entradas: EntradaDoc[],
  opciones?: { raiz?: string },
): ArchivoDocs[] {
  const raiz = opciones?.raiz ? `${opciones.raiz.replace(/\/+$/, "")}/` : "";
  const avisos = { recortados: 0 };
  const enCarpeta = new Map<string, ReturnType<typeof crearRegistroSlugs>>();
  const registroSueltos = crearRegistroSlugs();
  const archivos: ArchivoDocs[] = [];
  const visibles = entradas.slice(0, MAX_DOCS);
  avisos.recortados = entradas.length - visibles.length;

  for (const entrada of visibles) {
    const carpeta = entrada.grupo !== undefined ? slugDoc(entrada.grupo) : null;
    const registro = carpeta
      ? (enCarpeta.get(carpeta) ?? (() => { const r = crearRegistroSlugs(); enCarpeta.set(carpeta, r); return r; })())
      : registroSueltos;
    const slug = registro(entrada.titulo);
    const ruta = carpeta ? `docs/${carpeta}/${slug}.md` : `docs/${slug}.md`;
    archivos.push({
      path: raiz + ruta,
      content: recortar(
        cuerpoConFrontMatter(slug, entrada.titulo, entrada.cuerpo, entrada.orden, entrada.descripcion),
        avisos,
      ),
    });
  }

  archivos.push({
    path: `${raiz}LEEME-DOCUSAURUS.md`,
    content: leermeDocusaurus(avisos),
  });
  return archivos;
}

/** LEEME en español: los pasos MANUALES que quedan fuera del OS (crear el sitio, copiar, configurar). */
function leermeDocusaurus(avisos: { recortados: number }): string {
  const aviso = avisos.recortados > 0
    ? `> Aviso: ${avisos.recortados} documento(s) se recortaron al máximo de 200 KB por documento.\n\n`
    : "";
  return `# LEEME · docs/ exportada en Markdown puro (StarSeed OS)

Esta carpeta se exportó del OS como SOLO Markdown («.md», con «_category_.json» de carpeta,
nunca «.mdx», «.js», «.ts», «sidebars.js» ni «docusaurus.config.js»: en Docusaurus esos
archivos son CÓDIGO y el OS no lo escribe ni lo ejecuta).

Pasos MANUALES (fuera del OS, de quien tenga Node 20+):

1. npm create docusaurus@latest sitio classic — crea un sitio con la plantilla classic.
2. Copia la carpeta docs/ dentro del sitio creado (reemplaza la de ejemplo si existe).
3. En docusaurus.config.js del sitio añade format: 'detect' dentro de markdown, es decir
   markdown: { format: 'detect' }, para que los «.md» puros no se interpreten como MDX
   (los caracteres ya vienen escapados, y así se evita cualquier inyección MDX).
4. Si no quieres el aviso de versiones de su CLI, exporta NO_UPDATE_NOTIFIER=1 al lanzarlo.
5. Añade url, baseUrl y organizationName/projectName a tus datos antes de publicar.

La barra lateral se genera sola con el sidebars.js por defecto de la plantilla classic,
gracias a _category_.json y al front matter (title, sidebar_position, description).
Construir y desplegar el sitio (docusaurus build) es cosa tuya: nada se despliega sin la
palabra de Alex.

${aviso}Licencia de referencia: ficha lib-docusaurus · Docusaurus 3.10.2 (MIT el código,
CC-BY-4.0 la documentación). Exportado por StarSeed OS — módulo puro, sin ejecutar nada.
`;
}

/** Un tema de la guía se vuelve una entrada con sus puntos como lista y las dos líneas de ayuda. */
function entradaDeTema(tema: TemaGuia, indice: number, guia: string): EntradaDoc {
  const puntos = tema.puntos.length > 0
    ? `\n${tema.puntos.map((punto) => `- ${punto}`).join("\n")}`
    : "";
  return {
    id: tema.key,
    titulo: tema.titulo,
    grupo: guia,
    orden: indice + 1,
    descripcion: tema.voz,
    cuerpo: `${tema.cuerpo}${puntos}\n\nDónde: ${tema.ruta}\nPregunta a Astraura: ${tema.preguntaAurora}\n`,
  };
}

/** Exporta los temas de una guía (guia-temas-sistema / guia-temas-red) como carpeta docs/. */
export function docusaurusDesdeGuia(
  temas: readonly TemaGuia[],
  titulo: string,
): ArchivoDocs[] {
  const entradas = temas.map((tema, indice) => entradaDeTema(tema, indice, titulo));
  return docusaurusDesdeEntradas(entradas);
}

const CATEGORIA_BASE = { collapsed: false };

/** Exporta el árbol de educación (curriculum.ts) como docs/: carpeta con `_category_.json` por categoría o tema con hijos, un `.md` por hoja. */
export function docusaurusDesdeEdu(nodos: EduNode[]): ArchivoDocs[] {
  const hijos = new Map<string | null, EduNode[]>();
  for (const nodo of nodos) {
    const lista = hijos.get(nodo.parentId) ?? [];
    lista.push(nodo);
    hijos.set(nodo.parentId, lista);
  }
  const registros = new Map<string, ReturnType<typeof crearRegistroSlugs>>();
  const archivos: ArchivoDocs[] = [];

  const caminar = (nodo: EduNode, ruta: string[], indice: number): void => {
    const registro = registros.get(ruta.join("/")) ?? (() => {
      const nuevo = crearRegistroSlugs();
      registros.set(ruta.join("/"), nuevo);
      return nuevo;
    })();
    const slug = registro(nodo.name);
    const siguiente = [...ruta, slug];
    const descendencia = hijos.get(nodo.id) ?? [];
    if (descendencia.length > 0) {
      archivos.push({
        path: `docs/${siguiente.join("/")}/_category_.json`,
        content: `${JSON.stringify({ ...CATEGORIA_BASE, label: nodo.name, position: indice + 1 })}\n`,
      });
      descendencia.forEach((hijo, ordenHijo) => caminar(hijo, siguiente, ordenHijo));
    } else {
      archivos.push({
        path: `docs/${siguiente.join("/")}.md`,
        content: cuerpoConFrontMatter(nodo.id, nodo.name, nodo.blurb ?? nodo.name, undefined, nodo.blurb),
      });
    }
  };

  (hijos.get(null) ?? []).forEach((raiz, indiceRaiz) => caminar(raiz, [], indiceRaiz));
  return archivos;
}
