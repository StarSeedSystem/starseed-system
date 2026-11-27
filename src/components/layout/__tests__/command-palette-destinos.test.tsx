// @vitest-environment jsdom
/**
 * SEN1126A · La paleta encuentra Cuenta, las Neuronas, cada pilar de Cerebros
 * y la página de Control remoto, también por sus sinónimos.
 */
import { describe, it, expect } from "vitest";
import { buildDestinations, rankDestinations } from "../command-palette";
import { PILARES } from "@/components/cerebro/pilares";

function caminosPara(consulta: string): string[] {
  return rankDestinations(buildDestinations(), consulta).map((d) => d.path);
}

describe("paleta · destinos de Cuenta, Neuronas, Cerebros y Control remoto", () => {
  it("«Cuenta» encuentra la página de la cuenta", () => {
    expect(caminosPara("Cuenta")).toContain("/cuenta");
    expect(caminosPara("cuenta")).toContain("/cuenta");
  });

  it("Cuenta › Neuronas se encuentra por neurona, aparatos y dispositivos", () => {
    const destino = "/cuenta?section=seguridad";
    for (const consulta of ["Neuronas", "neurona", "aparatos", "dispositivos"]) {
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

  it("Control remoto se encuentra por control, terminal y pantalla", () => {
    for (const consulta of ["control", "terminal", "pantalla"]) {
      expect(caminosPara(consulta), consulta).toContain("/control-remoto");
    }
  });
});
