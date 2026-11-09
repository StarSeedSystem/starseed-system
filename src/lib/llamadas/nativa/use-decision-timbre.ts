"use client";

/*
 * useDecisionTimbre — quién suena y qué se enseña de una llamada entrante en esta ventana (LLA1108F, 2026-11-09).
 * Une los silencios (política), «Ignorar», si hay parte nativa y si la app está a la vista, y se lo da a
 * `decidirTimbre` (puro, con pruebas). Lo usan la tarjeta del timbre y la llamada directa flotante.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { decidirTimbre, estaIgnorada, suscribirIgnoradas, versionIgnoradas, consultaDe, type DecisionTimbre } from "./decision-timbre";
import { silenciadaPor, silenciosGuardados, suscribirSilencios } from "../silencio-llamadas";
import type { QuienLlama } from "./acciones-timbre";

/** La app está en pantalla y con foco (pestaña visible y ventana activa). */
export function appVisibleAhora(): boolean {
  if (typeof document === "undefined") return true;
  try {
    return document.visibilityState === "visible" && (typeof document.hasFocus !== "function" || document.hasFocus());
  } catch {
    return true;
  }
}

function useAppVisible(): boolean {
  const [visible, setVisible] = useState(appVisibleAhora);
  useEffect(() => {
    const act = () => setVisible(appVisibleAhora());
    document.addEventListener("visibilitychange", act);
    window.addEventListener("focus", act);
    window.addEventListener("blur", act);
    act();
    return () => {
      document.removeEventListener("visibilitychange", act);
      window.removeEventListener("focus", act);
      window.removeEventListener("blur", act);
    };
  }, []);
  return visible;
}

/** ¿Hay parte nativa que pueda sonar por su cuenta (Android con el parche)? Se pregunta una vez. */
function useHayNativa(): boolean {
  const [hay, setHay] = useState(false);
  useEffect(() => {
    let vivo = true;
    void import("./puente-llamada-nativa")
      .then(async (m) => {
        const p = m.puenteLlamadaNativa();
        if (!p.disponible) return;
        const c = await p.capacidades();
        // Solo Android suena por su cuenta; en escritorio la ventana propia la abre Rust y el tono es el de la web.
        if (vivo) setHay(c.nativa && c.plataforma === "android");
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);
  return hay;
}

export function useDecisionTimbre(q: QuienLlama): DecisionTimbre {
  const nativa = useHayNativa();
  const visible = useAppVisible();
  const silencios = useSyncExternalStore(suscribirSilencios, silenciosGuardados, silenciosGuardados);
  useSyncExternalStore(suscribirIgnoradas, versionIgnoradas, versionIgnoradas);
  const ignorada = estaIgnorada(q.id);
  const consulta = useMemo(() => consultaDe(q), [q.uid, q.neurona, q.chat, q.medio]); // eslint-disable-line react-hooks/exhaustive-deps
  const silencio = silenciadaPor(silencios, consulta, Date.now());
  return decidirTimbre({ nativa, appVisible: visible, ignorada, silencio });
}
