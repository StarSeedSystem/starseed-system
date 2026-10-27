import { describe, it, expect } from "vitest";
import {
  TAMANO_MAXIMO_ACTIVO,
  esActivoPermitido,
  fijarVersion,
  nombreActivoCli,
  nombreActivoRare,
  nombreActivoWeb,
  parseSha256Sums,
  sha256Hex,
  verificarActivo,
} from "../huellas";

const ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const VACIO = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const OTRA = "0".repeat(64);
const WEB = "figcraft-web-0.10.0.zip";
const RARE = "Rare-1.12.0.237-arm64.dmg";
const texto = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const enorme = { byteLength: TAMANO_MAXIMO_ACTIVO + 1 } as unknown as Uint8Array;

describe("sha256Hex", () => {
  it("calcula «abc»", async () => expect(await sha256Hex(texto("abc"))).toBe(ABC));
  it("calcula la entrada vacía", async () => expect(await sha256Hex(new Uint8Array())).toBe(VACIO));
});

describe("parseSha256Sums", () => {
  it("lee los dos formatos de espacio y normaliza la huella", () => {
    const sumas = parseSha256Sums([
      "# release", "",
      `${ABC.toUpperCase()}  ${WEB}`,
      `${VACIO} *${RARE}`,
    ].join("\n"));
    expect(sumas.size).toBe(2);
    expect(sumas.get(WEB)).toBe(ABC);
    expect(sumas.get(RARE)).toBe(VACIO);
  });
  it("ignora comentarios, vacías y huellas mal formadas", () => {
    const sumas = parseSha256Sums([
      "# comentario", "   ",
      `${ABC.slice(0, 63)}  truncada.zip`,
      `${"g".repeat(64)}  no-es-hex.zip`,
      "sin-huella  nombre.zip",
      `${VACIO} ${WEB}`,
    ].join("\n"));
    expect(sumas.size).toBe(1);
    expect(sumas.get(WEB)).toBe(VACIO);
  });
});

describe("nombres de activos", () => {
  it("compone web, CLI y Rare sin la «v»", () => {
    expect(nombreActivoWeb("figcraft", "v0.10.0")).toBe(WEB);
    expect(nombreActivoCli("deckcraft", "v0.10.0")).toBe(
      "deckcraft-cli-0.10.0-macos-universal.zip",
    );
    expect(nombreActivoRare("v1.12.0.237", "arm64.dmg")).toBe(RARE);
  });
});

describe("esActivoPermitido", () => {
  it("acepta los nombres conocidos", () => {
    const validos = [WEB, "gridcraft-cli-0.11.1-macos-universal.zip", RARE, "Rare-1.12.0.237-x86_64.AppImage"];
    for (const n of validos) expect(esActivoPermitido(n)).toBe(true);
  });
  it("rechaza rutas, espacios y nombres ajenos", () => {
    const invalidos = ["", "../x.zip", "a b.zip", "/figcraft-web-0.10.0.zip", `${WEB}/../x.zip`, "figcraft-web-0.10.0.exe", "otra-web-0.10.0.zip", "figcraft-web-0.10...zip", `${RARE} `];
    for (const n of invalidos) expect(esActivoPermitido(n)).toBe(false);
  });
});

describe("verificarActivo", () => {
  it("acepta una huella correcta", async () => {
    expect(await verificarActivo(WEB, texto("abc"), new Map([[WEB, ABC]]))).toEqual({ ok: true, motivo: "Huella verificada." });
  });
  it("rechaza una huella distinta sin repetirla entera", async () => {
    const r = await verificarActivo(WEB, texto("abc"), new Map([[WEB, OTRA]]));
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain(OTRA.slice(0, 8));
    expect(r.motivo).toContain(ABC.slice(0, 8));
    expect(r.motivo).not.toContain(OTRA);
  });
  it("rechaza un activo sin huella publicada", async () => {
    expect((await verificarActivo(WEB, texto("abc"), new Map())).ok).toBe(false);
  });
  it("rechaza un nombre no permitido", async () => {
    expect((await verificarActivo("../x.zip", texto("abc"), new Map([["../x.zip", ABC]]))).ok).toBe(false);
  });
  it("rechaza un activo que supera los 64 MB", async () => {
    const r = await verificarActivo(WEB, enorme, new Map([[WEB, ABC]]));
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("tope");
  });
});

describe("fijarVersion", () => {
  it("fija el activo web con su huella", () => {
    expect(fijarVersion("figcraft", "v0.10.0", new Map([[WEB, ABC]]))).toEqual({
      app: "figcraft", version: "0.10.0", activo: WEB, sha256: ABC,
    });
  });
  it("devuelve null si no hay huella publicada", () => {
    expect(fijarVersion("figcraft", "0.10.0", new Map())).toBeNull();
  });
});
