"use client";

/**
 * StartupUpdatesModal — «CONFIGURACIÓN/ACTUALIZACIÓN DE SISTEMAS DE ASTRAURA EN
 * ESTA NEURONA» (Adenda 111 · refactor 132 · rediseño 149).
 * ============================================================================
 * ENVOLTORIO FINO: conserva el GATE de auto-apertura (primera entrada de la neurona o
 * novedades de catálogo, `shouldShowUpdates`, retardo ~1200 ms), el evento de apertura
 * manual (`subscribeStartupOpen` / `openStartupUpdates`) y su overlay centrado z-[120].
 * El CONTENIDO es el componente reutilizable `AstrauraOmniVoiceConfig`
 * (variant="modal"): título dinámico por contexto (neurona nueva / actualización
 * de sistemas en uso / recomendaciones) y pestañas LLM · Astraura · OmniVoice ·
 * Cerebro · Señales por personalidad — ver `astraura-omnivoice-config.tsx` y el
 * SOP `architecture/astraura-config-sistemas-neurona.md`.
 *
 * Adenda 132: si el Centro de Configuración de Aurora está PENDIENTE (`isSetupPending`),
 * NO auto-abrimos esta ventana en esta sesión, para evitar dos modales apilados en la
 * primera visita a /agent (AuroraSetupCenter + esta ventana). La apertura MANUAL por
 * evento sigue funcionando siempre.
 *
 * Adenda 149 (ola 1): accesibilidad del overlay propio con `useModalA11y`
 * (Adendas 137/142) — foco inicial dentro de la ventana, trampa de Tab y cierre
 * con Escape. Escape equivale a «Recordar luego»: pospone (`snoozeUpdates`) igual
 * que la X y el botón del pie, en vez de cerrar sin dejar rastro.
 *
 * SSR-safe: no renderiza en servidor; decide abrir tras montar. Nunca lanza.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { shouldShowUpdates, subscribeStartupOpen, openStartupUpdates, snoozeUpdates } from "@/lib/astraura/startup-updates";
import { isSetupPending, subscribeSetup, markSetupDone } from "@/lib/aurora/setup-config";
import { useModalA11y } from "@/hooks/use-modal-a11y";
import { AstrauraOmniVoiceConfig } from "@/components/astraura/astraura-omnivoice-config";

export function StartupUpdatesModal() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // (Adenda 192) Cortesía con el rito/guía: manual = nunca replegar; espera viva.
  const manualRef = useRef(false);
  const esperaRef = useRef<(() => void) | null>(null);
  // (Adenda 194) Una vez que el usuario la cierra, NO vuelve a abrirse sola en
  // esta sesión: la espera de cortesía que se registró mientras estaba plegada
  // seguía viva y la resucitaba justo después de cerrarla.
  const cerradaPorUsuarioRef = useRef(false);
  useEffect(() => () => { esperaRef.current?.(); }, []); // solo al desmontar

  /**
   * (Adenda 193) Al CERRAR esta ventana arranca la guía de introducción si el
   * rito la dejó pendiente: el orden pedido es bienvenida → sistemas de
   * Astraura → guía. Idempotente: la marca se consume una sola vez.
   */
  const lanzarGuiaPendiente = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.sessionStorage.getItem("starseed.guia.pendiente") !== "1") return;
      window.sessionStorage.removeItem("starseed.guia.pendiente");
    } catch { return; }
    // (Adenda 219) Esta ventana YA configuró la neurona en el rito: el centro
    // «Configurar Neurona» (aurora-setup-center) no debe abrirse solo después
    // del perfil — visto en vivo tras «Ver mi perfil». Queda disponible en
    // Ajustes y en la paleta de comandos.
    try { markSetupDone(); } catch { /* sin storage */ }
    // (Adenda 194) Antes de la guía va la VENTANA DE PERFIL: se sube avatar y
    // portada, se corrige el @handle y luego se ve el perfil completo; desde
    // ahí arranca el recorrido en el Escritorio. Si esa ventana no estuviera
    // montada, se cae a la guía directa para no dejar el flujo colgado.
    window.setTimeout(() => {
      try {
        window.sessionStorage.setItem("starseed.perfil.launch", "1");
        window.dispatchEvent(new Event("starseed:open-perfil-inicial"));
        return;
      } catch { /* sin sessionStorage: guía directa */ }
      try {
        const w = window as unknown as { openStarseedGuide?: () => void };
        if (typeof w.openStarseedGuide === "function") w.openStarseedGuide();
        else window.dispatchEvent(new Event("starseed:open-guide"));
      } catch { /* la guía queda disponible en Ajustes */ }
    }, 400);
  }, []);

  /** Escape = «Recordar luego»: pospone y cierra (nunca lanza). */
  /** Cierre definitivo: corta esperas pendientes y no reabre. */
  const cerrarDefinitivo = useCallback(() => {
    cerradaPorUsuarioRef.current = true;
    esperaRef.current?.();
    esperaRef.current = null;
    setOpen(false);
  }, []);

  const remindLater = useCallback(() => {
    try { snoozeUpdates(); } catch { /* */ }
    cerrarDefinitivo();
    lanzarGuiaPendiente();
  }, [lanzarGuiaPendiente, cerrarDefinitivo]);

  // Foco inicial + trampa de Tab + Escape (patrón de la Adenda 137).
  useModalA11y({ open, onClose: remindLater, containerRef });

  useEffect(() => {
    // Auto-apertura GARANTIZADA por neurona (A149 · olas): primera entrada,
    // novedades del catálogo o CONFIGURACIÓN PENDIENTE (`shouldShowUpdates`
    // ya integra `pendingConfiguration()`, p.ej. la vía de voz sin elegir).
    // Si el Centro de Configuración de Aurora está PENDIENTE ya NO se pierde la
    // sesión entera (regresión de la A132 detectada por Alex: en neuronas sin
    // el setup completado la ventana no aparecía NUNCA): nos suscribimos y
    // abrimos EN CUANTO el Centro termina, con un respiro de 800 ms para no
    // solapar dos modales.
    let offSetup: (() => void) | null = null;
    let t2: ReturnType<typeof setTimeout> | null = null;
    let tFallback: ReturnType<typeof setTimeout> | null = null;
    // (Adenda 192) Cortesía con el RITO y la GUÍA de bienvenida: toda auto-
    // apertura pasa por aquí y ESPERA a que el primer plano quede libre —
    // abierta encima los enterraba y su modal cancelaba la navegación de los
    // vínculos de la guía («Ir a Cerebros» no navegaba). La apertura MANUAL
    // (evento/ajustes) sigue siendo inmediata.
    let cancelaEspera: (() => void) | null = null;
    const abrirConCortesia = () => {
      if (cerradaPorUsuarioRef.current) return;
      void import("@/lib/ui/fullscreen-modal")
        .then((m) => {
          cancelaEspera?.();
          cancelaEspera = m.alLiberarsePrimerPlano(() => {
            if (!cerradaPorUsuarioRef.current) setOpen(true);
          });
        })
        .catch(() => { if (!cerradaPorUsuarioRef.current) setOpen(true); });
    };
    // (Adenda 193) Relevo directo del rito: si la bienvenida acaba de terminar
    // (marca de sesión), esta ventana se abre YA — es su turno en el orden,
    // antes de la guía — sin esperar al sondeo de cortesía.
    try {
      if (window.sessionStorage.getItem("starseed.sistemas.launch") === "1") {
        window.sessionStorage.removeItem("starseed.sistemas.launch");
        manualRef.current = true;
        setOpen(true);
      }
    } catch { /* sin sessionStorage: sigue el flujo normal */ }

    const t = setTimeout(() => {
      try {
        if (isSetupPending()) {
          offSetup = subscribeSetup(() => {
            try {
              if (isSetupPending()) return; // sigue pendiente: esperar al siguiente evento
              offSetup?.();
              offSetup = null;
              t2 = setTimeout(() => { if (shouldShowUpdates()) abrirConCortesia(); }, 800);
            } catch { /* */ }
          });
          // RED DE SEGURIDAD (garantía de aparición por neurona): el Centro solo
          // se auto-ofrece en ciertos disparadores; si a los 9 s sigue pendiente
          // pero NO está en pantalla (marcador `data-aurora-setup-center`), la
          // ventana se abre igualmente — el único caso que se evita es el
          // solape REAL de dos modales, no la sesión entera (fix pedido por Alex).
          tFallback = setTimeout(() => {
            try {
              if (!isSetupPending()) return; // el flujo por evento ya se encarga
              const centerOnScreen = !!document.querySelector("[data-aurora-setup-center]");
              if (!centerOnScreen && shouldShowUpdates()) {
                offSetup?.();
                offSetup = null;
                abrirConCortesia();
              }
            } catch { /* */ }
          }, 9000);
          return;
        }
      } catch { /* si falla el gate, seguimos con el flujo normal */ }
      if (shouldShowUpdates()) abrirConCortesia();
    }, 1200);
    // Apertura manual por evento (desde ajustes/notificaciones): siempre abre.
    const off = subscribeStartupOpen(() => { manualRef.current = true; setOpen(true); });
    // Paridad con openAuroraSetup: disparador global.
    try { (window as unknown as { openAstrauraStartup?: () => void }).openAstrauraStartup = openStartupUpdates; } catch { /* */ }
    return () => { clearTimeout(t); if (t2) clearTimeout(t2); if (tFallback) clearTimeout(tFallback); offSetup?.(); off(); cancelaEspera?.(); };
  }, []);

  // (Adenda 192) RED DE CORTESÍA FINAL: si esta ventana quedó abierta por
  // cualquier vía automática mientras el rito o la guía están en primer plano,
  // se repliega y espera su turno (ver lib/ui/fullscreen-modal). La apertura
  // manual (evento de ajustes) marca manualRef y nunca se repliega.
  useEffect(() => {
    if (!open || manualRef.current || cerradaPorUsuarioRef.current) return;
    let offSub: (() => void) | null = null;
    void import("@/lib/ui/fullscreen-modal")
      .then((m) => {
        const replegar = () => {
          if (manualRef.current || cerradaPorUsuarioRef.current || !m.primerPlanoOcupado()) return;
          setOpen(false);
          esperaRef.current?.();
          esperaRef.current = m.alLiberarsePrimerPlano(() => {
            esperaRef.current = null;
            if (!cerradaPorUsuarioRef.current) setOpen(true);
          });
        };
        replegar();
        offSub = m.subscribeFullscreenModal(replegar);
      })
      .catch(() => { /* sin cortesía: mejor abierta que rota */ });
    return () => { offSub?.(); };
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Configuración de sistemas de Astraura en esta neurona"
    >
      {/* (Adenda 178) El onboarding unificado LIDERA con el paso «Astraura» — la IA
          de la neurona, cuyo motor por defecto es el local 1.58-bit (`local` es la
          primera clase del orden). La voz (OmniVoice) es un paso del MISMO wizard, así
          que voz e IA quedan en una sola ventana (integración pedida). */}
      <AstrauraOmniVoiceConfig
        variant="modal"
        initialSection="astraura"
        onApply={() => { cerrarDefinitivo(); lanzarGuiaPendiente(); }}
        onDismiss={() => { cerrarDefinitivo(); lanzarGuiaPendiente(); }}
      />
    </div>
  );
}

export default StartupUpdatesModal;
