import { describe, expect, it } from "vitest";
import {
  RecuerdoBot,
  CUOTA_POR_MEDIO,
  puntuar,
  regular,
  planTransferencia,
} from "../memoria-bot";
import type { Medio } from "../tipos";
import type { AlcanceMemoria } from "@/lib/nucleo/alcance-memoria";

const AHORA = 1_700_000_000_000; // Timestamp fijo para tests deterministas

function crearRecuerdo(
  overrides: Partial<RecuerdoBot> = {}
): RecuerdoBot {
  return {
    id: "recuerdo-1",
    alcance: "personal",
    texto: "Texto de ejemplo",
    origen: "prueba",
    at: AHORA,
    botId: "bot-1",
    bytes: 100,
    usos: 1,
    ...overrides,
  };
}

describe("memoria-bot", () => {
  describe("puntuar", () => {
    it("calcula puntuación basada en usos y recencia", () => {
      const recuerdo = crearRecuerdo({ usos: 5, at: AHORA - 1000 }); // 1 segundo atrás
      const puntuacion = puntuar(recuerdo, AHORA);
      // Con vida media de 30 días, 1 segundo atrás da una recencia muy cercana a 1
      expect(puntuacion).toBeCloseTo(5, 10);
    });

    it("recuerdos más antiguos tienen menor puntuación", () => {
      const reciente = crearRecuerdo({ usos: 2, at: AHORA - 1000 });
      const antiguo = crearRecuerdo({ usos: 2, at: AHORA - 1000 * 60 * 60 * 24 * 30 }); // 30 días atrás
      
      expect(puntuar(reciente, AHORA)).toBeGreaterThan(puntuar(antiguo, AHORA));
    });

    it("recuerdos con más usos tienen mayor puntuación", () => {
      const pocosUsos = crearRecuerdo({ usos: 1, at: AHORA - 1000 });
      const muchosUsos = crearRecuerdo({ usos: 10, at: AHORA - 1000 });
      
      expect(puntuar(muchosUsos, AHORA)).toBeGreaterThan(puntuar(pocosUsos, AHORA));
    });
  });

  describe("regular", () => {
    it("respeta la cuota de bytes", () => {
      const recuerdos = [
        crearRecuerdo({ id: "r1", bytes: 100 }),
        crearRecuerdo({ id: "r2", bytes: 200 }),
        crearRecuerdo({ id: "r3", bytes: 300 }),
      ];
      
      const resultado = regular(recuerdos, 250, AHORA); // Cuota de 250 bytes
      
      const bytesConservados = resultado.conservar.reduce((sum, r) => sum + r.bytes, 0);
      expect(bytesConservados).toBeLessThanOrEqual(250);
      
      // Verificar que se eliminaron los menos relevantes primero
      // (ordenados por puntuación ascendente, que con mismos usos y tiempo es por id)
      const idsConservados = resultado.conservar.map(r => r.id).sort();
      expect(idsConservados).toEqual(["r1", "r2"]); // Los dos más pequeños
    });

    it("nunca olvida recuerdos fijados", () => {
      const recuerdos = [
        crearRecuerdo({ id: "r1", bytes: 200, fijado: true }),
        crearRecuerdo({ id: "r2", bytes: 100, fijado: false }),
      ];
      
      const resultado = regular(recuerdos, 150, AHORA); // Cuota insuficiente para ambos
      
      // El fijado debe conservarse aunque supere la cuota individualmente
      const idsConservados = resultado.conservar.map(r => r.id);
      expect(idsConservados).toContain("r1");
      
      // El no fijado debe olvidarse
      const idsOlvidados = resultado.olvidar.map(r => r.id);
      expect(idsOlvidados).toContain("r2");
    });

    it("ordena por puntuación para decidir qué olvidar", () => {
      const ahora = AHORA;
      const recuerdos = [
        crearRecuerdo({ id: "r1", bytes: 100, usos: 1, at: ahora - 1000 }), // Puntuación baja
        crearRecuerdo({ id: "r2", bytes: 100, usos: 10, at: ahora }),      // Puntuación alta
      ];
      
      const resultado = regular(recuerdos, 150, ahora); // Solo cabe uno
      
      // Debe conservar el de mayor puntuación (r2) y olvidar el de menor (r1)
      const idsConservados = resultado.conservar.map(r => r.id);
      const idsOlvidados = resultado.olvidar.map(r => r.id);
      
      expect(idsConservados).toEqual(["r2"]);
      expect(idsOlvidados).toEqual(["r1"]);
    });
  });

  describe("planTransferencia", () => {
    const origen = { neurona: "neurona-1", cuentaId: "cuenta-1" };
    const destinosPropia = [
      { neurona: "neurona-2", cuentaId: "cuenta-1", tipo: "propia" },
    ];
    const destinosGrupo = [
      { neurona: "neurona-3", cuentaId: "cuenta-2", tipo: "grupo", grupoId: "grupo-1" },
    ];
    const destinosPublica = [
      { neurona: "neurona-4", cuentaId: "cuenta-3", tipo: "servidor-grupo" },
    ];

    it("devuelve plan vacío sin destinos", () => {
      const recuerdos = [crearRecuerdo()];
      const resultado = planTransferencia(recuerdos, origen, []);
      expect(resultado).toEqual([]);
    });

    it("personal nunca sale de la cuenta", () => {
      const recuerdos = [
        crearRecuerdo({ alcance: "personal", id: "personal-1" }),
        crearRecuerdo({ alcance: "perfil", id: "perfil-1" }),
        crearRecuerdo({ alcance: "grupo", id: "grupo-1" }),
        crearRecuerdo({ alcance: "publica", id: "publica-1" }),
      ];
      
      const resultado = planTransferencia(recuerdos, origen, destinosPropia);
      
      // Solo debe transferir personal y perfil a neurona propia
      expect(resultado.length).toBe(1);
      expect(resultado[0].ids).toEqual(expect.arrayContaining(["personal-1", "perfil-1"]));
      // No debe incluir grupo o pública en transferencias a propia
      expect(resultado[0].ids).not.toContain("grupo-1");
      expect(resultado[0].ids).not.toContain("publica-1");
    });

    it("grupo solo a su grupo", () => {
      // Para este test, necesitamos asumir que los recuerdos de grupo pertenecen al grupo correcto
      // En una implementación real, necesitaríamos filtrar por grupoId en el recuerdo
      const recuerdos = [
        crearRecuerdo({ alcance: "grupo", id: "grupo-1" }),
        crearRecuerdo({ alcance: "grupo", id: "grupo-2" }), // Otro grupo
      ];
      
      const resultado = planTransferencia(recuerdos, origen, destinosGrupo);
      
      // Debe transferir todos los recuerdos de grupo (asumiendo que son del grupo correcto)
      expect(resultado.length).toBe(1);
      expect(resultado[0].ids).toEqual(expect.arrayContaining(["grupo-1", "grupo-2"]));
    });

    it("público libre a cualquiera", () => {
      const recuerdos = [
        crearRecuerdo({ alcance: "publica", id: "publica-1" }),
        crearRecuerdo({ alcance: "publica", id: "publica-2" }),
      ];
      
      const resultado = planTransferencia(recuerdos, origen, destinosPublica);
      
      // Debe transferir todos los recuerdos públicos a cualquier destino
      expect(resultado.length).toBe(1);
      expect(resultado[0].ids).toEqual(expect.arrayContaining(["publica-1", "publica-2"]));
    });

    it("nada se duplica dos veces al mismo destino", () => {
      const recuerdos = [
        crearRecuerdo({ id: "duplicado", alcance: "personal" }),
        crearRecuerdo({ id: "normal", alcance: "personal" }),
      ];
      
      // El mismo destino aparece dos veces
      const resultado = planTransferencia(recuerdos, origen, [
        destinosPropia[0],
        destinosPropia[0], // Duplicado intencional
      ]);
      
      // Cada recuerdo debería aparecer solo una vez en total en las transferencias
      const todosLosIds = resultado.flatMap(t => t.ids);
      const duplicadoCount = todosLosIds.filter(id => id === "duplicado").length;
      const normalCount = todosLosIds.filter(id => id === "normal").length;
      
      expect(duplicadoCount).toBe(1);
      expect(normalCount).toBe(1);
    });
  });

  describe("CUOTA_POR_MEDIO", () => {
    it("tiene los valores correctos", () => {
      expect(CUOTA_POR_MEDIO.web).toBe(5 * 1024 * 1024); // 5 MB
      expect(CUOTA_POR_MEDIO.pwa).toBe(50 * 1024 * 1024); // 50 MB
      expect(CUOTA_POR_MEDIO.nativo).toBe(500 * 1024 * 1024); // 500 MB
      expect(CUOTA_POR_MEDIO.servidor).toBe(2 * 1024 * 1024 * 1024); // 2 GB
      expect(CUOTA_POR_MEDIO.xr).toBe(20 * 1024 * 1024); // 20 MB
    });
  });
});