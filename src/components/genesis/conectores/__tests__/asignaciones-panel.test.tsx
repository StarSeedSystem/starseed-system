import { describe, expect, it } from "vitest";

import type { OpcionCatalogo } from "@/lib/genesis/conectores/catalogo-opciones";
import {
  elegirCandidatos,
  type OfertaContexto,
  type Preferencias,
  type Tarea,
} from "@/lib/genesis/conectores/escalera";

const LIMITE = { rpm: 10, porDia: null, horasMes: null, almacenamientoGb: null, nota: "10 rpm" };

const opcion = (id: string, extra: Partial<OpcionCatalogo> = {}): OpcionCatalogo => ({
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
});

const oferta = (id: string): OfertaContexto => ({ id, nombre: id, tipo: "modelo", papel: ["escritor"] });
const tarea: Tarea = { papel: "escritor", privado: false, tamano: 1000 };
const preferencias = (extra: Partial<Preferencias> = {}): Preferencias => ({
  permitirPago: false,
  topeDiario: null,
  prohibidos: [],
  ...extra,
});

describe("escalera de asignaciones", () => {
  it("deduce el peldaño de cada opción del catálogo sin mutar la entrada", () => {
    const catalogo = [
      opcion("astraura-local"),
      opcion("nube-gratis"),
      opcion("contenedor-gratis", { tipo: "contenedor" }),
      opcion("pago-con-permiso", { tipo: "proveedor", gratis: null }),
    ];
    const copia = structuredClone(catalogo);

    const candidatos = elegirCandidatos({
      tarea,
      ofertas: [oferta("astraura-local")],
      catalogo,
      vinculadas: new Set<string>(),
      preferencias: preferencias({ permitirPago: true }),
    });

    expect(candidatos.map((c) => [c.candidatoId, c.peldano])).toEqual([
      ["astraura-local", 1],
      ["nube-gratis", 3],
      ["contenedor-gratis", 4],
      ["pago-con-permiso", 6],
    ]);
    expect(catalogo).toEqual(copia);
  });
});
