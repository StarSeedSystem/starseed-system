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
  tipo: "proveedor",
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
  it("deduce el peldaño de cada opción: local, malla, contenedor y pago con permiso", () => {
    const catalogo = [
      opcion("astraura-local", { tipo: "modelo", gratis: null }),
      opcion("nube-gratis", { tipo: "modelo" }),
      opcion("contenedor-gratis", { tipo: "contenedor" }),
      opcion("pago-con-permiso", { tipo: "proveedor", gratis: null }),
    ];
    const candidatos = elegirCandidatos({
      tarea,
      ofertas: [oferta("astraura-local")],
      catalogo,
      vinculadas: new Set<string>(),
      preferencias: preferencias({ permitirPago: true }),
    });
    const peldano = new Map(candidatos.map((c) => [c.candidatoId, c.peldano]));
    expect(peldano.get("astraura-local")).toBe(1);
    expect(peldano.get("nube-gratis")).toBe(3);
    expect(peldano.get("contenedor-gratis")).toBe(4);
    expect(peldano.get("pago-con-permiso")).toBe(6);
    expect(candidatos.map((c) => c.candidatoId)).toEqual([
      "astraura-local",
      "nube-gratis",
      "contenedor-gratis",
      "pago-con-permiso",
    ]);
  });

  it("lo privado no entra en la malla y el pago sin permiso no es candidato", () => {
    const catalogo = [
      opcion("nube-gratis", { tipo: "modelo" }),
      opcion("pago-sin-permiso", { tipo: "proveedor", gratis: null }),
    ];
    const candidatos = elegirCandidatos({
      tarea: { ...tarea, privado: true },
      ofertas: [],
      catalogo,
      vinculadas: new Set<string>(),
      preferencias: preferencias(),
    });
    expect(candidatos).toEqual([]);
  });
});
