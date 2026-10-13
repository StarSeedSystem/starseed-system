import { describe, it, expect } from "vitest";
import type { Medio } from "../tipos";
import { RecuerdoBot, CUOTA_POR_MEDIO } from "../memoria-bot";

describe("RecuerdoBot (memoria-bot.ts)", () => {
  describe("CUOTA_POR_MEDIO", () => {
    it("tiene los valores correctos por medio", () => {
      expect(CUOTA_POR_MEDIO.web).toBe(5 * 1024 * 1024);
      expect(CUOTA_POR_MEDIO.pwa).toBe(50 * 1024 * 1024);
      expect(CUOTA_POR_MEDIO.nativo).toBe(500 * 1024 * 1024);
      expect(CUOTA_POR_MEDIO.servidor).toBe(2 * 1024 * 1024 * 1024);
      expect(CUOTA_POR_MEDIO.xr).toBe(20 * 1024 * 1024);
    });
  });

  describe("puntuar", () => {
    it("calcula relevancia por usos × recencia", () => {
      const ahora = Date.now();
      const haceUnDia = ahora - 24 * 60 * 60 * 1000;
      const haceCienDias = ahora - 100 * 24 * 60 * 60 * 1000;
      const recuerdoAntiguo = new RecuerdoBot("1", "personal", "texto", "origen", haceCienDias, [], "bot1", 100, 9, false);
      const recuerdoReciente = new RecuerdoBot("2", "personal", "texto", "origen", haceUnDia, [], "bot1", 100, 1, false);
      expect(RecuerdoBot.puntuar(recuerdoReciente, ahora)).toBeGreaterThan(RecuerdoBot.puntuar(recuerdoAntiguo, ahora));
    });
    it("es determinista: mismos inputs dan mismos outputs", () => {
      const ahora = Date.now();
      const recuerdo = new RecuerdoBot("1", "personal", "texto", "origen", ahora - 1000, [], "bot1", 50, 5, false);
      const punt1 = RecuerdoBot.puntuar(recuerdo, ahora);
      const punt2 = RecuerdoBot.puntuar(recuerdo, ahora);
      expect(punt1).toBe(punt2);
    });
    it("maneja casos edge", () => {
      const ahora = Date.now();
      const recuerdoCeroUsos = new RecuerdoBot("1", "personal", "texto", "origen", ahora, [], "bot1", 100, 0, false);
      const recuerdoNormal = new RecuerdoBot("2", "personal", "texto", "origen", ahora, [], "bot1", 100, 5, false);
      const puntCero = RecuerdoBot.puntuar(recuerdoCeroUsos, ahora);
      const puntNormal = RecuerdoBot.puntuar(recuerdoNormal, ahora);
      expect(puntCero).toBe(0);
      expect(puntNormal).toBeGreaterThan(0);
    });
  });

  describe("regular", () => {
    it("respeta la cuota y nunca olvida fijados", () => {
      const ahora = Date.now();
      const cuotaBytes = 1000;
      const recuerdoFijo = new RecuerdoBot("fijo", "personal", "x".repeat(100), "origen", ahora, [], "bot1", 150, 10, true);
      const recuerdoBajoPuntuacion = new RecuerdoBot("bajo", "personal", "y".repeat(50), "origen", ahora - 30*24*60*60*1000, [], "bot1", 100, 1, false);
      const recuerdoAltoPuntuacion = new RecuerdoBot("alto", "personal", "z".repeat(50), "origen", ahora, [], "bot1", 100, 10, false);
      const recuerdos = [recuerdoFijo, recuerdoBajoPuntuacion, recuerdoAltoPuntuacion];
      const resultado = RecuerdoBot.regular(recuerdos, cuotaBytes, ahora);
      const olvidadosIds = resultado.olvidar.map(r => r.id);
      expect(olvidadosIds).not.toContain("fijo");
      const bytesConservar = resultado.conservar.reduce((sum, r) => sum + r.bytes, 0);
      expect(bytesConservar).toBeLessThanOrEqual(cuotaBytes);
      const todosIds = recuerdos.map(r => r.id);
      const conservarIds = resultado.conservar.map(r => r.id);
      const olvidarIds = resultado.olvidar.map(r => r.id);
      expect([...conservarIds, ...olvidarIds].sort()).toEqual(todosIds.sort());
    });
    it("conserva recuerdos fijados incluso cuando exceden cuota", () => {
      const ahora = Date.now();
      const cuotaBytes = 50;
      const recuerdoFijoGrande = new RecuerdoBot("fijo", "personal", "x".repeat(100), "origen", ahora, [], "bot1", 150, 10, true);
      const recuerdoNormal = new RecuerdoBot("normal", "personal", "y".repeat(10), "origen", ahora, [], "bot1", 20, 1, false);
      const recuerdos = [recuerdoFijoGrande, recuerdoNormal];
      const resultado = RecuerdoBot.regular(recuerdos, cuotaBytes, ahora);
      const conservarIds = resultado.conservar.map(r => r.id);
      expect(conservarIds).toContain("fijo");
    });
  });

  describe("planTransferencia", () => {
    it("respeta las reglas de transferencia por alcance", () => {
      const origen = { neurona: "neurona1", cuentaId: "cuenta123" };
      const destinos = [
        { neurona: "destinoA", cuentaId: "cuenta123", tipo: "propia" },
        { neurona: "destinoB", cuentaId: "cuenta456", tipo: "propia" },
        { neurona: "destinoC", cuentaId: "cuenta123", tipo: "grupo" },
        { neurona: "destinoD", cuentaId: "cuenta123", tipo: "servidor-grupo" },
        { neurona: "destinoE", cuentaId: "cuenta999", tipo: "propia" }
      ];
      const recuerdoPersonal = new RecuerdoBot("personal1", "personal", "texto", "origen", Date.now(), [], "bot1", 100, 5, false);
      const planPersonal = RecuerdoBot.planTransferencia([recuerdoPersonal], origen, destinos);
      expect(planPersonal.length).toBe(1);
      expect(planPersonal[0].ids).toEqual(["personal1"]);
      expect(planPersonal[0].destino).toBe(destinos[0]);
      const recuerdoGrupal = new RecuerdoBot("grupal1", "grupo", "texto", "origen", Date.now(), [], "bot1", 100, 5, false);
      const planGrupal = RecuerdoBot.planTransferencia([recuerdoGrupal], origen, destinos);
      expect(planGrupal.length).toBe(1);
      expect(planGrupal[0].ids).toEqual(["grupal1"]);
      expect(planGrupal[0].destino).toBe(destinos[2]);
      const recuerdoPublico = new RecuerdoBot("publico1", "publica", "texto", "origen", Date.now(), [], "bot1", 100, 5, false);
      const planPublico = RecuerdoBot.planTransferencia([recuerdoPublico], origen, destinos);
      expect(planPublico.length).toBe(1);
      expect(planPublico[0].ids).toEqual(["publico1"]);
      expect(destinos).toContainEqual(planPublico[0].destino);
    });
    it("plan vacío sin destinos", () => {
      const origen = { neurona: "neurona1", cuentaId: "cuenta123" };
      const recuerdos = [new RecuerdoBot("1", "personal", "texto", "origen", Date.now(), [], "bot1", 100, 1, false)];
      const plan = RecuerdoBot.planTransferencia(recuerdos, origen, []);
      expect(plan).toEqual([]);
    });
    it("no asigna recuerdo cuando no hay destinos válidos", () => {
      const origen = { neurona: "neurona1", cuentaId: "cuenta123" };
      const destinos = [
        { neurona: "destinoA", cuentaId: "cuenta456", tipo: "propia" },
        { neurona: "destinoB", cuentaId: "cuenta123", tipo: "grupo" }
      ];
      const recuerdoPersonal = new RecuerdoBot("personal1", "personal", "texto", "origen", Date.now(), [], "bot1", 100, 5, false);
      const plan = RecuerdoBot.planTransferencia([recuerdoPersonal], origen, destinos);
      expect(plan).toEqual([]);
    });
    it("nada se duplica dos veces al mismo destino", () => {
      const origen = { neurona: "neurona1", cuentaId: "cuenta123" };
      const destinos = [{ neurona: "destinoA", cuentaId: "cuenta123", tipo: "propia" }];
      const recuerdos = [
        new RecuerdoBot("1", "personal", "texto", "origen", Date.now(), [], "bot1", 100, 1, false),
        new RecuerdoBot("2", "personal", "texto", "origen", Date.now(), [], "bot1", 100, 1, false)
      ];
      const plan = RecuerdoBot.planTransferencia(recuerdos, origen, destinos);
      expect(plan.length).toBe(1);
      expect(plan[0].ids).toHaveLength(2);
      expect(plan[0].ids).toContain("1");
      expect(plan[0].ids).toContain("2");
    });
  });
});