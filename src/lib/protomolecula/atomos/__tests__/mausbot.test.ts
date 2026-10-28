/**
 * Prueba pura del átomo «Mausbot» (MBT1027L): registro del átomo, construcción del diseño
 * desde los parámetros y guardado con `guardarDiseno` (origen «protomolecula»). Sin red,
 * sin disco: el almacenamiento es un doble en memoria.
 */
import { describe, it, expect } from "vitest";
import { MAUSBOT, PALETAS_MAUSBOT, construirDiseno, cuerpoDe, guardarDisenoMausbot, paletaDe } from "../mausbot";
import { limpiarRegistro, obtenerAtomo, registrarAtomo } from "@/lib/protomolecula/registro-atomos";
import { CLAVE_DISENOS, DISENOS_FABRICA, listarDisenos, type AlmacenDisenos } from "@/lib/mausbot/disenos";

const SVG_LIMPIO = '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="20" fill="#007FFF"/></svg>';
const SVG_PELIGROSO = '<svg viewBox="0 0 64 64"><script>alert(1)</script><circle cx="32" cy="32" r="20"/></svg>';
const ENTRADA = {
  valores: { cuerpo: "svg" },
  svgCuerpo: SVG_LIMPIO,
  id: "pm-orbe",
  nombre: "Orbe de la Protomolécula",
  autor: "alex",
};

function almacenFalso(): AlmacenDisenos & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (c) => datos.get(c) ?? null,
    setItem: (c, v) => void datos.set(c, v),
    removeItem: (c) => void datos.delete(c),
  };
}

describe("átomo Mausbot de Astraura", () => {
  it("la definición se registra con su ficha Apache-2.0", () => {
    limpiarRegistro();
    expect(registrarAtomo(MAUSBOT)).toEqual({ ok: true });
    expect(obtenerAtomo("mausbot-astraura")).toBe(MAUSBOT);
    expect(MAUSBOT.categoria).toBe("ia");
    expect(MAUSBOT.ficha?.licencia).toContain("Apache-2.0");
  });

  it("declara cuerpo (10 de fábrica + svg), paleta, cara y tamaño", () => {
    const ids = MAUSBOT.parametros.map((p) => p.id);
    expect(ids).toEqual(["cuerpo", "paleta", "ojos", "boca", "mirada", "tamano"]);
    const cuerpo = MAUSBOT.parametros.find((p) => p.id === "cuerpo");
    expect(cuerpo?.opciones).toHaveLength(11);
    expect(cuerpo?.opciones).toContain("svg");
    expect(MAUSBOT.parametros.find((p) => p.id === "paleta")?.opciones).toEqual(Object.keys(PALETAS_MAUSBOT));
    for (const id of ["ojos", "boca", "mirada"]) {
      expect(MAUSBOT.parametros.find((p) => p.id === id)?.tipo).toBe("booleano");
    }
    const tamano = MAUSBOT.parametros.find((p) => p.id === "tamano");
    expect(tamano?.min).toBe(0.5);
    expect(tamano?.max).toBe(3);
  });

  it("los valores por defecto dan un diseño válido con degradado de tres colores y cara completa", () => {
    const r = construirDiseno({ valores: {} });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.diseno.cuerpo).toBe("cursor");
      expect(r.diseno.gradiente).toEqual(PALETAS_MAUSBOT["verde menta"]);
      expect(r.diseno.cara).toEqual({ ojos: true, boca: true, mirada: true });
      expect(r.diseno.origen).toBe("protomolecula");
      expect(r.diseno.id.startsWith("fabrica-")).toBe(false);
    }
  });

  it("misma entrada, mismo diseño (puro)", () => {
    expect(construirDiseno(ENTRADA)).toEqual(construirDiseno(ENTRADA));
  });

  it("cuerpo y paleta desconocidos caen al defecto, y el tamaño se acota al rango del átomo", () => {
    expect(cuerpoDe("star")).toBe("star");
    expect(cuerpoDe("caja")).toBe("cursor");
    expect(paletaDe("carmesí Anchor")).toEqual(PALETAS_MAUSBOT["carmesí Anchor"]);
    expect(paletaDe("arcoíris")).toEqual(PALETAS_MAUSBOT["verde menta"]);
    const r = construirDiseno({ valores: { cuerpo: "circle", paleta: "ámbar Logic", tamano: 9 } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.diseno.cuerpo).toBe("circle");
      expect(r.diseno.gradiente).toEqual(PALETAS_MAUSBOT["ámbar Logic"]);
      expect(r.diseno.tamano).toBe(3);
    }
  });

  it("un diseño válido con SVG propio se guarda con origen protomolecula y queda saneado", () => {
    const al = almacenFalso();
    const r = guardarDisenoMausbot(ENTRADA, al);
    expect(r.ok).toBe(true);
    const propios = listarDisenos(al).filter((d) => d.origen === "protomolecula");
    expect(propios).toHaveLength(1);
    expect(propios[0].id).toBe("pm-orbe");
    expect(propios[0].svgCuerpo).not.toContain("script");
    expect(al.datos.has(CLAVE_DISENOS)).toBe(true);
  });

  it("un SVG peligroso no se guarda y no deja nada escrito", () => {
    const al = almacenFalso();
    const r = guardarDisenoMausbot({ ...ENTRADA, svgCuerpo: SVG_PELIGROSO }, al);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("script");
    expect(listarDisenos(al)).toHaveLength(DISENOS_FABRICA.length);
    expect(al.datos.has(CLAVE_DISENOS)).toBe(false);
  });

  it("sin SVG el cuerpo svg no guarda nada", () => {
    const al = almacenFalso();
    expect(guardarDisenoMausbot({ ...ENTRADA, svgCuerpo: undefined }, al).ok).toBe(false);
    expect(al.datos.has(CLAVE_DISENOS)).toBe(false);
  });
});
