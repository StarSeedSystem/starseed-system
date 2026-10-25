/**
 * Rescate RTCB1013L · peldaños de la escalera de candidatos, adaptado a la API de hoy.
 *
 * La rama nube/40144614377 probaba `peldanoDe` en un `PanelAsignaciones` que main no tiene:
 * el contrato vive ahora en `elegirCandidatos` (`src/lib/genesis/conectores/escalera.ts`),
 * que deduce el peldaño numérico de cada opción del catálogo. Aquí se conserva solo el caso
 * que main aún no cubre (la escalera solo tenía una prueba de lista vacía).
 */
import { describe, expect, it } from "vitest";

import type { OpcionCatalogo } from "@/lib/genesis/conectores/catalogo-opciones";
import {
  elegirCandidatos,
  type OfertaContexto,
  type Preferencias,
  type Tarea,
} from "@/lib/genesis/conectores/escalera";

const LIMITE = {
  rpm: 30,
  porDia: null,
  horasMes: null,
  almacenamientoGb: null,
  nota: "30 peticiones/min",
};

function opcion(id: string, extra: Partial<OpcionCatalogo> = {}): OpcionCatalogo {
  return {
    id,
    nombre: id,
    tipo: "modelo",
    papeles: ["escritor"],
    gratis: LIMITE,
    requiereCuenta: false,
    enlaceAlta: null,
    enlaceClave: null,
    variables: [],
    privacidad: "local",
    licencia: null,
    verificado: null,
    fuente: "prueba",
    ...extra,
  };
}

function oferta(id: string): OfertaContexto {
  return { id, nombre: id, tipo: "modelo", papel: ["escritor"] };
}

function tarea(extra: Partial<Tarea> = {}): Tarea {
  return { papel: "escritor", privado: false, tamano: 100, ...extra };
}

function preferencias(extra: Partial<Preferencias> = {}): Preferencias {
  return { permitirPago: false, topeDiario: null, prohibidos: [], ...extra };
}

describe("elegirCandidatos", () => {
  it("deduce el peldaño de cada opción del catálogo", () => {
    const catalogo = [
      opcion("astraura-158"),
      opcion("nube-gratis"),
      opcion("contenedor-gratis", { tipo: "contenedor" }),
      opcion("proveedor-pago", { tipo: "proveedor", gratis: null }),
    ];
    const resultado = elegirCandidatos({
      tarea: tarea(),
      ofertas: [oferta("astraura-158")],
      catalogo,
      vinculadas: new Set<string>(),
      preferencias: preferencias({ permitirPago: true }),
    });

    const peldano = (id: string) =>
      resultado.find((c) => c.candidatoId === id)?.peldano;
    expect(peldano("astraura-158")).toBe(1);
    expect(peldano("nube-gratis")).toBe(3);
    expect(peldano("contenedor-gratis")).toBe(4);
    expect(peldano("proveedor-pago")).toBe(6);
    expect(resultado.map((c) => c.peldano)).toEqual([1, 3, 4, 6]);
    expect(resultado.find((c) => c.candidatoId === "nube-gratis")?.motivo).toBe(
      "Disponible en la bolsa de la malla",
    );
    expect(resultado.find((c) => c.candidatoId === "proveedor-pago")?.motivo).toBe(
      "Proveedor de pago disponible con permiso",
    );
  });

  it("deja fuera lo de pago sin permiso y lo prohibido", () => {
    const catalogo = [
      opcion("nube-gratis"),
      opcion("prohibida"),
      opcion("proveedor-pago", { tipo: "proveedor", gratis: null }),
    ];
    const resultado = elegirCandidatos({
      tarea: tarea(),
      ofertas: [],
      catalogo,
      vinculadas: new Set<string>(),
      preferencias: preferencias({ prohibidos: ["prohibida"] }),
    });

    expect(resultado.map((c) => c.candidatoId)).toEqual(["nube-gratis"]);
    expect(resultado[0].peldano).toBe(3);
  });
});
