/* servir-capacidades — lado ANFITRIÓN del relé `capacidad.*` de la malla (Ola 1017A
 * · tarea F; architecture/apps-en-la-malla.md §6). Admite cada `capacidad.pedir`:
 * sesión de préstamo, topes de `capacidadPrestable` y manejador local; encola si
 * está lleno (máx. 4), trocea la respuesta, deja cancelar y anota ms y bytes en
 * `prestamos()` («Procesos activos»). Puro: sin node:*, sin red ni disco; reloj
 * y envío inyectados. */
import { CAPACIDAD_MALLA_MAX_BYTES, bytesUtf8, partirEnTrozos, type Msg, type TipoCapacidad } from "@/lib/network/capacidad-por-malla";
import { capacidadPrestable, type OfertaNeurona } from "@/lib/recursos/oferta";
import { permitido, type Sesion } from "@/lib/recursos/sesion-prestamo";

/** Manejador de un tipo de capacidad: cuerpo de la petición, señal de aborto y trozos. */
export type ManejadorCapacidad = (cuerpo: Record<string, unknown>, opciones: { signal: AbortSignal; onTrozo: (texto: string) => void }) => Promise<unknown>;
export type EstadoPrestamo = "en cola" | "en curso" | "hecho" | "cancelado" | "error";

/** Un préstamo vivo o hecho, tal como lo lee «Procesos activos». */
export interface Prestamo { id: string; tipo: TipoCapacidad; invitado: string; inicioMs: number; duracionMs: number; bytes: number; estado: EstadoPrestamo }

export interface OpcionesServidor {
  manejadores: Partial<Record<TipoCapacidad, ManejadorCapacidad>>; oferta: OfertaNeurona; sesiones: Sesion[] | (() => Sesion[]); ahora: () => number;
  enviar?: (mensaje: Msg, a: string) => boolean; maxEnCurso?: number; maxEnCola?: number; trozoBytes?: number;
}

export interface ServidorCapacidades {
  atender(mensaje: Msg, de?: string): void; prestamos(): Prestamo[]; cancelar(id: string): boolean;
}

const MAX_EN_CURSO_DEFECTO = 1, MAX_EN_COLA_DEFECTO = 4; // contrato §6: máx. 4 en cola

interface EnCurso { prestamo: Prestamo; abort: AbortController; cancelado: boolean; huboTrozos: boolean }
interface Encolado { id: string; de: string; tipo: TipoCapacidad; sesionId?: string; prestamo: Prestamo; cuerpo: Record<string, unknown> }

/** ¿La prestable de esta oferta sirve el tipo pedido? Nunca inventa recursos. */
export function prestablePara(tipo: TipoCapacidad, oferta: OfertaNeurona): boolean {
  const prestable = capacidadPrestable(oferta);
  if (tipo === "render") return prestable.computo.gpu;
  if (tipo === "buscar" || tipo === "construir") return prestable.computo.nucleos > 0 || prestable.computo.ramLibreMb > 0;
  return prestable.computo.motores.includes(tipo);
}

