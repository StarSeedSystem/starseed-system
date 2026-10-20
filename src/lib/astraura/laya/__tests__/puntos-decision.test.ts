import { describe, it, expect } from "vitest";
import { PUNTOS_DECISION_LAYA, validarPuntos, PuntoDecision, CapaLaya, AccionSiDuda, NivelPrivacidadLaya } from "../puntos-decision";

describe("Puntos de decisión de Laya", () => {
  describe("validarPuntos", () => {
    it("debe validar correctamente el catálogo por defecto", () => {
      const resultado = validarPuntos();
      expect(resultado.valido).toBe(true);
      expect(resultado.errores).toHaveLength(0);
    });

    it("debe detectar IDs duplicados", () => {
      const puntosConDuplicado: PuntoDecision[] = [
        ...PUNTOS_DECISION_LAYA,
        { ...PUNTOS_DECISION_LAYA[0], id: "duplicado" },
        { ...PUNTOS_DECISION_LAYA[1], id: "duplicado" }
      ];
      
      const resultado = validarPuntos(puntosConDuplicado);
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain("ID duplicado: duplicado");
    });

    it("debe detectar umbrales fuera de rango", () => {
      const puntosConUmbralInvalido: PuntoDecision[] = [
        { ...PUNTOS_DECISION_LAYA[0], umbral: -0.1 },
        { ...PUNTOS_DECISION_LAYA[1], umbral: 1.5 }
      ];
      
      const resultado = validarPuntos(puntosConUmbralInvalido);
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain("Umbral fuera de rango [0,1] para reflejo.herramienta: -0.1");
      expect(resultado.errores).toContain("Umbral fuera de rango [0,1] para plan.dificultad: 1.5");
    });

    it("debe detectar preguntas 'choice' sin criterios", () => {
      const puntosSinCriterios: PuntoDecision[] = [
        { 
          ...PUNTOS_DECISION_LAYA[0], 
          preguntas: {
            ...PUNTOS_DECISION_LAYA[0].preguntas,
            herramienta: {
              ...PUNTOS_DECISION_LAYA[0].preguntas.herramienta,
              criteria: undefined
            }
          } 
        }
      ];
      
      const resultado = validarPuntos(puntosSinCriterios);
      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toContain("Pregunta 'choice' sin criterios: reflejo.herramienta.herramienta");
    });
  });

  describe("estructura de puntos de decisión", () => {
    it("debe tener todos los IDs esperados", () => {
      const idsEsperados = [
        "reflejo.herramienta",
        "plan.dificultad", 
        "respuesta.basta",
        "basico.consenso",
        "habilidad.elegir",
        "publicar.moderar",
        "privacidad.subir",
        "voz.tono",
        "video.intencion",
        "enjambre.medio"
      ];
      
      const idsActuales = PUNTOS_DECISION_LAYA.map(p => p.id);
      expect(idsActuales).toEqual(idsEsperados);
    });

    it("debe tener capas válidas", () => {
      const capasValidas: CapaLaya[] = [
        "reflejo",
        "planificador", 
        "respuesta-modelo",
        "decision-basica",
        "habilidad",
        "moderacion",
        "privacidad",
        "voz-video",
        "enjambre"
      ];
      
      for (const punto of PUNTOS_DECISION_LAYA) {
        expect(capasValidas).toContain(punto.capa);
      }
    });

    it("debe tener acciones de duda válidas", () => {
      const accionesValidas: AccionSiDuda[] = [
        "escalar",
        "confirmar", 
        "regla",
        "revisar",
        "orden-deterministico"
      ];
      
      for (const punto of PUNTOS_DECISION_LAYA) {
        expect(accionesValidas).toContain(punto.siDuda);
      }
    });

    it("debe tener niveles de privacidad válidos", () => {
      const privacidadesValidas: NivelPrivacidadLaya[] = [
        "puede-salir",
        "solo-propias"
      ];
      
      for (const punto of PUNTOS_DECISION_LAYA) {
        expect(privacidadesValidas).toContain(punto.privacidad);
      }
    });

    it("debe tener umbrales en rango válido", () => {
      for (const punto of PUNTOS_DECISION_LAYA) {
        if (punto.umbral !== undefined) {
          expect(punto.umbral).toBeGreaterThanOrEqual(0);
          expect(punto.umbral).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe("valores específicos de puntos", () => {
    it("reflejo.herramienta debe tener los criterios correctos", () => {
      const punto = PUNTOS_DECISION_LAYA.find(p => p.id === "reflejo.herramienta");
      expect(punto).toBeDefined();
      
      if (punto) {
        const pregunta = punto.preguntas.herramienta;
        expect(pregunta.type).toBe("choice");
        expect(pregunta.instructions).toContain("herramienta");
        expect(pregunta.criteria).toBeDefined();
        
        if (pregunta.criteria) {
          expect(Object.keys(pregunta.criteria)).toContain("buscar");
          expect(Object.keys(pregunta.criteria)).toContain("calcular");
          expect(Object.keys(pregunta.criteria)).toContain("comunicar");
        }
      }
    });

    it("privacidad.subir debe tener alto umbral", () => {
      const punto = PUNTOS_DECISION_LAYA.find(p => p.id === "privacidad.subir");
      expect(punto).toBeDefined();
      expect(punto.umbral).toBe(0.8);
    });

    it("publicar.moderar debe tener siDuda como 'revisar'", () => {
      const punto = PUNTOS_DECISION_LAYA.find(p => p.id === "publicar.moderar");
      expect(punto).toBeDefined();
      expect(punto.siDuda).toBe("revisar");
    });
  });
});