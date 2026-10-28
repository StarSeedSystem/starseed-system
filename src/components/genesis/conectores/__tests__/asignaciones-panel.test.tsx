/**
 * Asignaciones de conectores · casos rescatados de la rama de la nube (RTCB1013L).
 * La API de hoy vive en `src/lib/genesis/conectores/escalera.ts`: el peldaño
 * numérico (1–6) sustituye a la etiqueta que usaba el panel antiguo.
 */
import { describe, expect, it } from "vitest";
import type { OpcionCatalogo } from "@/lib/genesis/conectores/catalogo-opciones";
import {
  elegirCandidatos,
  type OfertaContexto,
  type Preferencias,
  type Tarea,
} from "@/lib/genesis/conectores/escalera";

const GRATIS = {
  rpm: 10,
  porDia: null,
  horasMes: null,
  almacenamientoGb: null,
  nota: "10 peticiones/min",
};

function opcion(overrides: Partial<OpcionCatalogo> = {}): OpcionCatalogo {
  return {
    id: overrides.id ?? "opcion",
    nombre: overrides.nombre ?? "Opción",
    tipo: overrides.tipo ?? "proveedor",
    papeles: overrides.papeles ?? ["escritor"],
    gratis: overrides.gratis === undefined ? GRATIS : overrides.gratis,
    requiereCuenta: overrides.requiereCuenta ?? false,
    enlaceAlta: overrides.enlaceAlta ?? null,
    enlaceClave: overrides.enlaceClave ?? null,
    variables: overrides.variables ?? [],
    privacidad: overrides.privacidad ?? "local",
    licencia: overrides.licencia ?? null,
    verificado: overrides.verificado ?? null,
    fuente: overrides.fuente ?? "prueba",
  };
}

const TAREA: Tarea = { papel: "escritor", privado: false, tamano: 1000 };
const CON_PAGO: Preferencias = { permitirPago: true, topeDiario: 5, prohibidos: [] };

describe("elegirCandidatos · peldaño de cada opción", () => {
  it("deduce el peldaño de cada opción del catálogo (local, malla, contenedor y pago)", () => {
    const ofertas: OfertaContexto[] = [
      { id: "astraura-local", nombre: "Astraura local", tipo: "modelo", papel: ["escritor"] },
    ];
    const catalogo = [
      opcion({ id: "astraura-local", tipo: "modelo" }),
      opcion({ id: "pago", gratis: null }),
      opcion({ id: "malla" }),
      opcion({ id: "contenedor", tipo: "contenedor" }),
    ];

    const candidatos = elegirCandidatos({
      tarea: TAREA,
      ofertas,
      catalogo,
      vinculadas: new Set<string>(),
      preferencias: CON_PAGO,
    });

    const peldano = Object.fromEntries(candidatos.map((c) => [c.candidatoId, c.peldano]));
    expect(peldano["astraura-local"]).toBe(1);
    expect(peldano["pago"]).toBe(6);
    expect(peldano["malla"]).toBe(3);
    expect(peldano["contenedor"]).toBe(4);
  });
});
