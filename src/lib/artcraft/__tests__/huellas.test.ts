import { describe, it, expect } from "vitest";
import {
  parseSha256Sums,
  nombreActivoWeb,
  nombreActivoCli,
  nombreActivoRare,
  esActivoPermitido,
  sha256Hex,
  verificarActivo,
  fijarVersion,
} from "../huellas";

const HEX_A = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const HEX_B = "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb";

describe("sha256Hex", () => {
  it("calcula la huella de «abc»", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(HEX_A);
  });

  it("calcula la huella del texto vacío", async () => {
    expect(await sha256Hex(new TextEncoder().encode(""))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("parseSha256Sums", () => {
  const suma = [
    "# SHA256SUMS de la release",
    "",
    `${HEX_A}  figcraft-web-0.10.0.zip`,
    `${HEX_B} *deckcraft-web-0.10.0.zip`,
    "no-es-una-linea",
    "abc123  corta.zip",
  ].join("\n");

  it("parsea los dos formatos de espacio e ignora las líneas inválidas", () => {
    const sumas = parseSha256Sums(suma);
    expect(sumas.get("figcraft-web-0.10.0.zip")).toBe(HEX_A);
    expect(sumas.get("deckcraft-web-0.10.0.zip")).toBe(HEX_B);
    expect(sumas.size).toBe(2);
  });

  it("normaliza la huella a minúsculas y no toca el nombre", () => {
    const sumas = parseSha256Sums(`${HEX_A.toUpperCase()}  FigCraft-Web-0.10.0.zip`);
    expect([...sumas.keys()]).toEqual(["FigCraft-Web-0.10.0.zip"]);
    expect(sumas.get("FigCraft-Web-0.10.0.zip")).toBe(HEX_A);
  });
});

describe("nombres de activos", () => {
  it("quita la «v» de la versión", () => {
    expect(nombreActivoWeb("figcraft", "v0.10.0")).toBe("figcraft-web-0.10.0.zip");
    expect(nombreActivoCli("gridcraft", "0.11.1")).toBe("gridcraft-cli-0.11.1-macos-universal.zip");
    expect(nombreActivoRare("1.16.4.0", "arm64.dmg")).toBe("Rare-1.16.4.0-arm64.dmg");
  });
});

describe("esActivoPermitido", () => {
  it("acepta los nombres del contrato", () => {
    expect(esActivoPermitido("figcraft-web-0.10.0.zip")).toBe(true);
    expect(esActivoPermitido("deckcraft-cli-0.10.0-macos-universal.zip")).toBe(true);
    expect(esActivoPermitido("Rare-1.16.4.0-x86_64.AppImage")).toBe(true);
  });

  it("rechaza rutas, «..» y espacios", () => {
    expect(esActivoPermitido("../x.zip")).toBe(false);
    expect(esActivoPermitido("a b.zip")).toBe(false);
    expect(esActivoPermitido("otro-thing-web-1.0.0.zip")).toBe(false);
    expect(esActivoPermitido("Rare-1.16.4.exe")).toBe(false);
  });
});

describe("verificarActivo", () => {
  const bytesA = new TextEncoder().encode("abc");
  const sumas = new Map([["figcraft-web-0.10.0.zip", HEX_A]]);

  it("verifica un activo correcto", async () => {
    const r = await verificarActivo("figcraft-web-0.10.0.zip", bytesA, sumas);
    expect(r.ok).toBe(true);
    expect(r.motivo).toBe("");
  });

  it("rechaza una huella distinta y no la repite entera en el motivo", async () => {
    const r = await verificarActivo("figcraft-web-0.10.0.zip", new TextEncoder().encode("xyz"), sumas);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("huella distinta");
    expect(r.motivo).not.toContain(HEX_B);
  });

  it("rechaza un nombre sin huella publicada", async () => {
    const r = await verificarActivo("gridcraft-web-0.11.1.zip", bytesA, sumas);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("sin huella publicada");
  });

  it("rechaza un activo no permitido", async () => {
    const r = await verificarActivo("../x.zip", bytesA, new Map([["../x.zip", HEX_A]]));
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("no permitido");
  });

  it("rechaza bytes por encima del tope de 64 MB", async () => {
    const enorme = { length: 64 * 1024 * 1024 + 1 } as Uint8Array;
    const r = await verificarActivo("figcraft-web-0.10.0.zip", enorme, sumas);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("tope de 64 MB");
  });
});

describe("fijarVersion", () => {
  it("fija el activo web con su huella", () => {
    expect(fijarVersion("figcraft", "v0.10.0", new Map([["figcraft-web-0.10.0.zip", HEX_A]]))).toEqual({
      app: "figcraft",
      version: "0.10.0",
      activo: "figcraft-web-0.10.0.zip",
      sha256: HEX_A,
    });
  });

  it("devuelve null si la release no trae el activo web", () => {
    expect(fijarVersion("deckcraft", "v0.10.0", new Map())).toBeNull();
  });
});
