/**
 * docusaurus-export — Exporta guías, grupos de documentos y la sección de
 * educación como carpeta `docs/` en Markdown puro (tarea DSN1025F, ficha
 * `lib-docusaurus` de config/repos-libreria-1025.json).
 *
 * El OS NO ejecuta Docusaurus: solo escribe la carpeta `docs/` que un sitio
 * creado a mano con `npm create docusaurus` lee. La barra lateral se autogenera
 * con el `sidebars.js` por defecto de Docusaurus, así que aquí no se exporta
 * ningún `.js`, ni `.mdx`, ni configuración: solo `.md` y `_category_.json`.
 * "Un `.mdx`, un `docusaurus.config.js` o un `sidebars.js` son CÓDIGO" (ficha).
 *
 * Módulo PURO: sin `node:*`, sin red, sin reloj. Determinista a igualdad de
 * entradas (la misma llamada dos veces produce exactamente los mismos archivos).
 */

import type { TemaGuia } from "@/lib/onboarding/guia-temas-sistema";
import type { EduNode } from "@/lib/education/curriculum";

/** Un archivo de la carpeta docs/: ruta relativa a la raíz y contenido. */
export interface ArchivoDocs {
  path: string;
  content: string;
}

/** Documento de entrada para la exportación genérica. */
export interface EntradaDoc {
  id: string;
  titulo: string;
  cuerpo: string;
  grupo?: string;
  orden?: number;
  descripcion?: string;
}

/** Máximo de documentos `.md` por exportación (el excedente queda fuera). */
export const MAX_DOCUMENTOS = 500;
/** Máximo de caracteres por documento; lo que pasa se recorta. */
export const MAX_TAMANO_DOC = 200 * 1024;

/**
 * Escapa un texto para que jamás se vuelva código: `{}<>` a entidades HTML y la
 * primera letra de toda línea que empiece por «import » o «export » a su
 * entidad (`&#105;` / `&#101;`), para que ni siquiera en MDX sea JavaScript.
 */
export function escaparMd(texto: string): string {
  const escapado = texto
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escapado
    .split("\n")
    .map((linea) => {
      if (linea.startsWith("import ")) return `&#105;${linea.slice(1)}`;
      if (linea.startsWith("export ")) return `&#101;${linea.slice(1)}`;
      return linea;
    })
    .join("\n");
}

