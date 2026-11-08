"use client";

/**
 * BandaEnlaceWifi — el enlace Wi-Fi directo con UNA neurona, en el chat y en su ficha (2026-11-08 · WFD1108A).
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/wifi-directo.md` §6. Lo decide el motor (`enlace-wifi-motor.ts`); aquí solo se
 * enseña y se pulsa:
 *   · activo → «Enlace Wi-Fi directo: activo · N Mb/s» (o «sin medir»), la red y «Cerrar»;
 *   · en marcha → la fase («levantando la red», «uniéndose a la red»…) y «Cancelar»;
 *   · vía guiada del Mac → «Únete a la red StarSeed-xxxx» con el nombre y la contraseña para copiar (solo
 *     en ESTE aparato: la contraseña llegó cifrada para él); se detecta sola al entrar;
 *   · la otra neurona lo pide («Preguntar») → «Aceptar» / «Ahora no»;
 *   · un envío pesado lo propone → «Abrir enlace Wi-Fi directo»;
 *   · falló → por qué y que se sigue por el enlace de antes.
 * En un Mac avisa siempre de que deja su red Wi-Fi mientras dura (una sola radio). Fuera de la app nativa
 * no pinta nada.
 */

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, Copy, Loader2, Wifi, WifiOff, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ACENTO, pildoraFantasma } from "@/components/messages/marco/estilos";
import { ocupada, puedeEnlaceWifi, textoFase, type ClaseNecesidad } from "@/lib/malla/enlace-wifi-directo";
import { AVISO_RADIO_UNICA, enlaceWifiDe, enlacesWifiActivos, suscribirEnlacesWifi, textoEnlaceWifi, textoMetodo } from "@/lib/malla/enlace-wifi-orquestacion";
import { motorWifiActivo, useEnlaceWifi } from "@/lib/malla/enlace-wifi-motor";

const CLASE_TEXTO: Record<ClaseNecesidad, string> = {
  archivo: "un archivo grande",
  llamada: "una llamada",
  pantalla: "compartir pantalla",
  flujo: "una transmisión",
  manual: "más ancho de banda",
};

/** Cuánto se enseña un fallo antes de esconderlo (ms). */
const FALLO_VISIBLE_MS = 2 * 60_000;

function Boton({ onClick, children, tono = "neutro", ocupado = false, etiqueta }: { onClick: () => void; children: ReactNode; tono?: "ok" | "neutro"; ocupado?: boolean; etiqueta?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={ocupado}
      aria-label={etiqueta}
      className={cn(
        "inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full px-2.5 text-[11.5px] font-semibold transition-colors duration-200 disabled:cursor-wait disabled:opacity-60",
        tono === "ok" ? "text-white" : "text-white/80 hover:text-white",
      )}
      style={tono === "ok" ? pildoraFantasma(ACENTO.esmeralda) : pildoraFantasma("#ffffff", false)}
    >
      {ocupado && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

function Copiable({ etiqueta, valor, secreto = false }: { etiqueta: string; valor: string; secreto?: boolean }) {
  const [hecho, setHecho] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valor);
      setHecho(true);
      setTimeout(() => setHecho(false), 1500);
    } catch {
      toast.message("No se pudo copiar: escríbelo a mano.");
    }
  };
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl bg-black/30 px-2.5 py-1.5">
      <span className="shrink-0 text-[10.5px] text-white/50">{etiqueta}</span>
      <code className={cn("min-w-0 flex-1 truncate text-[12.5px] text-white", secreto && "tracking-wide")}>{valor}</code>
      <button type="button" onClick={() => void copiar()} aria-label={`Copiar ${etiqueta.toLowerCase()}`} className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white">
        {hecho ? <Check className="h-3.5 w-3.5 text-emerald-300" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      </button>
    </div>
  );
}

export interface BandaEnlaceWifiProps {
  /** Id de neurona de la otra. */
  neurona: string;
  nombre?: string | null;
  /** Ofrecer «Abrir enlace Wi-Fi directo» a mano aunque nada lo proponga (ficha de la neurona). */
  manual?: boolean;
  className?: string;
}

