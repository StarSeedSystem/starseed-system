"use client";

/**
 * estacion-global — la estación en vivo que suena en TODO el OS, aunque cambies de página (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOP: `architecture/estaciones-en-vivo-parametricas.md` (§5.2).
 *
 * Un único objeto por pestaña: la sesión sintonizada (`SesionEnVivo`), sus canales reales y el
 * motor de sonido (`MotorSonido`). Lo cargan perezosamente el montaje global del layout
 * (`montaje-estacion-vivo.tsx`), el panel de la estación y el puente con la app oficial. Lo pinta
 * el minicontrol. Nada de esto baja al navegador hasta que alguien sintoniza una estación.
 */

import { useSyncExternalStore } from "react";
import { importarPrivada, llaveCasaConId, publicaDePrivada } from "./cripto-estacion";
import { crearCanalInternet, engancharEnlacesLocales } from "./canales-estacion";
import { guardarControlImportado, llaveDe, registroDe } from "./llaves-locales";
import { MotorSonido, type EstadoMotor } from "./motor-estacion";
import { SesionEnVivo, type CanalEstacion, type FotoSesion } from "./sesion-en-vivo";
import {
  enlaceDeSesion,
  leerEnlaceSesion,
  type FichaSesion,
  type ParametrosSesion,
  type TipoAccion,
} from "./transmision-parametrica";

const CLAVE_SINTONIZADA = "starseed.estaciones.sintonizada.v1";
const LATIDO_FILA_MS = 60_000;

export interface FotoEstacionGlobal {
  href: string | null;
  sesion: FotoSesion | null;
  motor: EstadoMotor;
  volumen: number;
  silenciada: boolean;
  cargando: boolean;
  error: string | null;
  /** Fila del directorio que esta pestaña mantiene viva (solo el anfitrión). */
  fila: string | null;
}

const MOTOR_VACIO: EstadoMotor = { listo: false, latenciaMs: null, baseTiempo: null, necesitaGesto: true, sonando: false, tramos: 0, error: null };

class EstacionGlobal {
  private sesion: SesionEnVivo | null = null;
  private motor = new MotorSonido();
  private href: string | null = null;
  private cargando = false;
  private error: string | null = null;
  private bajas: (() => void)[] = [];
  private oyentes = new Set<() => void>();
  private instantanea: FotoEstacionGlobal = this.calcular();
  private extras = new Set<CanalEstacion>();

  suscribir = (cb: () => void): (() => void) => {
    this.oyentes.add(cb);
    return () => {
      this.oyentes.delete(cb);
    };
  };

  foto = (): FotoEstacionGlobal => this.instantanea;

  private calcular(): FotoEstacionGlobal {
    const s = this.sesion?.foto() ?? null;
    return {
      href: this.href,
      sesion: s,
      motor: this.sesion ? this.motor.estado() : MOTOR_VACIO,
      volumen: this.motor.volumenLocal(),
      silenciada: this.motor.silenciado(),
      cargando: this.cargando,
      error: this.error,
      fila: s ? registroDe(s.ficha.id)?.fila ?? null : null,
    };
  }

  private emitir(): void {
    this.instantanea = this.calcular();
    for (const cb of Array.from(this.oyentes)) {
      try {
        cb();
      } catch {
        /* nada */
      }
    }
  }

  sesionActual(): SesionEnVivo | null {
    return this.sesion;
  }

