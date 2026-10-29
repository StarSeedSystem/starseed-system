/**
 * Pruebas de `juegos-pc.ts` (Rare · «Juegos de PC»): solo funciones puras de entrada → salida.
 * Ninguna cadena con forma de clave vive en el repositorio: los valores de las credenciales
 * se montan en tiempo de ejecución con `[…].join("")` y los hallazgos no deben repetirlos.
 */
import { describe, expect, it } from "vitest";
import {
  CONDICIONES_EPIC_DECIDIDAS, esUrlPermitidaRare, planificarJuegoPc, rutaConfigEpic, validarSinCredencialesEpic,
} from "../juegos-pc";
import type { NeuronaJuegos, PersonaJuegos, ServidorJuegos } from "../juegos-pc";

const CON_PANTALLA: NeuronaJuegos = { sistema: "macos", tienePantalla: true, binarioRare: true, gpu: true, memoriaMB: 8192 };
const SIN_PANTALLA: NeuronaJuegos = { sistema: "linux", tienePantalla: false, binarioRare: false, gpu: false, memoriaMB: 8192 };
const B: ServidorJuegos = { id: "casa", propio: true, compartido: false, gpu: true, wineOProton: true, transmision: "selkies", libreDiscoGB: 500 };
const C: ServidorJuegos = { id: "grupo", propio: false, compartido: true, gpu: true, wineOProton: true, transmision: "sunshine", libreDiscoGB: 200 };
const PERSONA: PersonaJuegos = { id: "alex", aceptaCondicionesEpic: true };
const plan = (n: NeuronaJuegos, servidores: ServidorJuegos[], personal: PersonaJuegos = PERSONA) =>
  planificarJuegoPc({ neurona: n, servidores, persona: personal });

describe("planificarJuegoPc · las tres rutas (§5.1)", () => {
  it("ruta A: neurona propia con pantalla y Rare instalado, con el aviso de que el OS no lo abre solo", () => {
    const p = plan(CON_PANTALLA, [C]);
    expect(p.ruta).toBe("neurona-propia");
    expect(p.motivo).toContain("ruta A");
    expect(p.pasos).toContain("abre Rare en tu neurona");
    expect(p.pasos.some((x) => x.startsWith("inicia sesión en Epic tú mismo"))).toBe(true);
    expect(p.avisos.join(" ")).toContain("nunca abre Rare solo");
  });
  it("ruta B: sin pantalla, un servidor propio con GPU, Wine o Proton y transmisión", () => {
    const p = plan(SIN_PANTALLA, [B]);
    expect(p.ruta).toBe("servidor-propio");
    expect(p.motivo).toContain("«casa»");
    expect(p.avisos.join(" ")).toContain("GPL-3.0-or-later");
    expect(p.pasos.some((x) => x.includes("selkies"))).toBe(true);
  });
  it("sin pantalla y sin servidor viable: ninguna, con el motivo de cada servidor", () => {
    const p = plan(SIN_PANTALLA, [{ ...B, transmision: null }, { ...C, compartido: true, propio: false }]);
    expect(p.ruta).toBe("ninguna");
    expect(p.motivo).toContain("sin transmisión");
    expect(p.pasos).toEqual([]);
  });
  it("ruta C bloqueada con la constante en false, aunque hay servidor compartido viable y la persona acepte", () => {
    expect(CONDICIONES_EPIC_DECIDIDAS).toBe(false);
    const p = plan(SIN_PANTALLA, [C]);
    expect(p).toMatchObject({ ruta: "ninguna", motivo: expect.stringContaining("condiciones de Epic"), pasos: [] });
    expect(p.motivo).toContain("Alex");
  });
  it("sin GPU en el servidor: aviso del A1 de Oracle (no sirve para 3D) y ninguna ruta", () => {
    const a1: ServidorJuegos = { ...B, id: "a1", gpu: false };
    const p = plan(SIN_PANTALLA, [a1]);
    expect(p.ruta).toBe("ninguna");
    expect(p.motivo).toContain("sin GPU");
    expect(p.avisos.join(" ")).toContain("A1 de Oracle");
    expect(p.avisos.join(" ")).toContain("no sirve para juegos 3D");
  });
  it("servidor propio sin Wine ni Proton: no vale para la ruta B", () => {
    const p = plan(SIN_PANTALLA, [{ ...B, wineOProton: false }]);
    expect(p.ruta).toBe("ninguna");
    expect(p.motivo).toContain("sin Wine ni Proton");
  });
  it("los juegos pesan decenas de GB: aviso cuando el disco del servidor va corto", () => {
    const p = plan(SIN_PANTALLA, [{ ...B }, { ...C, libreDiscoGB: 12 }]);
    expect(p.avisos.join(" ")).toContain("decenas de GB");
  });
});

