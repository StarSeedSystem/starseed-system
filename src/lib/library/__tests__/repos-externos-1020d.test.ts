import { describe, it, expect } from "vitest";
import {
  REPO_EXTERNOS_1020,
  REPO_EXTERNOS_1020D,
  REQUISITOS_1020D,
  REPOS_YA_PRESENTES,
} from "../repos-externos-1020";
import { allPackages } from "../packages";

const paquetes1020 = REPO_EXTERNOS_1020.packages;
const paquetes1020d = REPO_EXTERNOS_1020D.packages;

/// Los 7 ids de la 4.ª tanda que sí son fichas nuevas (10 − las 3 ya presentes).
const IDS_CUARTA_TANDA = [
  "lib-comfyui",
  "lib-harness2",
  "lib-libretranslate",
  "lib-archivebox",
  "lib-localsend",
  "lib-gallery-dl",
  "lib-openrig",
];

/// Las 3 duplicadas del catálogo (sin distinguir mayúsculas, como GitHub).
const DUPLICADAS = [
  { repo: "coollabsio/coolify", id: "iatool-coolify" },
  { repo: "OpenHands/OpenHands", id: "iatool-openhands" },
  { repo: "Stirling-Tools/Stirling-PDF", id: "iatool-stirling-pdf" },
];

describe("REPO_EXTERNOS_1020D · 4.ª tanda (config/repos-libreria-1020d.json)", () => {
  it("declara su identidad de repo builtin con id propio", () => {
    expect(REPO_EXTERNOS_1020D.id).toBe("starseed-biblioteca-externa-1020d");
    expect(REPO_EXTERNOS_1020D.builtin).toBe(true);
  });

  it("los ids de las CUATRO tandas son únicos entre todos", () => {
    const ids = [...paquetes1020, ...paquetes1020d].map((p) => p.id);
    expect(paquetes1020).toHaveLength(41);
    expect(paquetes1020d).toHaveLength(7);
    expect(new Set(ids).size).toBe(48);
  });

  it("las 3 duplicadas NO aparecen como paquetes de la tanda", () => {
    const ids = paquetes1020d.map((p) => p.id);
    expect(ids).not.toContain("lib-coolify");
    expect(ids).not.toContain("lib-openhands");
    expect(ids).not.toContain("lib-stirling-pdf");
    expect(ids).toEqual(IDS_CUARTA_TANDA);
  });

  it("las 3 duplicadas figuran en REPOS_YA_PRESENTES con su id original", () => {
    for (const dup of DUPLICADAS) {
      expect(REPOS_YA_PRESENTES).toContainEqual(dup);
    }
    expect(REPOS_YA_PRESENTES).toContainEqual({ repo: "penpot/penpot", id: "iatool-penpot" });
  });

  it("la comparación de duplicados no distingue mayúsculas (GitHub tampoco)", () => {
    for (const dup of DUPLICADAS) {
      const enMinusculas = dup.repo.toUpperCase();
      expect(REPOS_YA_PRESENTES.some((r) => r.repo.toLowerCase() === enMinusculas.toLowerCase())).toBe(true);
      expect(paquetes1020d.filter((p) => p.payload.githubRepo === dup.repo)).toHaveLength(0);
    }
  });

  it("las 7 fichas nuevas están en el repo builtin y en el catalogado completo", () => {
    const todos = allPackages();
    for (const id of IDS_CUARTA_TANDA) {
      const pkg = paquetes1020d.find((p) => p.id === id);
      expect(pkg, `falta ${id}`).toBeDefined();
      expect(String(pkg?.payload.externalUrl), id).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
      const enCatalogo = todos.find((p) => p.id === id);
      expect(enCatalogo, `${id} no entra en allPackages`).toBeDefined();
      expect(enCatalogo?.sourceRepoId, id).toBe("starseed-biblioteca-externa-1020d");
    }
  });

  it("fichas honestas: externas, sin ruta de instalación propia", () => {
    for (const pkg of paquetes1020d) {
      expect(pkg.comingSoon, pkg.id).toBe(true);
      expect(pkg.free, pkg.id).toBe(true);
      expect(pkg.payload.route, pkg.id).toBeUndefined();
      expect(ES_DUPLICADA(payloadGithubRepo(pkg))).toBe(false);
    }
  });

  it("la URL corregida de OpenHands vive en packages.ts (iatool-openhands)", () => {
    const openhands = allPackages().find((p) => p.id === "iatool-openhands");
    expect(openhands).toBeDefined();
    expect(String(openhands?.payload.externalUrl)).toBe("https://github.com/OpenHands/OpenHands");
    expect(allPackages().filter((p) => String(p.payload.externalUrl) === "https://github.com/OpenHands/OpenHands")).toHaveLength(1);
  });

  it("gallery-dl conserva el aviso del traslado a Codeberg", () => {
    const gdl = paquetes1020d.find((p) => p.id === "lib-gallery-dl");
    expect(gdl?.description, "falta el aviso de Codeberg").toContain("Codeberg");
  });

  it("REQUISITOS_1020D trae los requisitos de los 10 paquetes de la tanda", () => {
    expect(Object.keys(REQUISITOS_1020D)).toHaveLength(10);
    expect(Object.keys(REQUISITOS_1020D)).toEqual(
      expect.arrayContaining([...IDS_CUARTA_TANDA, "lib-coolify", "lib-openhands", "lib-stirling-pdf"]),
    );
    const comfy = REQUISITOS_1020D["lib-comfyui"];
    expect(comfy?.ram_gb).toBe(8);
    expect(comfy?.vram_gb).toBe(4);
    expect(comfy?.arquitecturas).toEqual(["amd64", "arm64"]);
    const coolify = REQUISITOS_1020D["lib-coolify"];
    expect(coolify?.ram_gb).toBeNull();
    expect(typeof coolify?.fuente).toBe("string");
    const sinMedir = Object.values(REQUISITOS_1020D).filter((r) => r?.ram_gb === null).length;
    expect(sinMedir).toBeGreaterThanOrEqual(1);
  });
});

function payloadGithubRepo(pkg: { payload: Record<string, unknown> }): string {
  return String(pkg.payload.githubRepo);
}
function ES_DUPLICADA(repo: string): boolean {
  return DUPLICADAS.some((d) => d.repo.toLowerCase() === repo.toLowerCase());
}
