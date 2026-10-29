/**
 * Exportación a Docusaurus · DSN1025F (Ola 1025R, grupo diseño).
 * ═══════════════════════════════════════════════════════════════════════════
 * El OS NO ejecuta Docusaurus: solo ESCRIBE la carpeta `docs/` en Markdown puro
 * que Docusaurus lee (solo `.md` y `_category_.json`; nunca `.mdx`, ni JS, ni
 * `sidebars.*`): la barra lateral se autogenera con el `sidebars.js` por defecto.
 * Los pasos manuales van en el `LEEME-DOCUSAURUS.md` de la salida.
 *
 * Por qué se escapa el texto ({, }, <, > y «import »/«export » a entidades):
 * Docusaurus interpreta los `.md` como MDX por defecto y una `{` o `<` sueltas
 * rompen o inyectan (contrato `architecture/repos-libreria-1025.md` §3.5).
 *
 * Módulo PURO: sin `node:*`, sin red, sin reloj. Lo importan componentes de cliente.
 */

import type { TemaGuia } from "@/lib/onboarding/guia-temas-sistema";
import type { EduNode } from "@/lib/education/curriculum";

/** Un archivo de la carpeta de salida. `path` lleva `docs/...` (o el `raiz` dado). */
export interface ArchivoDocs {
  path: string;
  content: string;
}

/** Una pieza de documentación que se exporta como `.md` con front matter. */
export interface EntradaDoc {
  id: string;
  titulo: string;
  cuerpo: string;
  grupo?: string;
  orden?: number;
  descripcion?: string;
}

/** Límites del contrato: más de eso se recorta o se omite, y queda avisado en el LEEME. */
const MAX_DOCUMENTOS = 500;
const MAX_CARACTERES = 200_000;

/** Convierte {, }, < y > en entidades, y la letra inicial de una línea que empieza
 * por «import » o «export » en &#105;/&#101;, para que el texto no sea código ni en MDX. */
