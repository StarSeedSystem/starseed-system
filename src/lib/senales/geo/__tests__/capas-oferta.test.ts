import { describe, expect, it } from "vitest";
import { CAPA_POR_ID, CAPAS_SENALES, pintarMarca, type ValorCapa } from "../capas";
import { construirMarcas, type EntradaMarcas, type MarcaGeo } from "../marcas";
import type { PresenciaMedio } from "@/lib/neurons/presencia";
import type { SenalesMedio } from "@/lib/neurons/senales-medio";
import type { DispositivoMallaRow } from "@/lib/network/malla-neuronas";
import type { FichaDispositivo } from "@/lib/network/malla-neuronas";

const AHORA = 1_700_000_000_000;

function senalesBase(): SenalesMedio {
  return {
    internet: { enLinea: true, tipo: "wifi", mbps: 10 },
    malla: { pares: 0, otrasCuentas: 0 },
    lora: { estado: "sin-radio", nodos: 0 },
    bluetooth: { disponible: true },
    serie: { disponible: false, puertos: 0 },
    reticulum: { disponible: false, motivo: "x" },
  };
}

function medioConOferta(n: string, m: string, t: number, oferta: { compute: boolean; storage: boolean; internet: boolean }): PresenciaMedio {
  return {
    n,
    m,
    t,
    tipo: "navegador",
    etiqueta: m,
    visible: true,
    desde: new Date().toISOString(),
    s: senalesBase(),
    o: oferta,
  };
}

function entradaMarcasConOferta(neuronaId: string, oferta: { compute: boolean; storage: boolean; internet: boolean }): EntradaMarcas {
  const medios: PresenciaMedio[] = [medioConOferta(neuronaId, "medio-1", AHORA, oferta)];
  return {
    filas: [] as DispositivoMallaRow[],
    medios,
    ahora: AHORA,
    yo: {
      neuronaId,
      nombre: "TestNeurona",
      plataforma: "macOS",
      capas: null,
      ficha: null as FichaDispositivo | null,
      posicion: { lat: 19.4326, lon: -99.1332, precisionM: 8, t: AHORA - 10_000 },
      senales: senalesBase(),
    },
  };
}

function marcaDeEntrada(e: EntradaMarcas): MarcaGeo {
  const [m] = construirMarcas(e);
  return m;
}

describe("capas de oferta: leen de la presencia", () => {
  const ofertaActiva = { compute: true, storage: true, internet: true };
  const ofertaInactiva = { compute: false, storage: false, internet: false };

  it("oferta-computo: anuncia → valor 'sí'; no anuncia → 'desconocido'", () => {
    const capa = CAPA_POR_ID["oferta-computo"];
    expect(capa).toBeDefined();
    expect(capa.estado).not.toBe("sin-fuente");

    const mActiva = marcaDeEntrada(entradaMarcasConOferta("n1", ofertaActiva));
    const mInactiva = marcaDeEntrada(entradaMarcasConOferta("n2", ofertaInactiva));

    const vActiva = capa.valor(mActiva);
    const vInactiva = capa.valor(mInactiva);

    expect(vActiva.tramo).toBe("si");
    expect(vActiva.texto).toContain("sí");
    expect(vActiva.medida).toBe(true);

    expect(vInactiva.tramo).toBe("no");
    expect(vInactiva.texto).toContain("no");
    expect(vInactiva.medida).toBe(true);
  });

  it("oferta-almacenamiento: anuncia → valor 'sí'; no anuncia → 'desconocido'", () => {
    const capa = CAPA_POR_ID["oferta-almacenamiento"];
    expect(capa).toBeDefined();
    expect(capa.estado).not.toBe("sin-fuente");

    const mActiva = marcaDeEntrada(entradaMarcasConOferta("n1", ofertaActiva));
    const mInactiva = marcaDeEntrada(entradaMarcasConOferta("n2", ofertaInactiva));

    const vActiva = capa.valor(mActiva);
    const vInactiva = capa.valor(mInactiva);

    expect(vActiva.tramo).toBe("si");
    expect(vActiva.texto).toContain("sí");
    expect(vActiva.medida).toBe(true);

    expect(vInactiva.tramo).toBe("no");
    expect(vInactiva.texto).toContain("no");
    expect(vInactiva.medida).toBe(true);
  });

  it("oferta-internet: anuncia → valor 'sí'; no anuncia → 'desconocido'", () => {
    const capa = CAPA_POR_ID["oferta-internet"];
    expect(capa).toBeDefined();
    expect(capa.estado).not.toBe("sin-fuente");

    const mActiva = marcaDeEntrada(entradaMarcasConOferta("n1", ofertaActiva));
    const mInactiva = marcaDeEntrada(entradaMarcasConOferta("n2", ofertaInactiva));

    const vActiva = capa.valor(mActiva);
    const vInactiva = capa.valor(mInactiva);

    expect(vActiva.tramo).toBe("si");
    expect(vActiva.texto).toContain("sí");
    expect(vActiva.medida).toBe(true);

    expect(vInactiva.tramo).toBe("no");
    expect(vInactiva.texto).toContain("no");
    expect(vInactiva.medida).toBe(true);
  });

  it("las tres capas ya no están en estado 'sin-fuente'", () => {
    const ids = ["oferta-computo", "oferta-almacenamiento", "oferta-internet"];
    for (const id of ids) {
      const capa = CAPA_POR_ID[id];
      expect(capa).toBeDefined();
      expect(capa.estado).not.toBe("sin-fuente");
      expect(capa.fuente).not.toContain("Sin fuente");
    }
  });
});