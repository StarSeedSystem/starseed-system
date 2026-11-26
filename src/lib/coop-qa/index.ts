/**
 * Biblioteca coop-qa · Pruebas automatizadas de co-op para StarSeed OS
 *
 * Provee oráculos de coherencia y utilidades para validar la sincronización
 * multijugador sin necesidad de pruebas manuales.
 */

export interface OraculoResultado {
  ok: boolean;
  error?: string;
  detalle?: string;
}

export interface EstadoSalaSync {
  salaId: string;
  reloj: number;
  objetos: Record<string, ObjSync>;
  jugadores: Record<string, JugadorSync>;
}

export interface ObjSync {
  id: string;
  tipo: string;
  propietario: string | null;
  epoch: number;
  posicion?: { x: number; y: number };
  salud?: number;
  borrado?: boolean;
}

export interface JugadorSync {
  id: string;
  nombre: string;
  posicion?: { x: number; y: number };
  inventario: string[];
  salud: number;
}

export interface TestCoopResult {
  pass: number;
  fail: number;
  errores: string[];
  resultado: "PASS" | "FAIL";
}

export const invariantesCriticas = {
  unPropietarioPorObjeto: (estado: EstadoSalaSync): OraculoResultado => {
    const contadores = new Map<string, string[]>();
    for (const obj of Object.values(estado.objetos)) {
      if (obj.borrado) continue;
      if (!obj.propietario) continue;
      const existentes = contadores.get(obj.propietario) || [];
      existentes.push(obj.id);
      contadores.set(obj.propietario, existentes);
    }
    for (const [propietario, objetos] of contadores) {
      if (objetos.length > 1) {
        return {
          ok: false,
          error: `Propietario duplicado: ${propietario} posee ${objetos.length} objetos simultáneamente`,
          detalle: objetos.slice(0, 5).join(", "),
        };
      }
    }
    return { ok: true };
  },

  conservacionObjetos: (estado: EstadoSalaSync, inicial: EstadoSalaSync): OraculoResultado => {
    const inicialCont = Object.values(inicial.objetos).filter(o => !o.borrado).length;
    const actualCont = Object.values(estado.objetos).filter(o => !o.borrado).length;
    if (inicialCont !== actualCont) {
      return {
        ok: false,
        error: `Objetos creados/perdidos: inicial=${inicialCont}, actual=${actualCont}`,
      };
    }
    return { ok: true };
  },

  relojMonotonicamenteCreciente: (anterior: number, actual: number): OraculoResultado => {
    if (actual < anterior) {
      return {
        ok: false,
        error: `Reloj retrocedió: ${anterior} -> ${actual}`,
      };
    }
    return { ok: true };
  },

  convergencia: (estados: EstadoSalaSync[]): OraculoResultado => {
    if (estados.length === 0) return { ok: true };
    const referencia = estados[0];
    for (let i = 1; i < estados.length; i++) {
      const otro = estados[i];
      if (referencia.reloj !== otro.reloj) {
        return {
          ok: false,
          error: `Relojes diferentes: ${referencia.reloj} vs ${otro.reloj}`,
        };
      }
      const idsRef = new Set(Object.keys(referencia.objetos));
      const idsOtro = new Set(Object.keys(otro.objetos));
      if (idsRef.size !== idsOtro.size || [...idsRef].some(id => !idsOtro.has(id))) {
        return {
          ok: false,
          error: `Objetos diferentes entre instancias`,
        };
      }
    }
    return { ok: true };
  },
};

export function testConvergencia(estados: EstadoSalaSync[]): TestCoopResult {
  const errors: string[] = [];
  let pass = 0;
  let fail = 0;

  const o = invariantesCriticas;

  const convergencia = o.convergencia(estados);
  if (convergencia.ok) {
    pass++;
  } else {
    fail++;
    errors.push(convergencia.error || "Convergencia fallida");
  }

  for (const estado of estados) {
    const unProp = o.unPropietarioPorObjeto(estado);
    if (unProp.ok) {
      pass++;
    } else {
      fail++;
      errors.push(unProp.error || "Propietario duplicado");
    }
  }

  let relojPrevio = -1;
  for (const estado of estados) {
    const relojOk = o.relojMonotonicamenteCreciente(relojPrevio, estado.reloj);
    if (relojOk.ok) {
      pass++;
    } else {
      fail++;
      errors.push(relojOk.error || "Reloj no monótono");
    }
    relojPrevio = estado.reloj;
  }

  return {
    pass,
    fail,
    errores: errors,
    resultado: fail === 0 ? "PASS" : "FAIL",
  };
}