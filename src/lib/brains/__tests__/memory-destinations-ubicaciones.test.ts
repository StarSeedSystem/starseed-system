/**
 * ALC1125C · parte 2 — mapa de ubicaciones del cerebro en los almacenes.
 * Solo funciones puras exportadas por memory-destinations: construir el mapa
 * (dónde vive cada carpeta, con copias y estado en línea) y el informe con los
 * avisos de la regla de dos copias. Sin red ni disco.
 */
import { describe, expect, it } from "vitest";
import {
  construirMapaUbicacionesCerebro,
  informeUbicacionesCerebro,
  normalizeMemoryDestinations,
  type AlmacenDetectado,
} from "@/lib/brains/memory-destinations";
import {
  crearAlmacen,
  crearManifiesto,
  type Almacen,
  type ManifiestoAlmacen,
} from "@/lib/almacenes";

function medio(params: {
  id: string;
  tipo: "extraible" | "disco_interno" | "red" | "nube";
  enLinea: boolean;
  carpetas?: Record<string, "parte" | "respaldo-vivo" | "cerebro-completo">;
}): Almacen {
  return crearAlmacen({
    idVolumen: params.id,
    numeroSerie: `SN-${params.id}`,
    tipo: params.tipo,
    nombre: `Medio ${params.id}`,
    modalidad: "parte",
    carpetas: params.carpetas,
    medidas: {
      totalBytes: BigInt(1_000_000),
      libreBytes: BigInt(500_000),
      velocidadLecturaMbps: 100,
      velocidadEscrituraMbps: 80,
      salud: "buena",
      sistemaArchivos: "exfat",
      enLinea: params.enLinea,
      neuronaId: "neurona-1",
    },
  });
}

function manifiesto(
  idVolumen: string,
  cerebros: string[],
  partes: Record<string, string>,
): ManifiestoAlmacen {
  return crearManifiesto({ idVolumen, numeroSerie: `SN-${idVolumen}`, dueño: "maggasukha", cerebros, partes });
}

describe("normalizeMemoryDestinations · tipo de almacén", () => {
  it("conserva un tipo válido y descarta uno inventado", () => {
    expect(normalizeMemoryDestinations({ almacen: { enabled: true, tipo: "extraible" } }).almacen.tipo).toBe(
      "extraible",
    );
    expect(
      normalizeMemoryDestinations({ almacen: { enabled: true, tipo: "inventado" } }).almacen.tipo,
    ).toBeUndefined();
  });
});

describe("construirMapaUbicacionesCerebro · dónde vive cada parte", () => {
  it("una parte en un medio apagado aparece fuera de línea y no desaparece", () => {
    const usb = medio({ id: "usb-1", tipo: "extraible", enLinea: false, carpetas: { "/memorias": "parte" } });
    const detectado: AlmacenDetectado = {
      almacen: usb,
      manifiesto: manifiesto("usb-1", [], { "/memorias": "cerebro-1" }),
    };
    const mapa = construirMapaUbicacionesCerebro({ brainId: "cerebro-1", almacenes: [detectado] });
    const carpeta = mapa["cerebro-1"].carpetas["/memorias"];
    expect(carpeta).toBeDefined();
    expect(carpeta.copias[0].enLinea).toBe(false);
    expect(carpeta.copias[0].almacenTipo).toBe("extraible");
  });

  it("un cerebro completo en el manifiesto vive en la raíz «/»", () => {
    const ssd = medio({ id: "ssd-1", tipo: "disco_interno", enLinea: true });
    const mapa = construirMapaUbicacionesCerebro({
      brainId: "cerebro-1",
      almacenes: [{ almacen: ssd, manifiesto: manifiesto("ssd-1", ["cerebro-1"], {}) }],
    });
    expect(mapa["cerebro-1"].carpetas["/"].copias[0].modalidad).toBe("cerebro-completo");
  });

  it("declara un almacén no detectado: su parte se muestra fuera de línea con su tipo", () => {
    const destinos = normalizeMemoryDestinations({
      almacen: {
        enabled: true,
        idVolumen: "usb-x",
        tipo: "extraible",
        label: "USB viaje",
        partes: { "/cerebros/privado": "cerebro-1" },
      },
    });
    const mapa = construirMapaUbicacionesCerebro({ brainId: "cerebro-1", destinos });
    const copia = mapa["cerebro-1"].carpetas["/cerebros/privado"].copias[0];
    expect(copia.enLinea).toBe(false);
    expect(copia.almacenTipo).toBe("extraible");
    expect(copia.almacenNombre).toBe("USB viaje");
  });

  it("no duplica la copia si el almacén está detectado y declarado a la vez", () => {
    const usb = medio({ id: "usb-1", tipo: "extraible", enLinea: true, carpetas: { "/memorias": "parte" } });
    const destinos = normalizeMemoryDestinations({
      almacen: { enabled: true, idVolumen: "usb-1", tipo: "extraible", label: "USB", partes: { "/memorias": "cerebro-1" } },
    });
    const mapa = construirMapaUbicacionesCerebro({
      brainId: "cerebro-1",
      almacenes: [{ almacen: usb, manifiesto: manifiesto("usb-1", [], { "/memorias": "cerebro-1" }) }],
      destinos,
    });
    expect(mapa["cerebro-1"].carpetas["/memorias"].copias.length).toBe(1);
  });

  it("ignora las partes declaradas para otros cerebros", () => {
    const usb = medio({ id: "usb-1", tipo: "extraible", enLinea: true, carpetas: { "/ajena": "parte" } });
    const mapa = construirMapaUbicacionesCerebro({
      brainId: "cerebro-1",
      almacenes: [{ almacen: usb, manifiesto: manifiesto("usb-1", [], { "/ajena": "cerebro-2" }) }],
    });
    expect(mapa["cerebro-1"].carpetas).toEqual({});
  });
});

