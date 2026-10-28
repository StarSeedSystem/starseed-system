import { describe, it, expect } from "vitest";
import {
  PAQUETES_EXTERNOS,
  REPOS_EXCLUIDOS,
  REPOS_YA_PRESENTES,
  REPO_EXTERNOS_1020,
} from "../repos-externos-1020";
import catalogo1020c from "../../../../config/repos-libreria-1020c.json";
import { listRepos } from "../packages";

interface EntradaC { id: string; repo: string; canal: string; licencia: string }
const catalogoC = (catalogo1020c as unknown as { paquetes: EntradaC[] }).paquetes;
const reposC = catalogoC.map((e) => e.repo);
const idsC = catalogoC.map((e) => e.id);

/** Devuelve https://github.com/<repo> de cada payload del builtin. */
function urlsBuiltin(): string[] {
  return listRepos().flatMap((r) =>
    r.packages.map((p) => typeof p.payload?.externalUrl === "string"
      ? p.payload.externalUrl : ""),
  );
}

describe("3.ª tanda 1020c · exclusiones y dedupe", () => {
  it("REPOS_EXCLUIDOS incluye la exclusión defensiva de la 3.ª tanda", () => {
    expect(REPOS_EXCLUIDOS).toContain("Kritt-ai/open-kritt");
    expect(REPOS_EXCLUIDOS).toHaveLength(3);
  });

  it("ningún repo excluido aparece como paquete", () => {
    for (const p of PAQUETES_EXTERNOS) {
      expect(REPOS_EXCLUIDOS, p.repo).not.toContain(p.repo);
    }
    expect(idsC).not.toContain("Kritt-ai/open-kritt");
  });
});

describe("3.ª tanda 1020c · paquetes de la vista plana", () => {
  const presentes = catalogoC.filter((e) => e.repo !== "penpot/penpot");

  it("las 13 restantes de la 3.ª tanda están en PAQUETES_EXTERNOS", () => {
    const ids = PAQUETES_EXTERNOS.map((p) => p.id);
    expect(presentes).toHaveLength(13);
    for (const e of presentes) expect(ids, e.id).toContain(e.id);
    expect(PAQUETES_EXTERNOS).toHaveLength(41);
  });

  it("los ids de las tres tandas son únicos", () => {
    const ids = PAQUETES_EXTERNOS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("conserva ficha honesta: canal, licencia y comingSoon por efecto", () => {
    const openworker = PAQUETES_EXTERNOS.find((p) => p.id === "lib-openworker");
    expect(openworker?.canal).toBe("releases");
    expect(openworker?.licencia).toBe("MIT");
    expect(openworker?.comingSoon).toBe(true);
    const supra = PAQUETES_EXTERNOS.find((p) => p.id === "lib-supra-tex");
    expect(supra?.canal).toBe("commits");
    expect(supra?.externalUrl).toBe("https://github.com/Supra-3D/SUPRA-Tex");
    const excali = PAQUETES_EXTERNOS.find((p) => p.id === "lib-excalidraw");
    expect(excali?.efecto).toBe("FUNCIONAL");
    expect(excali?.comingSoon).toBe(false);
  });
});

describe("3.ª tanda 1020c · sin duplicar repos ya builtin", () => {
  it("penpot/penpot no se creó como paquete nuevo", () => {
    const repos = PAQUETES_EXTERNOS.map((p) => p.githubRepo);
    expect(idsC).toContain("lib-penpot");
    expect(repos).not.toContain("penpot/penpot");
    const urls = repos.map((repo) => `https://github.com/${repo}`);
    expect(urls).not.toContain("https://github.com/penpot/penpot");
  });

  it("REPOS_YA_PRESENTES lo documenta y coincide con el builtin real", () => {
    expect(REPOS_YA_PRESENTES).toEqual([{ repo: "penpot/penpot", id: "iatool-penpot" }]);
    const urls = urlsBuiltin();
    expect(urls).toContain("https://github.com/penpot/penpot");
    expect(urls.filter((u) => u === "https://github.com/penpot/penpot")).toHaveLength(1);
  });

  it("heredan la repo builtin de la 1.ª tanda sin tocarla", () => {
    expect(REPO_EXTERNOS_1020.packages).toHaveLength(14);
    for (const pkg of REPO_EXTERNOS_1020.packages) {
      expect(reposC, pkg.id).not.toContain(String(pkg.payload.githubRepo));
    }
  });
});
