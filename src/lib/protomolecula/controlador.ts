/**
 * Protomolécula · CONTROLADOR. Punto de entrada único que une el núcleo puro.
 * Módulo PURO: sin React, sin red, sin `node:*`.
 */
import type {
  AtomoEnUso,
  EstadoValores,
  Molecula,
  Operacion,
  Cambio,
  ParametroRef,
  Parametro,
  Rol,
  Sesion,
  Origen,
  Autor,
  Ambito,
  Computo,
  ValorParametro,
} from "./tipos";
import { elegirComputo, Candidato } from "./planificador-computo";
import { decidir, decidirOperacion } from "./permisos";
import { obtenerAtomo, candidatosDe } from "./registro-atomos";
import { entenderVarias } from "./dictado";
import { aplicarOperacion, deshacerUltimo, rehacerUltimo, registrar, type Historial } from "./parametros";
import { operacionASdkOrder } from "../../lib/video-html/operaciones-sdk";
import { llamarServicio, type DefinicionServicio } from "./servicio-local";
import { ANIMACION_MANIMGX, enviarDesde, renderizarAnimacion, type RespuestaEnvio, type SalidaAnimacion } from "./atomos/animacion-manimgx";

export interface Pendiente {
  operacion: Operacion;
  motivo: string;
  /** Cuando la pendiente es de estructura (añadir átomo), lo que hay que crear al confirmar. */
  atomoNuevo?: { herramientaId: string; titulo?: string };
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
  anadirAtomo(herramientaId: string, titulo?: string, origen?: Origen): { ok: true; atomo: AtomoEnUso } | { ok: false; motivo: string };
}

function crearEstadoInicial(m: Molecula): EstadoControl {
  return { molecula: m, historial: { hechos: [], rehacer: [] }, pendientes: [] };
}

function notificar(suscriptores: Set<(estado: EstadoControl) => void>, estado: EstadoControl): void {
  for (const s of suscriptores) s(estado);
}

/** Los valores de UN átomo en uso: del compuesto `atomoId::parametroId` a lo que el átomo espera por id. */
function valoresDeAtomo(valores: EstadoValores, atomoId: string): Record<string, ValorParametro | undefined> {
  const prefijo = `${atomoId}::`;
  const delAtomo: Record<string, ValorParametro | undefined> = {};
  for (const [clave, valor] of Object.entries(valores)) {
    if (clave.startsWith(prefijo)) delAtomo[clave.slice(prefijo.length)] = valor;
  }
  return delAtomo;
}

