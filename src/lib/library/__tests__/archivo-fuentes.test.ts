import { describe, it, expect } from "vitest";
import {
  VARIABLES_ARCHIVEBOX_09,
  esDireccionPrivada,
  fichaDeCopia,
  fuentesParaArchivar,
  normalizarUrl,
  ordenDeArchivo,
} from "../archivo-fuentes";

describe("normalizarUrl", () => {
  it("pone el host en minúsculas y quita utm, fbclid, gclid y el fragmento", () => {
    const entrada = "https://Example.COM/ruta?utm_source=news&utm_medium=mail&fbclid=abc&gclid=def&a=1#seccion";
    expect(normalizarUrl(entrada)).toBe("https://example.com/ruta?a=1");
  });
  it("conserva los parámetros que no son ruido", () => {
    expect(normalizarUrl("http://example.com/buscar?q=libros&page=2")).toBe(
      "http://example.com/buscar?q=libros&page=2",
    );
  });
  it("solo acepta http(s) absolutas", () => {
    for (const url of ["javascript:alert(1)", "ftp://example.com/x", "file:///etc/passwd", "/ruta/interna", "no es una url", ""]) {
      expect(normalizarUrl(url)).toBeNull();
    }
  });
  it("rechaza todas las direcciones locales o privadas", () => {
    const locales = [
      "http://localhost:8001/x", "http://app.localhost/x", "http://127.0.0.1/x",
      "http://127.9.9.9/x", "http://10.0.0.5/x", "http://192.168.1.10/x",
      "http://172.16.0.1/x", "http://172.31.255.255/x", "http://[::1]/x",
      "http://impresora.local/x",
    ];
    for (const url of locales) expect(normalizarUrl(url)).toBeNull();
  });
  it("acepta direcciones públicas vecinas del rango privado", () => {
    expect(normalizarUrl("http://172.32.0.1/x")).toBe("http://172.32.0.1/x");
    expect(esDireccionPrivada("172.15.0.1")).toBe(false);
    expect(esDireccionPrivada("192.169.0.1")).toBe(false);
  });
});

describe("fuentesParaArchivar", () => {
  it("nunca archiva enlaces de fichas privadas", () => {
    const fichas = [{ id: "privada", enlaces: ["https://example.com/secreto"], privada: true }];
    expect(fuentesParaArchivar(fichas, [])).toEqual([]);
  });
  it("descarta lo ya archivado comparando la URL normalizada", () => {
    const fichas = [{ id: "a", enlaces: ["https://example.com/x?utm_source=foo"], privada: false }];
    expect(fuentesParaArchivar(fichas, ["https://example.com/x"])).toEqual([]);
  });
  it("no repite la misma URL y conserva la primera ficha", () => {
    const fichas = [
      { id: "a", enlaces: ["https://example.com/x", "https://example.com/x?fbclid=1"], privada: false },
      { id: "b", enlaces: ["https://example.com/x"], privada: false },
    ];
    expect(fuentesParaArchivar(fichas, [])).toEqual([{ url: "https://example.com/x", fichaId: "a" }]);
  });
  it("mezcla fichas públicas saltándose locales, no-http y privadas", () => {
    const fichas = [
      { id: "a", enlaces: ["http://localhost/x", "javascript:alert(1)", "https://example.com/ok"], privada: false },
      { id: "b", enlaces: ["https://10.1.2.3/x"], privada: false },
      { id: "c", enlaces: ["https://example.org/otra"], privada: true },
    ];
    expect(fuentesParaArchivar(fichas, [])).toEqual([{ url: "https://example.com/ok", fichaId: "a" }]);
  });
});

describe("ordenDeArchivo", () => {
  it("apaga archive.org y medios, y activa git solo con hosts de código", () => {
    const orden = ordenDeArchivo([
      "https://GitHub.com/usuario/repo?utm_source=x", "https://example.com/a#frag", "http://localhost/x",
    ]);
    expect(orden).toEqual({
      urls: ["https://github.com/usuario/repo", "https://example.com/a"],
      opciones: { archiveOrg: false, medios: false, git: true },
    });
  });
  it("deja git en false cuando no hay repositorios", () => {
    expect(ordenDeArchivo(["https://example.com/a"]).opciones.git).toBe(false);
  });
  it("exporta la tabla real de ArchiveBox 0.9 y no otras variables", () => {
    expect(VARIABLES_ARCHIVEBOX_09).toEqual({
      archiveOrg: "ARCHIVEDOTORG_ENABLED", medios: "YTDLP_ENABLED",
      indicePublico: "PUBLIC_INDEX", instantaneasPublicas: "PUBLIC_SNAPSHOTS",
    });
  });
});

describe("fichaDeCopia", () => {
  it("resume fecha y formatos con sus nombres legibles", () => {
    const resumen = fichaDeCopia({ guardadaEl: "2026-10-20 21:10", formatos: ["html", "pdf", "RARO"] });
    expect(resumen.texto).toBe("copia guardada el 2026-10-20 21:10 · HTML original, PDF, RARO");
    expect(resumen.formatos).toEqual(["HTML original", "PDF", "RARO"]);
    expect(resumen.aviso).toBeUndefined();
  });
  it("dice con honestidad que no hay fecha ni formatos confirmados", () => {
    expect(fichaDeCopia({})).toEqual({
      texto: "copia guardada (sin fecha confirmada) · sin formatos confirmados", formatos: [],
    });
  });
  it("avisa de lo que no se pudo guardar", () => {
    expect(fichaDeCopia({ guardadaEl: "ayer", formatos: ["pdf"], fallidos: ["media"] }).aviso).toBe(
      "no se pudo guardar: media",
    );
  });
});
