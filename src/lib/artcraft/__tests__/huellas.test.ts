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

const encoder = new TextEncoder();
const H_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const H_VACIO = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const WEB = "figcraft-web-0.10.0.zip";
const CLI = "gridcraft-cli-0.11.1-macos-universal.zip";
const RARE = "Rare-1.12.0.237-arm64.dmg";

describe("sha256Hex", () => {
  it("calcula la huella de «abc» y del vacío", async () => {
    expect(await sha256Hex(encoder.encode("abc"))).toBe(H_ABC);
    expect(await sha256Hex(new Uint8Array(0))).toBe(H_VACIO);
  });
});

const SUMAS = parseSha256Sums(
  [
    "# SHA256SUMS de la release",
    `${A.toUpperCase()}  ${WEB}`,
    `${B} *${CLI}`,
    `${C}  ${RARE}`,
    "abcd nombre-corto.zip",
    "xyz  malmal.zip",
    "",
    "   ",
  ].join("\n"),
);

describe("parseSha256Sums", () => {
  it("lee los dos formatos de espacio y normaliza la huella a minúsculas", () => {
    expect(SUMAS.get(WEB)).toBe(A);
    expect(SUMAS.get(CLI)).toBe(B);
    expect(SUMAS.get(RARE)).toBe(C);
  });

  it("ignora vacías, comentarios y huellas mal formadas", () => {
    expect(SUMAS.size).toBe(3);
    expect(SUMAS.has("nombre-corto.zip")).toBe(false);
    expect(SUMAS.has("malmal.zip")).toBe(false);
  });
});

describe("nombres de activos", () => {
  it("cobra los tres formatos: web sin v, cli macos-universal y Rare con formato", () => {
    expect(nombreActivoWeb("figcraft", "v0.10.0")).toBe(WEB);
    expect(nombreActivoCli("gridcraft", "0.11.1")).toBe(CLI);
    expect(nombreActivoRare("1.12.0.237", "x86_64.AppImage")).toBe("Rare-1.12.0.237-x86_64.AppImage");
  });
});

describe("esActivoPermitido", () => {
  it("acepta los nombres de activos de las releases", () => {
    expect(esActivoPermitido(WEB)).toBe(true);
    expect(esActivoPermitido(CLI)).toBe(true);
    expect(esActivoPermitido("deckcraft-web-0.10.0.zip")).toBe(true);
    expect(esActivoPermitido(RARE)).toBe(true);
    expect(esActivoPermitido("Rare-1.12.0.237-x86_64.dmg")).toBe(true);
  });

  it("rechaza rutas, espacios y lo que no es de la release", () => {
    expect(esActivoPermitido("../x.zip")).toBe(false);
    expect(esActivoPermitido("a b.zip")).toBe(false);
    expect(esActivoPermitido("figcraft/id.zip")).toBe(false);
    expect(esActivoPermitido("cualquier-cosa.zip")).toBe(false);
    expect(esActivoPermitido("")).toBe(false);
  });
});

describe("verificarActivo", () => {
  it("confirma un activo con la huella publicada (aunque venga en mayúsculas)", async () => {
    const sumas = new Map([[WEB, H_ABC.toUpperCase()]]);
    const res = await verificarActivo(WEB, encoder.encode("abc"), sumas);
    expect(res.ok).toBe(true);
    expect(res.motivo).toContain(WEB);
  });

  it("rechaza una huella distinta sin repetirla entera en el motivo", async () => {
    const res = await verificarActivo(WEB, encoder.encode("abcd"), new Map([[WEB, H_ABC]]));
    expect(res.ok).toBe(false);
    expect(res.motivo).not.toContain(H_ABC);
    expect(res.motivo).toContain("ba7816bf");
  });

  it("rechaza un activo sin huella publicada y uno no permitido", async () => {
    expect((await verificarActivo(WEB, encoder.encode("abc"), new Map())).ok).toBe(false);
    expect((await verificarActivo("../x.zip", encoder.encode("abc"), new Map([["../x.zip", H_ABC]]))).ok).toBe(false);
  });

  it("rechaza bytes que superan el tope de 64 MB", async () => {
    const res = await verificarActivo(WEB, new Uint8Array(64 * 1024 * 1024 + 1), new Map());
    expect(res.ok).toBe(false);
    expect(res.motivo).toContain("64 MB");
  });
});

describe("fijarVersion", () => {
  it("devuelve el activo web con su huella y la versión sin v", () => {
    const fijada = fijarVersion("figcraft", "v0.10.0", new Map([[WEB, A.toUpperCase()]]));
    expect(fijada).toEqual({ app: "figcraft", version: "0.10.0", activo: WEB, sha256: A });
  });

  it("devuelve null si el SHA256SUMS no trae el activo web", () => {
    expect(fijarVersion("deckcraft", "0.10.0", new Map())).toBeNull();
  });
});
