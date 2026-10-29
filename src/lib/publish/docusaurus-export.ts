/**
 * Exportación a Docusaurus (DSN1025F · Ola 1025F) — módulo PURO.
 * Sin `node:*`, sin red, sin reloj: lo puede importar un componente de cliente y una
 * prueba sin tocar nada del sistema. El OS NO ejecuta Docusaurus: solo escribe la
 * carpeta `docs/` en Markdown puro (solo `.md` con front matter y `_category_.json`;
 * la barra lateral la autogenera el `sidebars.js` por defecto del sitio), para llevarla
 * a un sitio creado a mano con `npm create docusaurus`.
 * Ficha lib-docusaurus en `config/repos-libreria-1025.json`: MIT el código,
 * CC-BY-4.0 la documentación; línea estable 3.10.2, Node 20+.
 */

import type { TemaGuia } from "@/lib/onboarding/guia-temas-sistema";
import type { EduNode } from "@/lib/education/curriculum";

/** Un archivo de la carpeta `docs/` exportada: ruta relativa y contenido textual. */
export interface ArchivoDocs {
  path: string;
  content: string;
}

/** Un documento listo para escribirse como `.md` en `docs/`. */
export interface EntradaDoc {
  id: string;
  titulo: string;
  cuerpo: string;
  grupo?: string;
  orden?: number;
  descripcion?: string;
}

const MAX_DOCS = 500;
const MAX_BYTES = 200_000;

/** Escapa lo que el MDX trataría como código: llaves, ángulos y líneas import/export. */
export function escaparMd(texto: string): string {
  const escapado = texto
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escapado
    .split("\n")
    .map((linea) =>
      linea.startsWith("import ")
        ? `&#105;${linea.slice(1)}`
        : linea.startsWith("export ")
          ? `&#101;${linea.slice(1)}`
          : linea,
    )
    .join("\n");
}

/** Slug minúscula ASCII para rutas de `docs/`; cadena vacía → «doc». */
export function slugDoc(texto: string): string {
  const base = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "doc";
}

/** Front matter YAML con valores entre comillas dobles vía JSON.stringify. */
function frontMatter(id: string, titulo: string, orden: number, descripcion?: string): string {
  const lineas = [
    "id: " + JSON.stringify(id),
    "title: " + JSON.stringify(titulo),
    "sidebar_position: " + orden,
  ];
  if (descripcion) lineas.push("description: " + JSON.stringify(descripcion));
  return "---\n" + lineas.join("\n") + "\n---\n\n";
}

/** Un documento `.md` completo a partir de una entrada: cabecera + cuerpo escapado. */
function docMd(id: string, entrada: EntradaDocLike, orden: number): string {
  return (
    frontMatter(id, entrada.titulo, orden, entrada.descripcion) +
    escaparMd(entrada.cuerpo.trim()) +
    "\n"
  );
}

type EntradaDocLike = Pick<EntradaDoc, "titulo" | "cuerpo" | "descripcion">;

/** Recorta un documento que pase de 200 KB (se avisa en el cuerpo). */
function recortar(texto: string): string {
  if (recodificador.encode(texto).length <= MAX_BYTES) return texto;
  let corto = texto;
  while (corto.length > 0 && recodificador.encode(corto).length > MAX_BYTES) {
    corto = corto.slice(0, corto.length - Math.ceil(corto.length / 100));
  }
  return corto + "\n\n«Recortado: pasaba de los 200 KB por documento.»\n";
}

const recodificador = new TextEncoder();

/** `_category_.json` de una carpeta de grupo: label, position y collapsed a false. */
function categoriaJson(label: string, position: number): string {
  return JSON.stringify({ label, position, "collapsed": false }, null, 2) + "\n";
}

/** Reserva un slug dentro de una carpeta: «-2», «-3»… si choca con uno ya usado. */
function usarSlug(slugs: Set<string>, base: string): string {
  let n = 1;
  let intento = base;
  while (slugs.has(intento)) {
    n += 1;
    intento = base + "-" + n;
  }
  slugs.add(intento);
  return intento;
}

const LEEME = `# Léeme · exportación a Docusaurus

Esto es Markdown puro escrito por StarSeed OS (solo \`.md\` con front matter y
\`_category_.json\`): ni \`.mdx\`, ni \`.js\`, ni configuración, ni el \`sidebars.js\` —
la barra lateral la autogenera el sitio con su \`sidebars.js\` por defecto.

Pasos manuales:

1. \`npm create docusaurus@latest sitio classic\` donde haya Node 20+ (la línea
   estable es la 3.10.2; \`docusaurus.config.js\` y \`.mdx\` son CÓDIGO, así que el
   sitio lo construye una persona, nunca el OS).
2. Copia TODO lo generado aquí dentro de \`sitio/docs/\`.
3. En \`sitio/docusaurus.config.js\`, añade \`markdown: { format: 'detect' }\`
   para que los \`.md\` se traten como Markdown y no como MDX.
4. Si el aviso de versiones del propio CLI molesta: \`NO_UPDATE_NOTIFIER=1\`.
5. **Nada se despliega ni se publica sin la palabra de Alex.**

Si hay más de 500 documentos, solo se exportan los primeros 500; cualquier
documento que pase de 200 KB se recorta con un aviso al final de su texto.
`;

function leeme(prefijo: string): ArchivoDocs {
  return { path: prefijo + "LEEME-DOCUSAURUS.md", content: LEEME };
}

/**
 * Exporta entradas libres como `docs/<grupo-slug>/<slug>.md` (o `docs/<slug>.md` sin
 * grupo), con su `_category_.json` por grupo y el LEEME en la raíz de la salida.
 * `opciones.raiz` antepone una carpeta raíz (p. ej. «sitio»: `sitio/docs/…`).
 */