export function crearServidor(o: OpcionesServidor): ServidorCapacidades {
  const reloj = o.ahora, maxEnCurso = o.maxEnCurso ?? MAX_EN_CURSO_DEFECTO, maxEnCola = o.maxEnCola ?? MAX_EN_COLA_DEFECTO;
  const trozoBytes = o.trozoBytes ?? CAPACIDAD_MALLA_MAX_BYTES - 256, enviarMsg = o.enviar ?? (() => true); // tope del protocolo menos margen del sobre
  const sesionesVivas = (): Sesion[] => (typeof o.sesiones === "function" ? o.sesiones() : o.sesiones);
  const registro: Prestamo[] = [], enCurso = new Map<string, EnCurso>(), cola: Encolado[] = [];
  const errorA = (id: string, a: string, estado: number, mensaje: string): boolean => enviarMsg({ t: "capacidad.error", id, estado, mensaje: mensaje.slice(0, 300) }, a);
  const def = (estado: number, motivo: string) => ({ estado, motivo });
  /* Admisión de un `capacidad.pedir`: sesión, topes y manejador; `null` si pasa. */
  const admision = (tipo: TipoCapacidad, sesionId?: string, de?: string): { estado: number; motivo: string } | null => {
    if (!de) return def(403, "Falta quién pide la capacidad (`de`).");
    const sesion = sesionId ? sesionesVivas().find((s) => s.id === sesionId) : undefined;
    if (!sesion) return def(sesionId ? 404 : 403, sesionId ? "Sesión de préstamo desconocida para esta neurona." : "Esta capacidad se sirve con sesión de préstamo: falta id de sesión.");
    if (sesion.alcance.tipo !== "capacidad" || sesion.invitado !== de) return def(403, "La sesión no es de capacidad o pertenece a otro invitado.");
    if (!permitido(sesion, "usar", reloj())) return def(403, "Sesión de préstamo expirada o revocada.");
    if (!prestablePara(tipo, o.oferta)) return def(503, "Esta neurona no presta ese tipo ahora (topes de capacidadPrestable).");
    if (!o.manejadores[tipo]) return def(501, "Sin manejador local para este tipo de capacidad.");
    return null;
  };
  /* Pasa una entrada a «en curso» y corre su manejador; recomprueba la admisión por si la sesión caducó en cola. */
  const arrancar = (e: Encolado, reChk = true): void => {
    const prestamo = e.prestamo, rechazo = reChk ? admision(e.tipo, e.sesionId, e.de) : null;
    if (rechazo) { prestamo.estado = "error"; prestamo.duracionMs = Math.max(0, reloj() - prestamo.inicioMs); errorA(e.id, e.de, rechazo.estado, rechazo.motivo); siguiente(); return; }
    const vivo: EnCurso = { prestamo, abort: new AbortController(), cancelado: false, huboTrozos: false };
    enCurso.set(e.id, vivo); prestamo.estado = "en curso";
    const onTrozo = (texto: string): void => {
      for (const parte of partirEnTrozos(texto, trozoBytes)) {
        if (!parte) continue;
        vivo.huboTrozos = true; prestamo.bytes += bytesUtf8(parte);
        enviarMsg({ t: "capacidad.trozo", id: e.id, texto: parte }, e.de);
      }
    };
    Promise.resolve().then(() => o.manejadores[e.tipo]!(e.cuerpo, { signal: vivo.abort.signal, onTrozo }))
      .then((resultado: unknown) => {
        // En `fin` va la respuesta entera (lo que lee el relé); las largas ya salieron troceadas por `trozo`.
        if (!vivo.huboTrozos && typeof resultado === "string" && bytesUtf8(resultado) > trozoBytes) onTrozo(resultado);
        if (!vivo.huboTrozos) prestamo.bytes += bytesUtf8(typeof resultado === "string" ? resultado : (JSON.stringify(resultado) ?? ""));
        enviarMsg({ t: "capacidad.fin", id: e.id, resultado: resultado ?? "" }, e.de);
        terminar(e.id, vivo.cancelado ? "cancelado" : "hecho");
      })
      .catch((motivo: unknown) => {
        errorA(e.id, e.de, vivo.cancelado ? 499 : 500, motivo instanceof Error ? motivo.message : "Error al ejecutar la capacidad prestada.");
        terminar(e.id, vivo.cancelado ? "cancelado" : "error");
      });
  };
  const siguiente = (): void => { while (enCurso.size < maxEnCurso && cola.length > 0) arrancar(cola.shift()!); };
  const terminar = (id: string, estado: EstadoPrestamo): void => {
    const en = enCurso.get(id); if (!en) return; enCurso.delete(id);
    en.prestamo.estado = estado; en.prestamo.duracionMs = Math.max(0, reloj() - en.prestamo.inicioMs);
    siguiente();
  };
  const admitir = (msg: { id: string; tipo: TipoCapacidad; cuerpo: Record<string, unknown>; sesionId?: string }, de: string): void => {
    const rechazo = admision(msg.tipo, msg.sesionId, de);
    if (rechazo) { errorA(msg.id, de, rechazo.estado, rechazo.motivo); return; }
    if (enCurso.has(msg.id) || cola.some((x) => x.id === msg.id)) return; // reenvío duplicado: nada
    if (enCurso.size >= maxEnCurso && cola.length >= maxEnCola) { errorA(msg.id, de, 429, `Cola de capacidad llena (máx. ${maxEnCola} en espera).`); return; }
    const prestamo: Prestamo = { id: msg.id, tipo: msg.tipo, invitado: de, inicioMs: reloj(), duracionMs: 0, bytes: 0, estado: "en cola" };
    const entrada: Encolado = { id: msg.id, de, tipo: msg.tipo, sesionId: msg.sesionId, cuerpo: msg.cuerpo, prestamo }; registro.push(prestamo);
    if (enCurso.size < maxEnCurso) arrancar(entrada, false);
    else cola.push(entrada);
  };

  /* Cancela lo vivo: aborta si corre, expulsa de la cola si espera. */
  const quitar = (id: string, de?: string): boolean => {
    const en = enCurso.get(id);
    if (en && (!de || en.prestamo.invitado === de)) {
      en.cancelado = true; try { en.abort.abort(); } catch { /* ya abortado */ }
      return true;
    }
    const i = cola.findIndex((x) => x.id === id && (!de || x.de === de)); if (i < 0) return false;
    const [fuera] = cola.splice(i, 1);
    fuera.prestamo.estado = "cancelado"; fuera.prestamo.duracionMs = Math.max(0, reloj() - fuera.prestamo.inicioMs);
    return true;
  };

  return {
    atender: (mensaje: Msg, de?: string): void => { if (mensaje.t === "capacidad.pedir") admitir(mensaje, de ?? ""); else if (mensaje.t === "capacidad.cancelar") quitar(mensaje.id, de); },
    prestamos: (): Prestamo[] =>
      registro.map((p) => (p.estado === "en cola" || p.estado === "en curso" ? { ...p, duracionMs: Math.max(0, reloj() - p.inicioMs) } : { ...p })),
    cancelar: (id: string): boolean => quitar(id),
  };
}
