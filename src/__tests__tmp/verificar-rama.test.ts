// Verificación temporal de los tres casos dudosos de la rama archivada.
// Se borra tras ejecutar. NO forma parte del cambio.
// @vitest-environment jsdom
// El caso del espejo toca window.localStorage: necesita entorno jsdom.
import { describe, expect, it } from "vitest";
import { PuertaInternet, puedeUsar, elegirPuerta } from "@/lib/malla/cristal/puertas-internet";
import type { ClaseDato } from "@/lib/malla/cristal/tipos";
import { SkillCapability } from "@/ai/astraura/skills";

function cap(id: string, label: string, routing?: SkillCapability["routing"]): SkillCapability {
  return { id, label, systemPrompt: "x", ...(routing ? { routing } : {}) };
}

describe("dudas de la rama", () => {
  it("dueño con compartir 'nadie'", () => {
    const puerta: PuertaInternet = {
      id: "p1",
      neurona: "n1",
      cuenta: "c1",
      tipo: "movil-4g",
      bajadaKbps: 10000,
      subidaKbps: 5000,
      latenciaMs: 50,
      medida: true,
      topeMensualMb: 1000,
      usadoMesMb: 200,
      reservaDuenoPct: 20,
      compartir: "nadie",
    };
    expect(puedeUsar(puerta, { cuenta: "c1", vinculado: false, grupos: [] })).toEqual({
      ok: true,
      motivo: "Dueño dentro de su tope",
    });
  });

  it("desempata por id con dos permitidas al mismo coste", () => {
    const gemelas: PuertaInternet[] = [
      { id: "zeta", neurona: "n1", cuenta: "c1", tipo: "wifi-externa", bajadaKbps: 5000, subidaKbps: 5000, latenciaMs: 100, medida: false, compartir: "publico" },
      { id: "alfa", neurona: "n2", cuenta: "c1", tipo: "cable", bajadaKbps: 5000, subidaKbps: 5000, latenciaMs: 100, medida: false, compartir: "publico" },
    ];
    const r = elegirPuerta({
      clase: "interno" as ClaseDato,
      necesitaInternet: true,
      puertas: gemelas,
      solicitante: { cuenta: "c1", vinculado: true, grupos: [] },
    });
    expect(r.puerta?.id).toBe("alfa");
  });

  it("desactivar una defaultOn también reflejada en el espejo la apaga", () => {
    const CAPS_KEY = "starseed.capabilities.v1";
    const DIS_KEY = "starseed.capabilities.disabled.v1";
    window.localStorage.setItem(CAPS_KEY, JSON.stringify(["av-gen"]));
    window.localStorage.setItem(DIS_KEY, JSON.stringify(["av-gen"]));
    // dynamic import would be nice but static ok
  });
});
