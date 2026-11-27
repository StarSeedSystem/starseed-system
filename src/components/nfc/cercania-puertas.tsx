"use client";

// Las cuatro puertas de «NFC y cercanía» (architecture/nfc-neuronas.md §9) sobre UN solo estado:
// `lib/nfc/estado-cercania.ts`. Aquí solo se pinta; la lógica vive allá. Nada se sale en pantallas chicas.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Nfc } from "lucide-react";
import {
  alternarActivo, cambiarModo, CLAVE_ENCUENTROS, CLAVE_ESTADO_CERCANIA, encuentrosPendientes, leerEstado,
  leerRegistroEncuentros, MODOS, resumenCercania, revocarVinculo, vinculosActivos,
  type EstadoCercania, type ModoCercania,
} from "@/lib/nfc/estado-cercania";
import { ETIQUETA_ACCION, ETIQUETA_RELACION, ETIQUETA_VIA, lineaRegistro, type RegistroEncuentro } from "@/lib/nfc/encuentros";
import { enlaceBoton } from "@/lib/notificaciones/encuentro-nfc";
import { safeGet, safeSet } from "@/lib/safe-storage";

const EVENTO = "starseed:nfc-cercania";
const ETIQUETA_MODO: Record<ModoCercania, string> = { recibir: "Recibir", emitir: "Emitir", ambos: "Ambos" };

/** El estado y el registro de este aparato; se refrescan al cambiar en otra puerta o pestaña. */
export function useCercania() {
  const [estado, setEstado] = useState<EstadoCercania>(() => leerEstado(safeGet(CLAVE_ESTADO_CERCANIA)));
  const [registro, setRegistro] = useState<RegistroEncuentro[]>(() => leerRegistroEncuentros(safeGet(CLAVE_ENCUENTROS)));

  useEffect(() => {
    const leer = () => {
      setEstado(leerEstado(safeGet(CLAVE_ESTADO_CERCANIA)));
      setRegistro(leerRegistroEncuentros(safeGet(CLAVE_ENCUENTROS)));
    };
    window.addEventListener(EVENTO, leer);
    window.addEventListener("storage", leer);
    return () => {
      window.removeEventListener(EVENTO, leer);
      window.removeEventListener("storage", leer);
    };
  }, []);

  const cambiar = useCallback((f: (e: EstadoCercania) => EstadoCercania) => {
    const sig = f(leerEstado(safeGet(CLAVE_ESTADO_CERCANIA)));
    safeSet(CLAVE_ESTADO_CERCANIA, JSON.stringify(sig));
    setEstado(sig);
    window.dispatchEvent(new Event(EVENTO));
  }, []);

  return { estado, registro, cambiar };
}

