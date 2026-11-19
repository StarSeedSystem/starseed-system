import { describe, it, expect } from "vitest";
import {
  tipoTransferenciaValido,
  crearSolicitudAceptacion,
  evaluarAceptacionAutomatica,
  decidirAceptacion,
  type TransferenciaEntrante,
  type SolicitudAceptacion,
  type NeuronaReconocida,
  type DecisionAceptacion,
} from "../aceptacion";

describe("aceptacion.ts — reglas de aceptación de transferencias", () => {
  const neuronaConocida: NeuronaReconocida = {
    id: "neurona-1",
    nombre: "MacBook Pro de Alex",
    aceptacionAutomatica: true,
    fingerprint: "fp-abc123",
  };

  const neuronaDesconocida: NeuronaReconocida = {
    id: "neurona-2",
    nombre: "Dispositivo desconocido",
    aceptacionAutomatica: false,
    fingerprint: "fp-xyz789",
  };

  const transferenciaArchivo: TransferenciaEntrante = {
    id: "tx-1",
    tipo: "archivo",
    nombre: "documento.pdf",
    tamaño: 1024 * 1024, // 1 MB
    tipoReal: "application/pdf",
    extension: ".pdf",
    neuronaOrigen: "neurona-1",
    medio: "mesh",
    fingerprintOrigen: "fp-abc123",
    timestamp: Date.now(),
  };

  const transferenciaCarpeta: TransferenciaEntrante = {
    id: "tx-2",
    tipo: "carpeta",
    nombre: "proyecto",
    tamaño: 50 * 1024 * 1024, // 50 MB
    tipoReal: "application/zip",
    extension: ".zip",
    neuronaOrigen: "neurona-2",
    medio: "wifi",
    fingerprintOrigen: "fp-xyz789",
    timestamp: Date.now(),
  };

  const transferenciaSincronizacion: TransferenciaEntrante = {
    id: "tx-3",
    tipo: "sincronizacion-cerebro",
    nombre: "cerebro-backup",
    tamaño: 100 * 1024 * 1024, // 100 MB
    tipoReal: "application/x-starseed-brain",
    extension: ".starseed-brain",
    neuronaOrigen: "neurona-1",
    medio: "syncthing",
    fingerprintOrigen: "fp-abc123",
    timestamp: Date.now(),
  };

  describe("tipoTransferenciaValido", () => {
    it("acepta 'archivo' como tipo válido", () => {
      expect(tipoTransferenciaValido("archivo")).toBe(true);
    });

    it("acepta 'carpeta' como tipo válido", () => {
      expect(tipoTransferenciaValido("carpeta")).toBe(true);
    });

    it("acepta 'sincronizacion-cerebro' como tipo válido", () => {
      expect(tipoTransferenciaValido("sincronizacion-cerebro")).toBe(true);
    });

    it("rechaza tipos desconocidos", () => {
      expect(tipoTransferenciaValido("desconocido")).toBe(false);
      expect(tipoTransferenciaValido("")).toBe(false);
    });
  });

  describe("crearSolicitudAceptacion", () => {
    it("crea una solicitud con todos los campos requeridos para un archivo", () => {
      const solicitud = crearSolicitudAceptacion(transferenciaArchivo);

      expect(solicitud.id).toBe("tx-1");
      expect(solicitud.tipo).toBe("archivo");
      expect(solicitud.nombre).toBe("documento.pdf");
      expect(solicitud.tamaño).toBe(1024 * 1024);
      expect(solicitud.tipoReal).toBe("application/pdf");
      expect(solicitud.extension).toBe(".pdf");
      expect(solicitud.neuronaOrigen).toBe("neurona-1");
      expect(solicitud.medio).toBe("mesh");
      expect(solicitud.fingerprintOrigen).toBe("fp-abc123");
      expect(solicitud.timestamp).toBe(transferenciaArchivo.timestamp);
      expect(solicitud.requiereConfirmacion).toBe(true);
    });

    it("crea una solicitud para una carpeta", () => {
      const solicitud = crearSolicitudAceptacion(transferenciaCarpeta);

      expect(solicitud.tipo).toBe("carpeta");
      expect(solicitud.nombre).toBe("proyecto");
      expect(solicitud.requiereConfirmacion).toBe(true);
    });

    it("crea una solicitud para sincronización de cerebro", () => {
      const solicitud = crearSolicitudAceptacion(transferenciaSincronizacion);

      expect(solicitud.tipo).toBe("sincronizacion-cerebro");
      expect(solicitud.nombre).toBe("cerebro-backup");
      expect(solicitud.requiereConfirmacion).toBe(true);
    });
  });

  describe("evaluarAceptacionAutomatica", () => {
    it("devuelve true si la neurona está reconocida y tiene aceptación automática activada", () => {
      const resultado = evaluarAceptacionAutomatica(transferenciaArchivo, [neuronaConocida]);

      expect(resultado).toBe(true);
    });

    it("devuelve false si la neurona está reconocida pero NO tiene aceptación automática", () => {
      const neuronaSinAuto: NeuronaReconocida = {
        ...neuronaConocida,
        aceptacionAutomatica: false,
      };
      const resultado = evaluarAceptacionAutomatica(transferenciaArchivo, [neuronaSinAuto]);

      expect(resultado).toBe(false);
    });

    it("devuelve false si la neurona NO está reconocida (aunque coincida el fingerprint)", () => {
      const transferenciaDeDesconocida: TransferenciaEntrante = {
        ...transferenciaArchivo,
        neuronaOrigen: "neurona-999",
        fingerprintOrigen: "fp-desconocido",
      };
      const resultado = evaluarAceptacionAutomatica(transferenciaDeDesconocida, [neuronaConocida]);

      expect(resultado).toBe(false);
    });

    it("devuelve false si no hay neuronas reconocidas configuradas", () => {
      const resultado = evaluarAceptacionAutomatica(transferenciaArchivo, []);

      expect(resultado).toBe(false);
    });

    it("devuelve false si el fingerprint no coincide con la neurona reconocida", () => {
      const transferenciaFalsoFingerprint: TransferenciaEntrante = {
        ...transferenciaArchivo,
        fingerprintOrigen: "fp-falso",
      };
      const resultado = evaluarAceptacionAutomatica(transferenciaFalsoFingerprint, [neuronaConocida]);

      expect(resultado).toBe(false);
    });
  });

  describe("decidirAceptacion", () => {
    it("acepta automáticamente si la neurona tiene aceptación automática activada", () => {
      const decision = decidirAceptacion(transferenciaArchivo, [neuronaConocida], null);

      expect(decision.aceptada).toBe(true);
      expect(decision.motivo).toBe("neurona-reconocida-auto");
      expect(decision.porConfirmacionManual).toBe(false);
    });

    it("requiere confirmación manual si la neurona está reconocida pero sin auto-aceptación", () => {
      const neuronaSinAuto: NeuronaReconocida = {
        ...neuronaConocida,
        aceptacionAutomatica: false,
      };
      const decision = decidirAceptacion(transferenciaArchivo, [neuronaSinAuto], null);

      expect(decision.aceptada).toBe(false);
      expect(decision.motivo).toBe("requiere-confirmacion");
      expect(decision.porConfirmacionManual).toBe(true);
      expect(decision.solicitud).toBeDefined();
    });

    it("requiere confirmación manual para neuronas desconocidas (nunca auto-acepta)", () => {
      const decision = decidirAceptacion(transferenciaCarpeta, [neuronaConocida], null);

      expect(decision.aceptada).toBe(false);
      expect(decision.motivo).toBe("neurona-desconocida");
      expect(decision.porConfirmacionManual).toBe(true);
      expect(decision.solicitud).toBeDefined();
    });

    it("respeta la decisión manual del usuario cuando se proporciona", () => {
      const decisionAceptar = decidirAceptacion(transferenciaCarpeta, [neuronaConocida], true);
      const decisionRechazar = decidirAceptacion(transferenciaCarpeta, [neuronaConocida], false);

      expect(decisionAceptar.aceptada).toBe(true);
      expect(decisionAceptar.motivo).toBe("confirmacion-manual-aceptar");
      expect(decisionAceptar.porConfirmacionManual).toBe(true);

      expect(decisionRechazar.aceptada).toBe(false);
      expect(decisionRechazar.motivo).toBe("confirmacion-manual-rechazar");
      expect(decisionRechazar.porConfirmacionManual).toBe(true);
    });

    it("incluye la solicitud completa en la decisión cuando requiere confirmación", () => {
      const transferenciaDeDesconocida: TransferenciaEntrante = {
        ...transferenciaArchivo,
        neuronaOrigen: "neurona-2",
        fingerprintOrigen: "fp-xyz789",
      };
      const decision = decidirAceptacion(transferenciaDeDesconocida, [neuronaDesconocida], null);

      expect(decision.solicitud).toBeDefined();
      expect(decision.solicitud?.id).toBe("tx-1");
      expect(decision.solicitud?.nombre).toBe("documento.pdf");
      expect(decision.solicitud?.tipoReal).toBe("application/pdf");
      expect(decision.solicitud?.neuronaOrigen).toBe("neurona-2");
    });
  });
});