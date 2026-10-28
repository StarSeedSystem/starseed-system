import { describe, it, expect } from "vitest";
import {
  PAQUETES_EXTERNOS,
  REPO_EXTERNOS_1020,
  REPOS_YA_PRESENTES,
  REQUISITOS_1020D,
} from "../repos-externos-1020";
import { allPackages } from "../packages";

const paquetes = REPO_EXTERNOS_1020.packages;
const IDS_CUARTA_TANDA = [
  "lib-comfyui",
  "lib-harness2",
  "lib-libretranslate",
  "lib-archivebox",
  "lib-localsend",
  "lib-gallery-dl",
  "lib-openrig",
];
const DUPLICADAS = [
  "coollabsio/coolify",
  "OpenHands/OpenHands",
  "Stirling-Tools/Stirling-PDF",
];

describe("REPO_EXTERNOS_1020 · 4.ª tanda (config/repos-libreria-1020d.json)", () => {
  it("los ids de las cuatro tandas son únicos", () => {
    const ids = paquetes.map((p) => p.id);
    expect(ids).toHaveLength(48);
    expect(new Set(ids).size).toBe(48);
  });

  it("las siete fichas nuevas están en el repo builtin y en la vista plana", () => {
    const idsPlanos = new Set(PAQUETES_EXTERNOS.map((p) => p.id));
    for (const id of IDS_CUARTA_TANDA) {
      expect(paquetes.some((p) => p.id === id), `falta ${id} en el repo`).toBe(true);
      expect(idsPlanos.has(id), `falta ${id} en la vista plana`).toBe(true);
    }
  });

  it("las tres duplicadas van a REPOS_YA_PRESENTES y no crean ficha nueva", () => {
    for (const repo of DUPLICADAS) {
      const yaPresente = REPOS_YA_PRESENTES.find(
        (r) => r.repo.toLowerCase() === repo.toLowerCase(),
      );
      expect(yaPresente, repo).toBeDefined();
      const cargados = paquetes.filter(
        (p) => String(p.payload.githubRepo).toLowerCase() === repo.toLowerCase(),
      );
      expect(cargados, repo).toHaveLength(0);
    }
  });

  it("no aparecen dos veces aunque cambien las mayúsculas", () => {
    const todos = allPackages();
    for (const repo of DUPLICADAS) {
      const fichas = todos.filter(
        (p) => String(p.payload.externalUrl ?? "").toLowerCase() ===
          `https://github.com/${repo}`.toLowerCase(),
      );
      expect(fichas, repo).toHaveLength(1);
    }
  });

  it("iatool-openhands usa la URL canónica y no la vieja All-Hands-AI", () => {
    const openhands = allPackages().find((p) => p.id === "iatool-openhands");
    expect(openhands?.payload.externalUrl).toBe("https://github.com/OpenHands/OpenHands");
    const viejas = allPackages().filter((p) =>
      String(p.payload.externalUrl ?? "").toLowerCase().includes("all-hands-ai/openhands"),
    );
    expect(viejas).toHaveLength(0);
  });

  it("gallery-dl conserva el aviso del traslado a Codeberg", () => {
    const gallery = paquetes.find((p) => p.id === "lib-gallery-dl");
    expect(gallery).toBeDefined();
    expect(gallery?.description).toContain("Codeberg");
  });

  it("REQUISITOS_1020D trae los diez requisitos tipados y deja null lo no medido", () => {
    expect(Object.keys(REQUISITOS_1020D)).toHaveLength(10);
    expect(REQUISITOS_1020D["lib-comfyui"]).toMatchObject({ ram_gb: 8, vram_gb: 4 });
    expect(REQUISITOS_1020D["lib-coolify"].ram_gb).toBeNull();
    expect(REQUISITOS_1020D["lib-gallery-dl"].arquitecturas).toContain("arm64");
  });
});
