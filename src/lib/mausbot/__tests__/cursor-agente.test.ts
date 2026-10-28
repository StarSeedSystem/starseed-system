// Adaptado de OpenMausBot (Copyright 2026 Milind Soni y colaboradores, Apache-2.0): shared/mascot-bodies.ts, src/components/cursor-face-data.ts

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  puedeActuar,
  __setPermissionsForMock,
  __setSettingsForMock,
  __resetMocks,
  type NivelBot,
} from "../cursor-agente";

describe("cursor-agente · puedeActuar", () => {
  beforeEach(() => {
    __resetMocks();
  });

  afterEach(() => {
    __resetMocks();
  });

  const deviceId = "neuron-test-123";

  function setupPerms(agent: boolean, screenVoice: boolean) {
    __setPermissionsForMock(() => ({ agent, compute: true, storage: true, sync: true, senses: true, wake: true }));
    __setSettingsForMock(() => ({ screenVoice, fileRequests: true, auroraListening: true, role: "ambos" }));
  }

  describe("permisos base (agent / screenVoice)", () => {
    it("devuelve false si permissionsFor.agent es false", () => {
      setupPerms(false, true);
      const res = puedeActuar({ deviceId, nivel: "proponer" });
      expect(res.ok).toBe(false);
      expect(res.motivo).toContain("permiso 'agent' desactivado");
    });

    it("devuelve false si settingsFor.screenVoice es false", () => {
      setupPerms(true, false);
      const res = puedeActuar({ deviceId, nivel: "proponer" });
      expect(res.ok).toBe(false);
      expect(res.motivo).toContain("screenVoice");
    });

    it("devuelve true si ambos permisos están activos", () => {
      setupPerms(true, true);
      const res = puedeActuar({ deviceId, nivel: "proponer" });
      expect(res.ok).toBe(true);
    });
  });

  describe("nivel 'nada'", () => {
    it("siempre devuelve false con motivo", () => {
      setupPerms(true, true);
      const res = puedeActuar({ deviceId, nivel: "nada" });
      expect(res.ok).toBe(false);
      expect(res.motivo).toContain("modo 'nada'");
    });
  });

  describe("nivel 'proponer'", () => {
    it("devuelve ok=true y requiereConfirmacion=true", () => {
      setupPerms(true, true);
      const res = puedeActuar({ deviceId, nivel: "proponer" });
      expect(res.ok).toBe(true);
      expect(res.requiereConfirmacion).toBe(true);
    });

    it("ignora el flag reversible", () => {
      setupPerms(true, true);
      const res = puedeActuar({ deviceId, nivel: "proponer", reversible: true });
      expect(res.ok).toBe(true);
      expect(res.requiereConfirmacion).toBe(true);
    });
  });

  describe("nivel 'aplicar-bajo'", () => {
    it("devuelve ok=true sin confirmación si reversible=true", () => {
      setupPerms(true, true);
      const res = puedeActuar({ deviceId, nivel: "aplicar-bajo", reversible: true });
      expect(res.ok).toBe(true);
      expect(res.requiereConfirmacion).toBe(false);
    });

    it("devuelve ok=true con confirmación si reversible=false", () => {
      setupPerms(true, true);
      const res = puedeActuar({ deviceId, nivel: "aplicar-bajo", reversible: false });
      expect(res.ok).toBe(true);
      expect(res.requiereConfirmacion).toBe(true);
      expect(res.motivo).toContain("no reversible");
    });
  });

  describe("nivel 'aplicar'", () => {
    it("devuelve ok=true sin confirmación", () => {
      setupPerms(true, true);
      const res = puedeActuar({ deviceId, nivel: "aplicar" });
      expect(res.ok).toBe(true);
      expect(res.requiereConfirmacion).toBe(false);
    });

    it("ignora el flag reversible", () => {
      setupPerms(true, true);
      const res = puedeActuar({ deviceId, nivel: "aplicar", reversible: false });
      expect(res.ok).toBe(true);
      expect(res.requiereConfirmacion).toBe(false);
    });
  });

  describe("nivel desconocido", () => {
    it("devuelve false con motivo", () => {
      setupPerms(true, true);
      const res = puedeActuar({ deviceId, nivel: "inventado" as NivelBot });
      expect(res.ok).toBe(false);
      expect(res.motivo).toContain("desconocido");
    });
  });

  describe("combinaciones de los tres niveles y dos permisos", () => {
    const niveles: NivelBot[] = ["proponer", "aplicar-bajo", "aplicar"];
    const permCases = [
      { agent: true, screenVoice: true, label: "ambos activos" },
      { agent: false, screenVoice: true, label: "agent=false" },
      { agent: true, screenVoice: false, label: "screenVoice=false" },
      { agent: false, screenVoice: false, label: "ambos false" },
    ];

    for (const { agent, screenVoice, label } of permCases) {
      for (const nivel of niveles) {
        it(`${nivel} con ${label}`, () => {
          setupPerms(agent, screenVoice);
          const res = puedeActuar({ deviceId, nivel, reversible: true });
          if (!agent || !screenVoice) {
            expect(res.ok).toBe(false);
          } else {
            expect(res.ok).toBe(true);
          }
        });
      }
    }
  });
});