/*
 * vista-antenas — de lo que mide la app nativa a lo que ve la persona (2026-10-10).
 * Contrato: architecture/apps-nativas-segundo-plano.md §7 (UI/UX sin ilusiones).
 *
 * Puro: misma entrada, misma salida. Reglas:
 *  1. Arriba una frase: cuántas antenas vivas y si siguen con la app cerrada.
 *  2. Cada antena que no está viva dice su motivo real (el que escribió el guardián).
 *  3. Permisos en orden y solo cuando cambian algo (notificaciones → batería → arranque).
 *  4. Nunca un verde sin medir: sin guardián, todo «sin medir».
 * Iconos: nombres de lucide-react (sin emojis).
 */

import type { EstadoAntena, EstadoAntenas, EstadoFondo, Resultado } from "./tipos";
import type { PuenteNativo } from "./puente";

export type Tono = "vivo" | "atento" | "apagado" | "bloqueado";

export type IdAccion =
  | "medir"
  | "abrir-radio"
  | "vincular-cuenta"
  | "como-reticulum"
  | "encender-fondo"
  | "conceder-notificaciones"
  | "excluir-bateria"
  | "arranque-sistema";

export interface AccionVista {
  id: IdAccion;
  etiqueta: string;
  /** Por qué conviene, en una frase (se enseña antes de pedir un permiso). */
  explicacion: string;
  /** Dato que necesita la acción (p. ej. la ruta de la radio). */
  dato?: string;
}

export interface FilaVista {
  id: string;
  nombre: string;
  icono: string;
  tono: Tono;
  estadoTexto: string;
  motivo: string;
  conAppCerrada: string;
  accion?: AccionVista;
}

export interface VistaAntenas {
  sinMedir: boolean;
  titular: string;
  tono: Tono;
  filas: FilaVista[];
  fondo: { texto: string; tono: Tono; acciones: AccionVista[] };
  vecinos: { propias: number; otras: number; texto: string };
}

const ICONOS: Record<string, string> = {
  "wifi-local": "Wifi",
  lora: "RadioTower",
  bluetooth: "Bluetooth",
  reticulum: "Network",
  internet: "Globe",
  guardian: "ShieldQuestion",
};

const TONO_DE_ESTADO: Record<string, Tono> = {
  viva: "vivo",
  detectada: "atento",
  apagada: "apagado",
  "no-disponible": "apagado",
  "sin-permiso": "bloqueado",
};

const TEXTO_DE_ESTADO: Record<string, string> = {
  viva: "Viva",
  detectada: "Detectada",
  apagada: "Apagada",
  "no-disponible": "No disponible",
  "sin-permiso": "Sin permiso",
};

function accionDeAntena(a: EstadoAntena): AccionVista | undefined {
  if (a.id === "lora" && a.estado === "detectada" && a.detalle[0]) {
    return {
      id: "abrir-radio",
      etiqueta: "Abrir la radio",
      explicacion: "Conecta la radio LoRa enchufada para enviar y recibir por la malla sin internet.",
      dato: a.detalle[0],
    };
  }
  if (a.id === "wifi-local" && /anónimo|falta la clave/i.test(a.motivo)) {
    return {
      id: "vincular-cuenta",
      etiqueta: "Reconocer mis neuronas",
      explicacion: "Con la clave de faro de tu cuenta, tus aparatos se reconocen entre sí en la red local; los demás solo ven «una neurona cerca».",
    };
  }
  if (a.id === "reticulum" && a.estado !== "viva") {
    return {
      id: "como-reticulum",
      etiqueta: "Cómo activarlo",
      explicacion: "Reticulum funciona si su programa (rnsd) está instalado y corriendo en este aparato; la app no lo trae por su licencia.",
    };
  }
  return undefined;
}

function conAppCerrada(a: EstadoAntena, fondoVivo: boolean): string {
  if (!a.segundo_plano) return "Solo con la app abierta";
  return fondoVivo ? "Sigue con la app cerrada" : "Se apaga al cerrar la app";
}

/** ¿El segundo plano está de verdad funcionando (no solo encendido)? */
export function fondoFunciona(f: EstadoFondo | null | undefined): boolean {
  if (!f || !f.disponible || !f.activo) return false;
  if (f.plataforma === "android") return Boolean(f.servicio?.vivo);
  return true;
}

