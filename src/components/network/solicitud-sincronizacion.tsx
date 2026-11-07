"use client";

/**
 * SolicitudSincronizacionFlotante — la ventana GLOBAL de la sincronización entre neuronas (2026-11-07 · MSH1107A).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/sincronizacion-neuronas.md` §4. Se monta en `MallaNeuronasMount` (todas las
 * rutas menos las de consola) y pinta, con UNA sola instancia aunque se monte dos veces:
 *   · la solicitud que llega de otra neurona: quién la pide, de qué cuenta dice ser, por qué vía llegó,
 *     su firma, sus capacidades, «Recordar para futuros encuentros» y Aceptar / Rechazar;
 *   · la que mandaste tú mientras espera respuesta (con su vía, «Recordar» y Cancelar);
 *   · «Vinculadas» en las dos neuronas cuando las dos aceptan (y, si no se recordó, el botón para hacerlo);
 *   · avisos discretos: reconexión automática de un vínculo recordado, rechazos y caducidades.
 * Toda la lógica está en el motor (`sincronizacion-neuronas-motor.ts`); aquí solo se enseña y se pulsa.
 */

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Fingerprint, Link2, Loader2, Radar, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  alAvisoSync,
  cancelarSolicitud,
  recordarSolicitud,
  recordarVinculo,
  responderSolicitud,
  useSolicitudesSync,
  useVinculosNeuronas,
  type AvisoSync,
} from "@/lib/malla/sincronizacion-neuronas-motor";
import {
  esperaMiRespuesta,
  esTerminal,
  textoEstado,
  textoVia,
  type SolicitudSync,
} from "@/lib/malla/sincronizacion-neuronas";

/** Una sola instancia viva por pestaña (la primera que se monta). */
let duena: symbol | null = null;

function useInstanciaUnica(): boolean {
  const [activa, setActiva] = useState(false);
  useEffect(() => {
    const yo = Symbol("solicitud-sincronizacion");
    if (!duena) {
      duena = yo;
      setActiva(true);
    }
    return () => {
      if (duena === yo) duena = null;
    };
  }, []);
  return activa;
}

function useAhora(activo: boolean): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!activo) return;
    setAhora(Date.now());
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [activo]);
  return ahora;
}

