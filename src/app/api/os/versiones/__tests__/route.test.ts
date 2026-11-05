import { describe, expect, it } from "vitest";
import { GET } from "../route";

const MARCHE = [
  {
    tag_name: "v0.3.0",
    published_at: "2026-10-09T12:00:00Z",
    html_url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.3.0",
    body: "Notas 0.3.0",
    draft: false,
    prerelease: false,
    assets: [
      { name: "StarSeed.OS_0.3.0_universal.dmg", browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.3.0/StarSeed.OS_0.3.0_universal.dmg", size: 7025536 },
      { name: "StarSeed-os-0.3.0.apk", browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.3.0/StarSeed-os-0.3.0.apk", size: 28665472 },
    ],
  },
  {
    tag_name: "v0.2.0",
    published_at: "2026-09-24T10:00:00Z",
    html_url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.2.0",
    body: "Notas 0.2.0",
    draft: false,
    prerelease: false,
    assets: [
      { name: "StarSeed.OS_0.2.0_universal.dmg", browser_download_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.2.0/StarSeed.OS_0.2.0_universal.dmg", size: 6500000 },
    ],
  },
];

describe("GET /api/os/versiones", () => {
  it("devuelve response JSON con versiones", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MARCHE),
    });

    const globalFetch = global.fetch;
    // @ts-ignore
    global.fetch = mockFetch;

    const response = await GET();

    // @ts-ignore
    global.fetch = globalFetch;

    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("Content-Type")).toContain("application/json");

    const body = await response.json();
    expect(body).toHaveProperty("versiones");
    expect(body).toHaveProperty("generadoEn");
    expect(Array.isArray(body.versiones)).toBe(true);
  });

  it("devuelve versiones ordenadas por fecha descendente", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MARCHE),
    });

    const globalFetch = global.fetch;
    // @ts-ignore
    global.fetch = mockFetch;

    const response = await GET();
    // @ts-ignore
    global.fetch = globalFetch;

    const body = await response.json();
    expect(body.versiones[0].version).toBe("v0.3.0");
    expect(body.versiones[1].version).toBe("v0.2.0");
  });

  it("incluye archivos por sistema operativo", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MARCHE),
    });

    const globalFetch = global.fetch;
    // @ts-ignore
    global.fetch = mockFetch;

    const response = await GET();
    // @ts-ignore
    global.fetch = globalFetch;

    const body = await response.json();
    const v03 = body.versiones[0];

    expect(v03.archivos.os.macos.length).toBeGreaterThan(0);
    expect(v03.archivos.os.android.length).toBeGreaterThan(0);
    expect(v03.archivos.os.windows).toEqual([]);
    expect(v03.archivos.os.linux).toEqual([]);
  });

  it("filtra borradores y prereleases", async () => {
    const releases = [
      ...MARCHE,
      {
        tag_name: "v0.1.0-draft",
        published_at: "2026-08-01T00:00:00Z",
        html_url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.1.0-draft",
        body: "Draft version",
        draft: true,
        prerelease: false,
        assets: [],
      },
      {
        tag_name: "v0.0.9-beta",
        published_at: "2026-07-01T00:00:00Z",
        html_url: "https://github.com/StarSeedSystem/starseed-system/releases/tag/v0.0.9-beta",
        body: "Beta version",
        draft: false,
        prerelease: true,
        assets: [],
      },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(releases),
    });

    const globalFetch = global.fetch;
    // @ts-ignore
    global.fetch = mockFetch;

    const response = await GET();
    // @ts-ignore
    global.fetch = globalFetch;

    const body = await response.json();
    const versions = body.versiones.map((v: any) => v.version);

    expect(versions).not.toContain("v0.1.0-draft");
    expect(versions).not.toContain("v0.0.9-beta");
  });

  it("maneja fallos de fetch devolviendo datos en caché", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const globalFetch = global.fetch;
    // @ts-ignore
    global.fetch = mockFetch;

    const response = await GET();
    // @ts-ignore
    global.fetch = globalFetch;

    const body = await response.json();
    expect(Array.isArray(body.versiones)).toBe(true);
  });
});