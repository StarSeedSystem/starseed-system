import { describe, it, expect } from "vitest";
import {
  PAQUETES_EXTERNOS,
  REPOS_EXCLUIDOS,
  REPOS_YA_PRESENTES,
  REQUISITOS_1020D,
  REPO_EXTERNOS_1020,
} from "../repos-externos-1020";
import { allPackages } from "../packages";

const paquetes = REPO_EXTERNOS_1020.packages;
const ids = paquetes.map((p) => p.id);
const reposEnBaja = paquetes.map((p) => String(p.payload.githubRepo).toLowerCase());

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
  { catalogo: "COOLLABSIO/COOLIFY", id: "iatool-coolify" },
  { catalogo: "OpenHands/OpenHands", id: "iatool-openhands" },
  { catalogo: "stirling-tools/stirling-pdf", id: "iatool-stirling-pdf" },
];

describe("REPO_EXTERNOS_1020 · 4.ª tanda (config/repos-libreria-1020d.json)", () => {
  it("los ids de las cuatro tandas son únicos", () => {
    expect(ids).toHaveLength(48);
    expect(new Set(ids).size).toBe(48);
  });

  it("las 7 fichas nuevas están en el repo builtin", () => {
    for (const id of IDS_CUARTA_TANDA) {
      const pkg = paquetes.find((p) => p.id === id);
      expect(pkg, `falta ${id}`).toBeDefined();
      const url = pkg?.payload.externalUrl;
      expect(typeof url, id).toBe("string");
      expect(url as string, id).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
    }
  });

  it("las 7 fichas nuevas también están en la vista plana PAQUETES_EXTERNOS", () => {
    const idsPlanos = PAQUETES_EXTERNOS.map((p) => p.id);
    for (const id of IDS_CUARTA_TANDA) expect(idsPlanos, `falta ${id}`).toContain(id);
  });

  it("Coolify, OpenHands y Stirling-PDF no se duplican aunque cambien las mayúsculas", () => {
    expect(REPOS_YA_PRESENTES).toContainEqual({ repo: "coollabsio/coolify", id: "iatool-coolify" });
    expect(REPOS_YA_PRESENTES).toContainEqual({ repo: "OpenHands/OpenHands", id: "iatool-openhands" });
    expect(REPOS_YA_PRESENTES).toContainEqual({ repo: "Stirling-Tools/Stirling-PDF", id: "iatool-stirling-pdf" });
    for (const dup of DUPLICADAS) {
      const enBaja = dup.catalogo.toLowerCase();
      expect(reposEnBaja, enBaja).not.toContain(enBaja);
      expect(PAQUETES_EXTERNOS.filter((p) => p.repo.toLowerCase() === enBaja)).toHaveLength(0);
    }
  });

  it("la 4.ª tanda aporta 7 fichas: sus 10 menos las 3 ya presentes", () => {
    const idsTanda = new Set([...IDS_CUARTA_TANDA, "lib-coolify", "lib-openhands", "lib-stirling-pdf"]);
    const cargadas = paquetes.filter((p) => idsTanda.has(p.id));
    expect(cargadas).toHaveLength(IDS_CUARTA_TANDA.length);
    expect(paquetes.find((p) => p.id === "lib-coolify")).toBeUndefined();
    expect(paquetes.find((p) => p.id === "lib-openhands")).toBeUndefined();
    expect(paquetes.find((p) => p.id === "lib-stirling-pdf")).toBeUndefined();
  });

  it("las exclusiones de seguridad se siguen aplicando y no entra reverse-skill", () => {
    expect(REPOS_EXCLUIDOS.length).toBeGreaterThanOrEqual(3);
    for (const pkg of paquetes) {
      expect(REPOS_EXCLUIDOS.map((v) => v.toLowerCase()), pkg.id).not.toContain(
        String(pkg.payload.githubRepo).toLowerCase(),
      );
    }
  });

  it("gallery-dl conserva el aviso del traslado a Codeberg", () => {
    const pkg = paquetes.find((p) => p.id === "lib-gallery-dl");
    expect(pkg).toBeDefined();
    expect(pkg?.description).toContain("Codeberg");
  });
});

describe("REQUISITOS_1020D · requisitos para la bolsa de recursos", () => {
  it("cubre los 10 paquetes de la tanda, incluidos los ya presentes", () => {
    const claves = Object.keys(REQUISITOS_1020D);
    expect(claves).toHaveLength(10);
    for (const id of [...IDS_CUARTA_TANDA, "lib-coolify", "lib-openhands", "lib-stirling-pdf"]) {
      expect(REQUISITOS_1020D[id], `falta ${id}`).toBeDefined();
    }
  });

  it("ComfyUI declara lo medido en el A1 con su fuente", () => {
    const comfy = REQUISITOS_1020D["lib-comfyui"];
    expect(comfy).toBeDefined();
    expect(comfy.ram_gb).toBe(8);
    expect(comfy.vram_gb).toBe(4);
    expect(comfy.gpu).toBe("recomendada");
    expect(comfy.arquitecturas).toContain("arm64");
    expect(comfy.fuente.length).toBeGreaterThan(0);
  });

  it("lo no medido es null, nunca un número inventado", () => {
    for (const id of ["lib-coolify", "lib-openhands", "lib-harness2", "lib-libretranslate", "lib-archivebox", "lib-localsend", "lib-gallery-dl", "lib-stirling-pdf", "lib-openrig"]) {
      const r = REQUISITOS_1020D[id];
      expect(typeof r, id).toBe("object");
      expect(r.ram_gb === null || typeof r.ram_gb === "number", id).toBe(true);
      expect(r.fuente.length > 0, id).toBe(true);
    }
    expect(REQUISITOS_1020D["lib-coolify"].ram_gb).toBeNull();
    expect(REQUISITOS_1020D["lib-stirling-pdf"].ram_gb).toBeNull();
    expect(REQUISITOS_1020D["lib-coolify"].docker).toBe("la instala");
    expect(REQUISITOS_1020D["lib-openhands"].docker).toBe("necesaria");
  });
});

describe("packages.ts · URL canónica de OpenHands (Ola 1020U)", () => {
  it("iatool-openhands apunta a https://github.com/OpenHands/OpenHands", () => {
    const oh = allPackages().find((p) => p.id === "iatool-openhands");
    expect(oh).toBeDefined();
    expect(oh?.payload.externalUrl).toBe("https://github.com/OpenHands/OpenHands");
  });

  it("Coolify y Stirling-PDF conservan su URL y aparecen una sola vez", () => {
    const todo = allPackages();
    const coolify = todo.filter((p) => p.payload.externalUrl === "https://github.com/coollabsio/coolify");
    expect(coolify).toHaveLength(1);
    expect(coolify[0]?.id).toBe("iatool-coolify");
    const stirling = todo.filter((p) => p.payload.externalUrl === "https://github.com/Stirling-Tools/Stirling-PDF");
    expect(stirling).toHaveLength(1);
    expect(stirling[0]?.id).toBe("iatool-stirling-pdf");
  });
});
