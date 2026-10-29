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

const binario = (texto: string): Uint8Array => new TextEncoder().encode(texto);
describe("nombreActivo* y esActivoPermitido", () => {
  it("quita la «v» del prefijo de versión en el activo web", () => {
    expect(nombreActivoWeb("figcraft", "v0.10.0")).toBe("figcraft-web-0.10.0.zip");
    expect(nombreActivoWeb("gridcraft", "0.11.1")).toBe("gridcraft-web-0.11.1.zip");
  });
  it("forma el nombre del binario CLI y de Rare", () => {
    expect(nombreActivoCli("deckcraft", "0.10.0")).toBe("deckcraft-cli-0.10.0-macos-universal.zip");
    expect(nombreActivoRare("1.12.0.237", "arm64.AppImage")).toBe("Rare-1.12.0.237-arm64.AppImage");
  });
  it("acepta los nombres de activos de las tres familias", () => {
    expect(esActivoPermitido("figcraft-web-0.10.0.zip")).toBe(true);
    expect(esActivoPermitido("gridcraft-cli-0.11.1-macos-universal.zip")).toBe(true);
    expect(esActivoPermitido("Rare-1.12.0.237-x86_64.dmg")).toBe(true);
  });
  it("rechaza rutas, travesías y espacios", () => {
    expect(esActivoPermitido("../x.zip")).toBe(false);
    expect(esActivoPermitido("a b.zip")).toBe(false);
    expect(esActivoPermitido("Rare-1.12-x/y.zip")).toBe(false);
    expect(esActivoPermitido("desconocido.zip")).toBe(false);
  });
});

describe("parseSha256Sums", () => {
  it("lee huellas con uno y dos espacios, y también en modo binario", () => {
    const texto = [
      "# SHA256SUMS de ejemplo",
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015AD  figcraft-web-0.10.0.zip",
      "E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855 *gridcraft-web-0.11.1.zip",
      "b72b3b13f0e07c1c0a58b0c5c4cd6a209cd171ff5cf985df6d41cbaeb1d023e4 deckcraft-web-0.10.0.zip",
      "",
      "malformada y sin huella completa",
    ].join("\n");
    const sumas = parseSha256Sums(texto);
    expect(sumas.get("figcraft-web-0.10.0.zip")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sumas.get("gridcraft-web-0.11.1.zip")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sumas.get("deckcraft-web-0.10.0.zip")).toBe(
      "b72b3b13f0e07c1c0a58b0c5c4cd6a209cd171ff5cf985df6d41cbaeb1d023e4",
    );
    expect(sumas.size).toBe(3);
  });
});

describe("sha256Hex", () => {
  it("calcula la huella de «abc»", async () => {
    expect(await sha256Hex(binario("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
  it("calcula la huella del contenido vacío", async () => {
    expect(await sha256Hex(new Uint8Array(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
describe("verificarActivo", () => {
  const nombre = "figcraft-web-0.10.0.zip";
  const abc = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

  it("aprueba un activo cuya huella coincide", async () => {
    const bytes = binario("activo real");
    const veredicto = await verificarActivo(nombre, bytes, new Map([[nombre, await sha256Hex(bytes)]]));
    expect(veredicto.ok).toBe(true);
    expect(veredicto.motivo).toContain("huella verificada");
  });
  it("rechaza una huella distinta y nunca imprime la completa", async () => {
    const veredicto = await verificarActivo(nombre, binario("otro contenido"), new Map([[nombre, abc]]));
    expect(veredicto.ok).toBe(false);
    expect(veredicto.motivo).toContain("huella distinta");
    expect(veredicto.motivo).toContain("ba7816bf");
    expect(veredicto.motivo).not.toContain(abc);
  });
  it("rechaza un activo sin huella publicada", async () => {
    const veredicto = await verificarActivo(nombre, binario("algo"), new Map());
    expect(veredicto.ok).toBe(false);
    expect(veredicto.motivo).toContain("sin huella publicada");
  });
  it("rechaza un nombre no permitido", async () => {
    expect((await verificarActivo("../falso.zip", binario("algo"), new Map())).ok).toBe(false);
  });
  it("rechaza bytes que superan el tope de 64 MB", async () => {
    const veredicto = await verificarActivo(nombre, new Uint8Array(64 * 1024 * 1024 + 1), new Map([[nombre, abc]]));
    expect(veredicto.ok).toBe(false);
    expect(veredicto.motivo).toContain("64 MB");
  });
});

describe("fijarVersion", () => {
  it("fija la versión por el activo web del SHA256SUMS", () => {
    const sumas = parseSha256Sums(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015AD  figcraft-web-0.10.0.zip",
    );
    expect(fijarVersion("figcraft", "v0.10.0", sumas)).toEqual({
      app: "figcraft",
      version: "v0.10.0",
      activo: "figcraft-web-0.10.0.zip",
      sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    });
  });
  it("no fija nada si falta la huella del activo web", () => {
    expect(fijarVersion("gridcraft", "0.11.1", new Map())).toBeNull();
    expect(fijarVersion("figcraft", "mal/ruta", new Map())).toBeNull();
  });
});