/** Slug en minúsculas ASCII (sin acentos); vacío si no queda nada. */
export function slugDoc(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Ayudantes internos ──────────────────────────────────────────────────────

/** Basa únicos por carpeta: la segunda coincidencia lleva «-2», la tercera «-3». */
function nuevoSlug(usados: Map<string, number>, base: string): string {
  const slug = base.length > 0 ? base : "doc";
  const veces = usados.get(slug) ?? 0;
  usados.set(slug, veces + 1);
  return veces > 0 ? `${slug}-${veces + 1}` : slug;
}

/** Registro de basas usadas por carpeta, para no chocar dentro del mismo nivel. */
type SlugsPorCarpeta = Map<string, Map<string, number>>;

function registroDe(carpeta: string, porCarpeta: SlugsPorCarpeta): Map<string, number> {
  let registro = porCarpeta.get(carpeta);
  if (!registro) {
    registro = new Map<string, number>();
    porCarpeta.set(carpeta, registro);
  }
  return registro;
}

/** Front matter YAML con valores entre comillas dobles (JSON.stringify). */
function frontMatter(dato: {
  id: string;
  titulo: string;
  orden: number;
  descripcion?: string;
}): string {
  const lineas = [
    "---",
    `id: ${JSON.stringify(dato.id)}`,
    `title: ${JSON.stringify(dato.titulo)}`,
    `sidebar_position: ${dato.orden}`,
  ];
  if (dato.descripcion) lineas.push(`description: ${JSON.stringify(dato.descripcion)}`);
  lineas.push("---", "");
  return lineas.join("\n");
}

/** Contenido de `_category_.json`, el único archivo no Markdown que se escribe. */
function categoriaJson(etiqueta: string, posicion: number): string {
  const contenido = JSON.stringify(
    { label: etiqueta, position: posicion, collapsed: false },
    null,
    2,
  );
  return `${contenido}\n`;
}

/** Recorta todo documento que supere `MAX_TAMANO_DOC` y lo deja avisado. */
function recortar(archivo: ArchivoDocs): ArchivoDocs {
  if (archivo.content.length <= MAX_TAMANO_DOC) return archivo;
  return {
    path: archivo.path,
    content: `${archivo.content.slice(0, MAX_TAMANO_DOC)}\n\n[Recortado: este documento superaba los 200 kB de MAX_TAMANO_DOC. El texto completo queda en su fuente dentro del OS.]\n`,
  };
}

/**
 * LEEME-DOCUSAURUS.md: los pasos MANUALES para montar un sitio de Docusaurus
 * con esta carpeta. Construir el sitio corre Node y React: no lo hace el OS.
 */
const LEEME = `# LEEME · Esta carpeta docs/ (exportación de StarSeed OS)

Carpeta en Markdown puro exportada por StarSeed OS (tarea DSN1025F, ficha
lib-docusaurus): solo \`docs/\` con \`.md\` y \`_category_.json\`; la barra lateral
la autogenera el \`sidebars.js\` por defecto de Docusaurus, y aquí NO se exporta
nada de código (ni \`.mdx\`, ni \`sidebars.*\`, ni \`docusaurus.config.*\`).

## Pasos manuales (los hace una persona con Node 20+, nunca el OS)

1. \`npm create docusaurus@latest sitio classic\` — crea un sitio nuevo con la
   plantilla \`classic\` (pedimos confirmó la ficha: línea estable 3.10.2,
   Node 20+).
2. Copia entera esta carpeta \`docs/\` dentro del sitio, junto a la que trae de
   ejemplo (puedes borrar la de ejemplo).
3. En \`docusaurus.config.js\` del sitio, dentro de \`markdown\`, pon
   \`{ format: 'detect' }\` — así el texto escapado nunca se vuelve código.
4. Si no quieres el aviso de versiones nuevas del CLI, arranca los comandos con
   \`NO_UPDATE_NOTIFIER=1\` (el CLI consulta npm para avisar; sin despliegue, da igual).

## Límites de la exportación

- Máximo 500 documentos (\`MAX_DOCUMENTOS\`); más de eso quedan fuera de la carpeta.
- Máximo 200 kB por documento (\`MAX_TAMANO_DOC\`); lo que pasa se recorta con
  un aviso al final del archivo.
- \`_category_.json\` fija \`collapsed: false\`, \`label\` y \`position\` de cada carpeta.

## Honestidad y despliegue

Nada de esta carpeta se despliega ni compila dentro del OS: \`docusaurus build\`
ejecuta código de Node y React, así que es un paso manual y local. Si algún día
se publica un sitio de documentación de StarSeed, solo con la palabra de Alex.
`;

/**
 * Exporta una lista plana de documentos: `docs/<grupo-slug>/<slug>.md` (o
 * `docs/<slug>.md` sin grupo), con `_category_.json` por grupo y el LEEME.
 */
export function docusaurusDesdeEntradas(
  entradas: EntradaDoc[],
  opciones?: { raiz?: string },
): ArchivoDocs[] {
  const raiz = opciones?.raiz ?? "docs";
  const elegidas = entradas.slice(0, MAX_DOCUMENTOS);
  const porCarpeta: SlugsPorCarpeta = new Map();
  const grupos: { slug: string; etiqueta: string }[] = [];
  const archivos: ArchivoDocs[] = [];

  for (const [i, entrada] of elegidas.entries()) {
    const grupoSlug = entrada.grupo ? slugDoc(entrada.grupo) : "";
    const carpeta = grupoSlug ? `${raiz}/${grupoSlug}` : raiz;
    if (grupoSlug && !grupos.some((g) => g.slug === grupoSlug)) {
      grupos.push({ slug: grupoSlug, etiqueta: entrada.grupo ?? grupoSlug });
    }
    const base = slugDoc(entrada.id.length > 0 ? entrada.id : entrada.titulo);
    const slug = nuevoSlug(registroDe(carpeta, porCarpeta), base);
    const cuerpo = escaparMd(entrada.cuerpo).length > 0
      ? `${escaparMd(entrada.cuerpo)}\n`
      : "";
    archivos.push({
      path: `${carpeta}/${slug}.md`,
      content:
        frontMatter({
          id: slug,
          titulo: entrada.titulo,
          orden: entrada.orden ?? i + 1,
          descripcion: entrada.descripcion,
        }) + cuerpo,
    });
  }

  for (const [pos, grupo] of grupos.entries()) {
    archivos.splice(
      archivos.findIndex((a) => a.path.startsWith(`${raiz}/${grupo.slug}/`)),
      0,
      { path: `${raiz}/${grupo.slug}/_category_.json`, content: categoriaJson(grupo.etiqueta, pos + 1) },
    );
  }
  archivos.push({ path: `${raiz}/LEEME-DOCUSAURUS.md`, content: `${LEEME}\n` });
  return archivos.map(recortar);
}

/**
 * Exporta los temas de una guía (tipo `TemaGuia`): un `.md` por tema, con su
 * cuerpo, los puntos como lista, «Dónde: <ruta>» y «Pregunta a Astraura: …».
 */
export function docusaurusDesdeGuia(
  temas: readonly TemaGuia[],
  titulo: string,
): ArchivoDocs[] {
  const entradas: EntradaDoc[] = temas.map((tema, i) => {
    const puntos = tema.puntos.map((punto) => `- ${punto}`).join("\n");
    const cuerpo = [
      tema.cuerpo,
      puntos,
      `Dónde: ${tema.ruta}`,
      `Pregunta a Astraura: ${tema.preguntaAurora}`,
    ]
      .filter((bloque) => bloque.length > 0)
      .join("\n\n");
    return {
      id: tema.key,
      titulo: tema.titulo,
      cuerpo,
      grupo: titulo,
      orden: i + 1,
      descripcion: tema.voz,
    };
  });
  return docusaurusDesdeEntradas(entradas);
}

/**
 * Exporta el árbol educativo (tipo `EduNode`): cada categoría o tema con hijos
 * es una carpeta con su `_category_.json`; cada nodo es un `.md` con su blurb.
 */
export function docusaurusDesdeEdu(nodos: EduNode[]): ArchivoDocs[] {
  const hijos = new Map<string | null, EduNode[]>();
  const raizSalida = "docs";
  for (const nodo of nodos) {
    const lista = hijos.get(nodo.parentId) ?? [];
    lista.push(nodo);
    hijos.set(nodo.parentId, lista);
  }

  const porCarpeta: SlugsPorCarpeta = new Map();
  const archivos: ArchivoDocs[] = [];
  let documentos = 0;

  const escribirNivel = (parentId: string | null, carpeta: string): void => {
    const nivel = hijos.get(parentId) ?? [];
    for (const [i, nodo] of nivel.entries()) {
      const base = slugDoc(nodo.name);
      const hijosNodo = hijos.get(nodo.id) ?? [];
      if (hijosNodo.length > 0) {
        const slugCarpeta = nuevoSlug(registroDe(carpeta, porCarpeta), base);
        const carpetaNodo = `${carpeta}/${slugCarpeta}`;
        archivos.push({
          path: `${carpetaNodo}/_category_.json`,
          content: categoriaJson(nodo.name, i + 1),
        });
        escribirNivel(nodo.id, carpetaNodo);
        if (documentos < MAX_DOCUMENTOS) {
          documentos += 1;
          archivos.push({
            path: `${carpetaNodo}/index.md`,
            content:
              frontMatter({
                id: slugCarpeta,
                titulo: nodo.name,
                orden: i + 1,
                descripcion: nodo.blurb,
              }) + escaparMd(nodo.blurb ?? "") + "\n",
          });
        }
      } else if (documentos < MAX_DOCUMENTOS) {
        documentos += 1;
        const slug = nuevoSlug(registroDe(carpeta, porCarpeta), base);
        archivos.push({
          path: `${carpeta}/${slug}.md`,
          content:
            frontMatter({
              id: slug,
              titulo: nodo.name,
              orden: i + 1,
              descripcion: nodo.blurb,
            }) + escaparMd(nodo.blurb ?? "") + "\n",
        });
      }
    }
  };

  escribirNivel(null, raizSalida);
  archivos.push({ path: `${raizSalida}/LEEME-DOCUSAURUS.md`, content: `${LEEME}\n` });
  return archivos.map(recortar);
}