  /**
   * Sintoniza una estación por su enlace (`/estaciones/vivo/<id>?f=…` o con `#f=…&k=…`). Si el
   * enlace trae la llave de control (`c=`), este medio pasa a controlarla.
   */
  async sintonizar(href: string, op: { ficha?: FichaSesion; token?: string | null } = {}): Promise<{ ok: boolean; motivo?: string }> {
    const leido = leerEnlaceSesion(href);
    const ficha = op.ficha ?? leido?.ficha ?? null;
    if (!leido || !ficha || ficha.id !== leido.id) {
      return this.fallo("El enlace no trae los datos de la estación (o están dañados).");
    }
    const token = op.token ?? leido.token ?? registroDe(ficha.id)?.token ?? null;
    if (ficha.privada && !token) return this.fallo("Esta estación es privada y el enlace no trae la invitación.");
    if (!(await llaveCasaConId(ficha.pk, ficha.id))) return this.fallo("La llave de la estación no corresponde a su enlace.");

    if (this.sesion?.ficha.id === ficha.id) {
      if (leido.control) await this.importarControl(ficha, leido.control, token);
      return { ok: true };
    }
    this.salir(false);
    this.cargando = true;
    this.error = null;
    this.emitir();

    let llave = await llaveDe(ficha.id);
    if (!llave && leido.control) llave = await this.validarControl(ficha, leido.control);
    if (llave && leido.control) {
      guardarControlImportado(ficha.id, leido.control, { enlace: enlaceDeSesion(ficha, { token: token ?? undefined }), titulo: ficha.titulo, token: token ?? undefined });
    }
    const referencia = !!llave && !!registroDe(ficha.id)?.referencia;
    const sesion = new SesionEnVivo({ ficha, token, llave, referencia });
    this.sesion = sesion;
    this.href = enlaceDeSesion(ficha, { token: token ?? undefined });
    this.bajas.push(sesion.suscribir(() => this.emitir()));
    for (const c of this.extras) sesion.agregarCanal(c);

    const internet = await crearCanalInternet(ficha.id, ficha.privada ? token : null).catch(() => null);
    if (this.sesion !== sesion) {
      internet?.cerrar();
      return { ok: false, motivo: "Se cambió de estación mientras conectaba." };
    }
    if (internet) sesion.agregarCanal(internet);
    const bajaLocal = await engancharEnlacesLocales(
      (c) => sesion.agregarCanal(c),
      (c) => sesion.quitarCanal(c),
    );
    this.bajas.push(bajaLocal);
    sesion.arrancar();
    this.motor.seguir(() => (this.sesion ? { estado: this.sesion.foto().estado, ahora: this.sesion.ahora() } : null));
    this.bajas.push(this.latirFila(sesion));
    this.recordar(this.href);
    this.cargando = false;
    if (!internet) this.error = "Sin conexión a internet: solo por enlaces locales (si los hay).";
    this.emitir();
    return { ok: true };
  }

  /** Abre el audio (debe llamarse desde un gesto: pulsar «Escuchar»). */
  async escuchar(): Promise<boolean> {
    const ok = await this.motor.preparar();
    if (ok) this.motor.programar();
    this.emitir();
    return ok;
  }

  /** Acción para TODOS (solo con control). */
  async controlar(
    tipo: Exclude<TipoAccion, "base">,
    extra: { params?: ParametrosSesion; volumen?: number } = {},
  ): Promise<{ ok: boolean; motivo?: string }> {
    if (!this.sesion) return { ok: false, motivo: "No hay ninguna estación sintonizada." };
    const r = await this.sesion.accion(tipo, extra);
    this.emitir();
    return { ok: r.ok, motivo: r.motivo };
  }

  volumen(v: number): void {
    this.motor.volumen(v);
    this.emitir();
  }

  silenciar(si: boolean): void {
    this.motor.silenciar(si);
    this.emitir();
  }

  /** Sale de la estación en esta pestaña (los demás siguen). */
  salir(olvidar = true): void {
    for (const b of this.bajas.splice(0)) {
      try {
        b();
      } catch {
        /* nada */
      }
    }
    this.sesion?.cerrar();
    this.sesion = null;
    this.motor.cerrar();
    this.motor = new MotorSonido();
    this.href = null;
    this.cargando = false;
    if (olvidar) {
      this.error = null;
      this.recordar(null);
    }
    this.emitir();
  }

  /** Un canal más para la sesión actual y las siguientes (el puente con la app oficial). */
  agregarCanalExtra(c: CanalEstacion): () => void {
    this.extras.add(c);
    this.sesion?.agregarCanal(c);
    return () => {
      this.extras.delete(c);
      this.sesion?.quitarCanal(c);
    };
  }

