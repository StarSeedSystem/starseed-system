/** Pruebas de `huellas.ts` · SHA256 de activos (contrato: `architecture/artcraft-y-rare.md` §6). Solo funciones puras. */
import { describe, expect, it } from "vitest";
import {
  TAMANO_MAXIMO_BYTES, esActivoPermitido, fijarVersion, nombreActivoCli,
  nombreActivoRare, nombreActivoWeb, parseSha256Sums, sha256Hex, verificarActivo,
} from "../huellas";

const SHA_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const SHA_VACIO = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const bytesDe = (texto: string): Uint8Array => new TextEncoder().encode(texto);
const NOMBRE = nombreActivoWeb("figcraft", "0.10.0");

describe("sha256Hex", () => {
  it("«abc» y el vacío dan las huellas conocidas", async () => {
    expect(await sha256Hex(bytesDe("abc"))).toBe(SHA_ABC);
    expect(await sha256Hex(new Uint8Array(0))).toBe(SHA_VACIO);
  });
});

describe("parseSha256Sums", () => {
  const SUMS = [
    "# huellas de la release", "",
    `${SHA_ABC.toUpperCase()}  figcraft-web-0.10.0.zip`,
    `${SHA_VACIO} *gridcraft-cli-0.11.1-macos-universal.zip`,
    "no-es-una-huella  deckcraft-web-0.10.0.zip",
  ].join("\r\n");

  it("lee uno y dos espacios y normaliza la huella a minúsculas", () => {
    const sumas = parseSha256Sums(SUMS);
    expect(sumas.size).toBe(2);
    expect(sumas.get("figcraft-web-0.10.0.zip")).toBe(SHA_ABC);
    expect(sumas.get("gridcraft-cli-0.11.1-macos-universal.zip")).toBe(SHA_VACIO);
  });

  it("ignora vacías, comentarios y huellas mal formadas", () => {
    expect(parseSha256Sums("\n# solo comentario\nzz  loquesea.zip\n").size).toBe(0);
  });
});

describe("nombres de activo", () => {
  it("web quita la «v» y cli es macOS universal", () => {
    expect(nombreActivoWeb("figcraft", "v0.10.0")).toBe("figcraft-web-0.10.0.zip");
    expect(nombreActivoCli("gridcraft", "0.11.1")).toBe("gridcraft-cli-0.11.1-macos-universal.zip");
  });

  it("Rare con cada formato conocido", () => {
    expect(nombreActivoRare("1.12.0.237", "arm64.dmg")).toBe("Rare-1.12.0.237-arm64.dmg");
    expect(nombreActivoRare("1.12.0.237", "x86_64.AppImage")).toBe("Rare-1.12.0.237-x86_64.AppImage");
  });
});

describe("esActivoPermitido", () => {
  it("acepta los nombres que generan las tres funciones", () => {
    expect(esActivoPermitido(nombreActivoWeb("deckcraft", "0.10.0"))).toBe(true);
    expect(esActivoPermitido(nombreActivoCli("figcraft", "0.10.0"))).toBe(true);
    expect(esActivoPermitido(nombreActivoRare("1.12.0.237", "x86_64.dmg"))).toBe(true);
  });

  it("rechaza rutas, espacios, «..» y nombres ajenos", () => {
    for (const nombre of ["../x.zip", "a b.zip", "figcraft/../web.zip", "figcraft-web-0.10.0.tar.gz", "OtraCosa.zip", ""]) {
      expect(esActivoPermitido(nombre)).toBe(false);
    }
  });
});

describe("verificarActivo", () => {
  it("acepta el activo cuando la huella coincide", async () => {
    const resultado = await verificarActivo(NOMBRE, bytesDe("abc"), new Map([[NOMBRE, SHA_ABC]]));
    expect(resultado).toEqual({ ok: true, motivo: "huella correcta" });
  });

  it("rechaza una huella distinta y solo enseña los 8 primeros caracteres", async () => {
    const publicada = "0".repeat(64);
    const resultado = await verificarActivo(NOMBRE, bytesDe("abc"), new Map([[NOMBRE, publicada]]));
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toContain("00000000");
    expect(resultado.motivo).toContain("ba7816bf");
    expect(resultado.motivo).not.toContain(SHA_ABC);
  });

  it("rechaza un activo sin huella publicada", async () => {
    const resultado = await verificarActivo(NOMBRE, bytesDe("abc"), new Map());
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toContain("sin huella publicada");
  });

  it("rechaza un nombre no permitido antes de mirar las sumas", async () => {
    const resultado = await verificarActivo("../x.zip", bytesDe("abc"), new Map());
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toContain("no permitido");
  });

  it("rechaza un activo que supera el tope de 64 MB", async () => {
    const bytes = new Uint8Array(TAMANO_MAXIMO_BYTES + 1);
    const resultado = await verificarActivo(NOMBRE, bytes, new Map([[NOMBRE, SHA_ABC]]));
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toContain("64 MB");
  });
});

describe("fijarVersion", () => {
  it("devuelve el activo web publicado y sin la «v»", () => {
    const sumas = new Map([["deckcraft-web-0.10.0.zip", SHA_ABC]]);
    expect(fijarVersion("deckcraft", "v0.10.0", sumas)).toEqual({
      app: "deckcraft", version: "0.10.0", activo: "deckcraft-web-0.10.0.zip", sha256: SHA_ABC,
    });
  });

  it("devuelve null cuando el activo no está en el SUMS", () => {
    expect(fijarVersion("gridcraft", "0.11.1", new Map())).toBeNull();
  });
});
