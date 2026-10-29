/**
 * Exportador a Docusaurus (DSN1025F · Ola 1025R · Grupo Diseño) · módulo PURO.
 * ═══════════════════════════════════════════════════════════════════════════
 * El OS no ejecuta Docusaurus (MIT el código, CC-BY-4.0 la documentación): solo
 * escribe la carpeta `docs/` en Markdown puro que un sitio creado a mano con
 * `npm create docusaurus` lee. Solo `.md` (nunca `.mdx`, ni `sidebars.*`, ni
 * `docusaurus.config.*`): la barra lateral la autogenera el `sidebars.js` por
 * defecto de Docusaurus, y cada carpeta se acompaña de su `_category_.json`.
 *
 * Referencia: `architecture/repos-libreria-1025.md` §«Diseño» (lib-docusaurus,
 * 3.10.2, Node 20+) y la ficha en `config/repos-libreria-1025.json`.
 *
 * Módulo PURO: sin `node:*`, sin red, sin reloj. La salida es determinista.
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

const MAX_DOCUMENTOS = 500;
const MAX_BYTES_DOC = 200_000;
const LEEME_NOMBRE = "LEEME-DOCUSAURUS.md";
const NOTA_RECORTADO =
  "\n\n*(Documento recortado al límite de 200 KB por el exportador; la versión completa vive en StarSeed OS.)*\n";

/**
 * Escapa el texto para que Docusaurus no lo lea como MDX: `{` y `}` pasan a
 * `&#123;`/`&#125;`, `<` y `>` a `&lt;`/`&gt;`, y una línea que empiece por
 * «import » o «export » lleva su primera letra como entidad HTML (`&#105;` /
 * `&#101;`), para que el texto no sea código ni siquiera con formato detectado.
 */
