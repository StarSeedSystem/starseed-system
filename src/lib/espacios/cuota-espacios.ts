/**
 * Cuota de GPU gratis de los Spaces públicos de Hugging Face, contada EN EL APARATO
 * de cada persona (tarea ESP1011A). Contratos: architecture/astraura-avatares-3d.md
 * §11.2 y architecture/astraura-imagenes.md §3.
 *
 * Reglas:
 *  - Cada persona gasta SU cuota (ZeroGPU: 2 min/día sin cuenta, 5 con cuenta
 *    gratis, 40 con PRO). Nada se cuenta en nuestros servidores ni en Supabase:
 *    el registro vive solo en este aparato (`safe-storage`).
 *  - «Basta de ilusiones»: lo que contamos es lo que devolvió cada llamada (el
 *    tiempo de proceso que vimos, o los segundos que el propio Space dijo que
 *    quedaban). Por eso el texto dice «unos N min»: Hugging Face no nos da su
 *    contador y la cuota de ZeroGPU es de la persona, compartida entre Spaces.
 *  - Un error de cuota agotada se reconoce para pasar a la siguiente opción.
 */
import { safeGet, safeSet } from "@/lib/safe-storage";

/** Minutos de GPU gratis al día que da ZeroGPU según la cuenta (2026-10-11). */
export const MINUTOS_DIA_POR_NIVEL = { "sin-cuenta": 2, gratis: 5, pro: 40 } as const;
export type NivelCuentaHf = keyof typeof MINUTOS_DIA_POR_NIVEL;

export const CLAVE_CUOTA = "starseed.espacios.cuota.v1";

/** Almacén mínimo del aparato (por defecto `safe-storage`; las pruebas pasan uno en memoria). */
export interface AlmacenLocal {
  get(clave: string): string | null;
  set(clave: string, valor: string): boolean;
  remove?(clave: string): void;
}

export const almacenDelAparato: AlmacenLocal = { get: safeGet, set: safeSet };

export interface UsoEspacio {
  /** Segundos de GPU vistos hoy en llamadas terminadas. */
  segundos: number;
  llamadas: number;
  /** El propio Space dijo hoy que la cuota está agotada. */
  agotado?: boolean;
}

interface RegistroCuota {
  dia: string;
  porEspacio: Record<string, UsoEspacio>;
  /** Último «te quedan N s» que dijo un Space hoy (manda sobre nuestra cuenta). */
  restanteDichoSegundos?: number;
}

/** Día civil UTC: así reinicia el contador sin depender del reloj local. */
export function claveDiaUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function leer(almacen: AlmacenLocal, ahora: number): RegistroCuota {
  const dia = claveDiaUtc(ahora);
  try {
    const crudo = almacen.get(CLAVE_CUOTA);
    if (crudo) {
      const r = JSON.parse(crudo) as RegistroCuota;
      if (r && r.dia === dia && r.porEspacio && typeof r.porEspacio === "object") return r;
    }
  } catch {
    // registro dañado: se empieza de cero (mejor que inventar)
  }
  return { dia, porEspacio: {} };
}

function guardar(almacen: AlmacenLocal, r: RegistroCuota): void {
  almacen.set(CLAVE_CUOTA, JSON.stringify(r));
}

/** Anota los segundos de GPU que gastó una llamada terminada a un Space. */
export function registrarUso(
  espacioId: string,
  segundos: number,
  almacen: AlmacenLocal = almacenDelAparato,
  ahora = Date.now(),
): UsoEspacio {
  const r = leer(almacen, ahora);
  const previo = r.porEspacio[espacioId] ?? { segundos: 0, llamadas: 0 };
  const añadidos = Math.max(0, Number.isFinite(segundos) ? segundos : 0);
  const uso: UsoEspacio = { ...previo, segundos: previo.segundos + añadidos, llamadas: previo.llamadas + 1 };
  r.porEspacio[espacioId] = uso;
  if (typeof r.restanteDichoSegundos === "number") {
    r.restanteDichoSegundos = Math.max(0, r.restanteDichoSegundos - añadidos);
  }
  guardar(almacen, r);
  return uso;
}

