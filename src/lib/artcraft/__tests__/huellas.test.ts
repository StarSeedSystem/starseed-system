import { describe, expect, it } from "vitest";
import {
  esActivoPermitido,
  fijarVersion,
  nombreActivoCli,
  nombreActivoRare,
  nombreActivoWeb,
  parseSha256Sums,
  sha256Hex,
  TOPE_BYTES_ACTIVO,
  verificarActivo,
} from "../huellas";

const HUELLA_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

const SUMAS = [
  "# SHA256SUMS artificial",
  `${HUELLA_ABC}  figcraft-web-0.10.0.zip`,
  "1111111111111111111111111111111111111111111111111111111111111111 *gridcraft-cli-0.11.1-macos-universal.zip",
  "2222222222222222222222222222222222222222222222222222222222222222  Rare-1.2.3.4-arm64.dmg",
  "no-es-hex corta.zip",
  "",
].join("\n");

describe("huellas sha256 de ArtCraft y Rare", () => {
  it("calcula la huella de «abc»", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(HUELLA_ABC);
  });

  it("calcula la huella del vacío", async () => {
    expect(await sha256Hex(new Uint8Array(0))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("parsea SUMS con uno y dos espacios, ignora comentarios, vacías y mal formadas", () => {
    const sumas = parseSha256Sums(SUMAS);
    expect(sumas.size).toBe(3);
    expect(sumas.get("figcraft-web-0.10.0.zip")).toBe(HUELLA_ABC);
    expect(sumas.get("gridcraft-cli-0.11.1-macos-universal.zip")).toBe("1" + "1".repeat(63));
    expect(sumas.has("corta.zip")).toBe(false);
  });

  it("normaliza la huella a minúsculas", () => {
    const sumas = parseSha256Sums("ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789  x.zip");
    expect(sumas.get("x.zip")).toBe("abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789");
  });

  it("construye los nombres de activos web, cli y de Rare", () => {
    expect(nombreActivoWeb("figcraft", "v0.10.0")).toBe("figcraft-web-0.10.0.zip");
    expect(nombreActivoWeb("deckcraft", "1.0.0")).toBe("deckcraft-web-1.0.0.zip");
    expect(nombreActivoCli("gridcraft", "v0.11.1")).toBe("gridcraft-cli-0.11.1-macos-universal.zip");
    expect(nombreActivoRare("v1.2.3.4", "x86_64.AppImage")).toBe("Rare-1.2.3.4-x86_64.AppImage");
  });

  it("acepta solo nombres válidos y rechaza rutas, puntos dobles y espacios", () => {
    expect(esActivoPermitido("figcraft-web-0.10.0.zip")).toBe(true);
    expect(esActivoPermitido("Rare-1.2.3.4-arm64.dmg")).toBe(true);
    expect(esActivoPermitido("../x.zip")).toBe(false);
    expect(esActivoPermitido("a b.zip")).toBe(false);
    expect(esActivoPermitido("Rare-1.2.3.4-arm64.sis")).toBe(false);
    expect(esActivoPermitido("figcraft-web-v1..2.zip")).toBe(false);
  });

  it("verifica un activo con huella Publicada", async () => {
    const sumas = parseSha256Sums(SUMAS);
    const bytes = new TextEncoder().encode("abc");
    expect(await verificarActivo("figcraft-web-0.10.0.zip", bytes, sumas)).toEqual({
      ok: true,
      motivo: `huella verificada: ${HUELLA_ABC.slice(0, 8)}…`,
    });
  });

  it("rechaza una huella distinta y no repite la huella completa en el motivo", async () => {
    const sumas = parseSha256Sums(SUMAS);
    const veredicto = await verificarActivo(
      "figcraft-web-0.10.0.zip",
      new TextEncoder().encode("cualquier otro texto"),
      sumas,
    );
    expect(veredicto.ok).toBe(false);
    expect(veredicto.motivo).toContain(HUELLA_ABC.slice(0, 8));
    expect(veredicto.motivo).not.toContain(HUELLA_ABC);
  });

  it("rechaza activo sin huella publicada y activo no permitido", async () => {
    const sumas = parseSha256Sums(SUMAS);
    expect((await verificarActivo("otra-web-9.9.9.zip", new Uint8Array(1), sumas)).ok).toBe(false);
    const noPermitido = await verificarActivo("../x.zip", new Uint8Array(1), sumas);
    expect(noPermitido.ok).toBe(false);
    expect(noPermitido.motivo).toContain("no permitido");
  });

  it("rechaza bytes que superan el tope de 64 MB", async () => {
    const sumas = parseSha256Sums(SUMAS);
    const gigante = await verificarActivo("figcraft-web-0.10.0.zip", new Uint8Array(TOPE_BYTES_ACTIVO + 1), sumas);
    expect(gigante.ok).toBe(false);
    expect(gigante.motivo).toContain("64 MB");
  });

  it("fija la versión solo si el activo web tiene huella publicada", async () => {
    const sumas = parseSha256Sums(SUMAS);
    expect(await fijarVersion("figcraft", "v0.10.0", sumas)).toEqual({
      app: "figcraft",
      version: "0.10.0",
      activo: "figcraft-web-0.10.0.zip",
      sha256: HUELLA_ABC,
    });
    expect(await fijarVersion("gridcraft", "v9.9.9", sumas)).toBeNull();
  });

  it("fijarVersion devuelve la versión sin el prefijo v en version y activo", async () => {
    const fijada = await fijarVersion("figcraft", "v0.10.0", parseSha256Sums(SUMAS));
    expect(fijada?.version).toBe("0.10.0");
    expect(fijada?.activo).not.toContain("v0.");
    expect(fijada?.activo).toContain("0.10.0");
  });
});
