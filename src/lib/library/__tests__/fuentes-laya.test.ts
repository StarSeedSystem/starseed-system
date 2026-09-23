import { describe, it, expect } from "vitest";
import { REPO_DECISIONES } from "../fuentes-decision";
import { urlDeConsulta, leerVersion } from "../actualizaciones";

describe("ficha de Laya en la Biblioteca", () => {
  it("encuentra el paquete laya en REPO_DECISIONES y valida sus campos principales", () => {
    const laya = REPO_DECISIONES.packages.find((p) => p.id === "laya");
    expect(laya).toBeDefined();
    expect(laya?.kind).toBe("ai-source");
    expect(laya?.name).toBe("laya");
    expect(laya?.author).toBe("receptron");
    expect(laya?.free).toBe(true);
    expect(laya?.sourceRepoId).toBe("starseed-decisiones");
    expect(laya?.version).toBe("1.0.0");
    expect(laya?.comingSoon).toBe(true);
    expect(laya?.tags).toEqual(
      expect.arrayContaining(["decisiones", "local", "onnx", "multilingüe", "jev"])
    );
  });

  it("valida el payload y la ficha detallada de laya", () => {
    const laya = REPO_DECISIONES.packages.find((p) => p.id === "laya");
    expect(laya?.payload?.upstream).toBe("https://github.com/receptron/laya");
    expect(laya?.payload?.licencia).toBe("MIT");
    expect(laya?.payload?.corre_aqui).toBe(false);

    const reqs = String(laya?.payload?.requisitos);
    expect(reqs).toContain("ONNX");
    expect(reqs).toContain("1,7 GB");
    expect(reqs).toContain("140 ms");
    expect(reqs).toContain("2 GB");
    expect(reqs).toContain("Jev systemOne");

    const desc = laya?.description ?? "";
    expect(desc).toContain("ONNX");
    expect(desc).toContain("fp32");
    expect(desc).toContain("convaiinnovations/laya");
    expect(desc).toContain("receptron/laya-onnx");
    expect(desc).toContain("Apache-2.0");
  });

  it("verifica la consulta de actualizaciones automaticas del upstream de laya", () => {
    const laya = REPO_DECISIONES.packages.find((p) => p.id === "laya");
    const upstream = String(laya?.payload?.upstream);
    const url = urlDeConsulta(upstream);

    expect(url).toBe("https://api.github.com/repos/receptron/laya/commits?per_page=1");

    const mockGithubJson = [
      {
        sha: "a1b2c3d4e5f67890",
        commit: {
          committer: {
            date: "2026-09-22T12:00:00Z",
          },
        },
      },
    ];

    const leida = leerVersion(upstream, mockGithubJson);
    expect(leida).not.toBeNull();
    expect(leida?.version).toBe("a1b2c3d");
    expect(leida?.fecha).toBe("2026-09-22T12:00:00Z");
  });
});
