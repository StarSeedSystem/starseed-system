import { describe, it, expect } from "vitest";
import { desdeReleases } from "../versiones-publicadas";

const releasesEjemplo = [
  {
    tag_name: "v0.3.0",
    name: "v0.3.0",
    draft: false,
    prerelease: false,
    published_at: "2026-10-09T12:00:00Z",
    body: "Notas de la 0.3.0",
    html_url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.3.0",
    assets: [
      { name: "StarSeed.OS_0.3.0_universal.dmg", size: 1024, browser_download_url: "https://example.com/dmg" },
      { name: "StarSeed.OS_0.3.0_x64-setup.exe", size: 2048, browser_download_url: "https://example.com/exe" },
      { name: "StarSeed.OS_0.3.0_x64_en-US.msi", size: 1024, browser_download_url: "https://example.com/msi" },
      { name: "StarSeed.OS_0.3.0_amd64.AppImage", size: 4096, browser_download_url: "https://example.com/AppImage" },
      { name: "StarSeed.OS_0.3.0_amd64.deb", size: 3000, browser_download_url: "https://example.com/deb" },
      { name: "StarSeed.OS-0.3.0-1.x86_64.rpm", size: 3100, browser_download_url: "https://example.com/rpm" },
      { name: "StarSeed-os-0.3.0.apk", size: 5000, browser_download_url: "https://example.com/apk" },
      { name: "StarSeed.Nexus_0.3.0_universal.dmg", size: 900, browser_download_url: "https://example.com/nexus-dmg" },
      { name: "StarSeed-cafe-0.3.0.apk", size: 4500, browser_download_url: "https://example.com/cafe-apk" },
    ],
  },
  {
    tag_name: "v0.2.0",
    name: "v0.2.0",
    draft: false,
    prerelease: false,
    published_at: "2026-08-01T10:00:00Z",
    body: "Notas de la 0.2.0",
    html_url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.2.0",
    assets: [],
  },
  {
    tag_name: "v0.4.0-beta",
    name: "v0.4.0-beta",
    draft: false,
    prerelease: true,
    published_at: "2026-11-01T10:00:00Z",
    body: "Pre-release",
    html_url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.4.0-beta",
    assets: [],
  },
  {
    tag_name: "v0.1.0",
    name: "v0.1.0",
    draft: true,
    prerelease: false,
    published_at: "2026-06-01T10:00:00Z",
    body: "Borrador",
    html_url: "",
    assets: [],
  },
];

describe("desdeReleases", () => {
  it("filtra borradores y prereleases", () => {
    const resultado = desdeReleases(releasesEjemplo);
    expect(resultado.length).toBe(2);
    expect(resultado.map(r => r.version)).toEqual(["0.3.0", "0.2.0"]);
  });

  it("ordena la más nueva primero", () => {
    const resultado = desdeReleases(releasesEjemplo);
    expect(resultado[0].version).toBe("0.3.0");
    expect(resultado[1].version).toBe("0.2.0");
  });

  it("mapea archivos por sistema y SO con tamaño y URL", () => {
    const resultado = desdeReleases(releasesEjemplo);
    const v = resultado[0];
    expect(v.version).toBe("0.3.0");
    expect(v.fecha).toBe("2026-10-09T12:00:00Z");
    expect(v.notas).toBe("Notas de la 0.3.0");
    expect(v.url).toContain("v0.3.0");

    const osMac = v.archivos.os.macos;
    expect(osMac).toBeDefined();
    expect(osMac?.length).toBe(1);
    expect(osMac?.[0].nombre).toBe("StarSeed.OS_0.3.0_universal.dmg");
    expect(osMac?.[0].tamanio).toBe(1024);
    expect(osMac?.[0].url).toBe("https://example.com/dmg");

    const osWin = v.archivos.os.windows;
    expect(osWin?.length).toBe(2);

    const osLinux = v.archivos.os.linux;
    expect(osLinux?.length).toBe(3);

    const osAndroid = v.archivos.os.android;
    expect(osAndroid?.length).toBe(1);
    expect(osAndroid?.[0].nombre).toBe("StarSeed-os-0.3.0.apk");

    const nexusMac = v.archivos.nexus.macos;
    expect(nexusMac?.length).toBe(1);
    expect(nexusMac?.[0].nombre).toBe("StarSeed.Nexus_0.3.0_universal.dmg");

    const cafeAndroid = v.archivos.cafe.android;
    expect(cafeAndroid?.length).toBe(1);
    expect(cafeAndroid?.[0].nombre).toBe("StarSeed-cafe-0.3.0.apk");
  });

  it("devuelve vacío con entrada inválida", () => {
    expect(desdeReleases(null)).toEqual([]);
    expect(desdeReleases({})).toEqual([]);
  });
});
