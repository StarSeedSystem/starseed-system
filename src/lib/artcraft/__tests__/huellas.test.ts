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

describe("huellas artcraft", () => {
  it("sha256Hex del texto «abc»", async () => {
    const bytes = new TextEncoder().encode("abc");
    const hash = await sha256Hex(bytes);
    expect(hash).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("sha256Hex del vacío", async () => {
    const hash = await sha256Hex(new Uint8Array([]));
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("parsea SUMS con dos formatos de espacio", () => {
    const texto = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  archivo1.zip\n" +
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 *archivo2.zip\n" +
      "# comentario\n\n" +
      "zzzz  malformado.zip\n";
    const sumas = parseSha256Sums(texto);
    expect(sumas.get("archivo1.zip")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sumas.get("archivo2.zip")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sumas.has("malformado.zip")).toBe(false);
  });

  it("nombres válidos e inválidos", () => {
    expect(esActivoPermitido("figcraft-web-0.10.0.zip")).toBe(true);
    expect(esActivoPermitido("gridcraft-cli-0.11.1-macos-universal.zip")).toBe(true);
    expect(esActivoPermitido("Rare-1.12.0.237-arm64.dmg")).toBe(true);
    expect(esActivoPermitido("../x.zip")).toBe(false);
    expect(esActivoPermitido("a b.zip")).toBe(false);
  });

  it("verificación correcta", async () => {
    const bytes = new TextEncoder().encode("abc");
    const sumas = new Map<string, string>();
    sumas.set("figcraft-web-0.10.0.zip", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const res = await verificarActivo("figcraft-web-0.10.0.zip", bytes, sumas);
    expect(res.ok).toBe(true);
    expect(res.motivo).toBe("ok");
  });

  it("huella distinta", async () => {
    const bytes = new TextEncoder().encode("abc");
    const sumas = new Map<string, string>();
    sumas.set("figcraft-web-0.10.0.zip", "0000000000000000000000000000000000000000000000000000000000000000");
    const res = await verificarActivo("figcraft-web-0.10.0.zip", bytes, sumas);
    expect(res.ok).toBe(false);
    expect(res.motivo).toBe("huella distinta ba7816bf");
  });

  it("sin huella", async () => {
    const bytes = new TextEncoder().encode("abc");
    const sumas = new Map<string, string>();
    const res = await verificarActivo("figcraft-web-0.10.0.zip", bytes, sumas);
    expect(res.ok).toBe(false);
    expect(res.motivo).toBe("sin huella publicada");
  });

  it("activo no permitido", async () => {
    const bytes = new TextEncoder().encode("abc");
    const sumas = new Map<string, string>();
    const res = await verificarActivo("../x.zip", bytes, sumas);
    expect(res.ok).toBe(false);
    expect(res.motivo).toBe("activo no permitido");
  });

  it("bytes que superan el tope", async () => {
    const bytes = new Uint8Array(64 * 1024 * 1024 + 1);
    const sumas = new Map<string, string>();
    sumas.set("figcraft-web-0.10.0.zip", "x");
    const res = await verificarActivo("figcraft-web-0.10.0.zip", bytes, sumas);
    expect(res.ok).toBe(false);
    expect(res.motivo).toBe("activo demasiado grande");
  });

  it("nombres de activos correctos", () => {
    expect(nombreActivoWeb("figcraft", "v0.10.0")).toBe("figcraft-web-0.10.0.zip");
    expect(nombreActivoCli("gridcraft", "0.11.1")).toBe("gridcraft-cli-0.11.1-macos-universal.zip");
    expect(nombreActivoRare("1.12.0.237", "arm64.AppImage")).toBe("Rare-1.12.0.237-arm64.AppImage");
  });

  it("fijarVersion devuelve null si no hay huella", () => {
    const res = fijarVersion("figcraft", "v0.10.0", new Map());
    expect(res).toBeNull();
  });

  it("fijarVersion devuelve datos si hay huella", () => {
    const sumas = new Map<string, string>();
    sumas.set("figcraft-web-0.10.0.zip", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const res = fijarVersion("figcraft", "v0.10.0", sumas);
    expect(res?.app).toBe("figcraft");
    expect(res?.version).toBe("0.10.0");
    expect(res?.activo).toBe("figcraft-web-0.10.0.zip");
    expect(res?.sha256).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