function restante(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function huellaCorta(h?: string): string {
  if (!h) return "sin huella";
  return h.length > 14 ? `${h.slice(0, 14)}…` : h;
}

const TARJETA = "pointer-events-auto w-full rounded-2xl border border-white/12 bg-black/80 p-3 text-white shadow-2xl backdrop-blur-md";
const CASILLA = "mt-2 flex cursor-pointer items-start gap-2 text-[11px] leading-snug text-white/80";

function SolicitudEntrante({
  s,
  miUid,
  ahora,
  huellaRecordada,
}: {
  s: SolicitudSync;
  miUid: string | null;
  ahora: number;
  /** Huella con la que se recordaba a esa neurona (si se recordaba). */
  huellaRecordada?: string;
}) {
  const suplanta = !!huellaRecordada && !!s.huellaOtro && huellaRecordada !== s.huellaOtro;
  const mismaCuenta = !!miUid && !!s.otro.cuenta && s.otro.cuenta === miUid;
  const [recordar, setRecordar] = useState(mismaCuenta);
  const [tocado, setTocado] = useState(false);
  // La cuenta propia se conoce un instante después de montar: hasta que la persona toque la casilla,
  // «Recordar» sigue a «es de tu cuenta».
  useEffect(() => {
    if (!tocado) setRecordar(mismaCuenta);
  }, [mismaCuenta, tocado]);
  const [ocupado, setOcupado] = useState(false);
  const titulo = `sync-titulo-${s.id}`;
  const contestar = async (acepta: boolean) => {
    setOcupado(true);
    const r = await responderSolicitud(s.id, acepta, recordar);
    if (!r.ok && r.motivo) toast.error("No se pudo contestar", { description: r.motivo });
    setOcupado(false);
  };
  const deOtroLado = s.direccion === "saliente"; // la lancé yo (un agente) y el otro ya aceptó
  return (
    <div role="alertdialog" aria-labelledby={titulo} className={TARJETA}>
      <div className="flex items-start justify-between gap-2">
        <p id={titulo} className="flex items-center gap-1.5 text-[13px] font-bold">
          <Link2 className="h-4 w-4 text-sky-300" aria-hidden />
          {deOtroLado ? "Falta tu aceptación" : "Solicitud de sincronización"}
        </p>
        <span className="shrink-0 rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] tabular-nums text-white/60" title="Tiempo para contestar">
          {restante(s.caduca - ahora)}
        </span>
      </div>
      <p className="mt-1.5 text-[13px] font-semibold text-white/95">{s.otro.nombre}</p>
      <p className="text-[11px] text-white/55">
        {mismaCuenta ? "de tu cuenta" : s.otro.cuenta ? "de otra cuenta (lo dice ella: sin servidor no se puede comprobar)" : "sin cuenta declarada"}
        {s.otro.plataforma ? ` · ${s.otro.plataforma}` : ""}
        {s.otro.medio ? ` · ${s.otro.medio === "app-nativa" ? "app nativa" : "navegador"}` : ""}
      </p>
      {s.auto && !deOtroLado && (
        <p className="mt-1 text-[11px] text-violet-200/90">Te recuerda de un encuentro anterior y quiere reconectar.</p>
      )}
      <p className="mt-1.5 text-[11px] text-white/70">
        <span className="text-white/45">Llega por </span>
        {textoVia(s.via, s.viaDetalle)}
      </p>
      <p className="mt-0.5 flex items-center gap-1 text-[10px] text-emerald-200/80">
        <Fingerprint className="h-3 w-3" aria-hidden /> Firma verificada · {huellaCorta(s.huellaOtro)}
      </p>
      {suplanta && (
        <p role="alert" className="mt-1 rounded-lg border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[10px] leading-snug text-amber-100">
          Ojo: dice ser «{s.otro.nombre}», pero no firma con la identidad que recordabas. Puede ser otro aparato: acepta solo si sabes
          que reinstaló la app.
        </p>
      )}
      {s.otro.capacidades.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {s.otro.capacidades.map((c) => (
            <span key={c} className="rounded-full border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[9px] text-white/75">
              {c}
            </span>
          ))}
        </div>
      )}
      <label className={CASILLA}>
        <input
          type="checkbox"
          className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-emerald-400"
          checked={recordar}
          onChange={(e) => {
            setTocado(true);
            setRecordar(e.target.checked);
          }}
        />
        <span>
          Recordar para futuros encuentros
          <span className="block text-[10px] text-white/45">La próxima vez que se encuentren se vincularán solas, sin preguntar.</span>
        </span>
      </label>
      <div className="mt-2.5 flex justify-end gap-1.5">
        <button
          type="button"
          disabled={ocupado}
          onClick={() => void contestar(false)}
          className="cursor-pointer rounded-full border border-white/15 bg-white/[0.05] px-3 py-1 text-[11px] font-bold text-white/80 transition-colors duration-200 hover:bg-white/[0.1] disabled:cursor-wait disabled:opacity-60"
        >
          Rechazar
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => void contestar(true)}
          className="cursor-pointer rounded-full border border-emerald-400/40 bg-emerald-500/20 px-3 py-1 text-[11px] font-bold text-emerald-100 transition-colors duration-200 hover:bg-emerald-500/30 disabled:cursor-wait disabled:opacity-60"
        >
          {ocupado ? "…" : "Aceptar"}
        </button>
      </div>
    </div>
  );
}

