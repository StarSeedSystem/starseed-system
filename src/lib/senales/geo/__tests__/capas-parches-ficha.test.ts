import { describe, expect, it } from "vitest";
import { CAPAS_SENALES, CAPA_POR_ID, COLOR_DESCONOCIDO, NOTA_PARCHE, estadoCapasInicial, leyendaDe, pintarMarca, sanearEstadoCapas } from "../capas";
import { parchesDeCapa } from "../parches";
import { fichaDeMarca } from "../ficha-geo";
import { construirMarcas, type MarcaGeo } from "../marcas";
import type { PresenciaMedio } from "@/lib/neurons/presencia";

const AHORA = 1_700_000_000_000;

function marca(p: Partial<MarcaGeo> = {}, medios: readonly PresenciaMedio[] = []): MarcaGeo {
  const [m] = construirMarcas({
    filas: [], medios, ahora: AHORA,
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
    // Bluetooth y Wi-Fi ya tienen fuente real (enlaces medidos); la oferta se anuncia en la presencia y solo la red externa sigue sin fuente.
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

  it("la ficha enseña la oferta anunciada y la dice desconocida sin anuncio", () => {
    const con = JSON.stringify(fichaDeMarca(marca({ oferta: { computo: true, almacenamiento: false, internet: true, t: AHORA - 1_000 } }), AHORA));
    expect(con).toContain("Cómputo compartido");
    expect(con).toContain("Internet compartido");
    expect(con).not.toMatch(/aún no se anuncian/);
    const sin = JSON.stringify(fichaDeMarca(marca({ oferta: null }), AHORA));
    expect(sin).toMatch(/sin anunciar|no anuncia|aún no anuncia/);
  });
});

describe("oferta anunciada", () => {
  const conOferta = (o: { computo: boolean; almacenamiento: boolean; internet: boolean }) =>
    marca({ oferta: { ...o, t: AHORA - 1_000 } });

  it("anuncia → valor con su hora; no anuncia → desconocido", () => {
    const c = CAPA_POR_ID["oferta-computo"];
    const anuncia = pintarMarca(c, conOferta({ computo: true, almacenamiento: false, internet: true }));
    expect(anuncia.tramo.id).toBe("si");
    expect(anuncia.valor.medida).toBe(true);
    expect(anuncia.valor.t).toBe(AHORA - 1_000);

    const apagado = pintarMarca(CAPA_POR_ID["oferta-almacenamiento"], conOferta({ computo: true, almacenamiento: false, internet: true }));
    expect(apagado.tramo.id).toBe("no");
    expect(apagado.valor.medida).toBe(true);

    const sinAnuncio = pintarMarca(c, marca({ oferta: null }));
    expect(sinAnuncio.tramo.id).toBe("desconocido");
    expect(sinAnuncio.valor.texto).toContain("sin anunciar");
  });

  it("las tres capas de oferta dejan de ser «sin fuente»", () => {
    const ids = ["oferta-computo", "oferta-almacenamiento", "oferta-internet"];
    for (const id of ids) expect(CAPA_POR_ID[id].estado).toBe("parcial");
  });

  it("la oferta viaja de la presencia a la capa del mapa", () => {
    const of = { computo: true, almacenamiento: false, internet: true, t: AHORA - 500 };
    const m = marca({}, [{ n: "yo", m: "web", t: AHORA, of } as unknown as PresenciaMedio]);
    expect(m.oferta).toEqual(of);
    const c = pintarMarca(CAPA_POR_ID["oferta-computo"], m);
    expect(c.tramo.id).toBe("si");
    expect(c.valor.t).toBe(of.t);
  });
});
