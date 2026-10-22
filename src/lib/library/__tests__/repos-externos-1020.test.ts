import { describe, it, expect } from "vitest";
import {
  REPO_EXTERNOS_1020,
  REPOS_EXCLUIDOS,
} from "../repos-externos-1020";

const paquetes = REPO_EXTERNOS_1020.packages;

describe("Repos externos 1020 · las dos tandas", () => {
  it("une las dos tandas en 28 fichas con ids únicos", () => {
    expect(paquetes).toHaveLength(28);
    expect(new Set(paquetes.map((p) => p.id)).size).toBe(28);
  });

  it("declara GitHub y el enlace externo de GitHub en cada ficha", () => {
    for (const paquete of paquetes) {
      const repo = paquete.payload.githubRepo;
      expect(typeof repo, paquete.id).toBe("string");
      expect(paquete.payload.externalUrl, paquete.id).toBe(
        `https://github.com/${String(repo)}`,
      );
    }
  });

  it("bloquea las excluidas y conserva el Vikunja original", () => {
    const repos = paquetes.map((p) => String(p.payload.githubRepo));
    expect(repos).not.toContain("zhaoxuya520/reverse-skill");
    expect(repos).not.toContain("Vikunja-Self-Hosted/Vikunja-Task-Management");
    expect(repos).toContain("go-vikunja/vikunja");
    expect(REPOS_EXCLUIDOS).toEqual(
      expect.arrayContaining([
        "zhaoxuya520/reverse-skill",
        "Vikunja-Self-Hosted/Vikunja-Task-Management",
      ]),
    );
  });

  it("mapea los campos nuevos y marca próximamente lo que no tiene ruta", () => {
    const ruview = paquetes.find(
      (p) => p.payload.githubRepo === "ruvnet/RuView",
    );
    expect(ruview?.payload.efecto).toBe("HERRAMIENTA-AGENTE");
    expect(ruview?.payload.preinstalar).toBe("manual");
    expect(ruview?.payload.claude).toBe("si");
    expect(ruview?.payload.patronTag).toBe("^ruview-harness-");
    expect(ruview?.comingSoon).toBe(true);
    expect(ruview?.payload.motivoProximamente).toBeTruthy();

    const wordcraft = paquetes.find((p) => p.id === "lib-wordcraft");
    expect(wordcraft?.payload.route).toBe("/documentos");
    expect(wordcraft?.comingSoon).toBe(false);
  });
});
