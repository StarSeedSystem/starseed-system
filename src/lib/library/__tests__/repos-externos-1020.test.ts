import { describe, it, expect } from "vitest";
import {
  REPO_EXTERNOS_1020,
  REPOS_EXCLUIDOS,
  esRepoExcluido,
} from "../repos-externos-1020";

const PAQUETES = REPO_EXTERNOS_1020.packages;
const REPOS = PAQUETES.map((p) => String(p.payload.githubRepo));

describe("Repos externos 1020 · las dos tandas", () => {
  it("une las dos tandas: 14 + 14 = 28 paquetes con ids únicos", () => {
    expect(PAQUETES.length).toBe(28);
    const ids = PAQUETES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todas traen payload.githubRepo y un payload.externalUrl de GitHub", () => {
    for (const p of PAQUETES) {
      const repo = p.payload.githubRepo;
      const url = p.payload.externalUrl;
      expect(typeof repo, `${p.id} sin githubRepo`).toBe("string");
      expect(String(repo).includes("/"), `${p.id} githubRepo inválido`).toBe(true);
      expect(typeof url, `${p.id} sin externalUrl`).toBe("string");
      expect(String(url).startsWith("https://github.com/"), `${p.id} URL no-GitHub`).toBe(true);
    }
  });

  it("ni el señuelo de Vikunja ni reverse-skill aparecen; el Vikunja real sí", () => {
    expect(REPOS).not.toContain("zhaoxuya520/reverse-skill");
    expect(REPOS).not.toContain("Vikunja-Self-Hosted/Vikunja-Task-Management");
    expect(REPOS).toContain("go-vikunja/vikunja");
  });

  it("exporta los repos excluidos de las dos tandas y los bloquea", () => {
    expect(REPOS_EXCLUIDOS).toContain("zhaoxuya520/reverse-skill");
    expect(REPOS_EXCLUIDOS).toContain("Vikunja-Self-Hosted/Vikunja-Task-Management");
    expect(esRepoExcluido("zhaoxuya520/reverse-skill")).toBe(true);
    expect(esRepoExcluido("go-vikunja/vikunja")).toBe(false);
    for (const repo of REPOS) expect(esRepoExcluido(repo), `${repo} excluido`).toBe(false);
  });

  it("mapea los campos nuevos de la 2.ª tanda al payload", () => {
    const vikunja = PAQUETES.find((p) => p.payload.githubRepo === "go-vikunja/vikunja");
    expect(vikunja?.payload.efecto).toBe("CONECTOR");
    expect(vikunja?.payload.preinstalar).toBe("siempre");

    const ruview = PAQUETES.find((p) => p.payload.githubRepo === "ruvnet/RuView");
    expect(ruview?.payload.efecto).toBe("HERRAMIENTA-AGENTE");
    expect(ruview?.payload.preinstalar).toBe("manual");
    expect(ruview?.payload.claude).toBe("si");
    expect(ruview?.payload.patronTag).toBe("^ruview-harness-");
  });

  it("lo que no corre dentro del OS queda en comingSoon con su motivo", () => {
    for (const p of PAQUETES) {
      const efecto = p.payload.efecto;
      const tieneRuta = typeof p.payload.route === "string" && p.payload.route.length > 0;
      if (!tieneRuta) {
        expect(p.comingSoon, `${p.id} debería ser comingSoon`).toBe(true);
        expect(String(p.description).length).toBeGreaterThan(p.name.length);
      }
      if (efecto === "CONECTOR" || efecto === "HERRAMIENTA-AGENTE" || efecto === "CATALOGO") {
        expect(tieneRuta, `${p.id} (${efecto}) no tiene ruta propia`).toBe(false);
      }
    }
  });

  it("no usa cualquier kind fuera del tipo PackageKind del OS", () => {
    const VALIDOS = [
      "app", "widget", "page", "publication", "board", "research",
      "project", "design", "animation", "function", "ai-source", "repo", "agent",
    ];
    for (const p of PAQUETES) expect(VALIDOS).toContain(p.kind);
  });
});
