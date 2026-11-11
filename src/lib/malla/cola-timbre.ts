/**
 * cola-timbre — el timbre de una llamada nunca se rinde en silencio (MLL1111C). Lógica pura: el tiempo y las vías se inyectan.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Prueba 35 (10-11, 18:31): Alex apagó el Wi-Fi de la tableta y llamó desde el Mac. Todos los pasos del arranque dieron
 * «ok» y luego «inicio paso=timbre fallo»: el aviso no tenía por dónde ir y nadie lo repitió. El Bluetooth ligó un minuto
 * después y la llamada no sonó hasta que Alex volvió a llamar a mano.
 *
 * Ahora: si el primer aviso no sale, el timbre queda EN COLA durante `VENTANA_TIMBRE_MS` (quien llama ve «Buscando una vía
 * hasta <nombre>…»). Se repite en cuanto liga cualquier vía (`alVia`) y, si no, a 1, 2, 3, 3… s. Un aviso que falla por
 * una vía se reintenta por la siguiente (quien entrega, `avisar`, elige la mejor vía viva en cada intento). Cada intento
 * deja su línea en el registro del enlace; nunca hay un «fallo» sin reintento.
 */

export const VENTANA_TIMBRE_MS = 30_000;

/** Espera antes del intento n (n ≥ 2) si ninguna vía nueva lo adelanta. */
export function esperaTimbre(n: number): number {
  return Math.min(1_000 * Math.max(1, n - 1), 3_000);
}

export interface OpcionesColaTimbre {
  /** Entrega el aviso por la mejor vía viva ahora. true: entregado. */
  avisar: () => Promise<boolean>;
  /** Se entera de que ligó una vía (Bluetooth, red local, internet…). Devuelve la baja. */
  alVia?: (cb: (via: string) => void) => () => void;
  /** Línea para el registro del enlace (sin el prefijo «inicio paso=timbre»). */
  anotar?: (detalle: string) => void;
  /** Empieza (true) o acaba (false) la búsqueda: la ventana enseña «Buscando una vía hasta <nombre>…». */
  alBuscar?: (buscando: boolean) => void;
  /** La persona colgó mientras se buscaba: se deja de intentar. */
  cancelada?: () => boolean;
  ventanaMs?: number;
  ahora?: () => number;
  esperar?: (ms: number, despertar: (cb: () => void) => void) => Promise<void>;
}

export interface ResultadoTimbre {
  ok: boolean;
  intentos: number;
  ms: number;
  /** «primer-intento» · «via-nueva:<via>» · «reintento» · «plazo» · «cancelada». */
  motivo: string;
}

/** Espera `ms` o hasta que alguien llame a `despertar`, lo que llegue antes. */
function esperaPorDefecto(ms: number, despertar: (cb: () => void) => void): Promise<void> {
  return new Promise((ok) => {
    let hecho = false;
    const fin = () => {
      if (hecho) return;
      hecho = true;
      clearTimeout(t);
      ok();
    };
    const t = setTimeout(fin, ms);
    despertar(fin);
  });
}

export async function timbreConCola(o: OpcionesColaTimbre): Promise<ResultadoTimbre> {
  const ahora = o.ahora ?? (() => Date.now());
  const ventana = o.ventanaMs ?? VENTANA_TIMBRE_MS;
  const esperar = o.esperar ?? esperaPorDefecto;
  const anotar = (d: string) => {
    try {
      o.anotar?.(d);
    } catch {
      /* el registro nunca tumba el timbre */
    }
  };
  const t0 = ahora();
  let intentos = 0;
  let viaNueva: string | null = null;
  let despertador: (() => void) | null = null;
  const baja = o.alVia?.((via) => {
    viaNueva = via;
    despertador?.();
  });
  let buscando = false;
  const intentar = async (): Promise<boolean> => {
    intentos += 1;
    try {
      return await o.avisar();
    } catch {
      return false;
    }
  };
  try {
    let motivo = "primer-intento";
    for (;;) {
      if (o.cancelada?.()) {
        anotar(`cancelada intentos=${intentos} tras=${ahora() - t0}ms`);
        return { ok: false, intentos, ms: ahora() - t0, motivo: "cancelada" };
      }
      const ok = await intentar();
      const ms = ahora() - t0;
      if (ok) {
        if (intentos > 1) anotar(`ok intento=${intentos} tras=${ms}ms motivo=${motivo}`);
        return { ok: true, intentos, ms, motivo };
      }
      const queda = ventana - ms;
      if (queda <= 0) {
        anotar(`agotada intentos=${intentos} tras=${ms}ms ventana=${ventana}ms`);
        return { ok: false, intentos, ms, motivo: "plazo" };
      }
      if (!buscando) {
        buscando = true;
        try {
          o.alBuscar?.(true);
        } catch {
          /* noop */
        }
        anotar(`en-cola intento=1 sin-via ventana=${ventana}ms`);
      } else {
        anotar(`reintento-fallido intento=${intentos} tras=${ms}ms motivo=${motivo}`);
      }
      // Una vía que ligó MIENTRAS se intentaba: se prueba ya, sin esperar.
      if (viaNueva) {
        motivo = `via-nueva:${viaNueva}`;
        viaNueva = null;
        continue;
      }
      await esperar(Math.min(esperaTimbre(intentos + 1), queda), (cb) => {
        despertador = cb;
      });
      despertador = null;
      motivo = viaNueva ? `via-nueva:${viaNueva}` : "reintento";
      viaNueva = null;
    }
  } finally {
    baja?.();
    if (buscando) {
      try {
        o.alBuscar?.(false);
      } catch {
        /* noop */
      }
    }
  }
}

/** «Buscando una vía hasta Maggaboard…». */
export function textoBuscandoVia(nombre: string | null | undefined): string {
  const n = (nombre ?? "").trim();
  return `Buscando una vía hasta ${n || "el otro aparato"}…`;
}
