/**
 * Rescate de pruebas (RTART1025L) de la rama nube a1-20261025-111426 (ART1025L).
 * El módulo `juegos-pc.ts` de esa rama (`planificarJuegoPc`, `rutaConfigEpic`,
 * `validarSinCredencialesEpic`, `esUrlPermitidaRare`) nunca se cableó en main:
 * el contrato vivo de «Juegos de PC» es la ficha `rare` del catálogo de la
 * Protomolécula (architecture/artcraft-y-rare.md §5-§6), con `rare` aún fuera
 * de `BINARIOS_PERMITIDOS`. Solo rescatan aquí los casos que prueban ese
 * contrato vivo, adaptados; los del planificador sin cablear quedan fuera.
 */
import { describe, expect, it } from "vitest";
import { herramientaPorId } from "../../protomolecula/catalogo-herramientas";
import type { HerramientaProto } from "../../protomolecula/catalogo-herramientas";

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