describe("informeUbicacionesCerebro · copias, en línea y avisos", () => {
  it("una ruta declarada sin copias aparece como sin_copias, no desaparece", () => {
    const mapa = construirMapaUbicacionesCerebro({ brainId: "cerebro-1", rutas: ["/vacia"] });
    const informe = informeUbicacionesCerebro(mapa, "cerebro-1");
    expect(informe.carpetas[0].estado).toBe("sin_copias");
    expect(informe.avisos.some((a) => a.includes("ninguna copia"))).toBe(true);
  });

  it("avisa cuando un extraíble es la única copia de algo fundamental", () => {
    const usb = medio({ id: "usb-1", tipo: "extraible", enLinea: true, carpetas: { "/fundamental": "parte" } });
    const mapa = construirMapaUbicacionesCerebro({
      brainId: "cerebro-1",
      almacenes: [{ almacen: usb, manifiesto: manifiesto("usb-1", [], { "/fundamental": "cerebro-1" }) }],
    });
    const informe = informeUbicacionesCerebro(mapa, "cerebro-1");
    expect(informe.carpetas[0].estado).toBe("en_linea");
    expect(informe.reglaDosCopias.cumple).toBe(false);
    expect(informe.avisos.some((a) => a.includes("extraíble"))).toBe(true);
  });

  it("cumple la regla con dos copias en medios distintos y las cuenta", () => {
    const usb = medio({ id: "usb-1", tipo: "extraible", enLinea: true, carpetas: { "/fundamental": "parte" } });
    const ssd = medio({ id: "ssd-1", tipo: "disco_interno", enLinea: true, carpetas: { "/fundamental": "parte" } });
    const mapa = construirMapaUbicacionesCerebro({
      brainId: "cerebro-1",
      almacenes: [
        { almacen: usb, manifiesto: manifiesto("usb-1", [], { "/fundamental": "cerebro-1" }) },
        { almacen: ssd, manifiesto: manifiesto("ssd-1", [], { "/fundamental": "cerebro-1" }) },
      ],
    });
    const informe = informeUbicacionesCerebro(mapa, "cerebro-1");
    expect(informe.reglaDosCopias.cumple).toBe(true);
    expect(informe.carpetas[0].totalCopias).toBe(2);
    expect(informe.carpetas[0].copiasEnLinea).toBe(2);
  });

  it("muestra fuera de línea (no hace desaparecer) una parte sin ningún medio en línea", () => {
    const usb = medio({ id: "usb-1", tipo: "extraible", enLinea: false, carpetas: { "/memorias": "parte" } });
    const mapa = construirMapaUbicacionesCerebro({
      brainId: "cerebro-1",
      almacenes: [{ almacen: usb, manifiesto: manifiesto("usb-1", [], { "/memorias": "cerebro-1" }) }],
    });
    const informe = informeUbicacionesCerebro(mapa, "cerebro-1");
    expect(informe.carpetas[0].estado).toBe("fuera_de_linea");
    expect(informe.avisos.some((a) => a.includes("fuera de línea") && a.includes("no desaparece"))).toBe(true);
  });
});
