import { describe, it, expect } from "vitest";
import {
  crearEstadoNeuronaSync,
  fusionarCamposNeurona,
  encolarCambioSinEnlace,
  procesarColaSinEnlace,
} from "../sincronia-neurona";

describe("sincronia-neurona: fusión por campo y cola", () => {
  it("fusiona campos remotos siguiendo la regla del timestamp más reciente", () => {
    const estado = crearEstadoNeuronaSync("n1", "a1");
    const remoto = {
      ajuste1: { valor: "nuevo", timestamp: 200, aparatoId: "a2" },
      ajuste2: { valor: "viejo", timestamp: 50, aparatoId: "a2" },
    };
    const estado1 = fusionarCamposNeurona(estado, remoto, "a2");

    const localConMasNuevo = {
      ajuste1: { valor: "actual", timestamp: 100, aparatoId: "a1" },
      ajuste2: { valor: "actual", timestamp: 100, aparatoId: "a1" },
    };
    
    // Simular el estado local antes de fusionar el remoto
    const estadoLocal: any = { ...estado, campos: localConMasNuevo };
    const resultado = fusionarCamposNeurona(estadoLocal, remoto, "a2");

    // ajuste1: remoto(200) > local(100) -> gana remoto
    expect(resultado.campos.ajuste1.valor).toBe("nuevo");
    // ajuste2: local(100) > remoto(50) -> gana local
    expect(resultado.campos.ajuste2.valor).toBe("actual");
  });

  it("protege campos propios del aparato", () => {
    const estado = crearEstadoNeuronaSync("n1", "a1");
    const remoto = {
      aparatoId: { valor: "a2", timestamp: 200, aparatoId: "a2" },
      huella: { valor: "xyz", timestamp: 200, aparatoId: "a2" },
      ajuste1: { valor: "ok", timestamp: 200, aparatoId: "a2" },
    };
    const resultado = fusionarCamposNeurona(estado, remoto, "a2");
    
    expect(resultado.campos.ajuste1).toBeDefined();
    expect(resultado.campos.aparatoId).toBeUndefined();
    expect(resultado.campos.huella).toBeUndefined();
  });

  it("encola cambios cuando no hay enlace", () => {
    const estado = crearEstadoNeuronaSync("n1", "a1");
    const estadoConCambios = encolarCambioSinEnlace(estado, "tema", "oscuro", 1000);
    
    expect(estadoConCambios.colaPendiente.length).toBe(1);
    expect(estadoConCambios.campos.tema.valor).toBe("oscuro");
  });

  it("procesa la cola y devuelve cambios a emitir al restablecer enlace", () => {
    const estado = crearEstadoNeuronaSync("n1", "a1");
    const estadoEncolado = encolarCambioSinEnlace(estado, "tema", "oscuro", 1000);
    const { estadoActualizado, cambiosAEmitir } = procesarColaSinEnlace(estadoEncolado);
    
    expect(estadoActualizado.colaPendiente.length).toBe(0);
    expect(cambiosAEmitir.length).toBe(1);
    expect(cambiosAEmitir[0].valor).toBe("oscuro");
  });
});