export function escaparMd(texto: string): string {
  return texto
    .split("\n")
    .map((linea) => {
      if (linea.startsWith("import ")) return "&#105;" + linea.slice(1);
      if (linea.startsWith("export ")) return "&#101;" + linea.slice(1);
      return linea;
    })
    .join("\n")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Slug en minúsculas ASCII: sin acentes, separado por guiones. */
export function slugDoc(texto: string): string {
  const base = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base || "doc";
}

/** Registral de slugs: repite «-2», «-3»… si el nombre ya está tomado. */
function slugUnico(texto: string, tomados: Set<string>): string {
  const base = slugDoc(texto);
  if (!tomados.has(base)) {
    tomados.add(base);
    return base;
  }
  let n = 2;
  while (tomados.has(`${base}-${n}`)) n += 1;
  const unico = `${base}-${n}`;
  tomados.add(unico);
  return unico;
}

/** Quejas pendientes para el LEEME: qué se recortó y qué se omitió. */
interface Avisos { truncados: number; omitidos: number }

/** Front matter YAML con valores entre comillas dobles vía JSON.stringify. */
function frontMatter(campos: Record<string, string | number>): string {
  const lineas = Object.entries(campos).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lineas.join("\n")}\n---\n`;
}

/** `_category_.json` de Docusaurus: la carpeta se pinta con este orden y abierta. */
function jsonCategoria(label: string, position: number): string {
  return `${JSON.stringify({ label, position, collapsed: false }, null, 2)}\n`;
}

/** Aplica el límite de 200 KB por documento y apunta el recorte en los avisos. */
function cortar(cuerpo: string, avisos: Avisos): string {
  if (cuerpo.length <= MAX_CARACTERES) return cuerpo;
  avisos.truncados += 1;
  return (
    cuerpo.slice(0, MAX_CARACTERES) +
    "\n\n(Recortado por el límite de 200 KB por documento del exportador.)"
  );
}

/** Un `.md` doc con su front matter, problema… digo, cuerpo escapado. */
function archivoDoc(
  raiz: string,
  rutaRelativa: string,
  campos: Record<string, string | number>,
  cuerpo: string,
): ArchivoDocs {
  return { path: `${raiz}/${rutaRelativa}`, content: frontMatter(campos) + cuerpo };
}

/** El LEEME de la salida: pasos MANUALES, nunca ejecutados por el OS. */
function leeme(raiz: string, avisos: Avisos): ArchivoDocs {
  const notas: string[] = [];
  if (avisos.truncados > 0) {
    notas.push(`- Se recortaron ${avisos.truncados} documento(s) por el límite de 200 KB.`);
  }
  if (avisos.omitidos > 0) {
    notas.push(
      `- Se omitieron ${avisos.omitidos} documento(s) por el límite de ${MAX_DOCUMENTOS} en total.`,
    );
  }
  const cuerpo =
    `# LEEME · Docusaurus desde StarSeed OS

Esta carpeta sale del OS en Markdown puro (solo \`.md\` y \`_category_.json\`).
El OS NO ejecuta Docusaurus ni \`docusaurus build\`: los pasos de abajo son manuales y
nada se despliega sin la palabra de Alex.

## Pasos manuales

1. En una terminal propia, crea el sitio: \`npm create docusaurus@latest sitio classic\`.
2. Copia la carpeta \`${raiz}/\` de esta salida dentro del \`${raiz}/\` del sitio nuevo.
3. En \`sitio/docusaurus.config.js\`, añade \`markdown: { format: 'detect' }\`:
   los \`.md\` se interpretan como MDX y con \`detect\` un \`{\` o \`<\` suelto no rompe el sitio.
4. Para arrancar sin el aviso de versiones nuevas de su CLI:
   \`NO_UPDATE_NOTIFIER=1 npm start\`.
5. Nada se despliega ni se publica sin la palabra de Alex.

## Límites

- Máximo ${MAX_DOCUMENTOS} documentos y 200 KB por documento; lo que exceda se recorta y se avisa aquí.
${notas.join("\n")}`;
  return { path: "LEEME-DOCUSAURUS.md", content: cuerpo + "\n" };
}

/** Exporta piezas sueltas en `docs/<grupo-slug>/<slug>.md` (o `docs/<slug>.md` sin grupo). */
export function docusaurusDesdeEntradas(
  entradas: readonly EntradaDoc[],
  opciones: { raiz?: string } = {},
): ArchivoDocs[] {
  const raiz = (opciones.raiz ?? "docs").replace(/\/+$/, "").replace(/^\/+/, "");
  const avisos: Avisos = { truncados: 0, omitidos: 0 };
  const slugs = new Set<string>();
  const visibles = entradas.slice(0, MAX_DOCUMENTOS);
  avisos.omitidos = Math.max(0, entradas.length - visibles.length);

  // Primero se reparten por grupo, en orden de aparición, para numerar carpetas y docs.
  const grupos: { nombre: string; piezas: EntradaDoc[] }[] = [];
  for (const entrada of visibles) {
    const nombre = entrada.grupo ?? "";
    let grupo = grupos.find((g) => g.nombre === nombre);
    if (!grupo) grupos.push((grupo = { nombre, piezas: [] }));
    grupo.piezas.push(entrada);
  }

  const resultado: ArchivoDocs[] = [];
  let posicionRaiz = 1;
  for (const g of grupos.filter((g) => g.nombre !== "")) {
    const slugGrupo = slugUnico(g.nombre, slugs);
    resultado.push({
      path: `${raiz}/${slugGrupo}/_category_.json`,
      content: jsonCategoria(g.nombre, grupos.indexOf(g) + 1),
    });
    g.piezas.forEach((entrada, i) => {
      const slug = slugUnico(entrada.titulo, slugs);
      resultado.push(
        archivoDoc(raiz, `${slugGrupo}/${slug}.md`, {
          id: entrada.id,
          title: entrada.titulo,
          sidebar_position: entrada.orden ?? i + 1,
          ...(entrada.descripcion ? { description: entrada.descripcion } : {}),
        }, cortar(escaparMd(entrada.cuerpo), avisos)),
      );
    });
  }
  for (const entrada of visibles.filter((e) => !e.grupo)) {
    const slug = slugUnico(entrada.titulo, slugs);
    resultado.push(
      archivoDoc(raiz, `${slug}.md`, {
        id: entrada.id,
        title: entrada.titulo,
        sidebar_position: posicionRaiz++,
        ...(entrada.descripcion ? { description: entrada.descripcion } : {}),
      }, cortar(escaparMd(entrada.cuerpo), avisos)),
    );
  }
  resultado.push(leeme(raiz, avisos));
  return resultado;
}

/** Exporta el cuerpo de cada tema, seguido de sus `puntos` como lista, de
 * «Dónde: <ruta>» y de «Pregunta a Astraura: <preguntaAurora>». Un archivo por tema. */
export function docusaurusDesdeGuia(temas: readonly TemaGuia[], titulo: string): ArchivoDocs[] {
  const raiz = "docs";
  const avisos: Avisos = { truncados: 0, omitidos: 0 };
  const slugs = new Set<string>();
  const resultado: ArchivoDocs[] = [];
  if (temas.length > 0) {
    resultado.push({ path: `${raiz}/_category_.json`, content: jsonCategoria(titulo, 1) });
  }
  for (const tema of temas) {
    if (!tema) continue;
    const slug = slugUnico(tema.titulo, slugs);
    const puntos = tema.puntos.map((p) => `- ${escaparMd(p)}`).join("\n");
    const cuerpo = [
      escaparMd(tema.cuerpo),
      puntos ? `\n${puntos}\n` : "",
      escaparMd(`Dónde: ${tema.ruta}`),
      escaparMd(`Pregunta a Astraura: ${tema.preguntaAurora}`),
    ].join("\n");
    resultado.push(
      archivoDoc(raiz, `${slug}.md`, {
        id: slug,
        title: tema.titulo,
        sidebar_position: resultado.length,
      }, cortar(cuerpo, avisos)),
    );
  }
  return resultado;
}

/** Exporta un árbol de educación: cada categoría o tema con hijos es una carpeta con
 * su `_category_.json`; cada nodo es un `.md` con su `blurb`. */
export function docusaurusDesdeEdu(nodos: readonly EduNode[]): ArchivoDocs[] {
  const raiz = "docs";
  const avisos: Avisos = { truncados: 0, omitidos: 0 };
  const resultado: ArchivoDocs[] = [];
  if (nodos.length > MAX_DOCUMENTOS) avisos.omitidos = nodos.length - MAX_DOCUMENTOS;
  const hijosPor = new Map<string | null, EduNode[]>();
  for (const nodo of nodos) {
    const lista = hijosPor.get(nodo.parentId) ?? [];
    lista.push(nodo);
    hijosPor.set(nodo.parentId, lista);
  }
  const slugs = new Set<string>();

  function emitir(nodo: EduNode, carpeta: string): void {
    const hermanos = hijosPor.get(nodo.parentId) ?? [];
    const slug = slugUnico(nodo.name, slugs);
    const ruta = carpeta ? `${carpeta}/${slug}` : slug;
    if (hijosPor.has(nodo.id)) {
      resultado.push({
        path: `${raiz}/${ruta}/_category_.json`,
        content: jsonCategoria(nodo.name, hermanos.indexOf(nodo) + 1),
      });
      resultado.push(
        archivoDoc(raiz, `${ruta}/${slug}.md`, { id: slug, title: nodo.name, sidebar_position: hermanos.indexOf(nodo) + 1 },
          nodos.length > MAX_DOCUMENTOS ? "" : cortar(escaparMd(nodo.blurb ?? ""), avisos)),
      );
      (hijosPor.get(nodo.id) ?? []).forEach((hijo) => emitir(hijo, ruta));
    } else {
      resultado.push(
        archivoDoc(raiz, carpeta ? `${carpeta}/${slug}.md` : `${slug}.md`, { id: slug, title: nodo.name, sidebar_position: hermanos.indexOf(nodo) + 1 },
          nodos.length > MAX_DOCUMENTOS ? "" : cortar(escaparMd(nodo.blurb ?? ""), avisos)),
      );
    }
  }
  (hijosPor.get(null) ?? []).forEach((raizNodo) => emitir(raizNodo, ""));
  resultado.push(leeme(raiz, avisos));
  return resultado;
}