/** El Space dijo que la cuota está agotada (y, si lo dijo, cuántos segundos quedan). */
export function marcarAgotado(
  espacioId: string,
  restanteSegundos: number | null,
  almacen: AlmacenLocal = almacenDelAparato,
  ahora = Date.now(),
): void {
  const r = leer(almacen, ahora);
  const previo = r.porEspacio[espacioId] ?? { segundos: 0, llamadas: 0 };
  r.porEspacio[espacioId] = { ...previo, agotado: true };
  if (restanteSegundos !== null) r.restanteDichoSegundos = restanteSegundos;
  guardar(almacen, r);
}

/** ¿Este Space ya dijo hoy que no queda cuota? (para no gastar otra llamada en él). */
export function agotadoHoy(espacioId: string, almacen: AlmacenLocal = almacenDelAparato, ahora = Date.now()): boolean {
  return leer(almacen, ahora).porEspacio[espacioId]?.agotado === true;
}

export function usoDeHoy(almacen: AlmacenLocal = almacenDelAparato, ahora = Date.now()): Readonly<Record<string, UsoEspacio>> {
  return leer(almacen, ahora).porEspacio;
}

export type ClaseErrorEspacio = "cuota" | "lleno" | "otro";

/**
 * Reconoce el mensaje de error de un Space. ZeroGPU devuelve frases como
 * «You have exceeded your GPU quota (60s requested vs. 29s left).» o
 * «ZeroGPU quota exceeded»; una cola llena, «queue is full».
 */
export function clasificarErrorEspacio(mensaje: string | null | undefined): ClaseErrorEspacio {
  const m = String(mensaje ?? "");
  if (/exceeded (your|the) (free )?gpu quota|gpu quota|zerogpu.{0,40}(quota|limit)|quota (exceeded|reached)|out of (daily )?quota|cuota/i.test(m)) {
    return "cuota";
  }
  if (/queue is full|queue full|too many requests|cola (está )?llena/i.test(m)) return "lleno";
  return "otro";
}

/** Segundos que el Space dice que quedan («… vs. 29s left»), o null si no lo dice. */
export function segundosRestantesDeError(mensaje: string | null | undefined): number | null {
  const m = /(\d+(?:\.\d+)?)\s*s(?:econds?)?\s+left/i.exec(String(mensaje ?? ""));
  return m ? Math.max(0, Number(m[1])) : null;
}

export interface EstadoCuota {
  nivel: NivelCuentaHf;
  minutosDia: number;
  gastadoMin: number;
  quedanMin: number;
  agotado: boolean;
  /** Frase honesta lista para enseñar. */
  texto: string;
}

/** Cuánto queda hoy, con el texto que se enseña («te quedan unos N min hoy»). */
export function estadoCuota(
  nivel: NivelCuentaHf,
  almacen: AlmacenLocal = almacenDelAparato,
  ahora = Date.now(),
): EstadoCuota {
  const r = leer(almacen, ahora);
  const minutosDia = MINUTOS_DIA_POR_NIVEL[nivel];
  const usos = Object.values(r.porEspacio);
  const gastadoSeg = usos.reduce((s, u) => s + u.segundos, 0);
  const gastadoMin = gastadoSeg / 60;
  let quedanMin = Math.max(0, minutosDia - gastadoMin);
  if (typeof r.restanteDichoSegundos === "number") quedanMin = Math.min(quedanMin, r.restanteDichoSegundos / 60);
  const agotado = quedanMin <= 0 || (usos.some((u) => u.agotado) && typeof r.restanteDichoSegundos !== "number");

  let texto: string;
  if (agotado) {
    texto = "Hoy ya no te queda cuota gratis de GPU en Hugging Face. Vuelve mañana o usa otra opción.";
  } else if (usos.length === 0) {
    texto = `Tienes unos ${minutosDia} min de GPU gratis al día en Hugging Face; hoy aún no has usado nada.`;
  } else {
    const n = quedanMin >= 1 ? Math.floor(quedanMin) : Math.round(quedanMin * 10) / 10;
    texto = `Te quedan unos ${n} min de GPU gratis hoy en Hugging Face.`;
  }
  if (nivel === "sin-cuenta" && !agotado) {
    texto += " Con una cuenta gratis serían 5 min al día.";
  }
  return { nivel, minutosDia, gastadoMin, quedanMin, agotado, texto };
}
