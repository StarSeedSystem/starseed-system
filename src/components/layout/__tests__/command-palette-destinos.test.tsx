// @vitest-environment jsdom
/**
 * SEN1126A · La paleta encuentra Cuenta, las Neuronas, cada pilar de Cerebros
 * y la página de Control remoto, también por los sinónimos que ya usa.
 *
 * Solo prueba las funciones puras exportadas `buildDestinations` y
 * `rankDestinations`: consulta (entrada) → destinos (salida), sin red ni DOM.
 */
import { describe, it, expect } from "vitest";
import { buildDestinations, rankDestinations } from "../command-palette";
import { PILARES } from "@/components/cerebro/pilares";

function caminosPara(consulta: string): string[] {
  return rankDestinations(buildDestinations(), consulta).map((d) => d.path);
}

describe("paleta · destinos de Cuenta, Neuronas, Cerebros y Control remoto", () => {
  it("«Cuenta» encuentra la página de la cuenta por su nombre y sus sinónimos", () => {
    for (const consulta of ["Cuenta", "cuenta", "account", "perfil", "usuario"]) {
      expect(caminosPara(consulta), consulta).toContain("/cuenta");
    }
  });

  it("Cuenta › Neuronas se encuentra por neurona, aparatos y dispositivos", () => {
    const destino = "/cuenta?section=seguridad";
    for (const consulta of [
      "Neuronas",
      "neurona",
      "aparatos",
      "dispositivos",
      "devices",
      "equipos",
    ]) {
      expect(caminosPara(consulta), consulta).toContain(destino);
    }
  });

  it("cada pilar de Cerebros se encuentra por su nombre y por su tab", () => {
    for (const pilar of PILARES) {
      const destino = `/cerebro?tab=${pilar.id}`;
      expect(caminosPara(pilar.etiqueta), pilar.etiqueta).toContain(destino);
      expect(caminosPara(pilar.id), pilar.id).toContain(destino);
    }
  });

  it("«Cerebros» ofrece los siete pilares con su tab", () => {
    const cerebros = caminosPara("Cerebros");
    for (const pilar of PILARES) {
      expect(cerebros, pilar.id).toContain(`/cerebro?tab=${pilar.id}`);
    }
  });

  it("Control remoto se encuentra por control, terminal y pantalla", () => {
    for (const consulta of [
      "control",
      "terminal",
      "pantalla",
      "remote",
      "screen",
      "monitor",
    ]) {
      expect(caminosPara(consulta), consulta).toContain("/control-remoto");
    }
  });

  it("todos los destinos son caminos navegables y sin duplicados", () => {
    const destinos = buildDestinations();
    const caminos = destinos.map((d) => d.path);
    expect(destinos.length).toBeGreaterThan(0);
    expect(caminos.every((camino) => camino.startsWith("/"))).toBe(true);
    expect(new Set(caminos).size).toBe(caminos.length);
  });
});
