// src/lib/artcraft/__tests__/huellas.test.ts
// Pruebas del módulo PURO de huellas SHA256 (artcraft-y-rare.md §6): sin red,
// sin disco ni procesos; los digests salen de webcrypto del medio (Node ≥ 20).
import { describe, expect, it } from "vitest";
import {
  MAX_ACTIVO_BYTES, esActivoPermitido, fijarVersion, nombreActivoCli, nombreActivoRare,
  nombreActivoWeb, parseSha256Sums, sha256Hex, verificarActivo,
} from "@/lib/artcraft/huellas";

const ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const VACIO = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const HELLO = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
const CODIFICAR = (texto: string): Uint8Array => new TextEncoder().encode(texto);

// SUMS de ejemplo: dos formatos de espacio («  » texto y « *» binario). Las
// líneas mal formadas se ejercitan aparte.
const TEXTO_SUMS = [
  "# figcraft v0.10.0 · SHA256SUMS de la release",
  `${ABC}  figcraft-web-0.10.0.zip`,
  `${HELLO.toUpperCase()} *Rare-1.12.0.237-arm64.dmg`,
  `${VACIO} *deckcraft-cli-0.10.0-macos-universal.zip`,
].join("\n");

describe("parseSha256Sums", () => {
  it("lee los dos formatos de espacio y deja el nombre tal cual", () => {
    const sumas = parseSha256Sums(TEXTO_SUMS);
    expect(sumas.get("figcraft-web-0.10.0.zip")).toBe(ABC);
    expect(sumas.get("Rare-1.12.0.237-arm64.dmg")).toBe(HELLO);
    expect(sumas.get("deckcraft-cli-0.10.0-macos-universal.zip")).toBe(VACIO);
    expect(sumas.size).toBe(3);
  });

  it("ignora líneas vacías, comentarios y huellas mal formadas", () => {
    const muestra = ["# comentario", "", "   ", `${ABC.slice(0, 63)}  cortada.zip`, "1234  sin-hex.zip", `${ABC}  figura.zip`].join("\n");
    expect([...parseSha256Sums(muestra).keys()]).toEqual(["figura.zip"]);
  });

  it("normaliza la huella a minúsculas, no el nombre", () => {
    const sumas = parseSha256Sums(`${"2".repeat(64)}  Rare-1.12.0.237-x86_64.dmg\n`);
    expect(sumas.get("Rare-1.12.0.237-x86_64.dmg")).toBe("2".repeat(64));
  });
});

describe("nombres de activos", () => {
  it("web, CLI y Rare siguen el formato exacto de las releases", () => {
    expect(nombreActivoWeb("figcraft", "v0.10.0")).toBe("figcraft-web-0.10.0.zip");
    expect(nombreActivoWeb("gridcraft", "0.11.1")).toBe("gridcraft-web-0.11.1.zip");
    expect(nombreActivoCli("deckcraft", "v0.10.0")).toBe("deckcraft-cli-0.10.0-macos-universal.zip");
    expect(nombreActivoRare("1.12.0.237", "x86_64.AppImage")).toBe("Rare-1.12.0.237-x86_64.AppImage");
    expect(nombreActivoRare("1.12.0.237", "arm64.dmg")).toBe("Rare-1.12.0.237-arm64.dmg");
  });
});

describe("esActivoPermitido", () => {
  it("acepta los activos web, CLI y de Rare", () => {
    expect(esActivoPermitido("figcraft-web-0.10.0.zip")).toBe(true);
    expect(esActivoPermitido("gridcraft-cli-0.11.1-macos-universal.zip")).toBe(true);
    expect(esActivoPermitido("Rare-1.12.0.237-x86_64.AppImage")).toBe(true);
  });

  it("rechaza rutas, puntos dobles, espacios y desconocidos", () => {
    const malos = ["../x.zip", "carpeta/figcraft-web-0.10.0.zip", "a b.zip", "figcraft-web-0..10.0.zip", "instalador-1.2.3.msi", "figcraft-web-.zip", ""];
    for (const nombre of malos) expect(esActivoPermitido(nombre)).toBe(false);
  });
});

describe("sha256Hex", () => {
  it("calcula la huella de «abc» y del texto vacío", async () => {
    expect(await sha256Hex(CODIFICAR("abc"))).toBe(ABC);
    expect(await sha256Hex(CODIFICAR(""))).toBe(VACIO);
  });
});

describe("verificarActivo", () => {
  it("aprueba un activo con la huella calculada exactamente la publicada", async () => {
    const sumas = parseSha256Sums(`${ABC}  figcraft-web-0.10.0.zip`);
    const r = await verificarActivo("figcraft-web-0.10.0.zip", CODIFICAR("abc"), sumas);
    expect(r.ok).toBe(true);
    expect(r.motivo).toContain(`${ABC.slice(0, 8)}…`);
  });

  it("rechaza huella distinta, sin repetir nunca la huella completa en el motivo", async () => {
    const sumas = parseSha256Sums(`${HELLO}  figcraft-web-0.10.0.zip`);
    const r = await verificarActivo("figcraft-web-0.10.0.zip", CODIFICAR("abc"), sumas);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain(ABC.slice(0, 8));
    expect(r.motivo).not.toContain(ABC.slice(8));
    expect(r.motivo).not.toContain(ABC);
  });

  it("rechaza un nombre fuera de la lista y un activo sin huella publicada", async () => {
    const sumas = parseSha256Sums(`${ABC}  figcraft-web-0.10.0.zip`);
    const prohibido = await verificarActivo("../figcraft-web-0.10.0.zip", CODIFICAR("abc"), sumas);
    expect(prohibido.ok).toBe(false);
    expect(prohibido.motivo).toContain("no permitido");
    const sinHuella = await verificarActivo("gridcraft-web-0.11.1.zip", CODIFICAR("abc"), sumas);
    expect(sinHuella.ok).toBe(false);
    expect(sinHuella.motivo).toContain("sin huella publicada");
  });

  it("rechaza los bytes que superan el tope de 64 MB antes de calcular nada", async () => {
    const sumas = parseSha256Sums(`${ABC}  figcraft-web-0.10.0.zip`);
    const r = await verificarActivo("figcraft-web-0.10.0.zip", new Uint8Array(MAX_ACTIVO_BYTES + 1), sumas);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("tope");
  });
});

describe("fijarVersion", () => {
  it("fija la versión cuando la huella del zip web está publicada", () => {
    expect(fijarVersion("figcraft", "v0.10.0", parseSha256Sums(TEXTO_SUMS))).toEqual({
      app: "figcraft", version: "0.10.0", activo: "figcraft-web-0.10.0.zip", sha256: ABC,
    });
  });

  it("sin huella publicada devuelve null: la versión nueva no se fija sola", () => {
    expect(fijarVersion("gridcraft", "v0.11.1", parseSha256Sums(TEXTO_SUMS))).toBeNull();
    expect(fijarVersion("deckcraft", "v0.10.0", new Map())).toBeNull();
  });
});
