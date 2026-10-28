import { describe, it, expect } from "vitest";
import {
  PAQUETES_EXTERNOS,
  REPOS_EXCLUIDOS,
  REPOS_YA_PRESENTES,
  REPO_EXTERNOS_1020,
  REQUISITOS_1020D,
} from "../repos-externos-1020";
import { allPackages } from "../packages";

const paquetes = REPO_EXTERNOS_1020.packages;
const reposCargados = new Set(paquetes.map((p) => String(p.payload.githubRepo)));
const reposLower = new Set([...reposCargados].map((r) => r.toLowerCase()));

const IDS_CUARTA_TANDA = [
  "lib-comfyui",
  "lib-harness2",
  "lib-libretranslate",
  "lib-archivebox",
  "lib-localsend",
  "lib-gallery-dl",
  "lib-openrig",
];

const REPOS_DUPLICADOS_1020D = [
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

  it("los 7 cargados de la 4.ª tanda están en el repo builtin", () => {
    expect(IDS_CUARTA_TANDA).toHaveLength(7);
    for (const id of IDS_CUARTA_TANDA) {
      const pkg = paquetes.find((p) => p.id === id);
      expect(pkg, `falta ${id}`).toBeDefined();
      const url = pkg?.payload.externalUrl;
      expect(typeof url, id).toBe("string");
      expect(url as string, id).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
    }
  });

  it("los 7 también están en la vista plana PAQUETES_EXTERNOS", () => {
    const ids = PAQUETES_EXTERNOS.map((p) => p.id);
    for (const id of IDS_CUARTA_TANDA) {
      expect(ids, `falta ${id}`).toContain(id);
    }
  });

  it("Coolify, OpenHands y Stirling-PDF están en REPOS_YA_PRESENTES y no se cargan dos veces", () => {
    for (const dup of REPOS_DUPLICADOS_1020D) {
      expect(REPOS_YA_PRESENTES.some((r) => r.repo.toLowerCase() === dup.toLowerCase()), dup).toBe(true);
      expect(reposLower.has(dup.toLowerCase()), dup).toBe(false);
    }
  });

  it("ningún repo se carga dos veces aunque cambien las mayúsculas", () => {
    expect(reposLower.size).toBe(reposCargados.size);
  });

  it("la 4.ª tanda aporta 7 fichas: sus 10 menos Coolify, OpenHands y Stirling-PDF", () => {
    const idsCuarta = [...IDS_CUARTA_TANDA, "lib-coolify", "lib-openhands", "lib-stirling-pdf"];
    expect(idsCuarta).toHaveLength(10);
    const cargadas = paquetes.filter((p) => idsCuarta.includes(p.id));
    expect(cargadas).toHaveLength(7);
    for (const dup of ["lib-coolify", "lib-openhands", "lib-stirling-pdf"]) {
      expect(paquetes.some((p) => p.id === dup), dup).toBe(false);
    }
  });

  it("no hay excluidas en la 4.ª tanda: sus repos no entran en REPOS_EXCLUIDOS", () => {
    const reposCuarta = [
      "Comfy-Org/ComfyUI", "google-research/harness2", "LibreTranslate/LibreTranslate",
      "ArchiveBox/ArchiveBox", "localsend/localsend", "mikf/gallery-dl", "mvschwarz/openrig",
    ];
    for (const repo of reposCuarta) {
      expect(REPOS_EXCLUIDOS.includes(repo), repo).toBe(false);
      expect(reposLower.has(repo.toLowerCase()), repo).toBe(true);
    }
  });

  it("iatool-openhands apunta ya a la URL canónica OpenHands/OpenHands", () => {
    const openhands = allPackages().filter(
      (p) => p.payload.externalUrl === "https://github.com/OpenHands/OpenHands",
    );
    expect(openhands).toHaveLength(1);
    expect(openhands[0]?.id).toBe("iatool-openhands");
    const vieja = allPackages().filter(
      (p) => p.payload.externalUrl === "https://github.com/All-Hands-AI/OpenHands",
    );
    expect(vieja).toHaveLength(0);
  });

  it("gallery-dl conserva su aviso del traslado a Codeberg", () => {
    const gdl = paquetes.find((p) => p.id === "lib-gallery-dl");
    expect(gdl?.description).toContain("Codeberg");
  });

  it("REQUISITOS_1020D trae los requisitos de los 10 paquetes de la tanda", () => {
    const ids = [...IDS_CUARTA_TANDA, "lib-coolify", "lib-openhands", "lib-stirling-pdf"];
    for (const id of ids) {
      const req = REQUISITOS_1020D[id];
      expect(req, `faltan requisitos de ${id}`).toBeDefined();
      expect(typeof req.fuente, id).toBe("string");
      expect(req.fuente.length > 0, id).toBe(true);
      expect(Array.isArray(req.arquitecturas), id).toBe(true);
      expect(Array.isArray(req.so), id).toBe(true);
      expect(Object.keys(REQUISITOS_1020D[id])).toContain("ram_gb");
    }
    expect(Object.keys(REQUISITOS_1020D)).toHaveLength(10);
  });

  it("ComfyUI declara lo que sí se midió y lo que no va como null, no inventado", () => {
    const comfy = REQUISITOS_1020D["lib-comfyui"];
    expect(comfy?.ram_gb).toBe(8);
    expect(comfy?.vram_gb).toBe(4);
    expect(comfy?.gpu).toBe("recomendada");
    const stirling = REQUISITOS_1020D["lib-stirling-pdf"];
    expect(stirling?.ram_gb).toBeNull();
    expect(stirling?.fuente).toMatch(/comprobado/);
  });
});
