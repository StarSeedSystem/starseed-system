/**
 * ARTCRAFT · huellas — pruebas puras (ART1025M). Ni red, ni disco, ni claves: los bytes
 * de los ejemplos se inventan aquí y los textos son los del propio contrato §6.
 */
import { describe, expect, it } from "vitest";
import {
  esActivoPermitido,
  fijarVersion,
  nombreActivoCli,
  nombreActivoRare,
  nombreActivoWeb,
  parseSha256Sums,
  sha256Hex,
  verificarActivo,
  TOPE_ACTIVO_BYTES,
} from "../huellas";

const enBytes = (texto: string): Uint8Array => new TextEncoder().encode(texto);

/** SUMS de ejemplo, con las dos formas de espacio, una en mayúsculas y basura que debe caer. */
const SUMAS = parseSha256Sums(
  [
    "# SHA256SUMS de la release de FigCraft",
    "",
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  figcraft-web-0.10.0.zip",
    "E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 *gridcraft-web-0.11.1.zip",
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  deckcraft-cli-0.10.0-macos-universal.zip",
    "malformado figcraft-web-0.10.0.zip",
  ].join("\n"),
);

describe("nombres de activos", () => {
  it("el zip web quita la v de la etiqueta", () => {
    expect(nombreActivoWeb("figcraft", "v0.10.0")).toBe("figcraft-web-0.10.0.zip");
  });

  it("la CLI macOS universal lleva su sufijo", () => {
    expect(nombreActivoCli("gridcraft", "0.11.1")).toBe(
      "gridcraft-cli-0.11.1-macos-universal.zip",
    );
  });

  it("Rare lleva su versión y su formato", () => {
    expect(nombreActivoRare("1.12.0.237", "arm64.dmg")).toBe("Rare-1.12.0.237-arm64.dmg");
    expect(nombreActivoRare("v1.12.0.237", "x86_64.AppImage")).toBe(
      "Rare-1.12.0.237-x86_64.AppImage",
    );
  });
});

describe("esActivoPermitido", () => {
  it("acepta los nombres que este módulo produce", () => {
    expect(esActivoPermitido("figcraft-web-0.10.0.zip")).toBe(true);
    expect(esActivoPermitido("deckcraft-cli-0.10.0-macos-universal.zip")).toBe(true);
    expect(esActivoPermitido("Rare-1.12.0.237-x86_64.AppImage")).toBe(true);
  });

  it("rechaza travesías de ruta, espacios y extensiones ajenas", () => {
    expect(esActivoPermitido("../x.zip")).toBe(false);
    expect(esActivoPermitido("a b.zip")).toBe(false);
    expect(esActivoPermitido("figcraft-web-0.10.0.zip.exe")).toBe(false);
  });
});

describe("parseSha256Sums", () => {
  it("lee las dos formas de espacio y normaliza la huella a minúsculas", () => {
    expect(SUMAS.get("figcraft-web-0.10.0.zip")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(SUMAS.get("gridcraft-web-0.11.1.zip")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("ignora comentarios, líneas vacías, basura y deja el nombre como venga", () => {
    expect(SUMAS.size).toBe(3);
    expect(parseSha256Sums("").size).toBe(0);
    const deEjemplo = parseSha256Sums("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad *Mi-Activo.zip");
    expect(deEjemplo.get("Mi-Activo.zip")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("sha256Hex", () => {
  it("calcula «abc» con el digesto de referencia", async () => {
    expect(await sha256Hex(enBytes("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("calcula el vacío con el digesto de referencia", async () => {
    expect(await sha256Hex(enBytes(""))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("verificarActivo", () => {
  it("acepta un activo con la huella publicada", async () => {
    const veredicto = await verificarActivo("figcraft-web-0.10.0.zip", enBytes("abc"), SUMAS);
    expect(veredicto.ok).toBe(true);
    expect(veredicto.motivo).toBe("");
  });

  it("acepta la huella del vacío publicada en mayúsculas y con asterisco", async () => {
    expect((await verificarActivo("gridcraft-web-0.11.1.zip", enBytes(""), SUMAS)).ok).toBe(true);
  });

  it("rechaza una huella distinta y mide solo 8 caracteres en el motivo", async () => {
    const calculada = await sha256Hex(enBytes("def"));
    const veredicto = await verificarActivo("figcraft-web-0.10.0.zip", enBytes("def"), SUMAS);
    expect(veredicto.ok).toBe(false);
    expect(veredicto.motivo).toContain(calculada.slice(0, 8));
    expect(veredicto.motivo).not.toContain(calculada);
  });

  it("rechaza lo que no tiene huella publicada", async () => {
    const veredicto = await verificarActivo("deckcraft-web-0.10.0.zip", enBytes("abc"), SUMAS);
    expect(veredicto.ok).toBe(false);
    expect(veredicto.motivo).toContain("sin huella publicada");
  });

  it("rechaza un nombre no permitido aunque el SUMS lo traiga", async () => {
    const sumas = parseSha256Sums(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  ../x.zip",
    );
    const veredicto = await verificarActivo("../x.zip", enBytes("abc"), sumas);
    expect(veredicto.ok).toBe(false);
    expect(veredicto.motivo).toContain("nombre no permitido");
  });

  it("rechaza los bytes que superan el tope de 64 MB sin calcular nada", async () => {
    const veredicto = await verificarActivo(
      "figcraft-web-0.10.0.zip",
      new Uint8Array(TOPE_ACTIVO_BYTES + 1),
      SUMAS,
    );
    expect(veredicto.ok).toBe(false);
    expect(veredicto.motivo).toContain("tope de 64 MB");
  });
});

describe("fijarVersion", () => {
  it("devuelve la versión fijada del zip web", () => {
    expect(fijarVersion("figcraft", "v0.10.0", SUMAS)).toEqual({
      app: "figcraft",
      version: "0.10.0",
      activo: "figcraft-web-0.10.0.zip",
      sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    });
  });

  it("devuelve null sin huella publicada", () => {
    expect(fijarVersion("deckcraft", "v0.10.0", SUMAS)).toBe(null);
  });
});
