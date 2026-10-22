/*
 * capacidad-por-malla — relé P2P de CAPACIDADES sobre la malla (Ola 1017A,
 * tarea E; §6 de `architecture/apps-en-la-malla.md`). Generaliza el patrón de
 * `ia-por-malla.ts` (namespace, topes, trozos, fin, error, cancelar) para
 * pedir a OTRA neurona una capacidad que esta no tiene. Protocolo JSON del
 * namespace `capacidad.*`, mensajes ≤ 16 KB: `pedir` {id, tipo, cuerpo},
 * `trozo` {id, indice, texto}, `fin` {id}, `error` {id, estado, mensaje,
 * ocupado?}, `cancelar` {id}. `trozo` lleva `indice` porque la salida puede
 * llegar en desorden y el cliente la reensambla por índice. El rol SERVIDOR
 * (admisión, cola y topes) es la tarea F; aquí viven el protocolo puro y el
 * CLIENTE, y `pedirCapacidad` NUNCA lanza: `{ ok:false, motivo }` — el relé
 * es un candidato, no un contrato.
 */

export const CAPACIDAD_MALLA_NS = "capacidad.";
/** Límite duro del protocolo: ningún mensaje viaja por el canal por encima. */
export const CAPACIDAD_MALLA_MAX_BYTES = 16 * 1024;
export const TIPOS_CAPACIDAD = ["imagen", "voz", "oido", "palabra", "transcodificar", "render", "buscar", "construir"] as const;
export type TipoCapacidad = (typeof TIPOS_CAPACIDAD)[number];

/** Guard puro: ¿`x` es un tipo de capacidad reconocido por el relé? */
export function esTipoCapacidad(x: unknown): x is TipoCapacidad {
  return typeof x === "string" && (TIPOS_CAPACIDAD as readonly string[]).includes(x);
}
export type MsgCapacidadPedir = { t: "capacidad.pedir"; id: string; tipo: TipoCapacidad; cuerpo: Record<string, unknown> };
export type MsgCapacidadTrozo = { t: "capacidad.trozo"; id: string; indice: number; texto: string };
export type MsgCapacidadFin = { t: "capacidad.fin"; id: string };
export type MsgCapacidadError = { t: "capacidad.error"; id: string; estado: number; mensaje: string; ocupado?: boolean };
export type MsgCapacidadCancelar = { t: "capacidad.cancelar"; id: string };
export type CapacidadMallaMsg = MsgCapacidadPedir | MsgCapacidadTrozo | MsgCapacidadFin | MsgCapacidadError | MsgCapacidadCancelar;
function esObjeto(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object";
}
/** Guard puro: ¿`x` es un mensaje del protocolo `capacidad.*` bien formado? */
export function esMensajeCapacidadMalla(x: unknown): x is CapacidadMallaMsg {
  if (!esObjeto(x)) return false;
  const t = x.t;
  if (typeof t !== "string" || !t.startsWith(CAPACIDAD_MALLA_NS) || typeof x.id !== "string" || !x.id) return false;
  if (t === "capacidad.pedir") return esTipoCapacidad(x.tipo) && esObjeto(x.cuerpo);
  if (t === "capacidad.trozo") return typeof x.indice === "number" && Number.isInteger(x.indice) && typeof x.texto === "string";
  if (t === "capacidad.error") return typeof x.estado === "number" && typeof x.mensaje === "string";
  return t === "capacidad.fin" || t === "capacidad.cancelar";
}
/** JSON.parse defensivo + guard. Nunca lanza; `null` si no es del protocolo. */
export function parseCapacidadMallaMensaje(raw: string): CapacidadMallaMsg | null {
  try {
    const obj: unknown = JSON.parse(raw);
    return esMensajeCapacidadMalla(obj) ? obj : null;
  } catch {
    return null;
  }
}
/* Rol CLIENTE — reúne los trozos y nunca lanza. Tipos del canal de la malla. */
export type EnviarPorMalla = (peerId: string, data: string) => boolean;
export type SuscribirMalla = (manejar: (peerId: string, data: string) => void) => () => void;
export type ResultadoCapacidad = { ok: true; texto: string } | { ok: false; motivo: string; ocupado?: boolean };
/** Reensambla los trozos por su `indice` (pueden haber llegado en desorden). */
export function unirTrozosOrdenados(trozos: Map<number, string>): string {
  return [...trozos.keys()].sort((a, b) => a - b).map((i) => trozos.get(i) ?? "").join("");
}
const longitudUtf8 = (s: string): number => new TextEncoder().encode(s).length;
/** Opciones del pedido: todo se inyecta para mantener el módulo puro. */
export type PedirCapacidadOpciones = {
  peerId: string;
  tipo: TipoCapacidad;
  cuerpo: Record<string, unknown>;
  sesionId: string;
  timeoutMs?: number;
  suscribir?: SuscribirMalla;
  signal?: AbortSignal;
};
/**
 * pedirCapacidad — manda un `capacidad.pedir` a `peerId`, reúne los trozos y
 * resuelve con `fin` (texto unido por índice), `error` o el tiempo agotado;
 * en abort o timeout manda `capacidad.cancelar`. Jamás lanza: todo fallo
 * (tipo, tamaño, JSON, canal, tiempo) es `{ ok:false, motivo }`.
 */