export function BandaEnlaceWifi({ neurona, nombre, manual = false, className }: BandaEnlaceWifiProps) {
  const s = useEnlaceWifi();
  const activos = useSyncExternalStore(suscribirEnlacesWifi, enlacesWifiActivos, enlacesWifiActivos);
  const [ocupado, setOcupado] = useState(false);
  const motor = motorWifiActivo();
  if (!motor || !neurona) return null;

  const activo = enlaceWifiDe(neurona, activos);
  const e = s.estado;
  const conEsta = e.otro === neurona;
  const radioUnica = !!s.capPropia?.radioUnica;
  const quien = nombre || e.nombreOtro || "la otra neurona";

  const hacer = async (f: () => Promise<unknown>) => {
    setOcupado(true);
    try {
      await f();
    } finally {
      setOcupado(false);
    }
  };

  const marco = (contenido: ReactNode, color: string = ACENTO.esmeralda) => (
    <div role="status" aria-live="polite" className={cn("space-y-2 rounded-2xl px-3 py-2 text-[12.5px] text-white/85", className)} style={pildoraFantasma(color)} data-testid="banda-enlace-wifi">
      {contenido}
    </div>
  );

  // Activo.
  if (activo) {
    return marco(
      <div className="flex flex-wrap items-center gap-2">
        <Wifi className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
        <span className="min-w-0 flex-1">
          <strong className="font-semibold text-white">{textoEnlaceWifi(activo)}</strong>
          <span className="block text-[11px] text-white/55">
            Sin router: de antena a antena por {textoMetodo(activo.metodo)}
            {activo.ssid ? ` («${activo.ssid}»)` : ""}. Archivos, llamadas y pantalla van por aquí.
            {radioUnica && !activo.soyAp ? " Este Mac salió de su red Wi-Fi mientras dure." : ""}
          </span>
        </span>
        <Boton onClick={() => void hacer(() => motor.cerrar("persona"))} ocupado={ocupado} etiqueta="Cerrar el enlace Wi-Fi directo">
          <X className="h-3 w-3" aria-hidden /> Cerrar
        </Boton>
      </div>,
    );
  }

  // Vía guiada (Mac sin unión automática): la persona se une a mano.
  if (conEsta && s.guiado && e.fase === "uniendo") {
    return marco(
      <>
        <p className="flex items-center gap-2">
          <Wifi className="h-4 w-4 shrink-0 text-amber-300" aria-hidden />
          <strong className="font-semibold text-white">Únete a la red «{s.guiado.ssid}»</strong>
        </p>
        <p className="text-[11.5px] text-white/65">
          Abre el menú Wi-Fi de la barra de arriba, elige «{s.guiado.ssid}» y pega la contraseña. StarSeed detecta solo cuando estés dentro. Este Mac deja tu red mientras dure y vuelve a ella al cerrar.
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          <Copiable etiqueta="Red" valor={s.guiado.ssid} />
          <Copiable etiqueta="Contraseña" valor={s.guiado.clave} secreto />
        </div>
        <div className="flex justify-end">
          <Boton onClick={() => void hacer(() => motor.cerrar("persona"))} ocupado={ocupado}>
            Cancelar
          </Boton>
        </div>
      </>,
      ACENTO.ambar,
    );
  }

  // En marcha con esta neurona.
  if (conEsta && ocupada(e.fase) && e.fase !== "decidiendo") {
    return marco(
      <div className="flex flex-wrap items-center gap-2">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-300" aria-hidden />
        <span className="min-w-0 flex-1">
          Enlace Wi-Fi directo con {quien}: {textoFase(e.fase)}…
          {s.nativo?.mensaje && s.nativo.sesion === e.sesion ? <span className="block text-[11px] text-white/55">{s.nativo.mensaje}</span> : null}
          {s.avisoRadio ? <span className="block text-[11px] text-amber-200/80">{s.avisoRadio}</span> : null}
        </span>
        <Boton onClick={() => void hacer(() => motor.cerrar("persona"))} ocupado={ocupado}>
          Cancelar
        </Boton>
      </div>,
    );
  }

  // La otra neurona lo pide (ajuste «Preguntar» aquí).
  if (s.pregunta && s.pregunta.otro === neurona) {
    return marco(
      <>
        <p className="flex items-start gap-2">
          <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
          <span>
            <strong className="font-semibold text-white">{s.pregunta.nombreOtro || quien}</strong> pide abrir un enlace Wi-Fi directo (sin router) para {CLASE_TEXTO[s.pregunta.clase]}.
            {radioUnica ? <span className="block text-[11px] text-amber-200/80">{AVISO_RADIO_UNICA}</span> : null}
          </span>
        </p>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Boton onClick={() => void hacer(() => motor.decidirPersona(false))} ocupado={ocupado}>
            Ahora no
          </Boton>
          <Boton tono="ok" onClick={() => void hacer(() => motor.decidirPersona(true))} ocupado={ocupado}>
            Aceptar
          </Boton>
        </div>
      </>,
    );
  }

  // Un envío pesado lo propone (ajuste «Preguntar» aquí).
  if (s.propuesta && s.propuesta.neurona === neurona) {
    return marco(
      <>
        <p className="flex items-start gap-2">
          <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
          <span>
            Para {CLASE_TEXTO[s.propuesta.clase]} con {quien}, un enlace Wi-Fi directo entre las dos antenas (sin router) va mucho más rápido.
            {s.propuesta.aviso ? <span className="block text-[11px] text-amber-200/80">{s.propuesta.aviso}</span> : null}
          </span>
        </p>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Boton onClick={() => void hacer(() => motor.resolverPropuesta(false))} ocupado={ocupado}>
            Ahora no
          </Boton>
          <Boton tono="ok" onClick={() => void hacer(() => motor.resolverPropuesta(true))} ocupado={ocupado}>
            Abrir enlace Wi-Fi directo
          </Boton>
        </div>
      </>,
    );
  }

  // Falló hace poco con esta neurona: por qué, y que todo sigue por el enlace de antes.
  if (conEsta && e.fase === "fallido" && e.motivo && Date.now() - e.desde < FALLO_VISIBLE_MS) {
    return marco(
      <p className="flex items-start gap-2 text-[11.5px]">
        <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
        <span>Enlace Wi-Fi directo: {e.motivo}. Todo sigue por el enlace de antes.</span>
      </p>,
      ACENTO.ambar,
    );
  }

  // A mano (ficha de la neurona): solo si esta app puede tomar parte.
  if (manual && puedeEnlaceWifi(s.capPropia) && !ocupada(e.fase)) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2 text-[11.5px] text-white/60", className)} data-testid="banda-enlace-wifi">
        <Wifi className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">Enlace Wi-Fi directo: no. Para lo pesado, las dos antenas pueden hablarse sin router.</span>
        <Boton
          onClick={() =>
            void hacer(async () => {
              const r = await motor.abrir(neurona, "manual", nombre ?? null);
              if (!r.ok) toast.message(r.motivo ?? "No se pudo abrir el enlace Wi-Fi directo.");
              else if (radioUnica) toast.message(AVISO_RADIO_UNICA);
            })
          }
          ocupado={ocupado}
        >
          Abrir enlace Wi-Fi directo
        </Boton>
      </div>
    );
  }
  return null;
}
