/**
 * Asignaciones de conectores · casos rescatados de la rama de la nube (RTCB1013L).
 * La API de hoy vive en `src/lib/genesis/conectores/escalera.ts`: el peldaño
 * numérico (1–6) sustituye a la etiqueta que usaba el panel antiguo.
 */
import { describe, expect, it } from "vitest";
import type { OpcionCatalogo } from "@/lib/genesis/conectores/catalogo-opciones";
import type { GrupoSugerencias } from "@/lib/genesis/conectores/sugerir";
import {
  elegirCandidatos,
  type OfertaContexto,
  type Preferencias,
  type Tarea,
} from "@/lib/genesis/conectores/escalera";
import {
  cadenaDeFila,
  etiquetaPeldano,
  modoDeGuardado,
  moverCadena,
  anadirACadena,
  peldanoDeOpcion,
  quitarDeCadena,
  sugeridasPorDefecto,
  textoDeGuardado,
  type Peldano,
} from "../asignaciones-panel";

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

describe("asignaciones-panel · peldaños y motivos", () => {
  it("nombra las cinco etiquetas del contrato y clasifica el catálogo", () => {
    expect([1, 2, 3, 4, 5, 6].map((p) => etiquetaPeldano(p as Peldano))).toEqual(["Local", "Local", "Malla", "Contenedor", "Gratis", "Pago"]);
    expect(peldanoDeOpcion(opcion({ tipo: "contenedor" }))).toBe(4);
    expect(peldanoDeOpcion(opcion({ privacidad: "local" }))).toBe(1);
    expect(peldanoDeOpcion(opcion({ gratis: null, privacidad: "nube-con-retencion" }))).toBe(6);
    expect(peldanoDeOpcion(opcion({ privacidad: "nube-sin-retencion", requiereCuenta: true }))).toBe(5);
    expect(peldanoDeOpcion(opcion({ privacidad: "nube-sin-retencion", requiereCuenta: false }))).toBe(3);
  });
  it("mueve, añade sin duplicar y quita de la cadena", () => {
    expect(moverCadena(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moverCadena(["a", "b"], 1, 0)).toEqual(["b", "a"]);
    expect(moverCadena(["a", "b"], 0, 5)).toEqual(["a", "b"]);
    expect(anadirACadena(["a"], "b")).toEqual(["a", "b"]);
    expect(anadirACadena(["a"], "a")).toEqual(["a"]);
    expect(quitarDeCadena(["a", "b", "a"], "a")).toEqual(["b"]);
  });

  it("restaura la sugerencia del ámbito y cae al orden por defecto para un director", () => {
    const catalogo = [opcion({ id: "pago-1", gratis: null, privacidad: "nube-con-retencion" }), opcion({ id: "local-1", privacidad: "local" }), opcion({ id: "gratis-1", privacidad: "nube-sin-retencion" })];
    expect(sugeridasPorDefecto(catalogo)).toEqual(["local-1", "gratis-1", "pago-1"]);
    const sugerencias: GrupoSugerencias[] = [
      { clave: "local-por-activar", titulo: "Local", opciones: [{ id: "charla-local", nombre: "Charla", tipo: "modelo", papeles: ["chat"], enlaceAlta: null, enlaceClave: null, limite: null, verificado: null, privacidad: "local", variables: [], motivo: "Local" }] },
      { clave: "sin-opcion", titulo: "Sin opción", papeles: [] },
    ];
    expect(cadenaDeFila("chat", sugerencias, catalogo)).toEqual(["charla-local"]);
    expect(cadenaDeFila("diseno", sugerencias, catalogo)).toEqual(["local-1", "gratis-1", "pago-1"]);
  });

  it("en PoliGenesis democrático guardar propone y nunca aplica", () => {
    expect(modoDeGuardado(true)).toBe("proponer");
    expect(modoDeGuardado(false)).toBe("aplicar");
    expect(textoDeGuardado("proponer")).toMatch(/vota/);
    expect(textoDeGuardado("aplicar")).toMatch(/guardadas/);
  });
});
