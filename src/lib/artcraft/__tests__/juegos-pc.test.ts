/**
 * RTART1025L: contrato vivo de «Juegos de PC» (architecture/artcraft-y-rare.md §5-§6).
 * Ficha `rare` de la Protomolécula (rescatada de la rama nube a1-20261025-111426)
 * y planificador puro `juegos-pc.ts`, integrado en main (sha a7e92be). Epic es SIEMPRE de la persona.
 */
import { describe, expect, it } from "vitest";
import { herramientaPorId } from "../../protomolecula/catalogo-herramientas";
import type { HerramientaProto } from "../../protomolecula/catalogo-herramientas";
import { CONDICIONES_EPIC_DECIDIDAS, esUrlPermitidaRare, planificarJuegoPc, rutaConfigEpic, validarSinCredencialesEpic, type NeuronaInfo } from "../juegos-pc";
function rare(): HerramientaProto {
  const ficha = herramientaPorId("rare");
  expect(ficha, "Rare debe estar en el catálogo de la Protomolécula").toBeDefined();
  return ficha as HerramientaProto;
}
describe("Rare: «Juegos de PC», lanzamiento confirmado y credenciales de Epic", () => {
  it("ruta A: programa aparte solo por cli, llamado por la persona y sin canal de control", () => {
    const ficha = rare();
    expect(ficha.control.via).toEqual(["cli"]);
    expect(ficha.control.notas).toContain("rare launch");
    expect(ficha.control.notas).toContain("rare login");
    expect(ficha.control.notas).toContain("--offline");
    expect(ficha.control.notas).toMatch(/no tiene servidor MCP ni canal de control/);
    expect(ficha.motivo).toMatch(/SOLO como programa aparte/);
    expect(ficha.motivo).toMatch(/nunca enlazado ni en un Worker/);
    expect(ficha.motivo).toMatch(/una neurona con pantalla/);
  });
  it("una Mac sin pantalla: ningún modo disponible (la Qt de Rare no va sin pantalla)", () => {
    expect(rare().control.notas).toContain("no tiene modo sin pantalla");
  });
  it("cuenta de Epic por persona: LEGENDARY_CONFIG_PATH con permisos 0700, fuera de repo, memoria y sala", () => {
    const notas = rare().control.notas;
    expect(notas).toContain("LEGENDARY_CONFIG_PATH");
    expect(notas).toContain("0700");
    expect(notas).toMatch(/por persona/);
    expect(notas).toMatch(/nunca la lleva a un repositorio, una memoria ni una sala/);
  });
  it("la ficha publicada no lleva campos de la sesión de Epic ni claves reales", () => {
    const texto = JSON.stringify(rare());
    for (const campo of ["access_token", "refresh_token", "account_id", "exchange_code"]) {
      expect(texto).not.toContain(campo);
    }
  });
  it("nombra las descargas remotas sin huella que bloquea y solo permite el repo oficial de RareDevs", () => {
    const ficha = rare();
    const avisos = (ficha.avisos ?? []).join(" ");
    expect(avisos).toContain("raredevs.github.io/wring");
    expect(avisos).toContain("ProtonDB");
    expect(avisos).toMatch(/bloquea o se aloja con SHA fijado/);
    expect(ficha.codigo).toBe("https://github.com/RareDevs/Rare");
  });
  it("sin condiciones de Epic decididas por Alex, las rutas de servidores siguen sin cablear", () => {
    const ficha = rare();
    expect(ficha.motivo).toMatch(/sin cablear/);
    const avisos = (ficha.avisos ?? []).join(" ");
    expect(avisos).toContain("una cuenta por persona");
    expect(avisos).toMatch(/las decide Alex/);
    expect(avisos).toContain("servidores compartidos");
  });
});
const entrada = (n: Partial<NeuronaInfo["neurona"]>, servidores: NeuronaInfo["servidores"], acepta = true): NeuronaInfo => ({
  neurona: { sistema: "macos", tienePantalla: true, binarioRare: true, gpu: false, memoriaMB: 8192, ...n },
  servidores, persona: { id: "alex", aceptaCondicionesEpic: acepta },
});
describe("planificarJuegoPc", () => {
  it("ruta A: neurona con pantalla y Rare instalado, aunque haya servidores compartidos", () => {
    const p = planificarJuegoPc(entrada({}, [{ id: "a1", propio: false, compartido: true, gpu: true, wineOProton: true, transmision: "selkies", libreDiscoGB: 40 }]));
    expect(p.ruta).toBe("neurona-propia");
    expect(p.pasos).toEqual(["abre Rare", "inicia sesión en Epic tú mismo"]);
  });
  it("ruta B: sin pantalla ni Rare, servidor propio con GPU y compatibilidad", () => {
    const p = planificarJuegoPc(entrada({ tienePantalla: false, binarioRare: false }, [
      { id: "a1", propio: true, compartido: false, gpu: false, wineOProton: true, transmision: null, libreDiscoGB: 40 },
      { id: "cpu", propio: true, compartido: false, gpu: true, wineOProton: true, transmision: "sunshine", libreDiscoGB: 40 },
    ]));
    expect(p.ruta).toBe("servidor-propio");
  });
  it("sin condiciones de Epic decididas, la ruta C no se ofrece aunque la persona acepte", () => {
    expect(CONDICIONES_EPIC_DECIDIDAS).toBe(false);
    const p = planificarJuegoPc(entrada({ tienePantalla: false, binarioRare: false }, [
      { id: "a1", propio: false, compartido: true, gpu: true, wineOProton: true, transmision: "selkies", libreDiscoGB: 40 },
    ]));
    expect(p.ruta).toBe("ninguna");
    expect(p.pasos).toEqual([]);
    expect(p.avisos).toContain("no hay ruta disponible en las condiciones actuales");
  });
});
describe("rutaConfigEpic", () => {
  it("carpeta 0700 por persona bajo <datos>/juegos, y personaId estricto", () => {
    expect(rutaConfigEpic("/datos", "alex-01")).toEqual({ ruta: "/datos/juegos/alex-01/legendary", modo: 0o700 });
    for (const malo of ["Alex", "a b", "a/b", "", "-".repeat(65)])
      expect(() => rutaConfigEpic("/datos", malo)).toThrow();
  });
});
describe("validarSinCredencialesEpic", () => {
  it("un texto con campos de sesión o tokens eg1~ no pasa, y uno limpio sí", () => {
    expect(validarSinCredencialesEpic("sesión iniciada por la persona")).toEqual({ ok: true, hallazgos: [] });
    const r = validarSinCredencialesEpic('user.json: "access_token": "eg1~AbC-1_2" y exchange_code');
    expect(r.ok).toBe(false);
    expect(r.hallazgos).toContain("access_token");
    expect(r.hallazgos).toContain("exchange_code");
    expect(r.hallazgos.some((h) => h.startsWith("eg1~"))).toBe(true);
  });
});
describe("esUrlPermitidaRare", () => {
  it("solo releases del repo oficial de RareDevs", () => {
    expect(esUrlPermitidaRare("https://github.com/RareDevs/Rare/releases/download/1.12.0.237/Rare.dmg")).toBe(true);
    for (const url of ["https://raredevs.github.io/wring/workarounds.json", "https://protondb.com/", "https://github.com/Otro/otro/releases/download/1.0/x", "https://github.com/RareDevs/Rare/releases"])
      expect(esUrlPermitidaRare(url)).toBe(false);
  });
});
