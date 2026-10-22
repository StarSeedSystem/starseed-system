// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Repos externos de las tandas 1020 (1.ª y 2.ª)
// ----------------------------------------------------------------------------
// Une los catálogos verificados `config/repos-libreria-1020.json` y
// `config/repos-libreria-1020b.json` en un repo builtin de fichas honestas.
// Módulo PURO (sin `node:*`, sin red): importable desde componentes de cliente.
// ════════════════════════════════════════════════════════════════════════════

import type { LibraryPackage, LibraryRepo } from "./packages";
import catalogoA from "../../../config/repos-libreria-1020.json";
import catalogoB from "../../../config/repos-libreria-1020b.json";

/** Entrada de cualquiera de los dos catálogos verificados. */
interface EntradaCatalogo {
  id: string; repo: string; nombre: string; kind: string;
  canal?: string; patron_tag?: string; licencia?: string; area?: string[];
  efecto?: string; preinstalar?: string; claude?: string; ruta_os?: string;
  assets?: string[]; que_es?: string; nota?: string; aviso?: string; skillId?: string;
}

interface Catalogo {
  paquetes: EntradaCatalogo[];
  excluida?: { repo?: string };
  excluidas?: { repo?: string }[];
}

const UNO = catalogoA as unknown as Catalogo;
const DOS = catalogoB as unknown as Catalogo;

/** Repos bloqueados por seguridad o por no ser el proyecto que dicen ser. */
export const REPOS_EXCLUIDOS: string[] = Array.from(
  new Set([UNO.excluida?.repo, ...(DOS.excluidas ?? []).map((e) => e.repo)]
    .filter((repo): repo is string => Boolean(repo && repo.trim()))),
);

const MAPA_KIND: Record<string, LibraryPackage["kind"]> = {
  app: "app", function: "function", "ai-source": "ai-source", tool: "repo", link: "repo",
};

/** Compara repos como GitHub: sin distinguir mayúsculas. */
function repoExcluido(repo: string): boolean {
  const objetivo = repo.trim().toLowerCase();
  return REPOS_EXCLUIDOS.some((r) => r.toLowerCase() === objetivo);
}

/** Motivo honesto cuando instalar no ejecuta nada dentro del OS. */
function motivoProximamente(entrada: EntradaCatalogo): string {
  if (entrada.ruta_os || entrada.skillId) return "";
  if (entrada.efecto === "CONECTOR") {
    return "Es un servidor que se aloja aparte (A1 o Mac): aquí solo se registra la ficha y el conector; el endpoint se pega en el Hub de Conectores.";
  }
  if (entrada.efecto === "HERRAMIENTA-AGENTE") {
    return "Es una herramienta (CLI, skill o MCP) que se instala en el equipo de quien la usa: aquí solo se registra la ficha y el enlace.";
  }
  if (entrada.efecto === "CATALOGO") {
    return "Es una ficha de catálogo con seguimiento de versiones; no ejecuta nada dentro del OS.";
  }
  return "Sin ruta propia en el OS: instalar solo registra la ficha, la licencia y el enlace al upstream.";
}

/** Proyecta una entrada del catálogo a la ficha instalable de la Librería. */
function aPaquete(entrada: EntradaCatalogo): LibraryPackage {
  const motivo = motivoProximamente(entrada);
  const externalUrl = `https://github.com/${entrada.repo}`;
  const partes = [entrada.que_es, entrada.nota, entrada.aviso].filter(
    (t): t is string => Boolean(t && t.trim()),
  );
  if (motivo) partes.push(`Próximamente: ${motivo}`);
  return {
    id: entrada.id,
    kind: MAPA_KIND[entrada.kind] ?? "repo",
    name: entrada.nombre,
    description: partes.join("\n\n"),
    icon: "Package",
    tags: [...(entrada.area ?? []), "repos-externos", "autoactualizable",
      ...(entrada.efecto ? [entrada.efecto.toLowerCase()] : [])],
    version: "1.0.0",
    author: entrada.repo.split("/")[0] ?? "upstream",
    sourceRepoId: "starseed-repos-externos-1020",
    free: true,
    comingSoon: Boolean(motivo),
    payload: {
      externalUrl,
      githubRepo: entrada.repo,
      canal: entrada.canal ?? "releases",
      area: entrada.area ?? [],
      licencia: entrada.licencia ?? "sin verificar",
      ...(entrada.efecto ? { efecto: entrada.efecto } : {}),
      ...(entrada.preinstalar ? { preinstalar: entrada.preinstalar } : {}),
      ...(entrada.claude ? { claude: entrada.claude } : {}),
      ...(entrada.patron_tag ? { patronTag: entrada.patron_tag } : {}),
      ...(entrada.ruta_os ? { route: entrada.ruta_os } : {}),
      ...(entrada.skillId ? { skillId: entrada.skillId } : {}),
      ...(entrada.assets ? { assets: entrada.assets } : {}),
      ...(motivo ? { motivoProximamente: motivo } : {}),
    },
  };
}

/** Todas las fichas de las dos tandas, sin duplicados y sin las excluidas. */
function fichasDeLasDosTandas(): LibraryPackage[] {
  const vistas = new Set<string>();
  const salida: LibraryPackage[] = [];
  for (const entrada of [...UNO.paquetes, ...DOS.paquetes]) {
    if (!entrada.id || !entrada.repo || repoExcluido(entrada.repo)) continue;
    if (vistas.has(entrada.id)) continue;
    vistas.add(entrada.id);
    salida.push(aPaquete(entrada));
  }
  return salida;
}

export const REPO_EXTERNOS_1020: LibraryRepo = {
  id: "starseed-repos-externos-1020",
  name: "Repos externos · tandas 1020",
  builtin: true,
  packages: fichasDeLasDosTandas(),
};
