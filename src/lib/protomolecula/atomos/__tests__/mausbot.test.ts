/**
 * Prueba del átomo «Mausbot» (1027L): un diseño válido sale guardado y uno con SVG
 * peligroso no. Solo funciones puras y un almacén en memoria (sin disco ni red).
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  MAUSBOT,
  construirDisenoMausbot,
  entradaDesdeValores,
  guardarDisenoMausbot,
} from "../mausbot";
import { listarDisenos } from "@/lib/mausbot/disenos";
import { limpiarRegistro, registrarAtomo } from "../../registro-atomos";

class AlmacenMemoria {
  private readonly datos = new Map<string, string>();
  getItem(clave: string): string | null { return this.datos.get(clave) ?? null; }
  setItem(clave: string, valor: string): void { this.datos.set(clave, valor); }
  removeItem(clave: string): void { this.datos.delete(clave); }
}

const SVG_SEGURO = '<svg viewBox="0 0 64 64"><path d="M4 4 L60 60" fill="#00ff88"/></svg>';
const SVG_PELIGROSO =
  '<svg viewBox="0 0 64 64"><script>alert(1)</script><path d="M0 0 L64 64"/></svg>';

describe("átomo Mausbot", () => {
  let almacen: AlmacenMemoria;

  beforeEach(() => {
    almacen = new AlmacenMemoria();
    limpiarRegistro();
  });

  it("se registra y declara cuerpo, degradado y cara", () => {
    expect(registrarAtomo(MAUSBOT)).toEqual({ ok: true });
    const ids = MAUSBOT.parametros.map((p) => p.id);
    expect(ids).toEqual(["cuerpo", "paleta", "ojos", "boca", "mirada", "tamano"]);
    expect(MAUSBOT.parametros[0]?.opciones).toContain("svg");
    expect(MAUSBOT.salidas).toEqual(["diseño de Mausbot"]);
  });

  it("construye un diseño de fábrica con la cara completa y origen de la Protomolécula", () => {
    const diseno = construirDisenoMausbot({ cuerpo: "blob" });
    expect(diseno).toMatchObject({
      cuerpo: "blob",
      origen: "protomolecula",
      tamano: 1,
      cara: { ojos: true, boca: true, mirada: true },
    });
    expect(diseno.id).toBe("pm-mausbot-blob");
    expect(diseno.gradiente).toHaveLength(3);
  });

  it("lee los valores del dictado y acota el tamaño", () => {
    const entrada = entradaDesdeValores({
      cuerpo: "star",
      paleta: "coral",
      ojos: false,
      boca: true,
      mirada: false,
      tamano: 99,
    });
    const diseno = construirDisenoMausbot(entrada);
    expect(diseno.cuerpo).toBe("star");
    expect(diseno.gradiente).toEqual(["#FF6B8A", "#DC143C", "#8A0D26"]);
    expect(diseno.cara).toEqual({ ojos: false, boca: true, mirada: false });
    expect(diseno.tamano).toBe(4);
  });

  it("guarda un diseño válido como propio", () => {
    const r = guardarDisenoMausbot({ id: "pm-prueba", cuerpo: "circle", paleta: "azul" }, almacen);
    expect(r).toEqual({ ok: true });
    const guardado = listarDisenos(almacen).find((d) => d.id === "pm-prueba");
    expect(guardado).toBeDefined();
    expect(guardado?.origen).toBe("protomolecula");
    expect(guardado?.gradiente).toEqual(["#66A3FF", "#007FFF", "#0052B3"]);
  });

  it("guarda un SVG propio ya saneado", () => {
    const r = guardarDisenoMausbot(
      { id: "pm-svg", cuerpo: "svg", svgCuerpo: SVG_SEGURO },
      almacen,
    );
    expect(r).toEqual({ ok: true });
    const guardado = listarDisenos(almacen).find((d) => d.id === "pm-svg");
    expect(guardado?.cuerpo).toBe("svg");
    expect(guardado?.svgCuerpo).toContain("<svg");
    expect(guardado?.svgCuerpo).not.toContain("script");
  });

  it("no guarda un diseño con SVG peligroso", () => {
    const r = guardarDisenoMausbot(
      { id: "pm-peligroso", cuerpo: "svg", svgCuerpo: SVG_PELIGROSO },
      almacen,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo.length).toBeGreaterThan(0);
    expect(listarDisenos(almacen).some((d) => d.id === "pm-peligroso")).toBe(false);
  });
});
