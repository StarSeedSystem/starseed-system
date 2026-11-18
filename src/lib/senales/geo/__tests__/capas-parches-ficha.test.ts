import { describe, expect, it } from "vitest";
import { CAPAS_SENALES, CAPA_POR_ID, COLOR_DESCONOCIDO, NOTA_PARCHE, estadoCapasInicial, leyendaDe, pintarMarca, sanearEstadoCapas } from "../capas";
import { parchesDeCapa } from "../parches";
import { fichaDeMarca } from "../ficha-geo";
import { construirMarcas, type MarcaGeo } from "../marcas";

const AHORA = 1_700_000_000_000;

function marca(p: Partial<MarcaGeo> = {}): MarcaGeo {
  const [m] = construirMarcas({
    filas: [], medios: [], ahora: AHORA,
    yo: {
      neuronaId: "yo", nombre: "MaggaBook", plataforma: "macOS", capas: null, ficha: null,
      posicion: { lat: 19.4326, lon: -99.1332, precisionM: 8, t: AHORA - 10_000 },
      senales: { internet: { enLinea: true, tipo: "wifi", mbps: 10 }, malla: { pares: 0, otrasCuentas: 0 }, lora: { estado: "sin-radio", nodos: 0 }, bluetooth: { disponible: true }, serie: { disponible: false, puertos: 0 }, reticulum: { disponible: false, motivo: "x" } },
    },
  });
  return { ...m, ...p };
}

describe("capas: una sola tabla para leyenda y pintura", () => {
  it("todas las capas tienen fuente declarada y un tramo «sin medir» gris y hueco", () => {
    expect(CAPAS_SENALES.length).toBeGreaterThanOrEqual(12);
    for (const c of CAPAS_SENALES) {
      expect(["real", "parcial", "sin-fuente", "estimado"]).toContain(c.estado);
      expect(c.fuente.length).toBeGreaterThan(5);
      const d = c.tramos.find((t) => t.id === "desconocido");
      expect(d?.estilo).toBe("hueco");
      expect(d?.color).toBe(COLOR_DESCONOCIDO);
    }
  });

  it("la leyenda sale de los mismos tramos con los que se pinta", () => {
    for (const c of CAPAS_SENALES) {
      expect(leyendaDe(c).map((l) => l.etiqueta)).toEqual(c.tramos.map((t) => t.etiqueta));
    }
  });

  it("sin fuente = siempre gris y hueco; nunca un color inventado", () => {
    const m = marca();
    for (const c of CAPAS_SENALES.filter((x) => x.estado === "sin-fuente")) {
      const { tramo } = pintarMarca(c, m);
      expect(tramo.id).toBe("desconocido");
    }
    // Bluetooth y Wi-Fi ya tienen fuente real (enlaces medidos); la oferta de recursos ahora tiene fuente parcial; solo red-externa sigue sin fuente.
    expect(CAPAS_SENALES.filter((x) => x.estado === "sin-fuente").map((x) => x.id)).toEqual(["red-externa"]);
  });

  it("internet 10 Mb/s: calidad media, con color", () => {
    const { tramo, valor } = pintarMarca(CAPA_POR_ID["senal-internet"], marca());
    expect(tramo.id).not.toBe("desconocido");
    expect(valor.medida).toBe(true);
  });

  it("la nota dice que el parche no es un alcance", () => {
    expect(NOTA_PARCHE).toMatch(/no es un alcance de cobertura/);
  });

  it("estado guardado: ids raros fuera, opacidad acotada, internet activa de inicio", () => {
    expect(estadoCapasInicial().activas).toEqual(["senal-internet", "cobertura-ble", "cobertura-wifi", "enlaces-medidos"]);
    const s = sanearEstadoCapas({ activas: ["senal-wifi", "nope", "senal-wifi", 3], opacidad: { "senal-wifi": 5, nope: 1, "senal-internet": 0 } });
    expect(s.activas).toEqual(["senal-wifi"]);
    expect(s.opacidad).toEqual({ "senal-wifi": 1, "senal-internet": 0.1 });
    expect(sanearEstadoCapas("x")).toEqual(estadoCapasInicial());
  });
});

describe("parches", () => {
  it("posición viva: pinta con su tramo", () => {
    const p = parchesDeCapa(CAPA_POR_ID["senal-internet"], [marca()], AHORA);
    expect(p).toHaveLength(1);
    expect(p[0].viva).toBe(true);
    expect(p[0].estilo).toBe("relleno");
  });

  it("posición de hace 2 h: gris hueco, nunca color", () => {
    const vieja = marca({ posicion: { tipo: "exacta", lat: 19.43, lon: -99.13, t: AHORA - 2 * 3600_000 } });
    const [p] = parchesDeCapa(CAPA_POR_ID["senal-internet"], [vieja], AHORA);
    expect(p.viva).toBe(false);
    expect(p.estilo).toBe("hueco");
    expect(p.color).toBe(COLOR_DESCONOCIDO);
  });

  it("sin posición: no hay parche", () => {
    const sin = marca({ posicion: { tipo: "desconocida", motivo: "x" } });
    expect(parchesDeCapa(CAPA_POR_ID["senal-internet"], [sin], AHORA)).toEqual([]);
  });
});

describe("ficha", () => {
  it("solo valores medidos con su hora; lo demás, «desconocido»", () => {
    const f = JSON.stringify(fichaDeMarca(marca(), AHORA));
    expect(f).toContain("MaggaBook");
    expect(f).toMatch(/desconocid/);
    expect(f).toContain("19.4326");
    expect(f).not.toMatch(/zona|público|publico|aproximad/i);
  });

  it("posición desconocida: dice el motivo, sin coordenadas", () => {
    const f = JSON.stringify(fichaDeMarca(marca({ posicion: { tipo: "desconocida", motivo: "MOTIVO-PRUEBA" } }), AHORA));
    expect(f).toContain("MOTIVO-PRUEBA");
  });
});
