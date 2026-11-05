import { describe, it, expect } from "vitest";
import { desdeReleases } from "../versiones-publicadas";

const releasesEjemplo = [
  {
    tag_name: "v0.3.0",
    name: "0.3.0",
    draft: false,
    prerelease: false,
    published_at: "2026-10-09T12:00:00Z",
    body: "Notas 0.3.0",
    html_url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.3.0",
    assets: [
      { name: "StarSeed.OS_0.3.0_universal.dmg", size: 1024, browser_download_url: "https://..." },
      { name: "StarSeed-os-0.3.0.apk", size: 2048, browser_download_url: "https://..." },
    ],
  },
  {
    tag_name: "v0.2.0",
    name: "0.2.0",
    draft: false,
    prerelease: false,
    published_at: "2026-09-01T12:00:00Z",
    body: "Notas 0.2.0",
    html_url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.2.0",
    assets: [],
  },
  {
    tag_name: "v0.3.1-beta",
    draft: false,
    prerelease: true,
    published_at: "2026-10-10T12:00:00Z",
    body: "Beta",
    html_url: "",
    assets: [],
  },
];

describe("desdeReleases", () => {
  it("filtra borradores y prereleases, ordena la más nueva primero", () => {
    const resultado = desdeReleases(releasesEjemplo);
    expect(resultado).toHaveLength(2);
    expect(resultado[0].version).toBe("v0.3.0");
    expect(resultado[1].version).toBe("v0.2.0");
  });

  it("agrupa archivos por sistema y SO con tamaño y url", () => {
    const resultado = desdeReleases(releasesEjemplo);
    const v = resultado[0];
    expect(v.archivos.os.macos?.[0].nombre).toBe("StarSeed.OS_0.3.0_universal.dmg");
    expect(v.archivos.os.android?.[0].tamaño).toBe(2048);
  });
});
