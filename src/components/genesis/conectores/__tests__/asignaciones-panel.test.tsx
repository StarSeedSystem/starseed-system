// Pruebas puras del panel de asignaciones (Ola 1019G · N): sin red, sin disco y sin claves.
import { describe, expect, it } from "vitest";
import type { OpcionCatalogo, Papel } from "@/lib/genesis/conectores/catalogo-opciones";
import { cadenaSugerida, modoDeGuardado, moverEnCadena, PELDANOS, peldanoDe } from "../asignaciones-panel";

const GRATIS = { rpm: 10, porDia: null, horasMes: null, almacenamientoGb: null, nota: "10 peticiones/min" };

function opcion(id: string, extra: Partial<OpcionCatalogo> = {}): OpcionCatalogo {
  return {
    id, nombre: id, tipo: "proveedor", papeles: ["escritor"] as Papel[], gratis: GRATIS,
    requiereCuenta: true, enlaceAlta: null, enlaceClave: null, variables: [],
    privacidad: "nube-sin-retencion", licencia: null, verificado: null, fuente: "prueba", ...extra,
  };
}

describe("peldanoDe · etiqueta del peldaño", () => {
  it("distingue local, malla, contenedor, gratis y pago", () => {
    expect(peldanoDe(opcion("local", { privacidad: "local" }))).toBe("local");
    expect(peldanoDe(opcion("ofrecida"), { ofertas: new Set(["ofrecida"]) })).toBe("local");
    expect(peldanoDe(opcion("malla"))).toBe("malla");
    expect(peldanoDe(opcion("vinculada"), { vinculadas: new Set(["vinculada"]) })).toBe("gratis");
    expect(peldanoDe(opcion("caja", { tipo: "contenedor" }))).toBe("contenedor");
    expect(peldanoDe(opcion("caro", { gratis: null }))).toBe("pago");
  });

  it("cada peldaño tiene etiqueta y motivo para la fila", () => {
    for (const p of ["local", "malla", "contenedor", "gratis", "pago"] as const) {
      expect(PELDANOS[p].etiqueta).toBe(p);
      expect(PELDANOS[p].motivo.length).toBeGreaterThan(10);
    }
  });
});

describe("cadenaSugerida · restaurar sugeridas", () => {
  it("pone lo local primero, no sugiere pago y respeta el papel", () => {
    const catalogo = [
      opcion("pago", { gratis: null }),
      opcion("gratis-b", { privacidad: "nube-sin-retencion" }),
      opcion("local-a", { privacidad: "local" }),
      opcion("otro-papel", { papeles: ["voz"] }),
    ];
    expect(cadenaSugerida("escritor", catalogo)).toEqual(["local-a", "gratis-b"]);
  });

  it("un director puede recibir cualquiera del catálogo, también sin papeles", () => {
    const catalogo = [opcion("gratis", { papeles: [] }), opcion("local", { privacidad: "local", papeles: ["voz"] })];
    expect(cadenaSugerida("optimizador", catalogo)).toEqual(["local", "gratis"]);
  });
});

describe("moverEnCadena · arrastrar para ordenar", () => {
  it("mueve un candidato y no muta la cadena original", () => {
    const original = ["a", "b", "c"];
    expect(moverEnCadena(original, 0, 2)).toEqual(["b", "c", "a"]);
    expect(moverEnCadena(original, 2, 0)).toEqual(["c", "a", "b"]);
    expect(original).toEqual(["a", "b", "c"]);
  });

  it("un destino fuera de rango o igual devuelve una copia intacta", () => {
    expect(moverEnCadena(["a", "b"], 1, 1)).toEqual(["a", "b"]);
    expect(moverEnCadena(["a", "b"], -1, 0)).toEqual(["a", "b"]);
    expect(moverEnCadena(["a", "b"], 0, 9)).toEqual(["a", "b"]);
    expect(moverEnCadena([], 0, 1)).toEqual([]);
  });
});

describe("modoDeGuardado · PoliGenesis democrático", () => {
  it("en modo democrático guarda una propuesta y en el resto aplica", () => {
    expect(modoDeGuardado(true)).toBe("propuesta");
    expect(modoDeGuardado(false)).toBe("aplicar");
  });
});
