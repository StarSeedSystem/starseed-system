import { describe, expect, it } from "vitest";
import {
  elementoDeOperacion,
  elementoDeEstructura,
  moleculaDesdeElementos,
  crearAcumuladorDeGestos,
  formaCorta,
  desdeFormaCorta,
} from "../sesion-sincronia";
import type { Operacion, Cambio, Accion, Autor, ParametroRef } from "./tipos";
import type { ElementoSala } from "@/lib/salas/sincronia-sala";
import type { Molecula } from "./tipos";

const autor: Autor = { tipo: "persona", id: "usuario1" };
const ref: ParametroRef = { atomoId: "ato1", parametroId: "volumen" };

describe("elementoDeOperacion", () => {
  it("crea ElementoSala correctamente para operación exacta", () => {
    const op: Operacion = {
      id: "op1",
      objetivo: ref,
      accion: { tipo: "exacta", valor: 0.5 },
      autor,
      origen: "mano",
      t: 1000,
    };
    const cambio: Cambio = {
      operacion: op,
      antes: 0,
      despues: 0.5,
      acotado: false,
      reversible: true,
    };

    const resultado = elementoDeOperacion(op, cambio);
    
    expect(resultado.tipo).toBe("parametro");
    expect(resultado.id).toBe("ato1::volumen");
    expect(resultado.datos.valor).toBe(0.5);
    expect(resultado.datos.antes).toBe(0);
    expect(resultado.datos.acotado).toBe(false);
    expect(resultado.actualizadoEn).toBe(1000);
    expect(resultado.porDispositivo).toBe("usuario1");
    expect(resultado.borrado).toBe(false);
  });

  it("maneja valores booleanos correctamente", () => {
    const op: Operacion = {
      id: "op2",
      objetivo: { atomoId: "ato2", parametroId: "eco" },
      accion: { tipo: "exacta", valor: true },
      autor,
      origen: "mano",
      t: 2000,
    };
    const cambio: Cambio = {
      operacion: op,
      antes: false,
      despues: true,
      acotado: false,
      reversible: true,
    };

    const resultado = elementoDeOperacion(op, cambio);
    expect(resultado.datos.valor).toBe(true);
  });
});

describe("elementoDeEstructura", () => {
  it("crea ElementoSala para capa", () => {
    const resultado = elementoDeEstructura(
      "capa",
      "capa1",
      1.5,
      false,
      1000,
      "usuario1"
    );
    
    expect(resultado.tipo).toBe("capa");
    expect(resultado.id).toBe("capa1");
    expect(resultado.datos.orden).toBe(1.5);
    expect(resultado.borrado).toBe(false);
  });

  it("crea ElementoSala para átomo", () => {
    const resultado = elementoDeEstructura(
      "atomo",
      "ato1",
      undefined,
      false,
      1000,
      "usuario1"
    );
    
    expect(resultado.tipo).toBe("atomo");
    expect(resultado.id).toBe("ato1");
    expect(resultado.datos.orden).toBeNull();
    expect(resultado.borrado).toBe(false);
  });

  it("maneja lápida correctamente", () => {
    const resultado = elementoDeEstructura(
      "capa",
      "capa1",
      1.0,
      true,
      2000,
      "usuario2"
    );
    
    expect(resultado.borrado).toBe(true);
    expect(resultado.porDispositivo).toBe("usuario2");
  });
});

