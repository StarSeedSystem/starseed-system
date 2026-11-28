import { describe, it, expect } from "vitest";
import {
  crearOfertaAlmacenamiento,
  actualizarOferta,
  comprometerBytes,
  liberarBytes,
  bytesLibres,
  estaDisponible,
  puedeAceptar,
  filtrarPorAmbito,
  ordenarPorPrioridad,
  resumirOferta,
  esAmbitoOfertaValido,
  esDisponibilidadValida,
  type OfertaAlmacenamiento,
  type AmbitoOferta,
} from "../oferta";
import { TipoAlmacen } from "../modelo";

describe("oferta de almacenamiento", () => {
  const crearOfertaBase = (overrides: Partial<{
    ambito: AmbitoOferta;
    bytesOfrecidos: bigint;
    activa: boolean;
    duracionMs: number;
    prioridad: number;
    topePorConsumidor: bigint;
    topeTotal: bigint;
  }> = {}): OfertaAlmacenamiento => {
    return crearOfertaAlmacenamiento({
      nodoId: "nodo-1",
      almacenId: "volumen-abc-123",
      tipoAlmacen: TipoAlmacen.DISCO_INTERNO,
      ambito: overrides.ambito ?? "privada",
      bytesOfrecidos: overrides.bytesOfrecidos ?? BigInt(1000),
      activa: overrides.activa ?? false,
      duracionMs: overrides.duracionMs ?? 0,
      prioridad: overrides.prioridad ?? 0,
      topePorConsumidor: overrides.topePorConsumidor,
      topeTotal: overrides.topeTotal,
    });
  };

  describe("crearOfertaAlmacenamiento", () => {
    it("crea una oferta con valores por defecto (apagada por defecto)", () => {
      const oferta = crearOfertaBase();
      expect(oferta.id).toMatch(/^oferta-nodo-1-volumen-abc-123-\d+$/);
      expect(oferta.nodoId).toBe("nodo-1");
      expect(oferta.almacenId).toBe("volumen-abc-123");
      expect(oferta.tipoAlmacen).toBe("disco_interno");
      expect(oferta.ambito).toBe("privada");
      expect(oferta.bytesOfrecidos).toBe(BigInt(1000));
      expect(oferta.bytesComprometidos).toBe(BigInt(0));
      expect(oferta.activa).toBe(false);
      expect(oferta.prioridad).toBe(0);
      expect(oferta.duracionMs).toBe(0);
      expect(oferta.disponibilidad).toBe("siempre");
      expect(oferta.fechaCreacion).toBeDefined();
      expect(oferta.fechaActualizacion).toBeDefined();
    });

    it("permite crear oferta activa si se pasa explícitamente", () => {
      const oferta = crearOfertaBase({ activa: true });
      expect(oferta.activa).toBe(true);
    });

    it("valida que el ámbito sea válido", () => {
      expect(() =>
        crearOfertaAlmacenamiento({
          nodoId: "n1",
          almacenId: "v1",
          tipoAlmacen: TipoAlmacen.DISCO_INTERNO,
          ambito: "invalido" as AmbitoOferta,
          bytesOfrecidos: BigInt(1000),
        })
      ).toThrow("Ámbito de oferta inválido");
    });

    it("valida que la disponibilidad sea válida", () => {
      expect(() =>
        crearOfertaAlmacenamiento({
          nodoId: "n1",
          almacenId: "v1",
          tipoAlmacen: TipoAlmacen.DISCO_INTERNO,
          ambito: "privada",
          bytesOfrecidos: BigInt(1000),
          disponibilidad: "invalido" as any,
        })
      ).toThrow("Disponibilidad inválida");
    });

    it("valida que bytesOfrecidos sea mayor que 0", () => {
      expect(() =>
        crearOfertaAlmacenamiento({
          nodoId: "n1",
          almacenId: "v1",
          tipoAlmacen: TipoAlmacen.DISCO_INTERNO,
          ambito: "privada",
          bytesOfrecidos: BigInt(0),
        })
      ).toThrow("bytesOfrecidos debe ser mayor que 0");
    });

    it("acepta todos los ámbitos válidos", () => {
      const ambitos: AmbitoOferta[] = ["privada", "grupo", "comunidad", "publica"];
      for (const ambito of ambitos) {
        const oferta = crearOfertaBase({ ambito });
        expect(oferta.ambito).toBe(ambito);
      }
    });
  });

  describe("bytesLibres", () => {
    it("devuelve bytesOfrecidos cuando no hay comprometidos", () => {
      const oferta = crearOfertaBase({ bytesOfrecidos: BigInt(1000) });
      expect(bytesLibres(oferta)).toBe(BigInt(1000));
    });

    it("resta bytes comprometidos", () => {
      const oferta = { ...crearOfertaBase(), bytesComprometidos: BigInt(300) };
      expect(bytesLibres(oferta)).toBe(BigInt(700));
    });

    it("devuelve 0 si comprometidos >= ofrecidos", () => {
      const oferta = { ...crearOfertaBase(), bytesOfrecidos: BigInt(1000), bytesComprometidos: BigInt(1000) };
      expect(bytesLibres(oferta)).toBe(BigInt(0));
      const oferta2 = { ...crearOfertaBase(), bytesOfrecidos: BigInt(1000), bytesComprometidos: BigInt(1500) };
      expect(bytesLibres(oferta2)).toBe(BigInt(0));
    });
  });

  describe("estaDisponible", () => {
    it("devuelve false si la oferta está inactiva", () => {
      const oferta = crearOfertaBase({ activa: false });
      expect(estaDisponible(oferta)).toBe(false);
    });

    it("devuelve true si la oferta está activa y tiene bytes libres", () => {
      const oferta = crearOfertaBase({ activa: true });
      expect(estaDisponible(oferta)).toBe(true);
    });

    it("devuelve false si no hay bytes libres", () => {
      const oferta = { ...crearOfertaBase({ activa: true }), bytesComprometidos: BigInt(1000) };
      expect(estaDisponible(oferta)).toBe(false);
    });

    it("respeta la duración de la oferta", () => {
      const ahora = Date.now();
      const oferta = {
        ...crearOfertaBase({ activa: true, duracionMs: 1000 }),
        fechaCreacion: new Date(ahora - 2000).toISOString(),
      };
      expect(estaDisponible(oferta, ahora)).toBe(false);
    });

    it("oferta sin duración (0) no expira", () => {
      const ahora = Date.now();
      const oferta = {
        ...crearOfertaBase({ activa: true, duracionMs: 0 }),
        fechaCreacion: new Date(ahora - 1000000).toISOString(),
      };
      expect(estaDisponible(oferta, ahora)).toBe(true);
    });
  });

  describe("puedeAceptar", () => {
    it("devuelve false si la oferta no está disponible", () => {
      const oferta = crearOfertaBase({ activa: false });
      expect(puedeAceptar(oferta, BigInt(100))).toBe(false);
    });

    it("devuelve false si bytes solicitados superan los libres", () => {
      const oferta = crearOfertaBase({ activa: true, bytesOfrecidos: BigInt(1000) });
      expect(puedeAceptar(oferta, BigInt(1500))).toBe(false);
    });

    it("respeta topePorConsumidor", () => {
      const oferta = crearOfertaBase({ activa: true, bytesOfrecidos: BigInt(1000), topePorConsumidor: BigInt(100) });
      expect(puedeAceptar(oferta, BigInt(50))).toBe(true);
      expect(puedeAceptar(oferta, BigInt(150))).toBe(false);
    });

    it("respeta topeTotal", () => {
      const oferta = {
        ...crearOfertaBase({ activa: true, bytesOfrecidos: BigInt(1000), topeTotal: BigInt(800) }),
        bytesComprometidos: BigInt(500),
      };
      expect(puedeAceptar(oferta, BigInt(200))).toBe(true);
      expect(puedeAceptar(oferta, BigInt(400))).toBe(false);
    });

    it("acepta solicitud exacta al límite", () => {
      const oferta = crearOfertaBase({ activa: true, bytesOfrecidos: BigInt(1000), topePorConsumidor: BigInt(500) });
      expect(puedeAceptar(oferta, BigInt(500))).toBe(true);
    });
  });

  describe("comprometerBytes y liberarBytes", () => {
    it("compromete bytes y actualiza fechaActualizacion", async () => {
      const oferta = crearOfertaBase({ activa: true });
      const fechaAntes = oferta.fechaActualizacion;
      await new Promise((r) => setTimeout(r, 5));
      const actualizada = comprometerBytes(oferta, BigInt(300));
      expect(actualizada.bytesComprometidos).toBe(BigInt(300));
      expect(actualizada.fechaActualizacion).not.toBe(fechaAntes);
    });

    it("lanza error si no hay suficientes bytes libres", () => {
      const oferta = { ...crearOfertaBase({ activa: true }), bytesOfrecidos: BigInt(1000), bytesComprometidos: BigInt(800) };
      expect(() => comprometerBytes(oferta, BigInt(300))).toThrow("No hay suficientes bytes libres");
    });

    it("libera bytes comprometidos", () => {
      const oferta = { ...crearOfertaBase({ activa: true }), bytesComprometidos: BigInt(500) };
      const actualizada = liberarBytes(oferta, BigInt(200));
      expect(actualizada.bytesComprometidos).toBe(BigInt(300));
    });

    it("no permite liberar más de lo comprometido (queda en 0)", () => {
      const oferta = { ...crearOfertaBase({ activa: true }), bytesComprometidos: BigInt(100) };
      const actualizada = liberarBytes(oferta, BigInt(200));
      expect(actualizada.bytesComprometidos).toBe(BigInt(0));
    });

    it("no hace nada si bytes <= 0", () => {
      const oferta = crearOfertaBase({ activa: true, bytesOfrecidos: BigInt(1000) });
      expect(comprometerBytes(oferta, BigInt(0))).toBe(oferta);
      expect(liberarBytes(oferta, BigInt(-1))).toBe(oferta);
    });
  });

  describe("actualizarOferta", () => {
    it("actualiza campos permitidos y fechaActualizacion", async () => {
      const oferta = crearOfertaBase();
      const fechaAntes = oferta.fechaActualizacion;
      await new Promise((r) => setTimeout(r, 5));
      const actualizada = actualizarOferta(oferta, { activa: true, prioridad: 5 });
      expect(actualizada.activa).toBe(true);
      expect(actualizada.prioridad).toBe(5);
      expect(actualizada.fechaActualizacion).not.toBe(fechaAntes);
    });

    it("no modifica la oferta original", () => {
      const oferta = crearOfertaBase();
      const originalActiva = oferta.activa;
      actualizarOferta(oferta, { activa: true });
      expect(oferta.activa).toBe(originalActiva);
    });
  });

  describe("filtrarPorAmbito", () => {
    it("filtra ofertas por ámbito y solo activas", () => {
      const ofertas = [
        crearOfertaBase({ ambito: "privada", activa: true }),
        crearOfertaBase({ ambito: "grupo", activa: true }),
        crearOfertaBase({ ambito: "privada", activa: false }),
        crearOfertaBase({ ambito: "comunidad", activa: true }),
      ];
      const privadas = filtrarPorAmbito(ofertas, "privada");
      expect(privadas.length).toBe(1);
      expect(privadas[0].ambito).toBe("privada");
      expect(privadas[0].activa).toBe(true);
    });

    it("devuelve array vacío si no hay coincidencias", () => {
      const ofertas = [crearOfertaBase({ ambito: "grupo", activa: true })];
      expect(filtrarPorAmbito(ofertas, "privada")).toEqual([]);
    });
  });

  describe("ordenarPorPrioridad", () => {
    it("ordena por prioridad descendente", () => {
      const ofertas = [
        crearOfertaBase({ prioridad: 1, activa: true, bytesOfrecidos: BigInt(1000) }),
        crearOfertaBase({ prioridad: 5, activa: true, bytesOfrecidos: BigInt(1000) }),
        crearOfertaBase({ prioridad: 3, activa: true, bytesOfrecidos: BigInt(1000) }),
      ];
      const ordenadas = ordenarPorPrioridad(ofertas);
      expect(ordenadas[0].prioridad).toBe(5);
      expect(ordenadas[1].prioridad).toBe(3);
      expect(ordenadas[2].prioridad).toBe(1);
    });

    it("desempata por bytes libres descendente", () => {
      const ofertas = [
        { ...crearOfertaBase({ prioridad: 2, activa: true }), bytesOfrecidos: BigInt(1000), bytesComprometidos: BigInt(500) },
        { ...crearOfertaBase({ prioridad: 2, activa: true }), bytesOfrecidos: BigInt(1000), bytesComprometidos: BigInt(200) },
      ];
      const ordenadas = ordenarPorPrioridad(ofertas);
      expect(bytesLibres(ordenadas[0])).toBeGreaterThan(bytesLibres(ordenadas[1]));
    });

    it("no modifica el array original", () => {
      const ofertas = [
        crearOfertaBase({ prioridad: 1 }),
        crearOfertaBase({ prioridad: 2 }),
      ];
      ordenarPorPrioridad(ofertas);
      expect(ofertas[0].prioridad).toBe(1);
      expect(ofertas[1].prioridad).toBe(2);
    });
  });

  describe("resumirOferta", () => {
    it("devuelve resumen con bytesLibres calculados", () => {
      const oferta = { ...crearOfertaBase({ activa: true }), bytesOfrecidos: BigInt(1000), bytesComprometidos: BigInt(300) };
      const resumen = resumirOferta(oferta);
      expect(resumen.id).toBe(oferta.id);
      expect(resumen.nodoId).toBe(oferta.nodoId);
      expect(resumen.almacenId).toBe(oferta.almacenId);
      expect(resumen.ambito).toBe(oferta.ambito);
      expect(resumen.bytesOfrecidos).toBe(BigInt(1000));
      expect(resumen.bytesLibres).toBe(BigInt(700));
      expect(resumen.activa).toBe(true);
      expect(resumen.prioridad).toBe(0);
    });
  });

  describe("validadores", () => {
    it("esAmbitoOfertaValido acepta ámbitos válidos", () => {
      expect(esAmbitoOfertaValido("privada")).toBe(true);
      expect(esAmbitoOfertaValido("grupo")).toBe(true);
      expect(esAmbitoOfertaValido("comunidad")).toBe(true);
      expect(esAmbitoOfertaValido("publica")).toBe(true);
    });

    it("esAmbitoOfertaValido rechaza ámbitos inválidos", () => {
      expect(esAmbitoOfertaValido("invalido")).toBe(false);
      expect(esAmbitoOfertaValido("")).toBe(false);
      expect(esAmbitoOfertaValido("publico")).toBe(false);
    });

    it("esDisponibilidadValida acepta disponibilidades válidas", () => {
      expect(esDisponibilidadValida("siempre")).toBe(true);
      expect(esDisponibilidadValida("programada")).toBe(true);
      expect(esDisponibilidadValida("bajo_demanda")).toBe(true);
    });

    it("esDisponibilidadValida rechaza disponibilidades inválidas", () => {
      expect(esDisponibilidadValida("nunca")).toBe(false);
      expect(esDisponibilidadValida("")).toBe(false);
    });
  });
});