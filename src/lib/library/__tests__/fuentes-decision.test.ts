import { describe, it, expect } from "vitest";
import { REPO_DECISIONES } from "../fuentes-decision";
import {
  STARSEED_CORE_REPO,
  STARSEED_LABS_REPO,
  STARSEED_IA_TOOLS_REPO,
  STARSEED_AGENTS_REPO,
} from "../packages";

describe("fuentes-decision", () => {
  const idsExistentes = new Set<string>();
  [
    STARSEED_CORE_REPO,
    STARSEED_LABS_REPO,
    STARSEED_IA_TOOLS_REPO,
    STARSEED_AGENTS_REPO,
    REPO_DECISIONES,
  ].forEach((repo) => {
    repo.packages.forEach((p) => idsExistentes.add(p.id));
  });

  it("tiene los paquetes esperados de decisiones", () => {
    expect(REPO_DECISIONES.packages.length).toBeGreaterThanOrEqual(8);
  });

  it("cada id es unico dentro del repo", () => {
    const ids = REPO_DECISIONES.packages.map((p) => p.id);
    const set = new Set(ids);
    expect(set.size).toBe(ids.length);
  });

  it("los ids no colisionan con los repos builtin existentes", () => {
    for (const p of REPO_DECISIONES.packages) {
      const existentesSinEste = [
        STARSEED_CORE_REPO,
        STARSEED_LABS_REPO,
        STARSEED_IA_TOOLS_REPO,
        STARSEED_AGENTS_REPO,
      ];
      for (const repo of existentesSinEste) {
        const enRepo = repo.packages.some((e) => e.id === p.id);
        expect(enRepo).toBe(false);
      }
    }
  });

  it("todos los paquetes tienen upstream con https", () => {
    for (const p of REPO_DECISIONES.packages) {
      const upstream = (p.payload?.upstream as string) ?? "";
      expect(upstream).toMatch(/^https:\/\/.*/);
    }
  });

  it("los que no corren aqui llevan comingSoon", () => {
    for (const p of REPO_DECISIONES.packages) {
      const corre = p.payload?.corre_aqui === true;
      if (!corre) {
        expect(p.comingSoon).toBe(true);
      }
    }
  });

  it("BitNet es el unico con corre_aqui true", () => {
    const conTrue = REPO_DECISIONES.packages.filter(
      (p) => p.payload?.corre_aqui === true
    );
    expect(conTrue.map((p) => p.id)).toEqual(["bitnet-b1.58"]);
  });

  it("BitNet no lleva comingSoon", () => {
    const bitnet = REPO_DECISIONES.packages.find((p) => p.id === "bitnet-b1.58");
    expect(bitnet).toBeDefined();
    expect(bitnet!.comingSoon).not.toBe(true);
  });

  it("tinker-cookbook dice su dependencia de pago sin adornos", () => {
    const tinker = REPO_DECISIONES.packages.find((p) => p.id === "tinker-cookbook");
    expect(tinker).toBeDefined();
    // Quien lea la ficha debe saber antes de invertir un día que el
    // entrenamiento como viene exige pagar: free=false y dicho en la descripción.
    expect(tinker!.free).toBe(false);
    expect(tinker!.description).toContain("PAGO");
    expect(tinker!.description).toContain("TINKER_API_KEY");
    expect(tinker!.description).toContain("88%");
    expect(tinker!.payload?.requisitos).toContain("PAGO");
  });
});