describe("formaCorta y desdeFormaCorta", () => {
it("codifica y decodifica operación exacta con número", () => {
  const op: Operacion = {
    id: "op1",
    objetivo: ref,
    accion: { tipo: "exacta", valor: 42.5 },
    autor,
    origen: "mano",
    t: 1000,
  };

  const corta = formaCorta(op);
  // console.log('corta:', corta); // Debugging
  expect(typeof corta).toBe("string");
  expect(corta.length).toBeLessThan(200); // Requisito LoRa
  
  const reconstructo = desdeFormaCorta(corta);
  // console.log('reconstructo:', reconstructo); // Debugging
  expect(reconstructo).not.toBeNull();
  if (reconstructo) {
    expect(reconstructo.objetivo).toEqual(ref);
    expect(reconstructo.accion.tipo).toBe("exacta");
    expect(reconstructo.accion.valor).toBe(42.5);
  }
});

  it("codifica y decodifica operación exacta con booleano", () => {
    const op: Operacion = {
      id: "op2",
      objetivo: { atomoId: "ato2", parametroId: "eco" },
      accion: { tipo: "exacta", valor: true },
      autor,
      origen: "mano",
      t: 2000,
    };

    const corta = formaCorta(op);
    const reconstructo = desdeFormaCorta(corta);
    expect(reconstructo).not.toBeNull();
    if (reconstructo) {
      expect(reconstructo.accion.valor).toBe(true);
    }
  });

  it("codifica y decodifica operación relativa", () => {
    const op: Operacion = {
      id: "op3",
      objetivo: ref,
      accion: { tipo: "relativa", cantidad: -5.5, modo: "delta" },
      autor,
      origen: "mano",
      t: 3000,
    };

    const corta = formaCorta(op);
    const reconstructo = desdeFormaCorta(corta);
    expect(reconstructo).not.toBeNull();
    if (reconstructo) {
      expect(reconstructo.accion.tipo).toBe("relativa");
      expect(reconstructo.accion.cantidad).toBe(-5.5);
      expect(reconstructo.accion.modo).toBe("delta");
    }
  });

  it("maneja alternar y disparo", () => {
    const opAlternar: Operacion = {
      id: "op4",
      objetivo: { atomoId: "ato3", parametroId: "interruptor" },
      accion: { tipo: "alternar" },
      autor,
      origen: "mano",
      t: 4000,
    };

    const cortaAlternar = formaCorta(opAlternar);
    const reconstructoAlternar = desdeFormaCorta(cortaAlternar);
    expect(reconstructoAlternar).not.toBeNull();
    if (reconstructoAlternar) {
      expect(reconstructoAlternar.accion.tipo).toBe("alternar");
    }

    const opDisparo: Operacion = {
      id: "op5",
      objetivo: { atomoId: "ato4", parametroId: "boton" },
      accion: { tipo: "disparo" },
      autor,
      origen: "mano",
      t: 5000,
    };

    const cortaDisparo = formaCorta(opDisparo);
    const reconstructoDisparo = desdeFormaCorta(cortaDisparo);
    expect(reconstructoDisparo).not.toBeNull();
    if (reconstructoDisparo) {
      expect(reconstructoDisparo.accion.tipo).toBe("disparo");
    }
  });

  it("rechaza formato inválido", () => {
    expect(desdeFormaCorta("")).toBeNull();
    expect(desdeFormaCorta("E:ato1::vol")).toBeNull(); // Falta partes
    expect(desdeFormaCorta("X:ato1::vol:valor")).toBeNull(); // Acción desconocida
  });
});

describe("crearAcumuladorDeGestos", () => {
  it("emite valores efímeros cada 16ms", () => {
    const acumulador = crearAcumuladorDeGestos({ cadaMs: 16 });
    let llamadas = 0;
    
    // Primera llamada - inicia el gesto
    const resultado1 = acumulador(10, 0, false);
    llamadas++;
    expect(resultado1).toBeNull(); // Primera llamada no emite
    
    // Segunda llamada a los 10ms - aún no hay 16ms
    const resultado2 = acumulador(15, 10, false);
    llamadas++;
    expect(resultado2).toBeNull();
    
    // Tercera llamada a los 20ms - ya pasaron 20ms desde el inicio (>16ms)
    const resultado3 = acumulador(20, 20, false);
    llamadas++;
    expect(resultado3).not.toBeNull();
    if (resultado3) {
      expect(resultado3.tipo).toBe("gesto");
      expect(resultado3.datos.valor).toBe(20);
      expect(resultado3.actualizadoEn).toBe(20);
    }
    
    // Cuarta llamada a los 25ms - solo han pasado 5ms desde la última emisión
    const resultado4 = acumulador(25, 25, false);
    llamadas++;
    expect(resultado4).toBeNull(); // No debería emitir aún
    
    // Quinta llamada a los 36ms - 20+16=36, debería emitir
    const resultado5 = acumulador(30, 36, false);
    llamadas++;
    expect(resultado5).not.toBeNull();
    if (resultado5) {
      expect(resultado5.datos.valor).toBe(30);
    }
    
    expect(llamadas).toBe(5);
  });

  it("envía confirmación al finalizar", () => {
    const acumulador = crearAcumuladorDeGestos();
    
    // Iniciamos gesto
    acumulador(10, 0, false);
    
    // Enviamos algunos puntos
    acumulador(15, 10, false);
    acumulador(20, 20, false);
    
    // Finalizamos el gesto
    const resultado = acumulador(20, 30, true);
    expect(resultado).toBeNull(); // Al finalizar, retorna null (la confirmación va por otro canal)
  });
});

describe("moleculaDesdeElementos", () => {
  it("maneja caso básico", () => {
    const base: Molecula = {
      id: "mol1",
      titulo: "Molecula de prueba",
      ambito: "personal",
      capas: [],
      atomos: [],
      valores: {},
      version: 1,
      creadaEn: 1000,
      actualizadaEn: 1000,
    };
    
    const elementos: ElementoSala[] = [
      elementoDeEstructura("capa", "capa1", 1.0, false, 2000, "usuario1"),
    ];
    
    const resultado = moleculaDesdeElementos(base, elementos);
    expect(resultado).toBeDefined();
    expect(resultado.id).toBe("mol1");
    // En una implementación completa, verificaríamos que la molécula se actualizó correctamente
    // Por ahora, solo nos aseguramos de que no lance excepciones y devuelve algo
  });
});