import { describe, it, expect } from "vitest";
import { destinosDe, type DestinoAlmacen } from "../destinos-almacen";
import type { Dato } from "../tipos";

const DATO_PRIVADO: Dato = {
  id: "d1", clase: "privado", tipo: "mensaje",
  bytes: 100, prioridad: 1, origen: "n1", destino: "n2",
};
const DATO_PUBLICO: Dato = { ...DATO_PRIVADO, clase: "publico", tipo: "publicacion" };

const APARATO: DestinoAlmacen = { id: "ap", tipo: "aparato", motor: "local", publico: false };
const CEREBRO: DestinoAlmacen = { id: "ce", tipo: "cerebro", motor: "gdrive", publico: false, cerebroId: "c1" };
const BIBLIO_PUBLICA: DestinoAlmacen = { id: "bi", tipo: "biblioteca", motor: "starseed", publico: true };
const SIN_MOTOR: DestinoAlmacen = { id: "na", tipo: "servidor", motor: "nas-x", publico: false };

const DISPONIBLES = [APARATO, CEREBRO, BIBLIO_PUBLICA, SIN_MOTOR];
const MOTORES = ["starseed", "gdrive", "gcs"];

const entorno = (extra?: Partial<Parameters<typeof destinosDe>[1]>) => ({
  politicaContexto: ["ap", "ce"],
  disponibles: DISPONIBLES,
  motoresReales: MOTORES,
  ...extra,
});

describe("destinosDe", () => {
  it("usa la política del contexto cuando no hay elección por dato", () => {
    const r = destinosDe(DATO_PRIVADO, entorno());
    expect(r.guardar.map((d) => d.id)).toEqual(["ap", "ce"]);
    expect(r.descartados).toEqual([]);
  });

  it("elegidosPorDato manda sobre la política y respeta el orden pedido", () => {
    const r = destinosDe(DATO_PRIVADO, entorno({ elegidosPorDato: ["ce", "ap"] }));
    expect(r.guardar.map((d) => d.id)).toEqual(["ce", "ap"]);
  });

  it("descarta destinos públicos para datos privados", () => {
    const r = destinosDe(DATO_PRIVADO, entorno({ elegidosPorDato: ["bi"] }));
    expect(r.guardar).toEqual([]);
    expect(r.descartados[0].id).toBe("bi");
    expect(r.descartados[0].motivo).toContain("público");
  });

  it("descarta destinos públicos para datos internos", () => {
    const r = destinosDe({ ...DATO_PRIVADO, clase: "interno" }, entorno({ elegidosPorDato: ["bi"] }));
    expect(r.descartados).toHaveLength(1);
  });

  it("admite destinos públicos para datos públicos", () => {
    const r = destinosDe(DATO_PUBLICO, entorno({ elegidosPorDato: ["bi"] }));
    expect(r.guardar[0].id).toBe("bi");
  });

  it("descarta los que no existen con su motivo", () => {
    const r = destinosDe(DATO_PRIVADO, entorno({ elegidosPorDato: ["fantasma"] }));
    expect(r.descartados[0].motivo).toContain("no existe");
  });

  it("descarta motores sin implementar salvo el aparato", () => {
    const r = destinosDe(DATO_PRIVADO, entorno({ elegidosPorDato: ["na", "ap"] }));
    expect(r.guardar.map((d) => d.id)).toEqual(["ap"]);
    expect(r.descartados[0].id).toBe("na");
    expect(r.descartados[0].motivo).toContain("aún sin motor de guardado");
  });
});