  /** La estación que había sintonizada antes de recargar (sin llave de control). */
  recordada(): string | null {
    try {
      return window.localStorage.getItem(CLAVE_SINTONIZADA);
    } catch {
      return null;
    }
  }

  private recordar(href: string | null): void {
    try {
      if (href) window.localStorage.setItem(CLAVE_SINTONIZADA, href);
      else window.localStorage.removeItem(CLAVE_SINTONIZADA);
    } catch {
      /* sin almacenamiento */
    }
  }

  private fallo(motivo: string): { ok: false; motivo: string } {
    this.error = motivo;
    this.cargando = false;
    this.emitir();
    return { ok: false, motivo };
  }

  private async validarControl(ficha: FichaSesion, control: string): Promise<CryptoKey | null> {
    const llave = await importarPrivada(control);
    if (!llave) return null;
    return (await publicaDePrivada(llave)) === ficha.pk ? llave : null;
  }

  private async importarControl(ficha: FichaSesion, control: string, token: string | null): Promise<void> {
    const llave = await this.validarControl(ficha, control);
    if (!llave || !this.sesion) return;
    guardarControlImportado(ficha.id, control, { enlace: enlaceDeSesion(ficha, { token: token ?? undefined }), titulo: ficha.titulo, token: token ?? undefined });
    this.sesion.tomarControl(llave);
    this.emitir();
  }

  /**
   * El anfitrión mantiene su fila del directorio fiel a la sesión: latido cada 60 s mientras suena
   * (el directorio solo dice «en directo» si el anfitrión está de verdad), y pausada/terminada en
   * cuanto la línea de tiempo llega a esa acción.
   */
  private latirFila(sesion: SesionEnVivo): () => void {
    let parado = false;
    let ultimaFase: string | null = null;
    const fila = () => {
      const f = sesion.foto();
      return f.control ? registroDe(f.ficha.id)?.fila ?? null : null;
    };
    const vuelta = async () => {
      if (parado) return;
      const f = sesion.foto();
      const id = fila();
      if (id && f.posicion.fase === "sonando") {
        const { latirEstacion } = await import("./datos");
        await latirEstacion(id, f.oyentes ?? undefined).catch(() => false);
      }
      if (!parado) h = setTimeout(vuelta, LATIDO_FILA_MS);
    };
    const alCambiar = async () => {
      const id = fila();
      if (!id || parado) return;
      const fase = sesion.foto().posicion.fase;
      if (fase === ultimaFase) return;
      const antes = ultimaFase;
      ultimaFase = fase;
      const datos = await import("./datos");
      if (fase === "pausada") await datos.pausarEstacion(id, true).catch(() => false);
      else if (fase === "terminada") await datos.terminarEstacion(id).catch(() => false);
      else if (fase === "sonando") {
        if (antes === "pausada") await datos.pausarEstacion(id, false).catch(() => false);
        if (antes === "terminada") await datos.editarEstacion(id, { termina_en: null }).catch(() => null);
        await datos.latirEstacion(id, sesion.foto().oyentes ?? undefined).catch(() => false);
      }
    };
    // La fase cambia sola al llegar el instante de una acción: se mira cada 2 s y en cada aviso.
    const baja = sesion.suscribir(() => void alCambiar());
    const mirar = setInterval(() => void alCambiar(), 2_000);
    let h = setTimeout(vuelta, 5_000);
    return () => {
      parado = true;
      baja();
      clearInterval(mirar);
      clearTimeout(h);
    };
  }
}

let unica: EstacionGlobal | null = null;

export function estacionGlobal(): EstacionGlobal {
  if (!unica) unica = new EstacionGlobal();
  return unica;
}

export type { EstacionGlobal };

const VACIA: FotoEstacionGlobal = {
  href: null,
  sesion: null,
  motor: MOTOR_VACIO,
  volumen: 0.8,
  silenciada: false,
  cargando: false,
  error: null,
  fila: null,
};

/** Foto reactiva de la estación global (para la interfaz). */
export function useEstacionGlobal(): FotoEstacionGlobal {
  const g = estacionGlobal();
  return useSyncExternalStore(g.suscribir, g.foto, () => VACIA);
}
