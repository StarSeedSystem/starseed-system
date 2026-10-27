/**
 * Peldaños de la escalera de conectores (GCA1019N) — caso de la rama adaptado a
 * la API de hoy. Main no tiene el panel ni `peldanoDe`: el contrato vigente es
 * `elegirCandidatos`, que deduce el peldaño cruzando la tarea, las ofertas del
 * ámbito, el catálogo y las preferencias. Se conserva la garantía que sigue en
 * pie: local primero, lo gratuito después, el contenedor del ámbito y el pago
 * solo con permiso. PURO: sin red, disco ni procesos.
 */
import { describe, expect, it } from "vitest";
import type { OpcionCatalogo } from "@/lib/genesis/conectores/catalogo-opciones";
import {
  elegirCandidatos,
  type OfertaContexto,
  type Preferencias,
  type Tarea,
} from "@/lib/genesis/conectores/escalera";

const LIMITE = { rpm: 30, porDia: null, horasMes: null, almacenamientoGb: null, nota: "30/min" };

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
    privacidad: "nube-sin-retencion",
    licencia: null,
    verificado: null,
    fuente: "prueba",
    ...extra,
  };
}

function oferta(id: string): OfertaContexto {
  return { id, nombre: id, tipo: "modelo", papel: ["escritor"] };
}

const tarea: Tarea = { papel: "escritor", privado: false, tamano: 1000 };
const preferencias = (extra: Partial<Preferencias> = {}): Preferencias => ({
  permitirPago: false,
  topeDiario: null,
  prohibidos: [],
  ...extra,
});

describe("peldaños de elegirCandidatos", () => {
  it("deduce el peldaño de cada opción del catálogo sin mutar la entrada", () => {
    const catalogo = [
      opcion("astraura-158-local", { gratis: null, privacidad: "local" }),
      opcion("nube-gratis"),
      opcion("contenedor-gratis", { tipo: "contenedor" }),
      opcion("pago-con-permiso", { tipo: "proveedor", gratis: null }),
    ];
    const copia = JSON.parse(JSON.stringify(catalogo)) as OpcionCatalogo[];

    const candidatos = elegirCandidatos({
      tarea,
      ofertas: [oferta("astraura-158-local")],
      catalogo,
      vinculadas: new Set<string>(),
      preferencias: preferencias({ permitirPago: true }),
    });

    expect(candidatos.map((c) => [c.candidatoId, c.peldano])).toEqual([
      ["astraura-158-local", 1],
      ["nube-gratis", 3],
      ["contenedor-gratis", 4],
      ["pago-con-permiso", 6],
    ]);
    expect(candidatos.find((c) => c.candidatoId === "astraura-158-local")?.motivo).toContain("Astraura");
    expect(candidatos.find((c) => c.candidatoId === "nube-gratis")?.motivo).toContain("malla");
    expect(candidatos.find((c) => c.candidatoId === "contenedor-gratis")?.motivo).toContain("Contenedor");
    expect(candidatos.find((c) => c.candidatoId === "pago-con-permiso")?.motivo).toContain("pago");
    expect(catalogo).toEqual(copia);
  });
});