/** Puerta 1 · mosaico del centro de control: encender/apagar, modo y acceso a los ajustes. */
export function MosaicoCercania() {
  const { estado, registro, cambiar } = useCercania();
  return (
    <section data-testid="mosaico-cercania" aria-label="NFC y cercanía" className="min-w-0 space-y-2 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/80">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Nfc className="h-4 w-4 shrink-0 text-amber-200" aria-hidden />
          <div className="min-w-0">
            <p className="truncate font-medium text-white/90">NFC y cercanía</p>
            <p data-testid="mosaico-resumen" className="truncate text-[11px] text-white/50">{resumenCercania(estado, registro)}</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={estado.activo}
          aria-label="Encender NFC y cercanía"
          data-testid="mosaico-interruptor"
          onClick={() => cambiar(alternarActivo)}
          className={"cursor-pointer shrink-0 rounded-full border px-2.5 py-1 transition-colors duration-200 " + (estado.activo ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-100" : "border-white/15 bg-white/5 text-white/60")}
        >
          {estado.activo ? "Encendido" : "Apagado"}
        </button>
      </div>
      {estado.activo && (
        <div className="flex flex-wrap items-center gap-1.5">
          {MODOS.map((m) => (
            <button
              key={m}
              type="button"
              data-testid={`mosaico-modo-${m}`}
              aria-pressed={estado.modo === m}
              onClick={() => cambiar((e) => cambiarModo(e, m))}
              className={"cursor-pointer rounded-full border px-2 py-0.5 transition-colors duration-200 " + (estado.modo === m ? "border-amber-300/50 bg-amber-300/20 text-amber-100" : "border-white/10 text-white/60 hover:bg-white/10")}
            >
              {ETIQUETA_MODO[m]}
            </button>
          ))}
          <Link href="/senales?vista=cercania" className="ml-auto cursor-pointer text-white/60 underline">Ajustes</Link>
        </div>
      )}
    </section>
  );
}

/** Puerta 2 · Centro de notificaciones: encuentros con ofertas sin hacer y sus botones. */
export function EncuentrosEnNotificaciones() {
  const { estado, registro } = useCercania();
  const pendientes = estado.activo ? encuentrosPendientes(registro).slice(0, 5) : [];
  if (pendientes.length === 0) return null;
  return (
    <ul data-testid="notificaciones-cercania" aria-label="Encuentros cercanos" className="space-y-2 border-b border-border/40 p-2">
      {pendientes.map((r) => (
        <li key={r.id} className="min-w-0 space-y-1 text-xs">
          <p className="truncate font-medium">Cerca de ti · {ETIQUETA_RELACION[r.relacion]} · vía {ETIQUETA_VIA[r.via]}</p>
          <div className="flex flex-wrap gap-1">
            {r.ofrecidas.filter((a) => !r.hechas.includes(a)).slice(0, 4).map((a) => (
              <Link key={a} href={enlaceBoton(r.id, a)} className="cursor-pointer rounded-full border border-sky-400/40 bg-sky-400/10 px-2 py-0.5 transition-colors duration-200 hover:bg-sky-400/20">
                {ETIQUETA_ACCION[a]}
              </Link>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Puerta 3 · Señales: registro de encuentros y vínculos activos, con «Revocar». */
export function RegistroYVinculos() {
  const { estado, registro, cambiar } = useCercania();
  const activos = vinculosActivos(estado);
  return (
    <section data-testid="vinculos-cercania" aria-label="Vínculos por cercanía" className="min-w-0 space-y-2 text-[11px] text-white/60">
      <h4 className="text-xs font-semibold text-white/80">Vínculos activos</h4>
      <ul className="space-y-1">
        {activos.length === 0 && <li>Sin vínculos activos.</li>}
        {activos.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">{v.neuronaId} · vía {ETIQUETA_VIA[v.via]}</span>
            <button type="button" data-testid={`revocar-${v.id}`} onClick={() => cambiar((e) => revocarVinculo(e, v.id))} className="cursor-pointer shrink-0 rounded-full border border-red-400/40 px-2 py-0.5 text-red-200 transition-colors duration-200 hover:bg-red-400/15">
              Revocar
            </button>
          </li>
        ))}
      </ul>
      <h4 className="text-xs font-semibold text-white/80">Registro</h4>
      <ul className="space-y-1">
        {registro.length === 0 && <li>Sin encuentros todavía.</li>}
        {registro.slice(0, 10).map((r) => <li key={r.id} className="truncate">{lineaRegistro(r)}</li>)}
      </ul>
    </section>
  );
}

/** Puerta 4 · hub social: personas conocidas por cercanía, tarjetas recibidas y grupos creados al acercarse. */
export function CercaniaSocial() {
  const { estado } = useCercania();
  const { conocidas, tarjetas, grupos } = estado;
  if (conocidas.length + tarjetas.length + grupos.length === 0) return null;
  return (
    <section data-testid="social-cercania" aria-label="Por cercanía" className="min-w-0 space-y-2 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
      <h3 className="flex items-center gap-2 font-semibold text-white/90"><Nfc className="h-4 w-4 shrink-0" aria-hidden /> Por cercanía</h3>
      {conocidas.length > 0 && <p className="truncate">Personas: {conocidas.slice(0, 5).map((p) => p.nombre).join(", ")}</p>}
      {tarjetas.length > 0 && <p className="truncate">Tarjetas recibidas: {tarjetas.slice(0, 5).map((t) => t.titulo).join(", ")}</p>}
      {grupos.length > 0 && <p className="truncate">Grupos: {grupos.slice(0, 5).map((g) => g.nombre).join(", ")}</p>}
    </section>
  );
}
