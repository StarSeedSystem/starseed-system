/**
 * Pruebas unitarias para la sincronía instantánea de neuronas entre aparatos (NEU1126F).
 * Cumple estrictamente con las reglas de Vitest (globals: false, sin vi.mock de Node, puras).
 */
import { describe, it, expect } from "vitest";
import {
  fusionarEstadoNeurona,
  encolarCambioSinEnlace,
  procesarColaPendiente,
  esCampoProtegido,
  inventarioSincroniaNeurona,
  type EstadoNeuronaSincronia,
  type CambioPendiente,
} from "../sincronia-neurona";

describe("sincronia-neurona (NEU1126F)", () => {
  const NEURONA_ID = "neurona-alpha-1126";
  const APARATO_MOVIL = "aparato-movil-01";
  const APARATO_TABLET = "aparato-tablet-02";

  it("inventario inicial describe con precisión qué se sincroniza y qué se protege", () => {
    const inv = inventarioSincroniaNeurona();
    expect(inv.sincronizado.length).toBeGreaterThan(0);
    expect(inv.protegido).toContain("clave_control_local");
    expect(inv.reglasClave.length).toBeGreaterThan(0);
  });

  it("protege estrictamente los datos propios del aparato y rechaza sincronizarlos", () => {
    expect(esCampoProtegido("clave_control_local")).toBe(true);
    expect(esCampoProtegido("permisos_sistema")).toBe(true);
    expect(esCampoProtegido("ajustes.tema")).toBe(false);

    const local: EstadoNeuronaSincronia = {
      neuronaId: NEURONA_ID,
      campos: {
        "ajustes.tema": {
          clave: "ajustes.tema",
          valor: "oscuro",
          actualizadoEn: 100,
          porDispositivo: APARATO_MOVIL,
        },
      },
      reloj: 1,
    };

    const remoto: EstadoNeuronaSincronia = {
      neuronaId: NEURONA_ID,
      campos: {
        "clave_control_local": {
          clave: "clave_control_local",
          valor: "secreto-malicioso-ajeno",
          actualizadoEn: 999,
          porDispositivo: APARATO_TABLET,
        },
        "ajustes.tema": {
          clave: "ajustes.tema",
          valor: "claro",
          actualizadoEn: 200,
          porDispositivo: APARATO_TABLET,
        },
      },
      reloj: 2,
    };

    const res = fusionarEstadoNeurona(local, remoto, APARATO_MOVIL);
    // El campo protegido jamás debió pasar al estado fusionado
    expect(res.estado.campos["clave_control_local"]).toBeUndefined();
    // El campo de ajuste normal ganó por fecha más reciente
    expect(res.estado.campos["ajustes.tema"].valor).toBe("claro");
    expect(res.cambiosAplicados).toContain("ajustes.tema");
    expect(res.cambiosAplicados).not.toContain("clave_control_local");
  });

  it("fusiona de forma simétrica por campo y fecha (LWW) con desempate determinista", () => {
    const local: EstadoNeuronaSincronia = {
      neuronaId: NEURONA_ID,
      campos: {
        "nota.md": {
          clave: "nota.md",
          valor: "# Contenido local antiguo",
          actualizadoEn: 100,
          porDispositivo: APARATO_MOVIL,
        },
      },
      reloj: 1,
    };

    const remoto: EstadoNeuronaSincronia = {
      neuronaId: NEURONA_ID,
      campos: {
        "nota.md": {
          clave: "nota.md",
          valor: "# Contenido remoto más reciente",
          actualizadoEn: 500,
          porDispositivo: APARATO_TABLET,
        },
      },
      reloj: 2,
    };

    const res = fusionarEstadoNeurona(local, remoto, APARATO_MOVIL);
    expect(res.estado.campos["nota.md"].valor).toBe("# Contenido remoto más reciente");
    expect(res.conflictos).toHaveLength(0);
  });

  it("maneja correctamente la cola de cambios sin enlace y los procesa al restablecer la conexión", () => {
    const colaInicial: CambioPendiente[] = [];
    const ahora = 1000;
    const cambio = {
      neuronaId: NEURONA_ID,
      campo: {
        clave: "ajustes.volumen",
        valor: 80,
        actualizadoEn: 1000,
        porDispositivo: APARATO_MOVIL,
      },
      creadoEn: ahora,
    };

    // Sin enlace
    const cola1 = encolarCambioSinEnlace(colaInicial, cambio, 1000);
    expect(cola1).toHaveLength(1);

    // Intentar procesar con enlace inactivo
    const procInactivo = procesarColaPendiente(cola1, false);
    expect(procInactivo.paraEmitir).toHaveLength(0);
    expect(procInactivo.colaRestante).toHaveLength(1);

    // Al restablecer el enlace
    const procActivo = procesarColaPendiente(cola1, true);
    expect(procActivo.paraEmitir).toHaveLength(1);
    expect(procActivo.colaRestante).toHaveLength(0);
    expect(procActivo.paraEmitir[0].campo.clave).toBe("ajustes.volumen");
  });
});
