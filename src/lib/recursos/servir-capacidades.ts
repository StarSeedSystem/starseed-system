import { permitido, type Sesion } from "./sesion-prestamo";
import { capacidadPrestable, type OfertaNeurona } from "./oferta";

// Relé `capacidad.*` (architecture/apps-en-la-malla.md §6) — lado ANFITRIÓN.
export type TipoCapacidad = "imagen" | "voz" | "oido" | "palabra" | "transcodificar" | "render" | "buscar" | "construir";
export type MsgCapacidadPedir = { t: "capacidad.pedir"; id: string; sesionId: string; capacidad: TipoCapacidad; datos?: string };
export type MsgCapacidadTrozo = { t: "capacidad.trozo"; id: string; texto: string };
export type MsgCapacidadFin = { t: "capacidad.fin"; id: string; bytes: number };
export type MsgCapacidadError = { t: "capacidad.error"; id: string; estado: number; mensaje: string };
export type MsgCapacidadCancelar = { t: "capacidad.cancelar"; id: string };
export type MsgCapacidad = MsgCapacidadPedir | MsgCapacidadTrozo | MsgCapacidadFin | MsgCapacidadError | MsgCapacidadCancelar;
export type AccionCapacidad = { t: "acepta" } | { t: "en cola"; posicion: number } | { t: "denegado"; mensaje: string };
export type EstadoPrestamo = "colada" | "en curso" | "cancelado" | "hecho";
export type Prestamo = {
  id: string; capacidad: TipoCapacidad; invitado: string; sesionId: string;
  estado: EstadoPrestamo; inicio: number; fin?: number; bytes: number;
};
export type ManejadorCapacidad = (datos: string | undefined, contexto: { signal: AbortSignal }) => Promise<string> | string;
export type OpcionesServidor = {
  manejadores: Partial<Record<TipoCapacidad, ManejadorCapacidad>>; oferta: OfertaNeurona; sesiones: Sesion[];
  ahora?: () => number; maxEnCurso?: number; maxEnCola?: number; tamanyoTrozoBytes?: number;
  salidas?: (mensaje: MsgCapacidad) => void;
};

export function crearServidor({
  manejadores, oferta, sesiones, ahora = () => Date.now(), maxEnCurso = 1, maxEnCola = 4,
  tamanyoTrozoBytes = 16 * 1024 - 256, salidas = () => {},
}: OpcionesServidor): {
  atender(mensaje: MsgCapacidad): Promise<AccionCapacidad>;
  cancelar(id: string): boolean;
  prestamos(): Prestamo[];
} {
  const prestamos = new Map<string, Prestamo>();
  const cortaPorId = new Map<string, () => void>();
  const cola: { pedir: MsgCapacidadPedir; prestamo: Prestamo }[] = [];
  let enCurso = 0;
  const negar = (mensaje: string): AccionCapacidad => ({ t: "denegado", mensaje });

  async function manejar(pedir: MsgCapacidadPedir, prestamo: Prestamo): Promise<void> {
    prestamo.estado = "en curso";
    const abort = new AbortController();
    let cancelado = false;
    cortaPorId.set(pedir.id, () => { cancelado = true; abort.abort(); });
    try {
      const texto = String(await manejadores[pedir.capacidad]!(pedir.datos, { signal: abort.signal }));
      prestamo.bytes = bytesUtf8(texto);
      for (const trozo of trocear(texto, tamanyoTrozoBytes)) salidas({ t: "capacidad.trozo", id: pedir.id, texto: trozo });
      salidas({ t: "capacidad.fin", id: pedir.id, bytes: prestamo.bytes });
      prestamo.estado = "hecho";
    } catch (e) {
      const mensaje = cancelado ? "Préstamo cancelado." : e instanceof Error ? e.message : "Error en la capacidad.";
      salidas({ t: "capacidad.error", id: pedir.id, estado: cancelado ? 499 : 500, mensaje });
      prestamo.estado = "cancelado";
    } finally {
      prestamo.fin = ahora();
      cortaPorId.delete(pedir.id);
      enCurso -= 1;
      desencolar();
    }
  }

  function desencolar(): void {
    while (enCurso < maxEnCurso && cola.length > 0) {
      const { pedir, prestamo } = cola.shift()!;
      enCurso += 1;
      void manejar(pedir, prestamo);
    }
  }

  function cortar(id: string): boolean {
    const corta = cortaPorId.get(id);
    if (corta) { corta(); return true; }
    const sitio = cola.findIndex((c) => c.pedir.id === id);
    if (sitio < 0) return false;
    const quita = cola.splice(sitio, 1)[0];
    quita.prestamo.estado = "cancelado";
    quita.prestamo.fin = ahora();
    return true;
  }

  const atender = async (mensaje: MsgCapacidad): Promise<AccionCapacidad> => {
    if (mensaje.t === "capacidad.cancelar") return cortar(mensaje.id) ? { t: "acepta" } : negar("Sin préstamo con ese id en curso ni en cola.");
    if (mensaje.t !== "capacidad.pedir") return negar("El anfitrión solo atiende capacidad.pedir y capacidad.cancelar.");
    const sesion = sesiones.find((s) => s.id === mensaje.sesionId);
    if (!sesion) return negar("No hay sesión de préstamo con ese id.");
    if (sesion.anfitrion !== oferta.nodoId) return negar("La sesión de préstamo no es de esta neurona.");
    if (!permitido(sesion, "capacidad", ahora())) return negar("La sesión de préstamo está revocada o caducada.");
    if (sesion.alcance.tipo === "capacidad" && sesion.alcance.id !== mensaje.capacidad && sesion.alcance.id !== "*") {
      return negar("La sesión de préstamo no cubre esta capacidad.");
    }
    if (!manejadores[mensaje.capacidad]) return negar(`La neurona no sirve la capacidad «${mensaje.capacidad}».`);
    const prestable = capacidadPrestable(oferta);
    if (prestable.computo.nucleos < 1 || prestable.computo.ramLibreMb <= 0) return negar("La neurona no presta cálculo ahora mismo (energía, horario o en uso).");
    if (enCurso >= maxEnCurso && cola.length >= maxEnCola) return negar(`La cola de préstamos está llena (máx. ${maxEnCola}).`);
    const prestamo: Prestamo = {
      id: mensaje.id, capacidad: mensaje.capacidad, invitado: sesion.invitado, sesionId: mensaje.sesionId,
      estado: "colada", inicio: ahora(), bytes: 0,
    };
    prestamos.set(prestamo.id, prestamo);
    cola.push({ pedir: mensaje, prestamo });
    desencolar();
    return prestamo.estado === "en curso" ? { t: "acepta" } : { t: "en cola", posicion: cola.findIndex((c) => c.pedir.id === prestamo.id) + 1 };
  };
  return { atender, cancelar: cortar, prestamos: () => [...prestamos.values()].map((p) => ({ ...p })) };
}

function trocear(texto: string, max: number): string[] {
  const partes: string[] = [];
  let actual = "";
  let bytesActual = 0;
  for (const caracter of texto) {
    const coste = new TextEncoder().encode(caracter).length;
    if (actual && bytesActual + coste > max) { partes.push(actual); actual = ""; bytesActual = 0; }
    actual += caracter;
    bytesActual += coste;
  }
  if (actual) partes.push(actual);
  return partes;
}
const bytesUtf8 = (texto: string): number => new TextEncoder().encode(texto).length;
