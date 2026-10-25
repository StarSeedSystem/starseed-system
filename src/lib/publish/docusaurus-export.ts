/**
 * DSN1025F · Docusaurus: exportar guías, grupos y educación como carpeta `docs/`.
 * El OS NO ejecuta Docusaurus (ficha `lib-docusaurus`, 3.10.2, MIT/CC-BY-4.0, Node 20+): solo escribe
 * Markdown puro (nada de `.mdx`, `.js`, `sidebars.*` ni `docusaurus.config.*`: allí ve código; la barra
 * lateral la autogenera el `sidebars.js` por defecto). Módulo PURO: sin `node:*`, sin red, sin reloj.
 */
import type { TemaGuia } from "@/lib/onboarding/guia-temas-sistema";
import type { EduNode } from "@/lib/education/curriculum";
export interface ArchivoDocs { path: string; content: string }
export interface EntradaDoc { id: string; titulo: string; cuerpo: string; grupo?: string; orden?: number; descripcion?: string }

const MAX_DOCS = 500;
const MAX_DOC_CARACTERES = 200 * 1024;
const AVISO_RECORTE = "\n\n<!-- Documento recortado al límite de 200 KB; ver LEEME-DOCUSAURUS.md. -->\n";
/** Escapa `{`, `}`, `<`, `>` y el arranque «import »/«export » para que el texto nunca sea MDX. */
export function escaparMd(texto: string): string {
  const escapado = texto.replaceAll("{", "&#123;").replaceAll("}", "&#125;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const arranque = (linea: string): string =>
    linea.startsWith("import ") ? `&#105;${linea.slice(1)}` : linea.startsWith("export ") ? `&#101;${linea.slice(1)}` : linea;
  return escapado.split("\n").map(arranque).join("\n");
}
/** Slug en minúsculas ASCII para carpetas y nombres de archivo. */
export function slugDoc(texto: string): string {
  const ascii = texto.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return ascii.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "doc";
}

type RegistroSlugs = { usados: Set<string>; vistas: Map<string, string>; n: number };
/** Fábrica interna: acumula archivos, slugs únicos por carpeta («-2», «-3» si chocan) y front matter. */
function crearFabrica() {
  const archivos: ArchivoDocs[] = [];
  const registros = new Map<string, RegistroSlugs>();
  const slugDe = (carpeta: string, texto: string): string => {
    let r = registros.get(carpeta);
    if (!r) { r = { usados: new Set(), vistas: new Map(), n: 2 }; registros.set(carpeta, r); }
    const conservada = r.vistas.get(texto); if (conservada) return conservada;
    let slug = slugDoc(texto);
    while (r.usados.has(slug)) { slug = `${slug.split("-").slice(0, -1).join("-") || slug}-${r.n}`; r.n += 1; }
    r.usados.add(slug); r.vistas.set(texto, slug);
    return slug;
  };
  const documento = (rutaMd: string, id: string, titulo: string, cuerpo: string, posicion: number, descripcion?: string): void => {
    const cabecera = `---\nid: ${JSON.stringify(id)}\ntitle: ${JSON.stringify(titulo)}\nsidebar_position: ${posicion}` + (descripcion === undefined ? "" : `\ndescription: ${JSON.stringify(descripcion)}`) + "\n---\n";
    let cuerpoEscapado = escaparMd(cuerpo);
    const excede = cabecera.length + cuerpoEscapado.length - MAX_DOC_CARACTERES;
    if (excede > 0) cuerpoEscapado = cuerpoEscapado.slice(0, Math.max(0, cuerpoEscapado.length - excede - AVISO_RECORTE.length)) + AVISO_RECORTE;
    archivos.push({ path: rutaMd, content: cabecera + cuerpoEscapado });
  };
  const carpetaJson = (rutaJson: string, label: string, posicion: number): void => {
    archivos.push({ path: rutaJson, content: JSON.stringify({ label, position: posicion, collapsed: false }, null, 2) + "\n" });
  };
  return { archivos, slugDe, documento, carpetaJson };
}
const LEEME_LINEAS: readonly string[] = [
  "# LEEME · documentación de StarSeed OS para Docusaurus",
  "",
  "StarSeed OS **no ejecuta** Docusaurus: solo ha escrito esta carpeta como Markdown puro (solo `.md` con front matter y `_category_.json` en las carpetas; nunca `.mdx`, `.js`, `sidebars.js` ni `docusaurus.config.*`, porque allí Docusaurus ve código). Los pasos del sitio, a mano, y nada se despliega sin la palabra de Alex:",
  "",
  "1. **Crear el sitio:** `npm create docusaurus@latest sitio classic` (línea estable 3.x, Node 20+). Descarga y ejecuta código de npm: lo hace quien lo apruebe, la exportación no lo corre.",
  "2. **Copiar esta carpeta** `docs/` dentro de `sitio/docs/`.",
  "3. **Configuración del sitio** (`docusaurus.config.js`): añadir `markdown: { format: 'detect' }` para que este Markdown puro no se trate como MDX.",
  "4. **Aviso de versiones:** su CLI consulta el registro de npm para avisar de versiones nuevas (`update-notifier`); se silencia arrancando con `NO_UPDATE_NOTIFIER=1` delante del comando.",
  "5. **Nada se despliega sin la palabra de Alex:** ni `npm run build` ni `npm run deploy` del sitio, ni publicarlo en ningún sitio.",
  "",
  "Límites ya aplicados por esta exportación: máximo **500 documentos** (si había más, se quedaron los primeros por su orden y el resto no se ha escrito) y máximo **200 KB por documento** (el cuerpo que excede se recorta y lo indica un comentario al final del archivo). Los cuerpos van **escapados** (`&#123;`, `&#125;`, `&lt;`, `&gt;` y el arranque de líneas `import`/`export` camuflado con una entidad) para que el texto no sea MDX ni código; la barra lateral la autogenera el `sidebars.js` por defecto de Docusaurus. Licencia: MIT el código, CC-BY-4.0 la documentación (facebook/docusaurus 3.10.2).",
];

/** Cierra la exportación: recorte al presupuesto de 500 documentos y LEEME en la raíz de la salida. */
function cerrarConLimites(archivos: ArchivoDocs[]): ArchivoDocs[] {
  const dentro: ArchivoDocs[] = [];
  let documentos = 0;
  for (const archivo of archivos) {
    if (!archivo.path.endsWith(".md")) dentro.push(archivo);
    else if (documentos < MAX_DOCS) { documentos += 1; dentro.push(archivo); }
  }
  return [...dentro, { path: "LEEME-DOCUSAURUS.md", content: LEEME_LINEAS.join("\n") + "\n" }];
}
/** Exporta entradas sueltas: `docs/<grupo-slug>/<slug>.md`, o `docs/<slug>.md` sin grupo. */
export function docusaurusDesdeEntradas(entradas: readonly EntradaDoc[], opciones?: { raiz?: string }): ArchivoDocs[] {
  const raiz = (opciones?.raiz ?? "docs").replace(/\/+$/, "");
  const fab = crearFabrica();
  const ordenGrupo = new Map<string, number>();
  entradas.forEach((doc, indice) => {
    const grupo = doc.grupo ?? "";
    const nueva = !!grupo && !ordenGrupo.has(grupo);
    if (nueva) ordenGrupo.set(grupo, ordenGrupo.size + 1);
    const carpeta = grupo ? `${raiz}/${fab.slugDe(raiz, grupo)}` : raiz;
    if (nueva) fab.carpetaJson(`${carpeta}/_category_.json`, grupo, ordenGrupo.get(grupo) ?? 1);
    fab.documento(`${carpeta}/${fab.slugDe(carpeta, doc.titulo)}.md`, doc.id, doc.titulo, doc.cuerpo, doc.orden ?? indice + 1, doc.descripcion);
  });
  return cerrarConLimites(fab.archivos);
}

/** Exporta una guía (`TemaGuia` de `@/lib/onboarding/guia-temas-sistema` y `guia-temas-red.ts`): cuerpo, los `puntos` como lista, «Dónde: <ruta>» y «Pregunta a Astraura: <preguntaAurora>»; un archivo por tema, en orden. */
export function docusaurusDesdeGuia(temas: readonly TemaGuia[], titulo: string): ArchivoDocs[] {
  const entradas: EntradaDoc[] = temas.map((tema, indice) => ({
    id: tema.key, titulo: tema.titulo, grupo: titulo, orden: indice + 1, descripcion: tema.voz,
    cuerpo: `${tema.cuerpo}\n\n${tema.puntos.map((p) => `- ${p}`).join("\n")}\n\nDónde: ${tema.ruta}\nPregunta a Astraura: ${tema.preguntaAurora}`,
  }));
  return docusaurusDesdeEntradas(entradas);
}
/** Exporta el árbol del currículo (`EduNode` de `@/lib/education/curriculum`): categoría o tema con hijos = carpeta con `_category_.json`; nodo hoja = `.md` con su `blurb`. */
export function docusaurusDesdeEdu(nodos: readonly EduNode[]): ArchivoDocs[] {
  const fab = crearFabrica();
  const hijos = new Map<string, EduNode[]>();
  for (const nodo of nodos) {
    const clave = nodo.parentId ?? "";
    hijos.set(clave, [...(hijos.get(clave) ?? []), nodo]);
  }
  const escribir = (clave: string, carpeta: string): void => {
    (hijos.get(clave) ?? []).forEach((nodo, indice) => {
      const ruta = `${carpeta}/${fab.slugDe(carpeta, nodo.name)}`;
      if ((hijos.get(nodo.id)?.length ?? 0) > 0) { fab.carpetaJson(`${ruta}/_category_.json`, nodo.name, indice + 1); escribir(nodo.id, ruta); }
      else fab.documento(`${ruta}.md`, nodo.id, nodo.name, nodo.blurb ?? "", indice + 1, nodo.blurb);
    });
  };
  escribir("", "docs");
  return cerrarConLimites(fab.archivos);
}
