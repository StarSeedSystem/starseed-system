/*
 * espejo-silencios — la lista de silencios de la web espejada a la parte nativa (LLA1108F, 2026-11-09).
 * Contrato: architecture/llamadas-telefonia.md § 8.5.
 *
 * Rust guarda `silencios-llamadas.json` en la carpeta que comparte con Kotlin; Kotlin lo lee al sonar (con el JS
 * congelado) y también escribe en él («Silenciar…» desde la pantalla de bloqueo). Aquí se manda la lista de la web
 * (`llamada_silencios_sincronizar`), Rust la fusiona con la nativa y devuelve el resultado, que la web adopta.
 * Pura salvo lo inyectado: el almacén, el reloj y la llamada a Rust. Nunca lanza.
 */

import { fusionar, guardarSilencios, leerSilencios, serializarSilencios, silenciosGuardados, suscribirSilencios, type Silencio } from "../silencio-llamadas";

export interface DepsEspejo {
  llamar(cmd: string, args: Record<string, unknown>): Promise<{ ok: boolean; valor?: unknown }>;
  leer?: () => readonly Silencio[];
  guardar?: (lista: readonly Silencio[]) => void;
  suscribir?: (cb: () => void) => () => void;
  ahora?: () => number;
  /** Espera antes de mandar (varios cambios seguidos = un envío). */
  esperaMs?: number;
}

export interface Espejo {
  /** Manda ya la lista y adopta lo que devuelva Rust. Devuelve si Rust contestó. */
  sincronizar(): Promise<boolean>;
  parar(): void;
}

export function crearEspejoSilencios(deps: DepsEspejo): Espejo {
  const leer = deps.leer ?? silenciosGuardados;
  const guardar = deps.guardar ?? guardarSilencios;
  const suscribir = deps.suscribir ?? suscribirSilencios;
  const ahora = deps.ahora ?? Date.now;
  let ultimo = "";
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let parado = false;

  async function sincronizar(): Promise<boolean> {
    const json = serializarSilencios(leer());
    if (json === ultimo) return true;
    try {
      const r = await deps.llamar("llamada_silencios_sincronizar", { json });
      if (!r.ok || typeof r.valor !== "string") return false;
      const fusion = fusionar(leer(), leerSilencios(r.valor), ahora());
      const nuevo = serializarSilencios(fusion);
      // Lo que se adopta ya está en Rust: no se vuelve a mandar.
      ultimo = nuevo;
      if (nuevo !== serializarSilencios(leer())) guardar(fusion);
      return true;
    } catch {
      return false;
    }
  }

  const baja = suscribir(() => {
    if (parado) return;
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      temporizador = null;
      void sincronizar();
    }, deps.esperaMs ?? 300);
  });

  return {
    sincronizar,
    parar: () => {
      parado = true;
      if (temporizador) clearTimeout(temporizador);
      baja();
    },
  };
}
