/** Pruebas huellas SHA256 (art §6), módulo puro. */
import { describe, it, expect } from "vitest";
import { 
  parseSha256Sums, 
  nombreActivoWeb, 
  nombreActivoCli, 
  nombreActivoRare, 
  esActivoPermitido, 
  sha256Hex, 
  verificarActivo, 
  fijarVersion 
} from "../huellas";

describe("parseSha256Sums", () => {
  it("parsea un SUMS con un solo espacio", () => {
    const texto = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  abc.zip";
    const mapa = parseSha256Sums(texto);
    expect(mapa.get("abc.zip")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("parsea un SUMS con dos espacios", () => {
    const texto = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  abc.zip";
    const mapa = parseSha256Sums(texto);
    expect(mapa.get("abc.zip")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("ignora líneas vacías y comentarios", () => {
    const texto = "\n# comentario\nba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  abc.zip\n\n";
    const mapa = parseSha256Sums(texto);
    expect(mapa.size).toBe(1);
    expect(mapa.has("abc.zip")).toBe(true);
  });

  it("ignora líneas mal formadas", () => {
    const texto = "basura\nba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  abc.zip";
    const mapa = parseSha256Sums(texto);
    expect(mapa.size).toBe(1);
  });

  it("normaliza la huella a minúsculas y admite uno o dos espacios", () => {
    const mayusculas = "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD";
    const texto = `${mayusculas} abc.zip\n${mayusculas}  def.zip`;
    const mapa = parseSha256Sums(texto);
    expect(mapa.get("abc.zip")).toBe(mayusculas.toLowerCase());
    expect(mapa.get("def.zip")).toBe(mayusculas.toLowerCase());
  });
});

describe("nombreActivoWeb", () => {
  it("versión sin v", () => {
    expect(nombreActivoWeb("figcraft", "0.10.0")).toBe("figcraft-web-0.10.0.zip");
  });

  it("quita v al inicio", () => {
    expect(nombreActivoWeb("figcraft", "v0.10.0")).toBe("figcraft-web-0.10.0.zip");
  });
});

describe("nombreActivoCli", () => {
  it("genera nombre correcto", () => {
    expect(nombreActivoCli("figcraft", "0.10.0")).toBe("figcraft-cli-0.10.0-macos-universal.zip");
  });

  it("quita v al inicio", () => {
    expect(nombreActivoCli("figcraft", "v0.10.0")).toBe("figcraft-cli-0.10.0-macos-universal.zip");
  });
});

describe("nombreActivoRare", () => {
  it("genera nombre con dmg arm64", () => {
    expect(nombreActivoRare("1.12.0.237", "arm64.dmg")).toBe("Rare-1.12.0.237-arm64.dmg");
  });

  it("genera nombre con AppImage x86_64", () => {
    expect(nombreActivoRare("1.12.0.237", "x86_64.AppImage")).toBe("Rare-1.12.0.237-x86_64.AppImage");
  });

  it("genera nombre con dmg x86_64", () => {
    expect(nombreActivoRare("1.12.0.237", "x86_64.dmg")).toBe("Rare-1.12.0.237-x86_64.dmg");
  });
});

describe("esActivoPermitido", () => {
  it("acepta nombre web válido", () => {
    expect(esActivoPermitido("figcraft-web-1.0.0.zip")).toBe(true);
  });

  it("acepta nombre cli válido", () => {
    expect(esActivoPermitido("figcraft-cli-1.0.0-macos-universal.zip")).toBe(true);
  });

  it("acepta nombre rare válido", () => {
    expect(esActivoPermitido("Rare-1.12.0.237-arm64.dmg")).toBe(true);
  });

  it("rechaza ruta con ../", () => {
    expect(esActivoPermitido("../x.zip")).toBe(false);
  });

  it("rechaza nombre con espacio", () => {
    expect(esActivoPermitido("a b.zip")).toBe(false);
  });

  it("rechaza nombre con barra", () => {
    expect(esActivoPermitido("some/path.zip")).toBe(false);
  });

  it("rechaza nombres ajenos y el vacío", () => {
    expect(esActivoPermitido("OtraCosa.zip")).toBe(false);
    expect(esActivoPermitido("")).toBe(false);
  });
});

describe("sha256Hex", () => {
  it("devuelve el hash conocido de 'abc'", async () => {
    const texto = "abc";
    const enc = new TextEncoder();
    const bytes = enc.encode(texto);
    const hash = await sha256Hex(bytes);
    expect(hash).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("devuelve hash del vacío", async () => {
    const bytes = new Uint8Array(0);
    const hash = await sha256Hex(bytes);
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("verificarActivo", () => {
  it("verificación correcta", async () => {
    const bytes = new TextEncoder().encode("abc");
    const sumas = new Map<string, string>([["figcraft-web-1.0.0.zip", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"]]);
    const result = await verificarActivo("figcraft-web-1.0.0.zip", bytes, sumas);
    expect(result.ok).toBe(true);
    expect(result.motivo).toBe("");
  });

  it("huella distinta", async () => {
    const bytes = new TextEncoder().encode("abc");
    const sumas = new Map<string, string>([["figcraft-web-1.0.0.zip", "deadbeef00000000000000000000000000000000"]]);
    const result = await verificarActivo("figcraft-web-1.0.0.zip", bytes, sumas);
    expect(result.ok).toBe(false);
    expect(result.motivo).toMatch(/ba7816bf/);
  });

  it("al fallar la huella solo enseña los 8 primeros caracteres", async () => {
    const bytes = new TextEncoder().encode("abc");
    const completa = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    const sumas = new Map<string, string>([["figcraft-web-1.0.0.zip", "0".repeat(64)]]);
    const result = await verificarActivo("figcraft-web-1.0.0.zip", bytes, sumas);
    expect(result.ok).toBe(false);
    expect(result.motivo).toContain("ba7816bf");
    expect(result.motivo).not.toContain(completa);
  });

  it("sin huella publicada", async () => {
    const bytes = new TextEncoder().encode("abc");
    const sumas = new Map<string, string>([]);
    const result = await verificarActivo("figcraft-web-1.0.0.zip", bytes, sumas);
    expect(result.ok).toBe(false);
    expect(result.motivo).toContain("sin huella publicada");
  });

  it("activo no permitido", async () => {
    const bytes = new TextEncoder().encode("abc");
    const sumas = new Map<string, string>([]);
    const result = await verificarActivo("../x.zip", bytes, sumas);
    expect(result.ok).toBe(false);
    expect(result.motivo).toContain("nombre no permitido");
  });
});

describe("fijarVersion", () => {
  it("devuelve objeto cuando la versión está en sumas", () => {
    const sumas = new Map<string, string>([["figcraft-web-0.10.0.zip", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"]]);
    const result = fijarVersion("figcraft", "0.10.0", sumas);
    expect(result).not.toBeNull();
    expect(result?.app).toBe("figcraft");
    expect(result?.version).toBe("0.10.0");
    expect(result?.activo).toBe("figcraft-web-0.10.0.zip");
    expect(result?.sha256).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("devuelve null cuando la versión no está", () => {
    const sumas = new Map<string, string>([]);
    const result = fijarVersion("figcraft", "1.0.0", sumas);
    expect(result).toBeNull();
  });
});