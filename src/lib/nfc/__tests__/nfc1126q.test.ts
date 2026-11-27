import { describe, expect, it } from "vitest";
import {
  AUDIENCIAS, RELACIONES_DE, aPreferencias, audienciaDe, establecerOferta, ofertasPorDefecto, sanearAudiencia,
} from "../ofertas-audiencia";
import { RELACIONES, preferenciasPorDefecto, resolver } from "../preferencias";
import { decidir } from "../decidir";
import type { TarjetaNeurona } from "../tarjeta";

const tarjeta = (id: string): TarjetaNeurona => ({
  version: 1, neuronaId: id, clavePublica: "a".repeat(64), cuenta: { modo: "alias", valor: "x" },
  claveEfimera: "b".repeat(64), nonce: "c".repeat(32), emitidaEn: 1_700_000_000_000, ofertas: [],
  transportes: [{ tipo: "ble", direccion: "AA:BB:CC:DD:EE:FF" }], firma: "d".repeat(128),
});

describe("audiencias", () => {
  it("cada relación pertenece a una sola audiencia", () => {
    for (const r of RELACIONES) {
      expect(AUDIENCIAS.filter((a) => RELACIONES_DE[a].includes(r))).toHaveLength(1);
      expect(RELACIONES_DE[audienciaDe(r)]).toContain(r);
    }
  });
});

describe("límites de seguridad", () => {
  it("lo ajeno nunca recibe recursos en «sí» ni escaneo por debajo del mínimo", () => {
    const abierto = { ...ofertasPorDefecto().mis_neuronas, automaticas: ["compartir_internet" as const] };
    const c = sanearAudiencia("contactos", abierto);
    expect([c.capacidades, c.almacenamiento, c.senales, c.internet]).not.toContain("si");
    const o = sanearAudiencia("otras_senales", { ...abierto, escaneo: "basico" });
    expect(o.escaneo).toBe("estricto");
    expect(o.automaticas).toEqual([]);
    expect(o.salaSonido).toBe("no");
  });

  it("mis neuronas conservan lo que se pone", () => {
    const p = establecerOferta(ofertasPorDefecto(), "mis_neuronas", { internet: "si" });
    expect(p.mis_neuronas.internet).toBe("si");
  });
});

describe("traducción a preferencias de decidir", () => {
  it("«sí» en mis neuronas es automático y «pedir» solo se ofrece", () => {
    const o = establecerOferta(ofertasPorDefecto(), "mis_neuronas", { almacenamiento: "si", internet: "pedir" });
    const r = resolver(aPreferencias(preferenciasPorDefecto(), o), "misma_cuenta");
    expect(r.automaticas).toContain("compartir_almacenamiento");
    expect(r.ofrecidas).toContain("compartir_internet");
    expect(r.automaticas).not.toContain("compartir_internet");
  });

  it("con un contacto el recurso se ofrece pero nunca corre solo", () => {
    const o = establecerOferta(ofertasPorDefecto(), "contactos", { almacenamiento: "si" });
    const prefs = aPreferencias(preferenciasPorDefecto(), o);
    const d = decidir({ propia: tarjeta("a"), ajena: tarjeta("b"), relacion: "cuenta_reconocida", prefs });
    expect(d.ofrecidas).toContain("compartir_almacenamiento");
    expect(d.automaticas).not.toContain("compartir_almacenamiento");
  });

  it("quitar un recurso lo retira de lo ofrecido", () => {
    const o = establecerOferta(ofertasPorDefecto(), "mis_neuronas", { capacidades: "no" });
    const r = resolver(aPreferencias(preferenciasPorDefecto(), o), "nodo_propio");
    expect(r.ofrecidas).not.toContain("compartir_capacidades");
  });

  it("otras señales no ofrecen recursos", () => {
    const prefs = aPreferencias(preferenciasPorDefecto(), ofertasPorDefecto());
    const r = resolver(prefs, "nodo_publico");
    expect(r.ofrecidas.some((a) => a.startsWith("compartir_"))).toBe(false);
  });
});
