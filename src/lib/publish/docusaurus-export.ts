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
const MAX_DOC_SIZE = 200 * 1024;

function escaparMd(texto: string): string {
  return texto
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/^import /gm, "&#105;mport ")
    .replace(/^export /gm, "&#101;xport ");
}

function slugifyAscii(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function slugDoc(texto: string, usados: Set<string> = new Set()): string {
  let base = slugifyAscii(texto);
  if (!base) base = "doc";
  if (!usados.has(base)) {
    usados.add(base);
    return base;
  }
  for (let i = 2; i <= 999; i++) {
    const candidate = `${base}-${i}`;
    if (!usados.has(candidate)) {
      usados.add(candidate);
      return candidate;
    }
  }
  return `${base}-${Date.now().toString(36)}`;
}

function frontMatterYaml(obj: Record<string, string | number | undefined>): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (typeof value === "number") {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(String(value))}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

function recortarConAviso(contenido: string, _path: string): string {
  if (Buffer.byteLength(contenido, "utf8") <= MAX_DOC_SIZE) return contenido;
  const aviso = `\n\n> **Aviso:** Este documento supera los ${MAX_DOC_SIZE / 1024} KB y ha sido recortado. Ver el original en el OS.`;
  const bytesDisponibles = MAX_DOC_SIZE - Buffer.byteLength(aviso, "utf8");
  const recortado = contenido.slice(0, bytesDisponibles);
  return recortado + aviso;
}

function buildLeemeContent(advertencia?: string): string {
  const lineas = [
    "# LEEME-DOCUSAURUS.md",
    "",
    "Pasos MANUALES para crear el sitio de documentación con Docusaurus:",
    "",
    "1. **Crear el sitio**",
    "   ```bash",
    "   npm create docusaurus@latest sitio classic",
    "   ```",
    "",
    "2. **Copiar la carpeta `docs/`**",
    "   ```bash",
    "   cp -r docs/* sitio/docs/",
    "   ```",
    "",
    "3. **Configurar el formato Markdown**",
    "   En `sitio/docusaurus.config.js` (o `.ts`), añade en la configuración de `presets`:",
    "   ```js",
    "   markdown: {",
    "     format: 'detect'",
    "   }",
    "   ```",
    "",
    "4. **Desactivar el aviso de actualizaciones (opcional)**",
    "   ```bash",
    "   NO_UPDATE_NOTIFIER=1 npm run build",
    "   ```",
    "   O exporta la variable de entorno antes de cualquier comando de Docusaurus.",
    "",
    "5. **Despliegue**",
    "   Nada se despliega sin la palabra de Alex.",
    "",
    "---",
    "*Generado automáticamente desde StarSeed OS*",
  ];
  if (advertencia) {
    lineas.splice(3, 0, advertencia, "");
  }
  return lineas.join("\n");
}

function docusaurusDesdeEntradas(
  entradas: EntradaDoc[],
  opciones: { raiz?: string } = {}
): ArchivoDocs[] {
  const raiz = opciones.raiz ?? "docs";
  const usadosGrupos = new Set<string>();
  const usadosDocsPorGrupo = new Map<string, Set<string>>();
  const archivos: ArchivoDocs[] = [];

  let advertencia: string | undefined;
  if (entradas.length > MAX_DOCS) {
    advertencia = `> **Aviso:** Se recibieron ${entradas.length} entradas; el máximo es ${MAX_DOCS}. Solo se exportan las primeras ${MAX_DOCS}.`;
  }

  const entradasProcesadas = entradas.slice(0, MAX_DOCS);

  for (const entrada of entradasProcesadas) {
    const grupoKey = entrada.grupo ?? "__sin_grupo__";
    let grupoSlug: string | null = null;
    if (entrada.grupo) {
      if (!usadosGrupos.has(grupoKey)) {
        grupoSlug = slugifyAscii(entrada.grupo);
        if (!grupoSlug) grupoSlug = "grupo";
        usadosGrupos.add(grupoKey);
      } else {
        grupoSlug = slugifyAscii(entrada.grupo);
        if (!grupoSlug) grupoSlug = "grupo";
      }
    }

    const usadosDocs = usadosDocsPorGrupo.get(grupoKey) ?? new Set<string>();
    const docSlug = slugDoc(entrada.titulo, usadosDocs);
    usadosDocsPorGrupo.set(grupoKey, usadosDocs);

    const rutaRelativa = grupoSlug
      ? `${grupoSlug}/${docSlug}.md`
      : `${docSlug}.md`;
    const path = `${raiz}/${rutaRelativa}`;

    const fm = frontMatterYaml({
      id: entrada.id,
      title: entrada.titulo,
      sidebar_position: entrada.orden ?? 0,
      description: entrada.descripcion,
    });

    const contenido = `${fm}\n\n${escaparMd(entrada.cuerpo)}`;
    const contenidoFinal = recortarConAviso(contenido, path);

    archivos.push({ path, content: contenidoFinal });
  }

  archivos.push({
    path: "LEEME-DOCUSAURUS.md",
    content: buildLeemeContent(advertencia),
  });

  return archivos;
}

function docusaurusDesdeGuia(
  temas: readonly TemaGuia[],
  _titulo: string
): ArchivoDocs[] {
  const entradas: EntradaDoc[] = temas.map((tema, index) => {
    const puntosMd = tema.puntos.map((p) => `- ${p}`).join("\n");
    const cuerpo = [
      tema.cuerpo,
      "",
      "## Puntos clave",
      "",
      puntosMd,
      "",
      `**Dónde:** ${tema.ruta}`,
      `**Pregunta a Astraura:** ${tema.preguntaAurora}`,
    ].join("\n");

    return {
      id: tema.key,
      titulo: tema.titulo,
      cuerpo,
      grupo: "guia",
      orden: index + 1,
      descripcion: tema.voz,
    };
  });

  return docusaurusDesdeEntradas(entradas, { raiz: "docs" });
}

function buildCategoryJson(label: string, position: number): string {
  return JSON.stringify(
    { label, position, collapsed: false },
    null,
    2
  );
}

function docusaurusDesdeEdu(nodos: EduNode[]): ArchivoDocs[] {
  const childrenMap = new Map<string, EduNode[]>();
  for (const n of nodos) {
    if (n.parentId) {
      const arr = childrenMap.get(n.parentId) ?? [];
      arr.push(n);
      childrenMap.set(n.parentId, arr);
    }
  }

  const roots = nodos.filter((n) => n.parentId === null);
  const usados = new Set<string>();
  const archivos: ArchivoDocs[] = [];

  function processNode(node: EduNode, parentPath: string[], position: number): void {
    const slug = slugDoc(node.name, usados);
    const currentPath = [...parentPath, slug];

    const hasChildren = (childrenMap.get(node.id)?.length ?? 0) > 0;
    if (node.kind === "category" || hasChildren) {
      const categoryPath = `${currentPath.join("/")}/_category_.json`;
      const label = node.name;
      archivos.push({
        path: `docs/${categoryPath}`,
        content: buildCategoryJson(label, position),
      });

      const children = childrenMap.get(node.id) ?? [];
      children.sort((a, b) => a.name.localeCompare(b.name, "es"));
      for (let i = 0; i < children.length; i++) {
        processNode(children[i], currentPath, i + 1);
      }
    } else {
      const docPath = `${currentPath.join("/")}.md`;
      const blurb = node.blurb ?? "";
      const fm = frontMatterYaml({
        id: node.id,
        title: node.name,
        sidebar_position: position,
        description: blurb,
      });
      const contenido = `${fm}\n\n${escaparMd(blurb)}`;
      archivos.push({
        path: `docs/${docPath}`,
        content: recortarConAviso(contenido, `docs/${docPath}`),
      });
    }
  }

  roots.sort((a, b) => a.name.localeCompare(b.name, "es"));
  for (let i = 0; i < roots.length; i++) {
    processNode(roots[i], [], i + 1);
  }

  archivos.push({
    path: "LEEME-DOCUSAURUS.md",
    content: buildLeemeContent(),
  });

  return archivos;
}

export {
  escaparMd,
  slugDoc,
  docusaurusDesdeEntradas,
  docusaurusDesdeGuia,
  docusaurusDesdeEdu,
};