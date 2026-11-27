"use client";

import { useEffect, useState } from "react";
import { Nfc, X } from "lucide-react";
import { decidir, type DecisionEncuentro } from "@/lib/nfc/decidir";
import {
  anadirAlRegistro,
  botonesDe,
  ETIQUETA_RELACION,
  ETIQUETA_VIA,
  lineaRegistro,
  marcarHecha,
  registrarEncuentro,
  resumenAutomaticas,
  type BotonEncuentro,
  type RegistroEncuentro,
} from "@/lib/nfc/encuentros";
import { cargarPreferencias, guardarPreferencias } from "@/lib/nfc/preferencias-guardado";
import { ignorar, preferenciasPorDefecto, recordar, type Accion, type Relacion } from "@/lib/nfc/preferencias";
import type { ViaAcercar } from "@/lib/nfc/respaldo";
import type { TarjetaNeurona } from "@/lib/nfc/tarjeta";
import { notifyFromApp } from "@/lib/notifications/app-notify";
import { notificacionDeEncuentro } from "@/lib/notificaciones/encuentro-nfc";
import { safeGet, safeSet } from "@/lib/safe-storage";
import { anadirConocida, anadirVinculo, CLAVE_ENCUENTROS, CLAVE_ESTADO_CERCANIA, leerEstado } from "@/lib/nfc/estado-cercania";

interface Props {
  decision: DecisionEncuentro;
  via: ViaAcercar;
  onBoton: (boton: BotonEncuentro) => void;
  onCerrar: () => void;
}

/** Hoja «Cerca de ti»: las opciones salen de `decidir` según las preferencias de ESTE aparato. */
export function HojaCerca({ decision, via, onBoton, onCerrar }: Props) {
  if (!decision.mostrar) return null;
  const botones = botonesDe(decision);
  const auto = resumenAutomaticas(decision);
  const quien =
    decision.perfil.tipo === "completo" ? decision.perfil.cuenta.valor
    : decision.perfil.tipo === "pendiente" ? "Neurona que pide permiso para mostrarse"
    : "Neurona cercana";
  return (
    <section
      role="dialog"
      aria-label="Cerca de ti"
      data-testid="hoja-cerca"
      className="space-y-3 rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-white/85 backdrop-blur"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-semibold text-sky-100">
            <Nfc className="h-4 w-4 shrink-0" aria-hidden /> Cerca de ti
          </h3>
          <p className="truncate text-xs text-white/70">{quien}</p>
          <p className="text-[11px] text-white/45">
            {ETIQUETA_RELACION[decision.relacion]} · vía {ETIQUETA_VIA[via]}
          </p>
        </div>
        <button type="button" aria-label="Cerrar" onClick={onCerrar} className="cursor-pointer rounded-full p-1 text-white/60 transition-colors hover:bg-white/10">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>
      {auto && <p data-testid="hoja-automaticas" className="text-xs text-emerald-200">{auto}</p>}
      <div className="flex flex-wrap gap-1.5">
        {botones.map((b) => (
          <button
            key={b.id}
            type="button"
            data-testid={`boton-${b.id}`}
            onClick={() => onBoton(b)}
            className={
              "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-200 " +
              (b.tipo === "fija"
                ? "border-white/15 bg-white/5 text-white/70 hover:bg-white/10"
                : "border-sky-400/40 bg-sky-400/15 text-sky-100 hover:bg-sky-400/25")
            }
          >
            {b.etiqueta}
          </button>
        ))}
      </div>
    </section>
  );
}

export default HojaCerca;

const CLAVE_REGISTRO = CLAVE_ENCUENTROS;

function leerRegistro(): RegistroEncuentro[] {
  try {
    const x: unknown = JSON.parse(safeGet(CLAVE_REGISTRO) ?? "[]");
    return Array.isArray(x) ? (x as RegistroEncuentro[]) : [];
  } catch {
    return [];
  }
}

interface SeccionProps {
  propia: TarjetaNeurona;
  /** Tarjeta recién recibida por NFC, BLE o QR; `null` si no hay encuentro nuevo. */
  ajena: TarjetaNeurona | null;
  via: ViaAcercar;
  relacion: Relacion;
  onAccion?: (accion: Accion, neuronaId: string) => void;
}

/** Sección «Cercanía» de Señales: la hoja del encuentro vivo y el registro de encuentros, sin conexión. */
export function SeccionCercania({ propia, ajena, via, relacion, onAccion }: SeccionProps) {
  const [registro, setRegistro] = useState<RegistroEncuentro[]>(leerRegistro);
  const [actual, setActual] = useState<{ d: DecisionEncuentro; id: string; neuronaId: string } | null>(null);

  useEffect(() => {
    if (!ajena) return;
    const prefs = cargarPreferencias() ?? preferenciasPorDefecto();
    const d = decidir({ propia, ajena, relacion, prefs });
    if (!d.mostrar) return;
    const reg = registrarEncuentro(d, ajena.neuronaId, via, Date.now());
    setRegistro((r) => {
      const sig = anadirAlRegistro(r, reg);
      safeSet(CLAVE_REGISTRO, JSON.stringify(sig));
      return sig;
    });
    setActual({ d, id: reg.id, neuronaId: ajena.neuronaId });
    // Un mismo estado para las cuatro puertas: el encuentro deja vínculo y persona conocida.
    const nombre = d.perfil.tipo === "completo" ? d.perfil.cuenta.valor : "Neurona cercana";
    const est = anadirConocida(
      anadirVinculo(leerEstado(safeGet(CLAVE_ESTADO_CERCANIA)), { id: reg.id, neuronaId: ajena.neuronaId, via, desde: reg.en }),
      { neuronaId: ajena.neuronaId, nombre, via, vista: reg.en },
    );
    safeSet(CLAVE_ESTADO_CERCANIA, JSON.stringify(est));
    window.dispatchEvent(new Event("starseed:nfc-cercania"));
    d.automaticas.forEach((a) => onAccion?.(a, ajena.neuronaId));
    const aviso = notificacionDeEncuentro(d, via, reg.id);
    if (aviso) notifyFromApp(aviso);
  }, [ajena, propia, via, relacion, onAccion]);

  const alBoton = (b: BotonEncuentro) => {
    if (!actual) return;
    const prefs = cargarPreferencias() ?? preferenciasPorDefecto();
    if (b.id === "ignorar") { guardarPreferencias(ignorar(prefs, actual.neuronaId)); setActual(null); return; }
    if (b.id === "recordar") { guardarPreferencias(recordar(prefs, actual.neuronaId)); return; }
    const accion = b.id;
    onAccion?.(accion, actual.neuronaId);
    setRegistro((r) => {
      const sig = marcarHecha(r, actual.id, accion);
      safeSet(CLAVE_REGISTRO, JSON.stringify(sig));
      return sig;
    });
  };

  return (
    <div data-testid="seccion-cercania" className="space-y-2">
      {actual && <HojaCerca decision={actual.d} via={via} onBoton={alBoton} onCerrar={() => setActual(null)} />}
      <ul className="space-y-1 text-[11px] text-white/55" aria-label="Registro de cercanía">
        {registro.length === 0 && <li>Sin encuentros todavía.</li>}
        {registro.slice(0, 20).map((r) => <li key={r.id}>{lineaRegistro(r)}</li>)}
      </ul>
    </div>
  );
}