export function crearControlador(o: {
  molecula: Molecula;
  rol: Rol | null;
  sesion?: Pick<Sesion, "ambito" | "consentimientos">;
  ahora: () => number;
  nuevoId: () => string;
  /** Resuelve la entrada «py» de un átomo (el código de la escena de ManimGX). Hoy ninguna
   *  superficie la trae aún: sin código, el propio átomo responde con su motivo honesto. */
  codigoDeEscena?: (atomo: AtomoEnUso) => string;
  /** Ejecuta la acción «renderizar» (por defecto, la del átomo); inyectable para probar el cableado. */
  renderizarManimgx?: (respuesta: RespuestaEnvio) => Promise<SalidaAnimacion>;
  /** Quien archiva o publica la salida del átomo (el MP4). Sin él, un fallo se informa y la salida se descarta. */
  alSalida?: (salida: SalidaAnimacion) => void;
}): Controlador {
  const { molecula: moleculaInicial, rol, sesion, ahora, nuevoId } = o;
  const codigoDeEscena = o.codigoDeEscena, renderizarManimgx = o.renderizarManimgx, alSalida = o.alSalida;
  let estado = crearEstadoInicial(moleculaInicial);
  const suscriptores = new Set<(estado: EstadoControl) => void>();

  const sesionEfectiva = sesion ?? { ambito: moleculaInicial.ambito, consentimientos: [] };

  function parametroDe(ref: ParametroRef): Parametro | undefined {
    const enUso = estado.molecula.atomos.find((a) => a.id === ref.atomoId);
    const def = obtenerAtomo(enUso?.herramientaId ?? ref.atomoId);
    if (!def) return undefined;
    return def.parametros.find((p) => p.id === ref.parametroId);
  }

   function aplicar(op: Operacion): { ok: true; cambio: Cambio } | { ok: false; motivo: string } {
     const p = parametroDe(op.objetivo);
     if (!p) return { ok: false, motivo: `Parámetro desconocido: ${op.objetivo.parametroId}` };
     const r = aplicarOperacion(estado.molecula.valores, p, op);
     if (!r.ok) return r;
     estado = {
       molecula: { ...estado.molecula, valores: r.estado, actualizadaEn: ahora(), version: estado.molecula.version + 1 },
       historial: registrar(estado.historial, r.cambio),
       pendientes: estado.pendientes,
     };
     notificar(suscriptores, estado);
     
     // If the atom is video-html, translate the operation to an SDK order and send it to the HyperFrames service
     const enUso = estado.molecula.atomos.find((a) => a.id === op.objetivo.atomoId);
     if (enUso) {
       const def = obtenerAtomo(enUso.herramientaId);
       if (def && def.herramientaId === "video-html") {
         try {
           const sdkOrder = operacionASdkOrder(op);
           // Call the HyperFrames service to apply the SDK order
           const servicioDef: DefinicionServicio = { id: "hyperframes", nombre: "HyperFrames", puerto: 4490, rutaSalud: "/health" };
           llamarServicio(servicioDef, "/api/sdk-order", sdkOrder, fetch, {}).then(result => {
             if (result.ok === false) {
               console.error("Failed to send SDK order to HyperFrames service:", result.motivo);
             }
           }).catch(error => {
             console.error("Error calling HyperFrames service:", error);
           });
         } catch (error) {
           // If translation fails, we log the error but still return the successful application
           console.error("Failed to translate operation to SDK order:", error);
         }
       } else if (def && def.herramientaId === ANIMACION_MANIMGX.herramientaId && op.accion.tipo === "disparo" && op.objetivo.parametroId === "renderizar") {
         // Acción «renderizar» del átomo Animación 3D (ManimGX): los parámetros de la mano, dictado o
         // agente se traducen al envío y se mandan al cliente-render (MGX1023B). Aquí no se interpreta
         // ningún código de Manim: el Worker de Pyodide es quien renderiza (contractos §3); el MP4
         // queda como salida del átomo para quien lo publica o archiva.
         try {
           const respuesta = enviarDesde(
             valoresDeAtomo(estado.molecula.valores, enUso.id),
             codigoDeEscena?.(enUso) ?? "",
             enUso.titulo ?? ANIMACION_MANIMGX.nombre,
           );
           (renderizarManimgx ?? renderizarAnimacion)(respuesta)
             .then((salida) => {
               if (salida.mp4) alSalida?.(salida);
               else console.error(`ManimGX (${enUso.id}): ${salida.error ?? "el render no produjo MP4"}`);
             })
             .catch((error: unknown) => console.error(`ManimGX (${enUso.id}):`, error));
         } catch (error) {
           console.error(`ManimGX (${enUso.id}): no se pudo encolar el render:`, error);
         }
       }
     }
     
     return { ok: true, cambio: r.cambio };
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
    const res = aplicar(op);
    if (!res.ok) return res;
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
    const decision = pendiente.atomoNuevo
      ? { ...decidir({ rol, origen: pendiente.operacion.origen, ambito: sesionEfectiva.ambito, accion: "editar-estructura" }), difundir: true }
      : decidirOperacion(pendiente.operacion, rol, sesionEfectiva, ahora());
    if (!decision.permitido) {
      return { ok: false, motivo: decision.motivo };
    }
    estado = { ...estado, pendientes: estado.pendientes.filter((_, i) => i !== idx) };
    if (pendiente.atomoNuevo) {
      const hecho = insertarAtomo(pendiente.atomoNuevo.herramientaId, pendiente.atomoNuevo.titulo);
      return { ok: true, cambio: cambioEstructura(pendiente.operacion, hecho.atomo.id), difundir: decision.difundir };
    }
    const res = aplicar(pendiente.operacion);
    if (!res.ok) return res;
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

  function cambioEstructura(op: Operacion, atomoId: string): Cambio {
    return { operacion: op, antes: "", despues: atomoId, acotado: false, reversible: false, nota: "Estructura: se añadió un átomo" };
  }

  function insertarAtomo(herramientaId: string, titulo?: string): { ok: true; atomo: AtomoEnUso } {
    const atomo: AtomoEnUso = { id: nuevoId(), herramientaId, titulo, estado: "activo" };
    
    // Determinar dónde debe ejecutarse el átomo usando el planificador puro
    // Valores provisionales - en una implementación real estos vendrían de la definición de la herramienta y el contexto del sistema
    const req = { 
      memoriaMB: 512, 
      gpu: false, 
      latenciaCritica: false, 
      ambito: sesionEfectiva.ambito, 
      pesado: false 
    };
    const candidatos: Candidato[] = [];
    
    const resultado = elegirComputo(req, candidatos);
    atomo.ejecutaEn = resultado.destino;
    
    estado = {
      molecula: { ...estado.molecula, atomos: [...estado.molecula.atomos, atomo], actualizadaEn: ahora(), version: estado.molecula.version + 1 },
      historial: estado.historial,
      pendientes: estado.pendientes,
    };
    notificar(suscriptores, estado);
    return { ok: true, atomo };
  }

  function anadirAtomo(herramientaId: string, titulo?: string, origen: Origen = "mano"): { ok: true; atomo: AtomoEnUso } | { ok: false; motivo: string } {
    const def = obtenerAtomo(herramientaId);
    if (!def) return { ok: false, motivo: `Herramienta no registrada: ${herramientaId}` };
    if (def.proximamente) return { ok: false, motivo: def.proximamente };
    const decision = decidir({ rol, origen, ambito: sesionEfectiva.ambito, accion: "editar-estructura" });
    if (!decision.permitido) return { ok: false, motivo: decision.motivo };
    if (decision.confirmar) {
      const operacion: Operacion = {
        id: nuevoId(), objetivo: { atomoId: "estructura", parametroId: "anadir-atomo" },
        accion: { tipo: "disparo" }, origen,
        autor: { tipo: origen === "ia" || origen === "agente" ? "agente" : "persona", id: "controlador" },
        t: ahora(),
      };
      const pendiente: Pendiente = { operacion, motivo: decision.motivo, atomoNuevo: { herramientaId, titulo } };
      estado = { ...estado, pendientes: [...estado.pendientes, pendiente] };
      notificar(suscriptores, estado);
      return { ok: false, motivo: decision.motivo };
    }
    return insertarAtomo(herramientaId, titulo);
  }

  return { obtener, suscribir, mover, dictar, confirmar, rechazar, deshacer, rehacer, anadirAtomo };
}