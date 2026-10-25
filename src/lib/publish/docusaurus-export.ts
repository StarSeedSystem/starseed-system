import type { TemaGuia } from "@/lib/onboarding/guia-temas-sistema";
import type { EduNode } from "@/lib/education/curriculum";

// Exportador PURO de documentación a la carpeta `docs/` que lee Docusaurus.
// Nunca genera `.mdx`, JavaScript ni configuración: solo Markdown con front
// matter y `_category_.json`. La barra lateral se autogenera en el sitio que
// se cree a mano. Sin red, sin disco y sin reloj: mismo texto, misma salida.

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
const ENTIDADES: Record<string, string> = { "{": "&#123;", "}": "&#125;", "<": "&lt;", ">": "&gt;" };

export function escaparMd(texto: string): string {
  return texto
    .replace(/[{}<>]/g, (c) => ENTIDADES[c] ?? c)
    .replace(/^(import |export )/gm, (m) => (m[0] === "i" ? "&#105;" : "&#101;") + m.slice(1));
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

function recortarSiGrande(texto: string, limite: number): string | null {
  let bytes = 0;
  let salida = "";
  for (const ch of texto) {
    const c = ch.codePointAt(0) ?? 0;
    const tam = c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
    if (bytes + tam > limite) return salida;
    bytes += tam;
    salida += ch;
  }
  return null;
}

function unico(base: string, usados: Set<string>): string {
  let slug = base;
  for (let i = 2; usados.has(slug); i++) slug = `${base}-${i}`;
  usados.add(slug);
  return slug;
}

function frontMatter(slug: string, titulo: string, pos: number, descripcion?: string): string {
  const lineas = [
    "---",
    `id: ${JSON.stringify(slug)}`,
    `title: ${JSON.stringify(titulo)}`,
    `sidebar_position: ${pos}`,
  ];
  if (descripcion) lineas.push(`description: ${JSON.stringify(descripcion)}`);
  return [...lineas, "---", ""].join("\n");
}

function documento(id: string, titulo: string, cuerpo: string, pos: number, descripcion?: string): string {
  return `${frontMatter(id, titulo, pos, descripcion)}\n${escaparMd(cuerpo).trimEnd()}\n`;
}

function categoria(label: string, pos: number): string {
  return `${JSON.stringify({ label, position: pos, collapsed: false }, null, 2)}\n`;
}

interface Salida {
  archivos: ArchivoDocs[];
  notas: string[];
  docs: number;
  omitidos: number;
  usados: Set<string>;
  carpetas: Set<string>;
  ids: Set<string>;
}

function nuevaSalida(): Salida {
  return {
    archivos: [], notas: [], docs: 0, omitidos: 0,
    usados: new Set(), carpetas: new Set(), ids: new Set(),
  };
}

function agregar(s: Salida, path: string, content: string): void {
  if (s.docs >= MAX_DOCS) {
    s.omitidos++;
    return;
  }
  s.docs++;
  const recortado = recortarSiGrande(content, MAX_BYTES);
  if (recortado !== null) s.notas.push(`\`${path}\` superaba 200 KB; se recortó.`);
  s.archivos.push({ path, content: recortado ?? content });
}

function leeme(notas: string[]): string {
  const avisos = notas.length
    ? `\n## Avisos de esta exportación\n\n${notas.map((n) => `- ${n}`).join("\n")}\n`
    : "";
  return `# LEEME · esta carpeta en Docusaurus

StarSeed OS escribió esta carpeta como **Markdown puro**: documentos \`.md\` con front matter y
\`_category_.json\`. No es un sitio en marcha y no se despliega sola. La barra lateral se
autogenera con el \`sidebars.js\` que trae Docusaurus, así que aquí no hay JavaScript de sitio.

## Pasos manuales

1. Con Node 20 o superior, crea el sitio en una carpeta vacía:

   \`\`\`bash
   npm create docusaurus@latest sitio classic
   \`\`\`

2. Copia esta carpeta \`docs/\` dentro del sitio creado (sustituye los documentos de ejemplo).

3. Deja el Markdown en modo detección en la configuración del sitio (\`docusaurus.config.js\` o
   \`.ts\`) para que el texto no se interprete como MDX:

   \`\`\`js
   markdown: { format: 'detect' },
   \`\`\`

4. Si no quieres el aviso de versiones nuevas de la CLI, expórtalo antes de usarla:

   \`\`\`bash
   export NO_UPDATE_NOTIFIER=1
   \`\`\`

5. Arranca o construye el sitio tú mismo (\`npm run start\` o \`npm run build\`). Ese paso ejecuta
   Node y React: no lo hace StarSeed OS.

Nada se despliega sin la palabra de Alex.
${avisos}`;
}

function terminar(s: Salida): ArchivoDocs[] {
  if (s.omitidos > 0) s.notas.push(`Se omitieron ${s.omitidos} documentos por el límite de ${MAX_DOCS}.`);
  s.archivos.push({ path: "LEEME-DOCUSAURUS.md", content: leeme(s.notas) });
  return s.archivos;
}

export function docusaurusDesdeEntradas(
  entradas: EntradaDoc[],
  opciones?: { raiz?: string },
): ArchivoDocs[] {
  const s = nuevaSalida();
  const raiz = (opciones?.raiz ?? "docs").replace(/^\/+|\/+$/g, "") || "docs";
  const grupos = new Map<string, string>();
  const posiciones = new Map<string, number>();
  const ordenadas = [...entradas].sort(
    (a, b) => (a.orden ?? Number.MAX_SAFE_INTEGER) - (b.orden ?? Number.MAX_SAFE_INTEGER),
  );

  for (const entrada of ordenadas) {
    let carpeta = raiz;
    if (entrada.grupo) {
      let grupo = grupos.get(entrada.grupo);
      if (!grupo) {
        grupo = unico(slugDoc(entrada.grupo), s.carpetas);
        grupos.set(entrada.grupo, grupo);
        s.archivos.push({
          path: `${raiz}/${grupo}/_category_.json`,
          content: categoria(entrada.grupo, grupos.size),
        });
      }
      carpeta = `${raiz}/${grupo}`;
    }
    const anterior = posiciones.get(carpeta) ?? 0;
    posiciones.set(carpeta, anterior + 1);
    const slug = unico(slugDoc(entrada.titulo), s.usados);
    agregar(
      s,
      `${carpeta}/${slug}.md`,
      documento(unico(slugDoc(entrada.id), s.ids), entrada.titulo, entrada.cuerpo, entrada.orden ?? anterior + 1, entrada.descripcion),
    );
  }
  return terminar(s);
}

export function docusaurusDesdeGuia(temas: readonly TemaGuia[], titulo: string): ArchivoDocs[] {
  const s = nuevaSalida();
  const carpeta = unico(slugDoc(titulo), s.carpetas);
  s.archivos.push({ path: `docs/${carpeta}/_category_.json`, content: categoria(titulo, 1) });

  temas.forEach((tema, i) => {
    const slug = unico(slugDoc(tema.titulo), s.usados);
    const cuerpo = [
      tema.cuerpo,
      "",
      ...tema.puntos.map((punto) => `- ${punto}`),
      "",
      `Dónde: ${tema.ruta}`,
      `Pregunta a Astraura: ${tema.preguntaAurora}`,
    ].join("\n");
    agregar(s, `docs/${carpeta}/${slug}.md`, documento(unico(slugDoc(tema.key), s.ids), tema.titulo, cuerpo, i + 1, tema.voz));
  });
  return terminar(s);
}

export function docusaurusDesdeEdu(nodos: EduNode[]): ArchivoDocs[] {
  const s = nuevaSalida();
  const hijos = new Map<string | null, EduNode[]>();
  const existentes = new Set(nodos.map((nodo) => nodo.id));
  for (const nodo of nodos) {
    const padre = nodo.parentId && existentes.has(nodo.parentId) ? nodo.parentId : null;
    hijos.set(padre, [...(hijos.get(padre) ?? []), nodo]);
  }

  const emitir = (nodo: EduNode, carpeta: string, pos: number): void => {
    const descendientes = hijos.get(nodo.id) ?? [];
    const propia = descendientes.length
      ? `${carpeta}/${unico(slugDoc(nodo.name), s.carpetas)}`
      : carpeta;
    if (descendientes.length) {
      s.archivos.push({
        path: `${propia}/_category_.json`,
        content: categoria(nodo.name, pos),
      });
    }
    const slug = unico(slugDoc(nodo.name), s.usados);
    agregar(s, `${propia}/${slug}.md`, documento(unico(slugDoc(nodo.id), s.ids), nodo.name, nodo.blurb ?? "", pos));
    descendientes.forEach((hijo, i) => emitir(hijo, propia, i + 1));
  };

  (hijos.get(null) ?? []).forEach((nodo, i) => emitir(nodo, "docs", i + 1));
  return terminar(s);
}
