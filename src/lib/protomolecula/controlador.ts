/**
 * Protomolécula · CONTROLADOR. Punto de entrada único que une el núcleo puro.
 * Módulo PURO: sin React, sin red, sin `node:*`.
 */
import type {
  Molecula,
  Operacion,
  Cambio,
  ParametroRef,
  Parametro,
  EstadoValores,
  Historial,
  AtomoEnUso,
  Rol,
  Sesion,
  Ambito,
  Origen,
  Autor,
  Consentimiento,
} from "./tipos";
import { decidirOperacion } from "./permisos";
import { aplicarEnMolecula } from "./molecula-estado";
import { obtenerAtomo, candidatosDe } from "./registro-atomos";
import { entenderVarias } from "./dictado";
import { deshacerUltimo, rehacerUltimo, registrar } from "./parametros";

export interface Pendiente {
  operacion: Operacion;
  motivo: string;
}

export interface EstadoControl {
  molecula: Molecula;
  historial: Historial;
  pendientes: Pendiente[];
}

export type ResultadoMover =
  | { ok: true; cambio: Cambio; difundir: boolean }
  | { ok: false; motivo: string; pendiente?: Pendiente };

export interface Controlador {
  obtener(): EstadoControl;
  suscribir(f: (estado: EstadoControl) => void): () => void;
  mover(op: Operacion): ResultadoMover;
  dictar(frase: string, autor: Autor, origen?: Origen): {
    resultados: Array<{ ok: true; operacion: Operacion; resumen: string } | { ok: false; razon: string; sugerencia: string; candidatos?: string[] }>;
    aplicados: number;
    pendientes: Pendiente[];
  };
  confirmar(opId: string): ResultadoMover;
  rechazar(opId: string): { ok: true } | { ok: false; motivo: string };
  deshacer(autorId: string): { ok: true; cambio: Cambio } | { ok: false; motivo: string };
  rehacer(autorId: string): { ok: true; cambio: Cambio } | { ok: false; motivo: string };
  anadirAtomo(herramientaId: string, titulo?: string): { ok: true; atomo: AtomoEnUso } | { ok: false; motivo: string };
}

function crearEstadoInicial(m: Molecula): EstadoControl {
  return { molecula: m, historial: { hechos: [], rehacer: [] }, pendientes: [] };
}

function notificar(suscriptores: Set<(estado: EstadoControl) => void>, estado: EstadoControl): void {
  for (const s of suscriptores) s(estado);
}

