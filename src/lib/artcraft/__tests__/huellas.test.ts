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
} from "../huellas";

describe("huellas ArtCraft y Rare", () => {
  it("sha256Hex del texto «abc»", async () => {
    const enc = new TextEncoder();
    const h = await sha256Hex(enc.encode("abc"));
    expect(h).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("sha256Hex del vacío", async () => {
    const h = await sha256Hex(new Uint8Array([]));
    expect(h).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("parseSha256Sums con dos formatos de espacio", () => {
    const txt = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  figcraft-web-0.5.1.zip\n" +
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 *Rare-1.2.3.4-arm64.dmg\n" +
      "# comentario\n\n" +
      "zzzz  malformada.zip\n";
    const m = parseSha256Sums(txt);
    expect(m.get("figcraft-web-0.5.1.zip")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(m.get("Rare-1.2.3.4-arm64.dmg")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(m.has("malformada.zip")).toBe(false);
  });

  it("nombres activos", () => {
    expect(nombreActivoWeb("figcraft", "0.5.1")).toBe("figcraft-web-0.5.1.zip");
    expect(nombreActivoWeb("gridcraft", "v1.0.0")).toBe("gridcraft-web-1.0.0.zip");
    expect(nombreActivoCli("deckcraft", "0.9.0")).toBe("deckcraft-cli-0.9.0-macos-universal.zip");
    expect(nombreActivoRare("1.2.3.4", "arm64.dmg")).toBe("Rare-1.2.3.4-arm64.dmg");
    expect(nombreActivoRare("v2.0.0.0", "x86_64.AppImage")).toBe("Rare-2.0.0.0-x86_64.AppImage");
  });

  it("nombres válidos e inválidos", () => {
    expect(esActivoPermitido("figcraft-web-0.5.1.zip")).toBe(true);
    expect(esActivoPermitido("gridcraft-cli-1.0.0-macos-universal.zip")).toBe(true);
    expect(esActivoPermitido("deckcraft-web-0.9.0.zip")).toBe(true);
    expect(esActivoPermitido("Rare-1.2.3.4-arm64.dmg")).toBe(true);
    expect(esActivoPermitido("Rare-9.0.0.0-x86_64.AppImage")).toBe(true);
    expect(esActivoPermitido("../x.zip")).toBe(false);
    expect(esActivoPermitido("a b.zip")).toBe(false);
    expect(esActivoPermitido("figcraft-cli-0.5.1.zip")).toBe(false);
    expect(esActivoPermitido("/etc/passwd")).toBe(false);
  });

  it("verificación correcta", async () => {
    const enc = new TextEncoder();
    const bytes = enc.encode("abc");
    const sumas = new Map<string, string>();
    sumas.set("figcraft-web-0.5.1.zip", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const res = await verificarActivo("figcraft-web-0.5.1.zip", bytes, sumas);
    expect(res.ok).toBe(true);
  });

  it("huella distinta", async () => {
    const enc = new TextEncoder();
    const bytes = enc.encode("abc");
    const sumas = new Map<string, string>();
    sumas.set("figcraft-web-0.5.1.zip", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const res = await verificarActivo("figcraft-web-0.5.1.zip", bytes, sumas);
    expect(res.ok).toBe(false);
    expect(res.motivo).toContain("huella distinta");
    expect(res.motivo.length).toBeLessThan(80);
  });

  it("sin huella", async () => {
    const enc = new TextEncoder();
    const bytes = enc.encode("abc");
    const sumas = new Map<string, string>();
    const res = await verificarActivo("figcraft-web-0.5.1.zip", bytes, sumas);
    expect(res.ok).toBe(false);
    expect(res.motivo).toBe("sin huella publicada");
  });

  it("activo no permitido", async () => {
    const enc = new TextEncoder();
    const bytes = enc.encode("abc");
    const sumas = new Map<string, string>();
    sumas.set("../x.zip", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const res = await verificarActivo("../x.zip", bytes, sumas);
    expect(res.ok).toBe(false);
    expect(res.motivo).toBe("activo no permitido");
  });

  it("bytes que superan el tope", async () => {
    const bytes = new Uint8Array(64 * 1024 * 1024 + 1);
    const sumas = new Map<string, string>();
    sumas.set("figcraft-web-0.5.1.zip", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    const res = await verificarActivo("figcraft-web-0.5.1.zip", bytes, sumas);
    expect(res.ok).toBe(false);
    expect(res.motivo).toBe("tamaño excesivo");
  });

  it("fijarVersion para el activo web", () => {
    const sumas = new Map<string, string>();
    sumas.set("figcraft-web-0.5.1.zip", "ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890");
    const res = fijarVersion("figcraft", "0.5.1", sumas);
    expect(res?.app).toBe("figcraft");
    expect(res?.activo).toBe("figcraft-web-0.5.1.zip");
    expect(res?.sha256).toBe("abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");
    expect(fijarVersion("figcraft", "0.5.2", new Map())).toBeNull();
  });
});