export function escaparMd(texto: string): string {
  const escapado = texto
    .replaceAll("{", "&#123;")
    .replaceAll("}", "&#125;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return escapado
    .split("\n")
    .map((linea) => {
      if (linea.startsWith("import ")) return "&#105;" + linea.slice(1);
      if (linea.startsWith("export ")) return "&#101;" + linea.slice(1);
      return linea;
    })
    .join("\n");
}

/** Slug de documento en minúsculas ASCII (sin acentos, separado por guiones). */
export function slugDoc(texto: string): string {
  const base = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "doc";
}

// ── Estado interno de una exportación (nace y muere en la llamada) ──
interface EstadoSalida {
  archivos: ArchivoDocs[];
  usados: Set<string>;
  documentos: number;
  recortados: number;
  omitidos: number;
}

function crearEstado(): EstadoSalida {
  return { archivos: [], usados: new Set(), documentos: 0, recortados: 0, omitidos: 0 };
}

/** Mantiene la unicidad de slugs en toda la salida: «-2», «-3», … si chocan. */
function slugLibre(usados: Set<string>, base: string): string {
  if (!usados.has(base)) {
    usados.add(base);
    return base;
  }
  let n = 2;
  while (usados.has(`${base}-${n}`)) n++;
  usados.add(`${base}-${n}`);
  return `${base}-${n}`;
}

/** Recorta un texto a un máximo de bytes sin partir un grafema UTF-8. */
function recortarABytes(texto: string, tope: number): string {
  const bytes = new TextEncoder().encode(texto);
  if (bytes.length <= tope) return texto;
  let fin = tope;
  while (fin > 0 && (bytes[fin] & 0xc0) === 0x80) fin--;
  return new TextDecoder().decode(bytes.subarray(0, fin));
}

/** Guarda un `.md` aplicando los topes: 200 KB por documento, 500 documentos. */
function escribirDoc(estado: EstadoSalida, path: string, contenido: string): void {
  if (estado.documentos >= MAX_DOCUMENTOS) {
    estado.omitidos++;
    return;
  }
  const final = recortarABytes(contenido, MAX_BYTES_DOC);
  if (final !== contenido) estado.recortados++;
  estado.archivos.push({
    path,
    content: final === contenido ? contenido : final + NOTA_RECORTADO,
  });
  estado.documentos++;
}

/** Front matter YAML con valores entre comillas dobles vía JSON.stringify. */
function frontMatter(
  id: string,
  titulo: string,
  orden: number | undefined,
  descripcion?: string,
): string {
  const lineas = ["---", `id: ${JSON.stringify(id)}`, `title: ${JSON.stringify(titulo)}`];
  if (orden !== undefined) lineas.push(`sidebar_position: ${JSON.stringify(orden)}`);
  if (descripcion) lineas.push(`description: ${JSON.stringify(descripcion)}`);
  lineas.push("---", "");
  return lineas.join("\n") + "\n";
}

/** `_category_.json` tal como lo espera la barra lateral autogenerada. */
function jsonCategoria(nombre: string, posicion: number): string {
  return JSON.stringify({ label: nombre, position: posicion, collapsed: false }, null, 2) + "\n";
}

/** LEEME en español con los pasos MANUALES para montar el sitio (honesto: nada automático). */
function leemeDocs(recortados: number, omitidos: number): string {
  const avisos = [
    recortados > 0 ? `Se recortaron ${recortados} documento(s) al límite de 200 KB por documento.` : "",
    omitidos > 0 ? `Se omitieron ${omitidos} documento(s) por el máximo de 500 documentos.` : "",
  ].filter(Boolean);
  const texto = `# LEEME · Carpeta docs/ para Docusaurus

Esta carpeta la escribió el exportador de Docusaurus de StarSeed OS (\`src/lib/publish/docusaurus-export.ts\`): solo Markdown puro — archivos \`.md\` con front matter, carpetas con \`_category_.json\` y este LEEME. Docusaurus no se ejecuta dentro del OS: montar el sitio es un paso manual de quien tenga Node 20 o más (la línea estable 3.10.2 lo pide).

## Pasos para montar el sitio (manuales)

1. Crea un sitio nuevo: \`npm create docusaurus@latest sitio classic\`
2. Copia esta carpeta \`docs/\` dentro del sitio creado (por ejemplo en \`sitio/docs/\`).
3. En la configuración del sitio añade \`markdown: { format: 'detect' }\` junto a las demás opciones.
4. Si no quieres el aviso de versiones de su CLI (consulta el registro de npm), exporta \`NO_UPDATE_NOTIFIER=1\` antes de los comandos.
5. Nada se despliega sin la palabra de Alex.
6. Trata un \`docusaurus.config.*\`, un \`sidebars.*\` o un \`.mdx\` como CÓDIGO: esta carpeta no contiene ninguno. Los cuerpos llegan escapados (\`&#123;\`, \`&#125;\`, \`&lt;\`, \`&gt;\`, y la primera letra entidad en líneas que empiezan por «import » o «export »).

## El contenido que llega

- Solo \`.md\`: la barra lateral la autogenera Docusaurus con su \`sidebars.js\` por defecto y las carpetas de grupo llevan su \`_category_.json\` con \`label\`, \`position\` y \`"collapsed": false\`.
- Tope: 200 KB por documento y 500 documentos como mucho.
${avisos.length > 0 ? "" : "Ningún documento se recortó ni se omitió en esta entrega.\n"}${
    avisos.map((a) => `- ${a}`).join("\n")
  }
`;
  return escaparMd(texto);
}

/**
 * Escribe `docs/` desde entradas genéricas: `docs/<grupo-slug>/<slug>.md`
 * (o `docs/<slug>.md` sin grupo), más un `_category_.json` por carpeta de
 * grupo y el `LEEME-DOCUSAURUS.md` en la raíz de la salida. La `raiz` opcional
 * antepone su ruta (por ejemplo `sitio`) al conjunto del resultado.
 */
export function docusaurusDesdeEntradas(
  entradas: EntradaDoc[],
  opciones?: { raiz?: string },
): ArchivoDocs[] {
  const raiz = (opciones?.raiz ?? "").replace(/^\/+|\/+$/g, "");
  const prefijo = raiz ? raiz + "/" : "";
  const estado = crearEstado();

  const grupos: Array<{ nombre: string; slug: string; posicion: number }> = [];
  const indiceGrupo = new Map<string, (typeof grupos)[number]>();

  for (const entrada of entradas) {
    const nombreGrupo = (entrada.grupo ?? "").trim();
    let grupo = nombreGrupo ? indiceGrupo.get(slugDoc(nombreGrupo)) : undefined;
    if (nombreGrupo && !grupo) {
      const slugGrupo = slugDoc(nombreGrupo);
      grupo = { nombre: nombreGrupo, slug: slugGrupo, posicion: grupos.length + 1 };
      grupos.push(grupo);
      indiceGrupo.set(slugGrupo, grupo);
    }
    const ruta = grupo ? `${prefijo}docs/${grupo.slug}/` : `${prefijo}docs/`;
    const slug = slugLibre(estado.usados, slugDoc(entrada.titulo));
    const contenido =
      frontMatter(entrada.id, entrada.titulo, entrada.orden, entrada.descripcion) +
      escaparMd(entrada.cuerpo);
    escribirDoc(estado, `${ruta}${slug}.md`, contenido);
  }

  for (const grupo of grupos) {
    estado.archivos.push({
      path: `${prefijo}docs/${grupo.slug}/_category_.json`,
      content: jsonCategoria(grupo.nombre, grupo.posicion),
    });
  }
  estado.archivos.unshift({
    path: `${prefijo}${LEEME_NOMBRE}`,
    content: leemeDocs(estado.recortados, estado.omitidos),
  });
  return estado.archivos;
}

/** Cuerpo de un tema de la guía: cuerpo, puntos como lista, «Dónde:» y «Pregunta a Astraura:». */
function cuerpoTema(tema: TemaGuia): string {
  const lineas = [tema.cuerpo, ""];
  for (const punto of tema.puntos) lineas.push(`- ${punto}`);
  lineas.push("", `Dónde: ${tema.ruta}`, `Pregunta a Astraura: ${tema.preguntaAurora}`);
  return lineas.join("\n") + "\n";
}

/** Exporta la guía de temas del sistema: un `.md` por tema, en orden, bajo el grupo del título dado. */
export function docusaurusDesdeGuia(
  temas: readonly TemaGuia[],
  titulo: string,
): ArchivoDocs[] {
  const entradas: EntradaDoc[] = temas.map((tema, i) => ({
    id: tema.key,
    titulo: tema.titulo,
    cuerpo: cuerpoTema(tema),
    grupo: titulo,
    orden: i + 1,
  }));
  return docusaurusDesdeEntradas(entradas);
}

/** Exporta el árbol de educación: categoría/tema con hijos → carpeta con `_category_.json` (y su blurb en `index.md`); hoja → su `.md`. */
export function docusaurusDesdeEdu(nodos: EduNode[]): ArchivoDocs[] {
  const estado = crearEstado();
  const ids = new Set(nodos.map((n) => n.id));
  const hijosDe = new Map<string, EduNode[]>();
  const raices: EduNode[] = [];
  const visitados = new Set<string>();
  for (const nodo of nodos) {
    if (visitados.has(nodo.id)) continue;
    visitados.add(nodo.id);
    if (nodo.parentId && ids.has(nodo.parentId)) {
      const lista = hijosDe.get(nodo.parentId) ?? [];
      lista.push(nodo);
      hijosDe.set(nodo.parentId, lista);
    } else {
      raices.push(nodo);
    }
  }
  const emitir = (lista: EduNode[], carpeta: string): void => {
    lista.forEach((nodo, i) => {
      const hijos = hijosDe.get(nodo.id) ?? [];
      if (hijos.length === 0) {
        const slug = slugLibre(estado.usados, slugDoc(nodo.name));
        escribirDoc(
          estado,
          `${carpeta}${slug}.md`,
          frontMatter(nodo.id, nodo.name, i + 1) + escaparMd(nodo.blurb ?? ""),
        );
        return;
      }
      const slug = slugLibre(estado.usados, slugDoc(nodo.name));
      const ruta = `${carpeta}${slug}/`;
      estado.archivos.push({ path: `${ruta}_category_.json`, content: jsonCategoria(nodo.name, i + 1) });
      escribirDoc(
        estado,
        `${ruta}index.md`,
        frontMatter(nodo.id, nodo.name, i + 1) + escaparMd(nodo.blurb ?? ""),
      );
      emitir(hijos, ruta);
    });
  };
  emitir(raices, "docs/");
  estado.archivos.unshift({
    path: LEEME_NOMBRE,
    content: leemeDocs(estado.recortados, estado.omitidos),
  });
  return estado.archivos;
}
