"use client";

/**
 * StartupUpdatesModal — «CONFIGURACIÓN/ACTUALIZACIÓN DE SISTEMAS DE ASTRAURA EN
 * ESTA NEURONA» (Adenda 111 · refactor 132 · rediseño 149).
 * ============================================================================
 * ENVOLTORIO FINO: conserva el GATE de auto-apertura (primera entrada de la neurona o
 * novedades de catálogo, `decidirArranque`, retardo ~1200 ms + espera a la cuenta), el evento de apertura
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
 * Persistencia entre medios (2026-09-29): «Alex: hay ventanas que reaparecen de las configuraciones
 * de las neuronas al reiniciar». La causa: el «visto» era local a cada navegador y la decisión se
 * tomaba a los ~1,2 s, antes de bajar la cuenta. Ahora:
 *   · la decisión ESPERA al primer pull de la cuenta (`cuandoCuentaFiable`); si la cuenta no se
 *     puede leer (402, sin red) no se decide a ciegas: no se asume «nunca visto»;
 *   · el «visto», la primera configuración y el «recordar luego» viajan con la cuenta
 *     (`startup-updates.ts` → `avisos-cuenta`); lo que un medio antiguo tenía en local se respeta
 *     y se copia a la cuenta;
 *   · un cambio de catálogo NO reabre esta ventana: sale un aviso pequeño no bloqueante con
 *     «Ver». La ventana grande solo se abre por primera configuración o algo que pide acción;
 *   · TODA vía de cierre deja rastro (Escape, X, «Recordar luego», enlaces, «Cerrar»).
 *
 * SSR-safe: no renderiza en servidor; decide abrir tras montar. Nunca lanza.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Compass, Sparkles } from "lucide-react";
import {
  copiarEstadoLocalACuenta, decidirArranque, getStartupState, sellarCatalogoVisto,
  subscribeStartupOpen, openStartupUpdates, snoozeUpdates, type DecisionArranque,
  hayNovedadesScout, marcarScoutVisto,
} from "@/lib/astraura/startup-updates";
import { detectCapabilities, type NeuronCapabilities } from "@/lib/neurons/neurons";
import { cuandoCuentaFiable } from "@/lib/sync/realtime-sync";
import { isSetupPending, subscribeSetup, markSetupDone } from "@/lib/aurora/setup-config";
import { esMiTurno, terminarEtapa, suscribirRito } from "@/lib/onboarding/director-rito";
import { useModalA11y } from "@/hooks/use-modal-a11y";
import { AstrauraOmniVoiceConfig } from "@/components/astraura/astraura-omnivoice-config";
import { IconoStarSeed } from "@/components/onboarding/icono-starseed";
import { marcarRitoActivo } from "@/lib/ui/rito-activo";
import { acentoDeIndice, clasesAcento } from "@/lib/ui/acentos";
import { cn } from "@/lib/utils";

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
  // (Ola 247 · 2026-09-05) Etapa del rito que YA atiende esta ventana. Es el
  // guardián anti-duplicado: aunque el director emita el avance varias veces
  // (montaje + evento), la ventana de sistemas solo se abre cuando es su turno
  // y una única vez en esta sesión.
  const etapaAtendidaRef = useRef<string | null>(null);
  // Scout findings (Adenda 138 · llmfit): hallazgos de modelos que rinden mejor.
  const [scoutFindings, setScoutFindings] = useState<{ summary: string; best: Array<{ spec: { label: string }; verdict: string; requiredGb: number; estTps?: number; quant?: string; deltaVsCurrent?: string }> } | null>(null);
  const [scoutLoading, setScoutLoading] = useState(false);
  useEffect(() => () => { esperaRef.current?.(); }, []); // solo al desmontar

  /**
   * (Ola 247 · 2026-09-05) Al CERRAR esta ventana avanza el rito hacia el
   * perfil. Antes se dejaba una marca suelta de guía y se abría la ventana de
   * perfil a mano por evento; ahora el DIRECTOR es quien decide: cerrar
   * «sistemas» pasa el turno a «perfil» y la ventana de perfil se abre sola.
   * `markSetupDone()` se conserva para que el centro «Configurar Neurona» no se
   * abra solo después del perfil.
   */
  const lanzarGuiaPendiente = useCallback(() => {
    // (Adenda 219) Esta ventana YA configuró la neurona en el rito: el centro
    // «Configurar Neurona» (aurora-setup-center) no debe abrirse solo después
    // del perfil — visto en vivo tras «Ver mi perfil». Queda disponible en
    // Ajustes y en la paleta de comandos.
    try { markSetupDone(); } catch { /* sin storage */ }
    terminarEtapa("sistemas");
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

  /**
   * Cierre SIN aplicar ni «recordar luego» explícito (enlaces «ir a Configuración IA», botón
   * «Cerrar»…): también deja rastro. Si la ventana seguiría pendiente, se pospone 24 h con la
   * cuenta; si ya estaba pospuesta o resuelta (aplicar), no se toca nada.
   */
  const cerrarSinAplicar = useCallback(() => {
    try {
      const st = getStartupState();
      const pospuesta = !!st.snoozeUntil && st.snoozeUntil > Date.now();
      if (!pospuesta && decidirArranque().accion === "ventana") snoozeUpdates();
    } catch { /* cerrar nunca falla */ }
    cerrarDefinitivo();
    lanzarGuiaPendiente();
  }, [cerrarDefinitivo, lanzarGuiaPendiente]);

  /** Comprueba y carga hallazgos del scout para esta neurona. */
  const comprobarScout = useCallback(async () => {
    setScoutLoading(true);
    try {
      const caps = await detectCapabilities();
      const catalogLen = (await import("@/ai/astraura/model-requirements")).ALL_LLM_SPECS.length +
        (await import("@/ai/astraura/model-requirements")).ALL_VOICE_SPECS.length;
      if (hayNovedadesScout(caps, catalogLen)) {
        const { scoutModels } = await import("@/ai/astraura/model-scout");
        const result = scoutModels(caps, { limit: 3 });
        if (result.hasBetter && result.best.length > 0) {
          setScoutFindings({
            summary: result.summary,
            best: result.best.slice(0, 3).map((r) => ({
              spec: { label: r.spec.label },
              verdict: r.verdict,
              requiredGb: r.requiredGb,
              estTps: r.estTps,
              quant: r.quant,
              deltaVsCurrent: r.deltaVsCurrent,
            })),
          });
        }
      }
    } catch {
      /* degradación silenciosa */
    } finally {
      setScoutLoading(false);
    }
  }, []);

  /** Marca los hallazgos del scout como vistos. */
  const marcarScoutComoVisto = useCallback(async () => {
    try {
      const caps = await detectCapabilities();
      const catalogLen = (await import("@/ai/astraura/model-requirements")).ALL_LLM_SPECS.length +
        (await import("@/ai/astraura/model-requirements")).ALL_VOICE_SPECS.length;
      marcarScoutVisto(caps, catalogLen);
      setScoutFindings(null);
    } catch {
      /* noop */
    }
  }, []);

  // Foco inicial + trampa de Tab + Escape (patrón de la Adenda 137).
  useModalA11y({ open, onClose: remindLater, containerRef });

  // (Ola 227) Esta ventana ES parte del rito: mientras esté abierta ni el
  // OmniDock, ni las cortinas/bordes Trinity ni la paleta de comandos salen.
  useEffect(() => {
    marcarRitoActivo("sistemas-neurona", open);
    return () => marcarRitoActivo("sistemas-neurona", false);
  }, [open]);

  useEffect(() => {
    // Auto-apertura GARANTIZADA por neurona (A149 · olas): primera entrada,
    // novedades del catálogo o CONFIGURACIÓN PENDIENTE (`decidirArranque`
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
    let cancelaCuenta: (() => void) | null = null;
    let cancelaEsperaAviso: (() => void) | null = null;
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
    // Aviso pequeño de novedades de catálogo (no bloqueante). Se sella en la CUENTA al mostrarlo,
    // así ni este medio ni los demás lo repiten; «Ver» abre la ventana con el detalle. Espera a que
    // el rito/la guía dejen el primer plano, como la ventana grande.
    const mostrarAvisoNovedades = (d: Extract<DecisionArranque, { accion: "aviso" }>) => {
      sellarCatalogoVisto(d.firma);
      const partes: string[] = [];
      if (d.modelos > 0) partes.push(`${d.modelos} ${d.modelos === 1 ? "modelo nuevo" : "modelos nuevos"}`);
      if (d.fuentes > 0) partes.push(`${d.fuentes} ${d.fuentes === 1 ? "fuente nueva" : "fuentes nuevas"}`);
      const lanzar = () => {
        try {
          toast("Astraura tiene novedades", {
            description: `${partes.join(" · ")}. Tu configuración sigue igual.`,
            duration: 12000,
            action: { label: "Ver", onClick: () => openStartupUpdates() },
          });
        } catch { /* sin toaster: el aviso es prescindible */ }
      };
      void import("@/lib/ui/fullscreen-modal")
        .then((m) => { cancelaEsperaAviso?.(); cancelaEsperaAviso = m.alLiberarsePrimerPlano(lanzar); })
        .catch(lanzar);
    };
    // La decisión de arranque, ya con la cuenta bajada. Copia primero lo que un medio antiguo
    // tenía «visto» en local (así los demás medios lo heredan) y decide con el estado unificado.
    const decidirYActuar = () => {
      if (cerradaPorUsuarioRef.current) return;
      try {
        copiarEstadoLocalACuenta();
        const d = decidirArranque();
        if (d.accion === "ventana") abrirConCortesia();
        else if (d.accion === "aviso") mostrarAvisoNovedades(d);
        else if (d.sellar) sellarCatalogoVisto(d.sellar);
      } catch { /* si falla el gate, no se abre nada: mejor callar que reabrir */ }
    };
    /** ¿Toca la ventana grande ahora? (con la cuenta ya bajada) */
    const tocaVentana = () => {
      try {
        copiarEstadoLocalACuenta();
        return decidirArranque().accion === "ventana";
      } catch { return false; }
    };
    // (Ola 247 · 2026-09-05) Relevo directo del rito: si la máquina de estados
    // del director está en «sistemas» (la bienvenida acaba de terminar), esta
    // ventana se abre YA — es su turno, antes del perfil — sin esperar al sondeo
    // de cortesía. `esMiTurno` es la señal única; ya no se leen marcas sueltas
    // de sessionStorage. Se abre una sola vez por sesión (ref de etapa atendida).
    const abrirSiEsSistemas = () => {
      if (cerradaPorUsuarioRef.current || etapaAtendidaRef.current === "sistemas") return;
      if (esMiTurno("sistemas")) {
        etapaAtendidaRef.current = "sistemas";
        manualRef.current = true;
        setOpen(true);
      }
    };
    abrirSiEsSistemas();
    const offRito = suscribirRito(() => abrirSiEsSistemas());

    // ESPERA al primer pull de la cuenta: decidir a los 1,2 s con el medio vacío era lo que
    // reabría la ventana en cada medio nuevo. Sin cuenta legible, no se decide a ciegas.
    const arrancarDecision = () => {
      try {
        if (isSetupPending()) {
          offSetup = subscribeSetup(() => {
            try {
              if (isSetupPending()) return; // sigue pendiente: esperar al siguiente evento
              offSetup?.();
              offSetup = null;
              t2 = setTimeout(decidirYActuar, 800);
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
              if (!centerOnScreen && tocaVentana()) {
                offSetup?.();
                offSetup = null;
                decidirYActuar();
              }
            } catch { /* */ }
          }, 9000);
          return;
        }
      } catch { /* si falla el gate, seguimos con el flujo normal */ }
      decidirYActuar();
    };
    const t = setTimeout(() => { cancelaCuenta = cuandoCuentaFiable(arrancarDecision, 4000); }, 1200);
    // Apertura manual por evento (desde ajustes/notificaciones): siempre abre.
    const off = subscribeStartupOpen(() => { manualRef.current = true; setOpen(true); });
    // Paridad con openAuroraSetup: disparador global.
    try { (window as unknown as { openAstrauraStartup?: () => void }).openAstrauraStartup = openStartupUpdates; } catch { /* */ }
    return () => { clearTimeout(t); cancelaCuenta?.(); if (t2) clearTimeout(t2); if (tFallback) clearTimeout(tFallback); offSetup?.(); off(); offRito(); cancelaEspera?.(); cancelaEsperaAviso?.(); };
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

  // Comprobar hallazgos del scout al abrir la ventana (Adenda 138 · llmfit).
  useEffect(() => {
    if (!open) return;
    comprobarScout();
  }, [open, comprobarScout]);

  // Marcar scout como visto al aplicar o descartar.
  const handleApplyWithScout = useCallback(() => {
    marcarScoutComoVisto();
    cerrarDefinitivo();
    lanzarGuiaPendiente();
  }, [marcarScoutComoVisto, cerrarDefinitivo, lanzarGuiaPendiente]);

  const handleDismissWithScout = useCallback(() => {
    marcarScoutComoVisto();
    cerrarSinAplicar();
  }, [marcarScoutComoVisto, cerrarSinAplicar]);

  if (!open) return null;

  // (Ola 227) Aura de acentos Trinity ROTATIVA: cada apertura avanza en la
  // paleta, así la ventana no queda siempre en morado/verde.
  const giro = new Date().getDate();
  const clA = clasesAcento(acentoDeIndice(giro));
  const clB = clasesAcento(acentoDeIndice(giro + 4));

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[120] flex flex-col items-center justify-center bg-black/60 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Configuración de sistemas de Astraura en esta neurona"
    >
      {/* Auras de acento rotativas (no interactivas) */}
      <div aria-hidden className={cn("pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full blur-3xl", clA.fondo)} />
      <div aria-hidden className={cn("pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full blur-3xl", clB.fondo)} />
      {/* (Adenda 178) El onboarding unificado LIDERA con el paso «Astraura» — la IA
          de la neurona, cuyo motor por defecto es el local 1.58-bit (`local` es la
          primera clase del orden). La voz (OmniVoice) es un paso del MISMO wizard, así
          que voz e IA quedan en una sola ventana (integración pedida). */}
      {/* Emblema de StarSeed arriba del todo, centrado sobre la ventana. */}
      <div className="pointer-events-none relative z-10 -mb-6 flex justify-center">
        <IconoStarSeed size={48} />
      </div>
      {/* Línea de acento superior, también rotativa */}
      <div aria-hidden className={cn("pointer-events-none relative z-10 -mb-px h-0.5 w-full max-w-3xl rounded-full bg-gradient-to-r", clA.degradado)} />
      {/* Hallazgos del Scout (Adenda 138 · llmfit): muestra modelos que rinden mejor. */}
      {scoutLoading && (
        <div className="relative z-10 w-full max-w-[560px] mb-2 rounded-xl border border-violet-500/20 bg-violet-950/20 px-3 py-2 animate-in fade-in-0 duration-200">
          <div className="flex items-center gap-2 text-[12px] text-violet-300">
            <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Analizando el hardware de esta neurona para encontrar mejores modelos…
          </div>
        </div>
      )}
      {scoutFindings && !scoutLoading && (
        <div className="relative z-10 w-full max-w-[560px] mb-2 rounded-xl border border-emerald-400/25 bg-emerald-500/[0.06] px-3 py-2.5 animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
          <div className="flex items-start justify-between gap-2">
            <p className="flex min-w-0 items-center gap-2 text-[12px] font-semibold text-emerald-300">
              <Compass className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Se detectaron modelos que rinden mejor en este equipo</span>
            </p>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-emerald-100/90">{scoutFindings.summary}</p>
          {scoutFindings.best.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {scoutFindings.best.map((r, i) => (
                <div key={i} className="rounded-lg border border-white/10 bg-white/5 p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-white/90">{r.spec.label}</span>
                    <span className="rounded-full border px-2 py-0.5 text-[11px] border-emerald-500/30 bg-emerald-500/15 text-emerald-300">
                      {r.verdict === "perfecto" ? "Perfecto" : r.verdict === "bueno" ? "Bueno" : "Justo"}
                    </span>
                    <span className="ml-auto text-[11px] text-white/50">
                      ~{r.requiredGb.toFixed(1)} GB{r.estTps ? ` · ~${Math.round(r.estTps)} tok/s` : ""}
                      {r.quant ? ` · ${r.quant}` : ""}
                    </span>
                  </div>
                  {r.deltaVsCurrent && (
                    <div className="mt-1 text-[11px] text-fuchsia-300/80">{r.deltaVsCurrent}</div>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[10px] text-emerald-100/70">
            Se aplicará la mejor opción al pulsar «Aplicar y continuar». Puedes revisar los detalles en la pestaña Astraura.
          </p>
        </div>
      )}
      <AstrauraOmniVoiceConfig
        variant="modal"
        initialSection="astraura"
        onApply={handleApplyWithScout}
        onDismiss={handleDismissWithScout}
      />
    </div>
  );
}

export default StartupUpdatesModal;
