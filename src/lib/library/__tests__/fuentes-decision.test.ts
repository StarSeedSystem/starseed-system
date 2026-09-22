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

  it("tiene exactamente nueve paquetes (tres repos nuevas en TK1c)", () => {
    expect(REPO_DECISIONES.packages).toHaveLength(9);
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

  it("los que no corren aqui llevan comingSoon, excepto repos que funcionan (TK1c)", () => {
    for (const p of REPO_DECISIONES.packages) {
      const corre = p.payload?.corre_aqui === true;
      const esRepoNuevas = ["hermes-jev-skills", "jev-router"].includes(p.id);
      if (!corre) {
        if (esRepoNuevas) {
          expect(p.comingSoon).toBe(false); // repos MIT que funcionan con clave/requisito existente
        } else {
          expect(p.comingSoon).toBe(true);
        }
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
    expect(tinker!.description).toContain("88%");
    expect(tinker!.description).toContain("SU infraestructura");
    expect(tinker!.payload?.requisitos).toContain("PAGO");
  });

  // TK1c — las tres repos nuevas registradas con coste honesto (sección 8, 11, 💠)
  it("hermes-jev-skills: MIT, sin dependencias, clave OpenRouter, free=true, corre_aqui=false", () => {
    const p = REPO_DECISIONES.packages.find((x) => x.id === "hermes-jev-skills");
    expect(p).toBeDefined();
    expect(p!.free).toBe(true);
    expect(p!.payload?.licencia).toBe("MIT");
    expect(p!.description).toContain("Python 3.9+");
    expect(p!.description).toContain("clave de OpenRouter");
    expect(p!.payload?.corre_aqui).toBe(false);
    expect(p!.comingSoon).toBe(false);
  });

  it("jev-router: MIT, Node 20.12+, coste es suscripción Claude Code (previo, no repo), free=true", () => {
    const p = REPO_DECISIONES.packages.find((x) => x.id === "jev-router");
    expect(p).toBeDefined();
    expect(p!.free).toBe(true);
    expect(p!.payload?.licencia).toBe("MIT");
    expect(p!.description).toContain("Node 20.12+");
    expect(p!.description).toContain("suscripción de Claude Code");
    expect(p!.description).toContain("requisito previo");
    expect(p!.payload?.corre_aqui).toBe(false);
    expect(p!.comingSoon).toBe(false);
  });

  it("tinker-cookbook: Apache 2.0, free=false, 88% requieren cuenta DE PAGO en thinkingmachines.ai", () => {
    const p = REPO_DECISIONES.packages.find((x) => x.id === "tinker-cookbook");
    expect(p).toBeDefined();
    expect(p!.free).toBe(false);
    expect(p!.payload?.licencia).toBe("Apache-2.0");
    expect(p!.description).toContain("374 módulos Python");
    expect(p!.description).toContain("329 (88%)");
    expect(p!.description).toContain("DE PAGO");
    expect(p!.description).toContain("SU infraestructura");
  });
});