export function docusaurusDesdeEntradas(
  entradas: readonly EntradaDoc[],
  opciones?: { raiz?: string },
): ArchivoDocs[] {
  const prefijo = opciones?.raiz ? opciones.raiz + "/" : "";
  const archivos: ArchivoDocs[] = [];
  const slugsPorCarpeta = new Map<string, Set<string>>();
  const grupos: { slug: string; label: string }[] = [];
  entradas.slice(0, MAX_DOCS).forEach((entrada, indice) => {
    const carpeta = `${prefijo}docs${entrada.grupo ? "/" + slugDoc(entrada.grupo) : ""}`;
    let slugs = slugsPorCarpeta.get(carpeta);
    if (!slugs) {
      slugs = new Set();
      slugsPorCarpeta.set(carpeta, slugs);
    }
    const slug = usarSlug(slugs, slugDoc(entrada.titulo));
    const orden = entrada.orden ?? indice + 1;
    archivos.push({
      path: `${carpeta}/${slug}.md`,
      content: recortar(docMd(entrada.id || slug, entrada, orden)),
    });
    if (entrada.grupo && !grupos.some((g) => g.slug === slugDoc(entrada.grupo!))) {
      grupos.push({ slug: slugDoc(entrada.grupo), label: entrada.grupo });
    }
  });
  grupos.forEach((grupo, ind) => {
    archivos.push({
      path: `${prefijo}docs/${grupo.slug}/_category_.json`,
      content: categoriaJson(grupo.label, ind + 1),
    });
  });
  archivos.push(leeme(prefijo));
  return archivos;
}

/**
 * Exporta una guía de introducción (`TemaGuia`): un grupo sobre el título y un
 * `.md` por tema con el cuerpo, los puntos como lista, «Dónde: <ruta>» y
 * «Pregunta a Astraura: <preguntaAurora>», en el orden del tour.
 */
export function docusaurusDesdeGuia(temas: readonly TemaGuia[], titulo: string): ArchivoDocs[] {
  const carpeta = "docs/" + slugDoc(titulo);
  const slugs = new Set<string>();
  const archivos: ArchivoDocs[] = temas.slice(0, MAX_DOCS).map((tema, indice) => {
    const slug = usarSlug(slugs, slugDoc(tema.titulo));
    const cuerpo = [
      tema.cuerpo.trim(),
      tema.puntos.map((punto) => "- " + punto).join("\n"),
      "Dónde: " + tema.ruta,
      "Pregunta a Astraura: " + tema.preguntaAurora,
    ]
      .filter(Boolean)
      .join("\n\n");
    const doc: EntradaDoc = {
      id: slug,
      titulo: tema.titulo,
      cuerpo,
      descripcion: tema.voz,
    };
    return { path: `${carpeta}/${slug}.md`, content: recortar(docMd(slug, doc, indice + 1)) };
  });
  if (temas.length > 0) {
    archivos.push({ path: carpeta + "/_category_.json", content: categoriaJson(titulo, 1) });
  }
  archivos.push(leeme(""));
  return archivos;
}

/**
 * Exporta un árbol de educación (`EduNode`, por `parentId`): cada categoría o tema
 * con hijos es una carpeta con su `_category_.json`; cada nodo es un `.md` con su
 * blurb como cuerpo y como descripción.
 */
export function docusaurusDesdeEdu(nodos: readonly EduNode[]): ArchivoDocs[] {
  const porId = new Map(nodos.map((nodo) => [nodo.id, nodo]));
  const slugsPorCarpeta = new Map<string, Set<string>>();
  const posiciones = new Map<string, number>();
  const archivos: ArchivoDocs[] = [];
  nodos.slice(0, MAX_DOCS).forEach((nodo) => {
    const cadena: string[] = [nodo.id];
    let padre = nodo.parentId ? porId.get(nodo.parentId) : undefined;
    while (padre && !cadena.includes(padre.id)) {
      cadena.unshift(padre.id);
      const siguiente = padre.parentId ? porId.get(padre.parentId) : undefined;
      if (siguiente === padre) break;
      padre = siguiente;
    }
    const ruta = "docs/" + cadena.map((id) => slugDoc(porId.get(id)!.name)).join("/");
    const dirBase = ruta.slice(0, ruta.lastIndexOf("/"));
    let slugs = slugsPorCarpeta.get(dirBase);
    if (!slugs) {
      slugs = new Set();
      slugsPorCarpeta.set(dirBase, slugs);
    }
    const slug = usarSlug(slugs, slugDoc(nodo.name));
    const posicion = (posiciones.get(nodo.parentId ?? "raiz") ?? 0) + 1;
    posiciones.set(nodo.parentId ?? "raiz", posicion);
    if (hayHijos(nodo, nodos)) {
      archivos.push({ path: `${ruta}/${slug}/_category_.json`, content: categoriaJson(nodo.name, posicion) });
    }
    const doc: EntradaDoc = { id: nodo.id, titulo: nodo.name, cuerpo: nodo.blurb ?? "" };
    archivos.push({ path: `${ruta}/${slug}.md`, content: recortar(docMd(nodo.id, doc, posicion)) });
  });
  archivos.push(leeme(""));
  return archivos;
}

/** true si algún nodo de la lista cuelga de este (relación directa). */
function hayHijos(nodo: EduNode, nodos: readonly EduNode[]): boolean {
  return nodos.some((otro) => otro.id !== nodo.id && otro.parentId === nodo.id);
}