export async function pedirCapacidad(enviar: EnviarPorMalla, opciones: PedirCapacidadOpciones): Promise<ResultadoCapacidad> {
  const { peerId, tipo, cuerpo, sesionId } = opciones;
  if (!esTipoCapacidad(tipo)) return { ok: false, motivo: `Tipo de capacidad no reconocido: "${String(tipo)}".` };
  let json: string;
  try {
    json = JSON.stringify({ t: "capacidad.pedir", id: sesionId, tipo, cuerpo } satisfies MsgCapacidadPedir);
  } catch {
    return { ok: false, motivo: "El cuerpo de la petición no se puede serializar a JSON." };
  }
  if (longitudUtf8(json) > CAPACIDAD_MALLA_MAX_BYTES) return { ok: false, motivo: `La petición excede el tope de la malla (${CAPACIDAD_MALLA_MAX_BYTES} bytes).` };
  return new Promise<ResultadoCapacidad>((resolver) => {
    const trozos = new Map<number, string>();
    const timeoutMs = opciones.timeoutMs ?? 120_000;
    let asentada = false;
    const salir = (r: ResultadoCapacidad, avisarCancelar: boolean) => {
      if (asentada) return;
      asentada = true;
      clearTimeout(tiempo);
      bajar?.();
      opciones.signal?.removeEventListener("abort", alAbortar);
      if (avisarCancelar) {
        try { enviar(peerId, JSON.stringify({ t: "capacidad.cancelar", id: sesionId } satisfies MsgCapacidadCancelar)); } catch { /* peer ya no escucha */ }
      }
      resolver(r);
    };
    const alAbortar = () => salir({ ok: false, motivo: "Sesión de capacidad cancelada." }, true);
    const bajar = opciones.suscribir?.((idCanal: string, data: string) => {
      if (asentada || idCanal !== peerId) return;
      const msg = parseCapacidadMallaMensaje(data);
      if (!msg || msg.id !== sesionId) return;
      if (msg.t === "capacidad.trozo") trozos.set(msg.indice, msg.texto);
      else if (msg.t === "capacidad.fin") salir({ ok: true, texto: unirTrozosOrdenados(trozos) }, false);
      else if (msg.t === "capacidad.error") salir({ ok: false, motivo: msg.mensaje, ocupado: !!msg.ocupado }, false);
    });
    const tiempo = setTimeout(() => salir({ ok: false, motivo: `Sesión de capacidad sin respuesta en ${timeoutMs} ms.` }, true), timeoutMs);
    opciones.signal?.addEventListener("abort", alAbortar, { once: true });
    try {
      if (!enviar(peerId, json)) salir({ ok: false, motivo: "El canal de la malla no aceptó el mensaje." }, false);
    } catch {
      salir({ ok: false, motivo: "El canal de la malla no aceptó el mensaje." }, false);
    }
  });
}