function SolicitudEnCurso({ s }: { s: SolicitudSync }) {
  return (
    <div className={cn(TARJETA, "py-2.5")} aria-live="polite">
      <div className="flex items-start justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-[12px] font-bold">
          {s.direccion === "saliente" ? (
            <Radar className="h-3.5 w-3.5 shrink-0 animate-pulse text-sky-300" aria-hidden />
          ) : (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-300" aria-hidden />
          )}
          <span className="truncate">Sincronizar con {s.otro.nombre}</span>
        </p>
        {s.direccion === "saliente" && (
          <button
            type="button"
            onClick={() => void cancelarSolicitud(s.id)}
            aria-label="Cancelar la solicitud"
            className="shrink-0 cursor-pointer rounded-lg border border-white/10 bg-white/[0.04] p-1 text-white/50 transition-colors duration-200 hover:text-white/85"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <p className="mt-1 text-[11px] leading-snug text-white/70">{textoEstado(s)}</p>
      {s.direccion === "saliente" && (
        <label className={CASILLA}>
          <input
            type="checkbox"
            className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-emerald-400"
            checked={s.recordarYo}
            onChange={(e) => recordarSolicitud(s.id, e.target.checked)}
          />
          <span>Recordar para futuros encuentros</span>
        </label>
      )}
    </div>
  );
}

function Vinculadas({ a, onCerrar }: { a: AvisoSync; onCerrar: () => void }) {
  const s = a.solicitud;
  const [recordado, setRecordado] = useState(s.recordarYo);
  return (
    <div role="status" className={cn(TARJETA, "border-emerald-400/30")}>
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[13px] font-bold text-emerald-100">
          <BadgeCheck className="h-4 w-4 text-emerald-300" aria-hidden /> Vinculadas
        </p>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar aviso"
          className="cursor-pointer rounded-lg border border-white/10 bg-white/[0.04] p-1 text-white/50 transition-colors duration-200 hover:text-white/85"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-white/85">
        Esta neurona y <span className="font-semibold">{s.otro.nombre}</span> están vinculadas por {textoVia(s.via)}.
      </p>
      {recordado ? (
        <p className="mt-1 text-[11px] text-emerald-200/80">Se recordará: en futuros encuentros se vincularán solas.</p>
      ) : (
        <button
          type="button"
          onClick={() => {
            recordarVinculo(s.otro.neurona, true);
            setRecordado(true);
          }}
          className="mt-2 cursor-pointer rounded-full border border-emerald-400/35 bg-emerald-500/15 px-3 py-1 text-[11px] font-bold text-emerald-100 transition-colors duration-200 hover:bg-emerald-500/25"
        >
          Recordar para futuros encuentros
        </button>
      )}
    </div>
  );
}

export function SolicitudSincronizacionFlotante() {
  const activa = useInstanciaUnica();
  const solicitudes = useSolicitudesSync();
  const vinculos = useVinculosNeuronas();
  const [miUid, setMiUid] = useState<string | null>(null);
  const [vinculadas, setVinculadas] = useState<Array<AvisoSync & { at: number }>>([]);

  useEffect(() => {
    if (!activa) return;
    let vivo = true;
    import("@/lib/consumo/usuario")
      .then((m) => m.uidActual())
      .then((u) => {
        if (vivo) setMiUid(u ?? null);
      })
      .catch(() => undefined);
    const baja = alAvisoSync((a) => {
      const nombre = a.solicitud.otro.nombre;
      if (a.tipo === "vinculadas") {
        setVinculadas((l) => [...l.filter((x) => x.solicitud.id !== a.solicitud.id), { ...a, at: Date.now() }].slice(-3));
      } else if (a.tipo === "reconectada") {
        toast.success(`Reconectada con ${nombre}`, { description: `por ${textoVia(a.solicitud.via)} · vínculo recordado` });
      } else {
        toast.message(a.tipo === "rechazada" ? "Sincronización rechazada" : a.tipo === "caducada" ? "Sincronización caducada" : "Sincronización cancelada", {
          description: a.texto,
        });
      }
    });
    return () => {
      vivo = false;
      baja();
    };
  }, [activa]);

  const pendientes = useMemo(() => solicitudes.filter(esperaMiRespuesta).sort((a, b) => a.creada - b.creada), [solicitudes]);
  const enCurso = useMemo(
    () => solicitudes.filter((s) => !esTerminal(s.estado) && s.aceptoYo && !s.auto).slice(0, 2),
    [solicitudes],
  );
  const ahora = useAhora(activa && (pendientes.length > 0 || vinculadas.length > 0));

  // «Vinculadas» se queda 12 s (o hasta que se cierre).
  useEffect(() => {
    if (!vinculadas.length) return;
    const t = setTimeout(() => setVinculadas((l) => l.filter((x) => Date.now() - x.at < 12_000)), 12_500);
    return () => clearTimeout(t);
  }, [vinculadas]);

  if (!activa || (!pendientes.length && !enCurso.length && !vinculadas.length)) return null;
  const primera = pendientes[0];
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {vinculadas.map((a) => (
        <Vinculadas key={a.solicitud.id} a={a} onCerrar={() => setVinculadas((l) => l.filter((x) => x.solicitud.id !== a.solicitud.id))} />
      ))}
      {enCurso.map((s) => (
        <SolicitudEnCurso key={s.id} s={s} />
      ))}
      {primera && (
        <SolicitudEntrante
          key={primera.id}
          s={primera}
          miUid={miUid}
          ahora={ahora}
          huellaRecordada={vinculos.find((v) => v.neurona === primera.otro.neurona)?.huella}
        />
      )}
      {pendientes.length > 1 && (
        <p className="pointer-events-auto self-end rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white/60">
          {pendientes.length - 1} solicitud{pendientes.length - 1 === 1 ? "" : "es"} más en espera
        </p>
      )}
    </div>
  );
}

export default SolicitudSincronizacionFlotante;
