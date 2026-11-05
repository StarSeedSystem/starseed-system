import { describe, expect, it } from "vitest";

import { desdeReleases, tipoVersion } from "../versiones-publicadas";

const JSON_RELEASES = [
  {
    tag_name: "v0.3.0",
    published_at: "2026-10-09T12:00:00Z",
    html_url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.3.0",
    name: "v0.3.0",
    body: "Notas de la versión 0.3.0",
    draft: false,
    prerelease: false,
    assets: [
      { name: "StarSeed.OS_0.3.0_universal.dmg", browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.3.0/StarSeed.OS_0.3.0_universal.dmg", size: 7025536 },
      { name: "StarSeed.OS_0.3.0_x64-setup.exe", browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.3.0/StarSeed.OS_0.3.0_x64-setup.exe", size: 2516582 },
      { name: "StarSeed.OS_0.3.0_x64_en-US.msi", browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.3.0/StarSeed.OS_0.3.0_x64_en-US.msi", size: 3460352 },
      { name: "StarSeed.OS_0.3.0_amd64.AppImage", browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.3.0/StarSeed.OS_0.3.0_amd64.AppImage", size: 81800000 },
      { name: "StarSeed.OS_0.3.0_amd64.deb", browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.3.0/StarSeed.OS_0.3.0_amd64.deb", size: 3774874 },
      { name: "StarSeed.OS-0.3.0-1.x86_64.rpm", browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.3.0/StarSeed.OS-0.3.0-1.x86_64.rpm", size: 3774874 },
      { name: "StarSeed-os-0.3.0.apk", browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.3.0/StarSeed-os-0.3.0.apk", size: 28665472 },
      { name: "StarSeed.Nexus_0.3.0_universal.dmg", browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.3.0/StarSeed.Nexus_0.3.0_universal.dmg", size: 7025536 },
      { name: "StarSeed.Nexus_0.3.0_x64-setup.exe", browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.3.0/StarSeed.Nexus_0.3.0_x64-setup.exe", size: 2516582 },
      { name: "StarSeed-nexus-0.3.0.apk", browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.3.0/StarSeed-nexus-0.3.0.apk", size: 28665472 },
      { name: "StarSeed.Cafe_0.3.0_universal.dmg", browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.3.0/StarSeed.Cafe_0.3.0_universal.dmg", size: 7025536 },
      { name: "StarSeed.cafe-0.3.0.apk", browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.3.0/StarSeed.cafe-0.3.0.apk", size: 28665472 },
    ],
  },
  {
    tag_name: "v0.2.0",
    published_at: "2026-09-24T10:00:00Z",
    html_url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.2.0",
    name: "v0.2.0",
    body: "Notas de la versión 0.2.0",
    draft: false,
    prerelease: false,
    assets: [
      { name: "StarSeed.OS_0.2.0_universal.dmg", browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.2.0/StarSeed.OS_0.2.0_universal.dmg", size: 6500000 },
      { name: "StarSeed-os-0.2.0.apk", browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.2.0/StarSeed-os-0.2.0.apk", size: 27000000 },
    ],
  },
  {
    tag_name: "v0.1.0",
    published_at: "2026-08-15T08:00:00Z",
    html_url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.1.0",
    name: "v0.1.0",
    body: "Notas de la versión 0.1.0",
    draft: true,
    prerelease: false,
    assets: [
      { name: "StarSeed.OS_0.1.0_universal.dmg", browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.1.0/StarSeed.OS_0.1.0_universal.dmg", size: 6000000 },
    ],
  },
  {
    tag_name: "v0.0.9-beta",
    published_at: "2026-07-01T00:00:00Z",
    html_url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.0.9-beta",
    name: "v0.0.9-beta",
    body: "Notas de beta",
    draft: false,
    prerelease: true,
    assets: [
      { name: "StarSeed.OS_0.0.9-beta_universal.dmg", browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.0.9-beta/StarSeed.OS_0.0.9-beta_universal.dmg", size: 5000000 },
    ],
  },
];

describe("desdeReleases", () => {
  it("devuelve versiones sin borradores ni prereleases, más nueva primero", () => {
    const result = desdeReleases(JSON_RELEASES as any);

    expect(result).toHaveLength(2);
    expect(result[0].version).toBe("v0.3.0");
    expect(result[1].version).toBe("v0.2.0");
  });

  it("filtra borradores (draft=true)", () => {
    const result = desdeReleases(JSON_RELEASES as any);
    const versions = result.map((v) => v.version);
    expect(versions).not.toContain("v0.1.0");
  });

  it("filtra prereleases (prerelease=true)", () => {
    const result = desdeReleases(JSON_RELEASES as any);
    const versions = result.map((v) => v.version);
    expect(versions).not.toContain("v0.0.9-beta");
  });

  it("incluye fecha, notas, url y archivos por sistema", () => {
    const result = desdeReleases(JSON_RELEASES as any);
    const v03 = result[0];

    expect(v03.fecha).toBe("2026-10-09");
    expect(v03.notas).toBe("Notas de la versión 0.3.0");
    expect(v03.url).toBe("https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.3.0");
  });

  it("agrupa archivos por sistema y por SO", () => {
    const result = desdeReleases(JSON_RELEASES as any);
    const v03 = result[0];

    expect(v03.archivos).toBeDefined();
    expect(v03.archivos.os).toBeDefined();

    const osAssets = v03.archivos.os;
    const systemos = Object.keys(osAssets);
    expect(systemos).toContain("macos");
    expect(systemos).toContain("windows");
    expect(systemos).toContain("linux");
    expect(systemos).toContain("android");
  });

  it("cada archivo tiene nombre, tamaño y URL", () => {
    const result = desdeReleases(JSON_RELEASES as any);
    const v03 = result[0];

    const macos = v03.archivos.os.macos;
    expect(macos).toHaveLength(1);
    expect(macos[0].nombre).toBe("StarSeed.OS_0.3.0_universal.dmg");
    expect(macos[0].bytes).toBe(7025536);
    expect(macos[0].href).toBe("https://github.com/StarSeedSystem/starseed-system/releases/download/v0.3.0/StarSeed.OS_0.3.0_universal.dmg");
  });

  it("filtra solo los assets del sistema OS por defecto", () => {
    const result = desdeReleases(JSON_RELEASES as any);
    const v03 = result[0];

    const android = v03.archivos.os.android;
    expect(android).toHaveLength(1);
    expect(android[0].nombre).toBe("StarSeed-os-0.3.0.apk");
  });

  it("devuelve array vacío si no hay releases válidos", () => {
    const result1 = desdeReleases([]);
    expect(result1).toEqual([]);

    const result2 = desdeReleases([{ draft: true, prerelease: true, assets: [] }] as any);
    expect(result2).toEqual([]);
  });

  it("maneja assets con nombres inesperados sin lanzar", () => {
    const releasesMalFormados = [
      {
        tag_name: "v1.0.0",
        published_at: "2026-11-01T00:00:00Z",
        html_url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v1.0.0",
        body: "Notas",
        draft: false,
        prerelease: false,
        assets: [
          { name: "file.txt", browser_download_url: "http://example.com/file.txt", size: 100 },
          { name: null, browser_download_url: "http://example.com/", size: 100 },
        ],
      },
    ];

    expect(() => desdeReleases(releasesMalFormados as any)).not.toThrow();
    const result = desdeReleases(releasesMalFormados as any);
    expect(result).toHaveLength(1);
    expect(result[0].archivos.os.macos).toEqual([]);
  });
});

describe("tipoVersion", () => {
  it("identifica version OS correctamente", () => {
    expect(tipoVersion("StarSeed.OS_0.3.0_universal.dmg")).toBe("os");
    expect(tipoVersion("StarSeed-os-0.3.0.apk")).toBe("os");
  });

  it("identifica version Nexus correctamente", () => {
    expect(tipoVersion("StarSeed.Nexus_0.3.0_universal.dmg")).toBe("nexus");
    expect(tipoVersion("StarSeed-nexus-0.3.0.apk")).toBe("nexus");
  });

  it("identifica version Cafe correctamente", () => {
    expect(tipoVersion("StarSeed.Cafe_0.3.0_universal.dmg")).toBe("cafe");
    expect(tipoVersion("StarSeed.cafe-0.3.0.apk")).toBe("cafe");
  });

  it("devuelve null para archivos de otros sistemas", () => {
    expect(tipoVersion("Astraura-1.6.0-arm64-mac.dmg")).toBeNull();
    expect(tipoVersion("Audiomorphic_v1.2.0.apk")).toBeNull();
  });
});