function vistaFondo(f: EstadoFondo | null | undefined): VistaAntenas["fondo"] {
  if (!f) return { texto: "Sin medir: la app no ha dicho cómo se comporta al cerrarla.", tono: "apagado", acciones: [] };
  const acciones: AccionVista[] = [];
  if (f.disponible && !f.activo) {
    acciones.push({
      id: "encender-fondo",
      etiqueta: "Mantener antenas al cerrar",
      explicacion: "La app seguirá anunciándose y escuchando a tus neuronas con la ventana cerrada.",
    });
  }
  const s = f.servicio;
  if (s && f.activo && !s.notificaciones) {
    acciones.push({
      id: "conceder-notificaciones",
      etiqueta: "Permitir notificaciones",
      explicacion: "Android exige un aviso fijo mientras la app trabaja cerrada; sin permiso no lo verías.",
    });
  }
  if (s && f.activo && !s.bateria_exenta) {
    acciones.push({
      id: "excluir-bateria",
      etiqueta: "Excluir de la optimización de batería",
      explicacion: "Con la pantalla apagada Android duerme la app y tus neuronas se oyen tarde. Gasta algo más de batería.",
    });
  }
  if (f.disponible && f.activo && f.arranque_con_sistema === false) {
    acciones.push({
      id: "arranque-sistema",
      etiqueta: "Arrancar al encender",
      explicacion: "Las antenas vuelven solas tras reiniciar el aparato, sin abrir la app.",
    });
  }
  const tono: Tono = fondoFunciona(f) ? "vivo" : f.disponible && f.activo ? "atento" : "apagado";
  return { texto: f.al_cerrar, tono, acciones };
}

function vistaVecinos(e: EstadoAntenas): VistaAntenas["vecinos"] {
  const propias = e.vecinos.filter((v) => v.propia).length;
  const otras = e.otras_cerca;
  const a = propias === 0 ? "Ninguna neurona tuya en esta red" : propias === 1 ? "1 neurona tuya en esta red" : `${propias} neuronas tuyas en esta red`;
  const b = otras > 0 ? ` · ${otras} de otras cuentas cerca (solo se cuentan)` : "";
  return { propias, otras, texto: a + b };
}

export function vistaAntenas(e: EstadoAntenas | null | undefined, f?: EstadoFondo | null): VistaAntenas {
  const fondo = vistaFondo(f);
  if (!e || !e.guardian_activo) {
    const motivo = e?.antenas.find((a) => a.id === "guardian")?.motivo ?? "La app nativa no ha respondido todavía.";
    return {
      sinMedir: true,
      titular: "Antenas sin medir",
      tono: "apagado",
      filas: [
        {
          id: "guardian",
          nombre: "Guardián de antenas",
          icono: ICONOS.guardian,
          tono: "apagado",
          estadoTexto: "Sin medir",
          motivo,
          conAppCerrada: "—",
          accion: { id: "medir", etiqueta: "Medir ahora", explicacion: "Pide a la app que compruebe cada antena." },
        },
      ],
      fondo,
      vecinos: { propias: 0, otras: 0, texto: "Sin medir" },
    };
  }
  const vivoFondo = fondoFunciona(f);
  const filas: FilaVista[] = e.antenas.map((a) => ({
    id: a.id,
    nombre: a.nombre,
    icono: ICONOS[a.id] ?? "Radio",
    tono: TONO_DE_ESTADO[a.estado] ?? "apagado",
    estadoTexto: TEXTO_DE_ESTADO[a.estado] ?? a.estado,
    motivo: a.motivo,
    conAppCerrada: conAppCerrada(a, vivoFondo),
    accion: accionDeAntena(a),
  }));
  const vivas = e.antenas.filter((a) => a.estado === "viva");
  let titular: string;
  if (vivas.length === 0) {
    titular = "Ninguna antena viva";
  } else {
    const n = vivas.length === 1 ? "1 antena viva" : `${vivas.length} antenas vivas`;
    titular = `${n} · ${vivoFondo ? "siguen con la app cerrada" : "se apagan al cerrar la app"}`;
  }
  const tono: Tono = vivas.length === 0 ? "apagado" : vivoFondo ? "vivo" : "atento";
  return { sinMedir: false, titular, tono, filas, fondo, vecinos: vistaVecinos(e) };
}

/** Ejecuta una acción de la vista con el puente (inyectado). Nunca lanza. */
export async function ejecutarAccion(
  accion: AccionVista,
  puente: PuenteNativo,
  extra: { vincularCuenta?: () => Promise<Resultado<unknown>> } = {},
): Promise<Resultado<unknown>> {
  switch (accion.id) {
    case "medir":
      return puente.antenasMedir();
    case "abrir-radio":
      return accion.dato ? puente.serieAbrir(accion.dato) : { ok: false, motivo: "No se sabe qué radio abrir." };
    case "encender-fondo":
      return puente.fondoFijar(true);
    case "arranque-sistema":
      return puente.fondoArranque(true);
    case "excluir-bateria":
      return puente.fondoPedirBateria();
    case "conceder-notificaciones":
      return puente.llamar("plugin:notification|request_permission");
    case "vincular-cuenta":
      return extra.vincularCuenta ? extra.vincularCuenta() : { ok: false, motivo: "Inicia sesión para reconocer tus neuronas." };
    case "como-reticulum":
      return { ok: true, valor: accion.explicacion };
  }
}
