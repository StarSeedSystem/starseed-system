import { describe, it, expect } from "vitest";
import { limpiarRegistro, registrarAtomo } from "../../registro-atomos";
import { MAUSBOT, construirDiseno, guardarDisenoMausbot, gradienteDeId, PALETAS_GRADIENTE, type ControlesMausbot } from "../mausbot";
import { CLAVE_DISENOS, type AlmacenDisenos } from "@/lib/mausbot/disenos";
import { IDS_CUERPO_MAUSBOT } from "@/lib/mausbot/cuerpos";

const VALIDO: ControlesMausbot = {
  nombre: "Cursor púrpura",
  cuerpo: "cursor",
  gradiente: "carmesí Anchor",
  cara: { ojos: true, boca: false, mirada: true },
  tamano: 1.5,
};

function almacenPrueba(): AlmacenDisenos & { escrituras: string[] } {
  const escrituras: string[] = [];
  return {
    escrituras,
    getItem: () => null,
    setItem: (_c, v) => { escrituras.push(v); },
    removeItem: () => {},
  };
}

describe("átomo mausbot de la Protomolécula", () => {
  it("la definición registra correctamente", () => {
    limpiarRegistro();
    expect(registrarAtomo(MAUSBOT)).toEqual({ ok: true });
  });

  it("declara los diez cuerpos y svg como opciones", () => {
    const cuerpo = MAUSBOT.parametros.find((p) => p.id === "cuerpo");
    expect(cuerpo?.opciones).toEqual([...IDS_CUERPO_MAUSBOT, "svg"]);
  });

  it("cada paleta devuelta por gradienteDeId es una terna hex", () => {
    for (const p of PALETAS_GRADIENTE) {
      expect(typeof p.id).toBe("string");
      const g = gradienteDeId(p.id);
      expect(g).not.toBeNull();
      expect(g?.length).toBe(3);
      expect(g?.every((c) => /^#[0-9a-fA-F]{3,8}$/.test(c))).toBe(true);
    }
    expect(gradienteDeId("paleta que no existe")).toBeNull();
  });

  it("construirDiseno compone un diseño válido con origen protomolecula e id propio", () => {
    const r = construirDiseno(VALIDO);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.diseno.origen).toBe("protomolecula");
      expect(r.diseno.id).toBe("pm-cursor-cursor-purpura");
      expect(r.diseno.id.startsWith("fabrica-")).toBe(false);
      expect(r.diseno.gradiente).toEqual(["#FF6B8A", "#DC143C", "#8A0D26"]);
      expect(r.diseno.cara).toEqual({ ojos: true, boca: false, mirada: true });
      expect(r.diseno.tamano).toBe(1.5);
    }
  });

  it("rechaza cuerpo desconocido, svg sin SVG y degradado inválido", () => {
    expect(construirDiseno({ ...VALIDO, cuerpo: "otro" as never }).ok).toBe(false);
    expect(construirDiseno({ ...VALIDO, cuerpo: "svg" }).ok).toBe(false);
    expect(construirDiseno({ ...VALIDO, gradiente: ["rojo", "verde", "azul"] }).ok).toBe(false);
    expect(construirDiseno({ ...VALIDO, nombre: "   " }).ok).toBe(false);
    expect(construirDiseno({ ...VALIDO, cara: { ojos: true, boca: "sí" as never, mirada: true } }).ok).toBe(false);
  });

  describe("guardarDisenoMausbot", () => {
    it("un diseño válido se guarda en la clave de diseños y se puede leer de vuelta", () => {
      const al = almacenPrueba();
      const r = guardarDisenoMausbot(VALIDO, al);
      expect(r).toEqual({ ok: true });
      expect(al.escrituras.length).toBe(1);
      const guardados = JSON.parse(al.escrituras[0]) as unknown[];
      expect(guardados.length).toBe(1);
      expect((guardados[0] as { origen: string }).origen).toBe("protomolecula");
    });

    it("un SVG peligroso (con script) no se guarda ni escribe nada", () => {
      const al = almacenPrueba();
      const r = guardarDisenoMausbot(
        { ...VALIDO, cuerpo: "svg", svgCuerpo: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' },
        al,
      );
      expect(r.ok).toBe(false);
      expect(al.escrituras.length).toBe(0);
    });

    it("un SVG limpio sí se guarda", () => {
      const al = almacenPrueba();
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="#007FFF" d="M4 32a28 28 0 1 0 56 0 28 28 0 1 0-56 0Z"/></svg>';
      const r = guardarDisenoMausbot({ ...VALIDO, cuerpo: "svg", svgCuerpo: svg }, al);
      expect(r.ok).toBe(true);
      expect(al.escrituras.length).toBe(1);
    });
  });
});
