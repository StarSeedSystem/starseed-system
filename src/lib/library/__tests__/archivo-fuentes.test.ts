import { describe, expect, it } from "vitest";

import {
  OPCIONES_ARCHIVEBOX_09,
  fichaDeCopia,
  fuentesParaArchivar,
  normalizarUrl,
  ordenDeArchivo,
} from "../archivo-fuentes";

describe("normalizarUrl", () => {
  it("normaliza el host y quita rastreadores y fragmento", () => {
    expect(
      normalizarUrl("HTTPS://Example.COM/Articulo?utm_source=x&utm_medium=y&fbclid=1&gclid=2&id=7#parte"),
    ).toBe("https://example.com/Articulo?id=7");
    expect(normalizarUrl("http://ejemplo.com/?utm_campaign=hola#arriba")).toBe("http://ejemplo.com/");
  });

  it("quita los rastreadores aunque lleguen en mayúsculas", () => {
    expect(normalizarUrl("https://ejemplo.com/p?UTM_SOURCE=x&FBCLID=1&ok=2")).toBe(
      "https://ejemplo.com/p?ok=2",
    );
  });

  it("solo admite http y https, nunca rutas internas ni esquemas peligrosos", () => {
    for (const raw of [
      "javascript:alert(1)",
      "data:text/html,hola",
      "mailto:alguien@ejemplo.com",
      "ftp://ejemplo.com/archivo",
      "/ruta/interna",
      "",
      "   ",
      null,
      undefined,
    ]) {
      expect(normalizarUrl(raw)).toBeNull();
    }
  });
});

describe("exclusión de direcciones locales y privadas", () => {
  it("rechaza localhost, bucles y redes privadas", () => {
    for (const raw of [
      "http://localhost/x",
      "http://LOCALHOST:3000/x",
      "http://127.0.0.1/x",
      "http://127.9.9.9/",
      "http://10.0.0.5/",
      "http://192.168.1.4/",
      "http://172.16.0.1/",
      "http://172.31.255.255/",
      "http://[::1]/x",
      "http://mi-cosa.local/x",
    ]) {
      expect(normalizarUrl(raw), raw).toBeNull();
    }
  });

  it("no rechaza una 172 pública", () => {
    expect(normalizarUrl("http://172.32.0.1/x")).toBe("http://172.32.0.1/x");
    expect(normalizarUrl("http://172.15.0.1/x")).toBe("http://172.15.0.1/x");
  });
});

describe("fuentesParaArchivar", () => {
  it("devuelve vacío sin fichas y no repite", () => {
    expect(fuentesParaArchivar([])).toEqual([]);
    expect(fuentesParaArchivar([], [])).toEqual([]);
  });

  it("excluye fichas privadas y enlaces locales, y no repite", () => {
    const urls = fuentesParaArchivar(
      [
        {
          id: "publica-1",
          privada: false,
          enlaces: [
            "https://Example.com/a?utm_source=x&id=1#arriba",
            "https://example.com/a?id=1",
            "http://localhost/b",
            "ftp://example.com/c",
          ],
        },
        { id: "privada-1", privada: true, enlaces: ["https://example.com/privado"] },
        { id: "publica-2", privada: false, enlaces: ["https://example.com/ya", "https://sitio.org/b#x"] },
      ],
      ["https://example.com/ya?fbclid=1"],
    );

    expect(urls).toEqual(["https://example.com/a?id=1", "https://sitio.org/b"]);
  });
});

describe("ordenDeArchivo", () => {
  it("apaga archive.org y medios, y pide git solo para hosts de código", () => {
    expect(OPCIONES_ARCHIVEBOX_09).toEqual({ ARCHIVEDOTORG_ENABLED: false, YTDLP_ENABLED: false, PUBLIC_INDEX: false, PUBLIC_SNAPSHOTS: false });

    const codigo = ordenDeArchivo([
      "https://GitHub.com/A/b?utm_source=x",
      "https://github.com/A/b",
      "https://gist.github.com/abc",
    ]);
    expect(codigo.urls).toEqual(["https://github.com/A/b", "https://gist.github.com/abc"]);
    expect(codigo.opciones).toEqual({ archiveOrg: false, medios: false, git: true });

    const normal = ordenDeArchivo(["https://ejemplo.com/x", "http://localhost/y"]);
    expect(normal.urls).toEqual(["https://ejemplo.com/x"]);
    expect(normal.opciones).toEqual({ archiveOrg: false, medios: false, git: false });
  });
});

describe("fichaDeCopia", () => {
  it("resume fecha y formatos, y dice cuando falta un dato", () => {
    expect(
      fichaDeCopia({
        guardadaEn: "2026-10-20T18:30:00Z",
        formatos: ["PDF", "captura", "HTML", "PDF"],
      }),
    ).toBe("copia guardada el 2026-10-20 · PDF, captura y HTML");

    const sinDatos = fichaDeCopia({ formatos: [] });
    expect(sinDatos).toContain("copia guardada (fecha sin verificar)");
    expect(sinDatos).toContain("sin formatos verificados");

    expect(fichaDeCopia({ guardadaEn: "2026-02-31", formatos: ["PDF"] })).toBe(
      "copia guardada (fecha sin verificar) · PDF",
    );
  });
});
