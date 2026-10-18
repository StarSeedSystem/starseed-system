"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdnAvatar } from "@/lib/avatares/adn/adn";
import { sanearAdn } from "@/lib/avatares/adn/adn";
import {
  CambioAvatar,
  sanearCambio,
  aplicarCambio,
  aplicarCambios,
  lote,
  intervaloEnvioMs,
  ColaEnvio,
  crearColaEnvio,
  encolar,
} from "@/lib/avatares/adn/cambios";
import { loadAdnEntry, parseAdnEntry } from "@/lib/avatares/adaptadores/almacen-adn";
import type { MetaAvatar } from "@/lib/vivo/espacial/avatares";

/**
 * Sincronización de ADN para avatares en escena.
 * - Cache de ADN por ref+rev para evitar lecturas repetidas.
 * - Envío lotes de cambios mediante el canal de la escena (10 Hz ajustado).
 * - Aplicación de cambios recibidos solo si la revisión es más nueva.
 */

/* ────────────────────────────── Tipos ────────────────────────────── */

export interface EventAdn {
  /** Evento tipo "adn" que viaja por el canal de la escena. */
  tipo: "adn";
  ref: string; // referencia al ADN (biblioteca:… o genesis:…)
  rev: number; // revisión del ADN
  cambios: CambioAvatar[]; // lote de cambios aplicados
}

/* ────────────────────────────── Estado ────────────────────────────── */

/** Cache en memoria: clave = ref, valor = { entry: AdnEntry, adn: AdnAvatar, rev: number } */
const adnCache = new Map<string, { entry: AdnEntry | null; adn: AdnAvatar | null; rev: number }>();

/**
 * Obtener ADN desde caché o Biblioteca.
 * Si no está en caché o la revisión es distinta, lo carga desde Biblioteca.
 * Devuelve el ADN válido o null si no se pudo obtener.
 */
async function obtenerAdn(ref: string, rev: number): Promise<AdnAvatar | null> {
  const cached = adnCache.get(ref);
  if (cached && cached.rev === rev && cached.adn !== null) {
    return cached.adn;
  }
  // No hay caché válida, intentar cargar desde Biblioteca
  const entry = await loadAdnEntry(ref, rev);
  if (!entry) return null;
  const adn = await parseAdnEntry(entry);
  if (!adn) return null;
  // Guardar en caché
  adnCache.set(ref, { entry, adn, rev: entry.rev });
  return adn;
}

/* ────────────────────────────── Lógica ────────────────────────────── */

/**
 * Inicializa la sincronización para un avatar local.
 * Devuelve un objeto con métodos para enviar cambios y manejar eventos recibidos.
 */
export function useAdnSincronia(
  miAvatar: MetaAvatar,
  enviarEvento: (evento: EventAdn) => void,
  setAdnLocal: (adn: AdnAvatar) => void,
): {
  /** Llamar cuando haya cambios locales para enviarlos. */
  cambiarLocal: (cambios: CambioAvatar[]) => void;
  /** Manejar un evento recibido del canal de la escena. */
  recibirEvento: (evento: EventAdn) => void;
} {
  const [, setEstado] = useState<void>();
  const colaRef = useRef<ColaEnvio>(crearColaEnvio());
  const ultimaEmisionRef = useRef<number>(-Infinity);
  const otrosPresentesRef = useRef<number>(0);

  // Actualizar el número de otros presentes (para ajustar el intervalo de envío)
  const actualizarOtrosPresentes = (n: number) => {
    otrosPresentesRef.current = n;
  };

  /** Enviar el lote de cambios pendientes si corresponde según el presupuesto de tráfico. */
  const intentarEnvio = useCallback((ahora: number) => {
    const loteCambios = lote(colaRef.current, ahora, otrosPresentesRef.current);
    if (loteCambios && loteCambios.length > 0) {
      const evento: EventAdn = {
        tipo: "adn",
        ref: miAvatar.adnRef ?? "",
        rev: miAvatar.adnRev ?? 0,
        cambios: loteCambios,
      };
      enviarEvento(evento);
      ultimaEmisionRef.current = ahora;
    }
  }, [miAvatar, enviarEvento]);

  /** Aplicar un cambio local y agregarlo a la cola para envío. */
  const cambiarLocal = useCallback((cambios: CambioAvatar[]) => {
    cambios.forEach((c) => encolar(colaRef.current, c));
    // Intentar envío inmediatamente (el propio lote respeta el intervalo)
    intentarEnvio(Date.now());
  }, [intentarEnvio, colaRef]);

  /** Recibir un evento adn de otro avatar y aplicar si la revisión es más nueva. */
  const recibirEvento = useCallback(async (evento: EventAdn) => {
    // Validar referencia y revisión
    if (!evento.ref || typeof evento.rev !== "number") return;
    // Obtener el ADN actual caché (si existe) para comparar revisión
    const cached = adnCache.get(evento.ref);
    const revActual = cached?.rev ?? -1;
    if (evento.rev <= revActual) return; // no es más nueva
    // Obtener el ADN desde Biblioteca (o caché actualizada)
    const adn = await obtenerAdn(evento.ref, evento.rev);
    if (!adn) return;
    // Aplicar los cambios recibidos (filtrados por sanearCambio)
    const cambiosValidos = evento.cambios.map(sanearCambio).filter((c): c is CambioAvatar => c !== null);
    if (cambiosValidos.length === 0) return;
    const adnActualizado = aplicarCambios(adn, cambiosValidos);
    // Guardar en caché y actualizar localmente
    adnCache.set(evento.ref, { entry: null, adn: adnActualizado, rev: evento.rev });
    setAdnLocal(adnActualizado);
    // Forzar una re-renderización para actualizar la UI
    setEstado(undefined);
  }, [adnCache, obtenerAdn, aplicarCambios, setAdnLocal]);

  // Efecto para intentar envío en cada fotograma (usando requestAnimationFrame)
  useEffect(() => {
    let animando = true;
    const ciclo = () => {
      if (!animando) return;
      const ahora = Date.now();
      intentarEnvio(ahora);
      requestAnimationFrame(ciclo);
    };
    requestAnimationFrame(ciclo);
    return () => {
      animando = false;
    };
  }, [intentarEnvio, intentarEnvio]);

  return {
    cambiarLocal,
    recibirEvento,
    actualizarOtrosPresentes,
  };
}