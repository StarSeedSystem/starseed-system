/**
 * Asignaciones de conectores · casos rescatados de la rama de la nube (RTCB1013L).
 * La API de hoy vive en `src/lib/genesis/conectores/escalera.ts`: el peldaño
 * numérico (1–6) sustituye a la etiqueta que usaba el panel antiguo.
 */
import { describe, expect, it } from "vitest";
import {
  anadirACadena,
  etiquetaDeCadena,
  etiquetaPeldano,
  filasPorDefecto,
  moverEnCadena,
  planDeGuardado,
  preferenciasDe,
  quitarDeCadena,
  restaurarSugeridas,
} from "../asignaciones-panel";
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

describe("panel de asignaciones · helpers puros", () => {
  it("etiqueta cada peldaño con su nombre", () => {
    const peldanos = [1, 2, 3, 4, 5, 6] as const;
    expect(peldanos.map((p) => etiquetaPeldano(p))).toEqual(["local", "local", "malla", "contenedor", "gratis", "pago"]);
  });

  it("etiqueta cada eslabón con su peldaño y motivo, y avisa si no está en el catálogo", () => {
    const candidatos = [{ candidatoId: "local-1", peldano: 3 as const, motivo: "En la malla" }];
    expect(etiquetaDeCadena("local-1", candidatos)).toEqual({ etiqueta: "malla", motivo: "En la malla" });
    expect(etiquetaDeCadena("fuera", candidatos).etiqueta).toBe("sin-catalogar");
  });

  it("ordena, añade sin duplicar y quita de la cadena", () => {
    expect(moverEnCadena(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moverEnCadena(["a"], 2, 0)).toEqual(["a"]);
    expect(anadirACadena(["a"], "b")).toEqual(["a", "b"]);
    expect(anadirACadena(["a"], "a")).toEqual(["a"]);
    expect(quitarDeCadena(["a", "b"], "a")).toEqual(["b"]);
  });

  it("compone una fila por rol y restaura las sugeridas con lo local primero", () => {
    expect(filasPorDefecto([{ clave: "escritor", cadena: ["x", "x", ""] }], ["escritor", "revisor"])).toEqual([
      { clave: "escritor", cadena: ["x"] },
      { clave: "revisor", cadena: [] },
    ]);
    const catalogo = [opcion({ id: "local-1", papeles: ["escritor"] })];
    const ofertas = [{ id: "local-1", nombre: "Local", tipo: "modelo" as const, papel: ["escritor" as const] }];
    expect(restaurarSugeridas(["escritor"], catalogo, ofertas, new Set<string>(), preferenciasDe(false))[0].cadena).toEqual(["local-1"]);
  });
});

describe("panel de asignaciones · guardado", () => {
  it("en PoliGenesis democrático PROPONE y en modo jerárquico aplica", () => {
    expect(planDeGuardado("proponer")).toEqual({
      propone: true,
      etiqueta: "Proponer a votación",
      aviso: "Propuesta creada: la entidad la vota antes de aplicarse.",
    });
    expect(planDeGuardado("aplicar")).toMatchObject({ propone: false, etiqueta: "Guardar" });
  });
});