export function crearControlador(o: {
  molecula: Molecula;
  rol: Rol | null;
  sesion?: Pick<Sesion, "ambito" | "consentimientos">;
  ahora: () => number;
  nuevoId: () => string;
}): Controlador {
  const { molecula: moleculaInicial, rol, sesion, ahora, nuevoId } = o;
  let estado = crearEstadoInicial(moleculaInicial);
  const suscriptores = new Set<(estado: EstadoControl) => void>();

  const sesionEfectiva = sesion ?? { ambito: moleculaInicial.ambito, consentimientos: [] };

  function parametroDe(ref: ParametroRef): Parametro | undefined {
    const def = obtenerAtomo(ref.atomoId);
    if (!def) return undefined;
    return def.parametros.find((p) => p.id === ref.parametroId);
  }

  function obtener(): EstadoControl {
    return estado;
  }

  function suscribir(f: (estado: EstadoControl) => void): () => void {
    suscriptores.add(f);
    return () => suscriptores.delete(f);
  }

  function mover(op: Operacion): ResultadoMover {
    const decision = decidirOperacion(op, rol, sesionEfectiva, ahora());
    if (!decision.permitido) {
      return { ok: false, motivo: decision.motivo };
    }
    if (decision.confirmar) {
      const pendiente: Pendiente = { operacion: op, motivo: decision.motivo };
      estado = { ...estado, pendientes: [...estado.pendientes, pendiente] };
      notificar(suscriptores, estado);
      return { ok: false, motivo: decision.motivo, pendiente };
    }
    const p = parametroDe(op.objetivo);
    if (!p) {
      return { ok: false, motivo: `Parámetro desconocido: ${op.objetivo.parametroId}` };
    }
    const res = aplicarEnMolecula(estado.molecula, parametroDe, op, ahora());
    if (!res.ok) {
      return { ok: false, motivo: res.motivo };
    }
    estado = {
      molecula: res.molecula,
      historial: registrar(estado.historial, res.cambio),
      pendientes: estado.pendientes,
    };
    notificar(suscriptores, estado);
    return { ok: true, cambio: res.cambio, difundir: decision.difundir };
  }

  function dictar(frase: string, autor: Autor, origen: Origen = "dictado") {
    const cs = candidatosDe(estado.molecula);
    const ctx = { autor, ahora: ahora(), origen, id: nuevoId };
    const resultados = entenderVarias(frase, cs, ctx);
    const pendientesNuevos: Pendiente[] = [];
    let aplicados = 0;
    for (const r of resultados) {
      if (r.ok) {
        const resMover = mover(r.operacion);
        if (resMover.ok) {
          aplicados++;
        } else if (resMover.pendiente) {
          pendientesNuevos.push(resMover.pendiente);
        }
      }
    }
    return { resultados, aplicados, pendientes: pendientesNuevos };
  }

  function confirmar(opId: string): ResultadoMover {
    const idx = estado.pendientes.findIndex((p) => p.operacion.id === opId);
    if (idx < 0) return { ok: false, motivo: "No hay operación pendiente con ese id" };
    const pendiente = estado.pendientes[idx];
    const decision = decidirOperacion(pendiente.operacion, rol, sesionEfectiva, ahora());
    if (!decision.permitido || !decision.confirmar) {
      return { ok: false, motivo: decision.motivo };
    }
    const p = parametroDe(pendiente.operacion.objetivo);
    if (!p) {
      return { ok: false, motivo: `Parámetro desconocido: ${pendiente.operacion.objetivo.parametroId}` };
    }
    const res = aplicarEnMolecula(estado.molecula, parametroDe, pendiente.operacion, ahora());
    if (!res.ok) {
      return { ok: false, motivo: res.motivo };
    }
    estado = {
      molecula: res.molecula,
      historial: registrar(estado.historial, res.cambio),
      pendientes: estado.pendientes.filter((_, i) => i !== idx),
    };
    notificar(suscriptores, estado);
    return { ok: true, cambio: res.cambio, difundir: decision.difundir };
  }

  function rechazar(opId: string): { ok: true } | { ok: false; motivo: string } {
    const idx = estado.pendientes.findIndex((p) => p.operacion.id === opId);
    if (idx < 0) return { ok: false, motivo: "No hay operación pendiente con ese id" };
    estado = { ...estado, pendientes: estado.pendientes.filter((_, i) => i !== idx) };
    notificar(suscriptores, estado);
    return { ok: true };
  }

  function deshacer(autorId: string): { ok: true; cambio: Cambio } | { ok: false; motivo: string } {
    const res = deshacerUltimo(estado.historial, estado.molecula.valores, autorId);
    if (!res.ok) return res;
    estado = {
      molecula: { ...estado.molecula, valores: res.estado, actualizadaEn: ahora(), version: estado.molecula.version + 1 },
      historial: res.historial,
      pendientes: estado.pendientes,
    };
    notificar(suscriptores, estado);
    return { ok: true, cambio: res.cambio };
  }

  function rehacer(autorId: string): { ok: true; cambio: Cambio } | { ok: false; motivo: string } {
    const res = rehacerUltimo(estado.historial, estado.molecula.valores, autorId);
    if (!res.ok) return res;
    estado = {
      molecula: { ...estado.molecula, valores: res.estado, actualizadaEn: ahora(), version: estado.molecula.version + 1 },
      historial: res.historial,
      pendientes: estado.pendientes,
    };
    notificar(suscriptores, estado);
    return { ok: true, cambio: res.cambio };
  }

  function anadirAtomo(herramientaId: string, titulo?: string): { ok: true; atomo: AtomoEnUso } | { ok: false; motivo: string } {
    const def = obtenerAtomo(herramientaId);
    if (!def) return { ok: false, motivo: `Herramienta no registrada: ${herramientaId}` };
    if (def.proximamente) return { ok: false, motivo: def.proximamente };
    const decision = decidir({ rol, origen: "mano", ambito: sesionEfectiva.ambito, accion: "editar-estructura" });
    if (!decision.permitido) return { ok: false, motivo: decision.motivo };
    const id = nuevoId();
    const atomo: AtomoEnUso = { id, herramientaId, titulo, estado: "activo" };
    estado = {
      molecula: {
        ...estado.molecula,
        atomos: [...estado.molecula.atomos, atomo],
        actualizadaEn: ahora(),
        version: estado.molecula.version + 1,
      },
      historial: estado.historial,
      pendientes: estado.pendientes,
    };
    notificar(suscriptores, estado);
    return { ok: true, atomo };
  }

  return { obtener, suscribir, mover, dictar, confirmar, rechazar, deshacer, rehacer, anadirAtomo };
}