describe("rutaConfigEpic · carpeta de Legendary por persona (§5.3)", () => {
  it("devuelve `<datos>/juegos/<persona>/legendary` con modo 0700", () => {
    expect(rutaConfigEpic("<datos>", "alex-b")).toEqual({ ruta: "<datos>/juegos/alex-b/legendary", modo: 0o700 });
  });
  it("persona inválida: lanza, sin aceptar mayúsculas, espacios, barras ni ids largos", () => {
    const malos = ["Alex", "a b", "..", "~/x", "a".repeat(65), ""];
    for (const id of malos) expect(() => rutaConfigEpic("<datos>", id)).toThrow(/1 a 64/);
  });
});

describe("validarSinCredencialesEpic · nada con forma de sesión de Epic se cuela", () => {
  const VALOR = ["Abc123de", "f9Xy8Zq7", "0203"].join("");
  it("texto limpio: ok", () => {
    expect(validarSinCredencialesEpic("hoy se planificó el lanzador y nada más")).toEqual({ ok: true, hallazgos: [] });
  });
  it("access_token y exchange_code con valor largo: detectados y SIN repetir el valor", () => {
    const cuerpo = ["{\"access_token\":\"", VALOR, "\",\"exchange_code\":\"código1234\"}"].join("");
    const r = validarSinCredencialesEpic(cuerpo);
    expect(r.ok).toBe(false);
    expect(r.hallazgos.some((h) => h.includes("access_token"))).toBe(true);
    expect(r.hallazgos.some((h) => h.includes("exchange_code"))).toBe(true);
    expect(JSON.stringify(r)).not.toContain(VALOR.slice(0, 10));
  });
  it("token con prefijo eg1~: detectado sin repetirlo ni en el hallazgo", () => {
    const tok = ["eg1", "~", "TkAb12-9_kk"].join("");
    const r = validarSinCredencialesEpic(`el texto pegado contiene: ${tok} y ya`);
    expect(r.ok).toBe(false);
    expect(r.hallazgos.join(" ")).toContain("eg1");
    expect(JSON.stringify(r)).not.toContain("TkAb12");
  });
  it("valores cortos no disparan alarma; refresh_token y account_id con valor largo sí", () => {
    const corto = validarSinCredencialesEpic('{"access_token":"corto"}');
    expect(corto.ok).toBe(true);
    const id = ["ab", "cd", "ef", "1234", "56"].join("");
    const largo = validarSinCredencialesEpic(["refresh_token: ", VALOR, ` y account_id: ${id}`].join(""));
    expect(largo.ok).toBe(false);
    expect(largo.hallazgos.length).toBe(2);
  });
});

describe("esUrlPermitidaRare · solo GitHub releases; descargas remotas bloqueadas hasta fijar SHA", () => {
  it("las páginas de releases de RareDevs/Rare valen", () => {
    for (const u of ["https://github.com/RareDevs/Rare/releases/tag/1.12.0.237", "https://github.com/RareDevs/Rare/releases/latest", "https://github.com/RareDevs/Rare/releases"])
      expect(esUrlPermitidaRare(u)).toBe(true);
  });
  it("dominios remotos de Rare, ProtonDB y demás: false; también http y URLs de otros repos", () => {
    for (const u of ["https://raredevs.github.io/wring/workarounds.json", "https://protondb.com/", "https://github.com/RareDevs/Otro/releases/1",
      "http://github.com/RareDevs/Rare/releases/1", "https://example.com/RareDevs/Rare.zip", "sin url"])
      expect(esUrlPermitidaRare(u)).toBe(false);
  });
});
