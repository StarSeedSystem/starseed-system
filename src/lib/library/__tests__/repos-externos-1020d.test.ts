import { describe, it, expect } from "vitest";
import {
  PAQUETES_EXTERNOS,
  REPOS_YA_PRESENTES,
  REQUISITOS_1020D,
  REPO_EXTERNOS_1020,
  requisitosDe,
} from "../repos-externos-1020";
import { allPackages } from "../packages";

const paquetes = REPO_EXTERNOS_1020.packages;
const reposCargados = new Set(paquetes.map((p) => String(p.payload.githubRepo)));

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
  { repo: "coollabsio/coolify", id: "iatool-coolify" },
  { repo: "OpenHands/OpenHands", id: "iatool-openhands" },
  { repo: "Stirling-Tools/Stirling-PDF", id: "iatool-stirling-pdf" },
];

describe("REPO_EXTERNOS_1020 · 4.ª tanda (config/repos-libreria-1020d.json)", () => {
  it("los ids de las cuatro tandas son únicos", () => {
    const ids = paquetes.map((p) => p.id);
    expect(ids).toHaveLength(48);
    expect(new Set(ids).size).toBe(48);
  });

  it("Coolify, OpenHands y Stirling-PDF no se duplican aunque cambien las mayúsculas", () => {
    for (const { repo, id } of DUPLICADAS) {
      expect(REPOS_YA_PRESENTES).toContainEqual({ repo, id });
      const enMinuscula = repo.toLowerCase();
      const cargados = Array.from(reposCargados).filter(
        (r) => r.toLowerCase() === enMinuscula,
      );
      expect(cargados, repo).toHaveLength(0);
      expect(PAQUETES_EXTERNOS.filter((p) => p.githubRepo.toLowerCase() === enMinuscula)).toHaveLength(0);
    }
  });

  it("los 7 nuevos de la 4.ª tanda están en el repo builtin con su URL", () => {
    expect(IDS_CUARTA_TANDA).toHaveLength(7);
    for (const id of IDS_CUARTA_TANDA) {
      const pkg = paquetes.find((p) => p.id === id);
      expect(pkg, `falta ${id}`).toBeDefined();
      expect(typeof pkg?.payload.externalUrl, id).toBe("string");
      expect(String(pkg?.payload.externalUrl), id).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
    }
  });

  it("la URL de iatool-openhands es la canónica OpenHands/OpenHands", () => {
    const ficha = allPackages().find((p) => p.id === "iatool-openhands");
    expect(ficha).toBeDefined();
    expect(String(ficha?.payload.externalUrl)).toBe("https://github.com/OpenHands/OpenHands");
  });

  it("gallery-dl conserva su aviso del traslado a Codeberg", () => {
    const ficha = paquetes.find((p) => p.id === "lib-gallery-dl");
    expect(ficha).toBeDefined();
    expect(ficha?.description).toContain("Codeberg");
    expect(String(ficha?.payload.githubRepo)).toBe("mikf/gallery-dl");
  });

  it("REQUISITOS_1020D trae los 10 paquetes de la tanda, con null para lo sin medir", () => {
    expect(Object.keys(REQUISITOS_1020D).sort()).toEqual(
      ["lib-archivebox", "lib-coolify", "lib-comfyui", "lib-gallery-dl", "lib-harness2",
        "lib-libretranslate", "lib-localsend", "lib-openhands", "lib-openrig", "lib-stirling-pdf"].sort(),
    );
    expect(REQUISITOS_1020D["lib-comfyui"]?.ram_gb).toBe(8);
    expect(REQUISITOS_1020D["lib-comfyui"]?.gpu).toBe("recomendada");
    expect(REQUISITOS_1020D["lib-coolify"]?.ram_gb).toBeNull();
    expect(REQUISITOS_1020D["lib-coolify"]?.so).toEqual(["linux"]);
    expect(REQUISITOS_1020D["lib-localsend"]?.gpu).toBe("no");
  });

  it("requisitosDe normaliza lo ausente sin inventar datos", () => {
    const vacio = requisitosDe(null);
    expect(vacio.ram_gb).toBeNull();
    expect(vacio.vram_gb).toBeNull();
    expect(vacio.fuente).toBe("");
    expect(vacio.arquitecturas).toEqual([]);
  });
});
