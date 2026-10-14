/**
 * Protomolécula · ACCIÓN DE AGENTE. Maneja [[ACCION: protomolecula {json}]].
 * Contrato: architecture/protomolecula.md §5.1
 * Módulo PURO: sin React, sin red, sin `node:*`.
 */
import type { Operacion, Accion, ModoRelativo, Autor } from "./tipos";
import { obtenerAtomo, candidatosDe } from "./registro-atomos";
import { normalizar, valorActual, formatearValor } from "./parametros";
import { entenderVarias } from "./dictado";
import { controladorActivo } from "./controlador-activo";
import type { Controlador, ResultadoMover, Pendiente } from "./controlador";

/**
 * Maneja una acción de agente sobre la Protomolécula.
 * @param args   Objeto con la acción y sus parámetros.
 * @param ctx    Contexto con callback para abrir ruta (opcional).
 * @returns      Resultado honesto para el protocolo de Aurora.
 */
export function manejarAccionProtomolecula(
  args: Record<string, unknown>,
  ctx: { abrirRuta?: (ruta: string) => void }
): { ok: boolean; message: string; status?: string } {
  const accion = args.accion as string | undefined;
  const agenteId = args.agente ?? "astraura";
  const autor: Autor = { tipo: "agente", id: agenteId };
  const controlador = controladorActivo();
  if (!controlador) {
    return { ok: false, message: "No hay controlador activo de Protomolécula." };
  }
  const state = controlador.obtener();

  switch (accion) {
    case "abrir": {
      if (ctx.abrirRuta) {
        ctx.abrirRuta("/protomolecula");
        return { ok: true, message: "Abriendo la Protomolécula.", status: "Abriendo Protomolécula" };
      }
      return { ok: false, message: "No se pudo abrir la Protomolécula: falta callback abrirRuta." };
    }

    case "estado": {
      const lines: string[] = [];
      for (const atomo of state.molecula.atomos) {
        const def = obtenerAtomo(atomo.herramientaId);
        if (!def) continue;
        for (const parametro of def.parametros) {
          const ref: { atomoId: string; parametroId: string } = {
            atomoId: atomo.id,
            parametroId: parametro.id,
          };
          const valor = valorActual(state.molecula.valores, ref, parametro);
          const linea = `${parametro.nombre} (${atomo.titulo ?? atomo.herramientaId}): ${formatearValor(parametro, valor)} ${parametro.unidad ?? ""} [${parametro.min ?? 0}–${parametro.max ?? 0}]`;
          lines.push(linea);
          if (lines.length >= 40) break;
        }
        if (lines.length >= 40) break;
      }
      const summary = lines.join("\n");
      return { ok: true, message: summary, status: "Estado de la Protomolécula" };
    }

    case "dictar": {
      const frase = args.frase as string | undefined;
      if (!frase) {
        return { ok: false, message: "Falta frase para dictar." };
      }
      const cs = candidatosDe(state.molecula);
      const dictCtx = {
        autor,
        ahora: Date.now(),
        origen: "agente" as const,
        id: () => `dic-${Date.now()}`,
      };
      const dictResult = entenderVarias(frase, cs, dictCtx);
      const resultados = dictResult.resultados;
      const aplicados: string[] = [];
      const noEntendido: string[] = [];
      for (const r of resultados) {
        if (r.ok) {
          const moverRes = controlador.mover(r.operacion);
          if (moverRes.ok) {
            aplicados.push(r.resumen);
          } else if (moverRes.pendiente) {
            noEntendido.push(`${r.resumen} (pendiente de confirmación)`);
          }
        } else {
          noEntendido.push(`${r.razon}: ${r.sugerencia}`);
        }
      }
      let message = "";
      if (aplicados.length) message += `Aplicado: ${aplicados.join(", ")}. `;
      if (noEntendido.length) message += `No entendido: ${noEntendido.join(", ")}.`;
      if (!message) message = "No se entendió nada.";
      return { ok: true, message: message.trim(), status: "Dictado procesado" };
    }

    case "mover": {
      const parametroId = args.parametro as string | undefined;
      if (!parametroId) {
        return { ok: false, message: "Falta parámetro para mover." };
      }
      const cs = candidatosDe(state.molecula);
      const normalized = normalizar(parametroId);
      let candidate: ReturnType<typeof candidatosDe>[number] | undefined;
      for (const c of cs) {
        if (normalizar(c.parametro.nombre) === normalized) {
          candidate = c;
          break;
        }
        if (c.parametro.sinonimos?.some((s) => normalizar(s) === normalized)) {
          candidate = c;
          break;
        }
      }
      if (!candidate) {
        return { ok: false, message: `No se encontró el parámetro "${parametroId}".` };
      }
      let accion: Accion;
      if (args.valor !== undefined) {
        accion = { tipo: "exacta", valor: args.valor };
      } else if (args.cambio !== undefined && args.modo !== undefined) {
        const cambio = Number(args.cambio);
        const modo = args.modo as ModoRelativo;
        accion = { tipo: "relativa", cantidad: cambio, modo };
      } else {
        return {
          ok: false,
          message: "Especificar valor o cambio+modo para la acción mover.",
        };
      }
      const operacion: Operacion = {
        id: `op-${Date.now()}`,
        objetivo: candidate.ref,
        accion,
        autor,
        origen: "agente" as const,
        t: Date.now(),
      };
      const moverRes = controlador.mover(operacion);
      if (moverRes.ok) {
        return { ok: true, message: "Parámetro movido.", status: "Parámetro actualizado" };
      } else if (moverRes.pendiente) {
        return {
          ok: false,
          message: `Operación pendiente de confirmación: ${moverRes.motivo}`,
          status: "Pendiente",
        };
      } else {
        return { ok: false, message: moverRes.motivo, status: "Error" };
      }
    }

    case "deshacer": {
      const deshacerRes = controlador.deshacer(agenteId);
      if (deshacerRes.ok) {
        return { ok: true, message: "Deshecho último cambio del agente.", status: "Deshecho" };
      } else {
        return { ok: false, message: deshacerRes.motivo, status: "Error al deshacer" };
      }
    }

    case "proponer-codigo": {
      return {
        ok: false,
        message:
          "próximamente: las propuestas de código llegan con la fase F7; hoy no se ejecuta ni se guarda nada.",
        status: "Próximamente",
      };
    }

    default: {
      return { ok: false, message: `Acción desconocida "${accion}".` };
    }
  }
}