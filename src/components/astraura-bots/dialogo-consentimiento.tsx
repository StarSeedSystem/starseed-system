"use client";

/**
 * Diálogo de consentimiento de UN sentido para UN bot (BOT1011E2 · contrato §5.2).
 *
 * La persona ve el NOMBRE del bot, QUÉ verá y PARA QUÉ, y elige cuánto dura el permiso (a un
 * invitado no se le ofrece «hasta que lo quite»: su permiso dura una hora como mucho). En
 * sesión pública hace falta además el permiso EXPRESO. Si el aparato no concede el permiso
 * real NO se otorga nada y se dice por qué; «No» y Escape cierran sin otorgar.
 */
import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { requestDevicePermission, type PermisoDispositivo, type ResultadoPermiso } from "@/lib/aurora/senses/request-permission";
import { esInvitado } from "@/lib/astraura-bots/tipos";
import {
  DURACIONES, NOMBRE_SENTIDO, PERMISO_SENTIDO, USO_SENTIDO,
  type DialogoConsentimientoProps, type DuracionConsentimiento,
} from "./sentidos-ui";

export type { DialogoConsentimientoProps, ResultadoConsentimiento } from "./sentidos-ui";

export function DialogoConsentimiento({
  bot, sentido, sesion, abierto, onConceder, onDenegar, pedirPermiso = requestDevicePermission,
}: DialogoConsentimientoProps) {
  const [duracion, setDuracion] = useState<DuracionConsentimiento>("sesion");
  const [expreso, setExpreso] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [problema, setProblema] = useState("");
  const uso = USO_SENTIDO[sentido];
  const duraciones = esInvitado(bot) ? DURACIONES.filter((d) => d.id !== "siempre") : DURACIONES;

  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: KeyboardEvent) => { if (e.key === "Escape") onDenegar(); };
    document.addEventListener("keydown", alPulsar);
    return () => document.removeEventListener("keydown", alPulsar);
  }, [abierto, onDenegar]);

  if (!abierto) return null;

  const conceder = async () => {
    setOcupado(true);
    setProblema("");
    const permiso = PERMISO_SENTIDO[sentido];
    let dispositivo: ResultadoPermiso | null = null;
    if (permiso) {
      try {
        dispositivo = await pedirPermiso(permiso);
      } catch {
        dispositivo = { permiso, soportado: false, concedido: false, motivo: "el aparato no respondió" };
      }
      if (!dispositivo.concedido) {
        setProblema(`El aparato no ha concedido el permiso: ${dispositivo.motivo ?? "denegado"}.`);
        setOcupado(false);
        return;
      }
    }
    setOcupado(false);
    onConceder({ sentido, duracion, expreso: sesion === "publica" && expreso, dispositivo });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`Permiso de ${bot.nombre}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg space-y-4 rounded-xl border border-white/10 bg-zinc-950/95 p-6 text-zinc-100 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{bot.nombre} quiere usar {NOMBRE_SENTIDO[sentido]}</h2>
          <button type="button" onClick={onDenegar} aria-label="Cerrar sin conceder" title="Cerrar sin conceder"
            className="cursor-pointer rounded-md p-1 text-white/70 transition-colors duration-200 hover:bg-white/10">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <dl className="space-y-2 text-sm">
          <div><dt className="text-white/60">Qué verá</dt><dd>{uso.queVe}</dd></div>
          <div><dt className="text-white/60">Para qué</dt><dd>{uso.paraQue}</dd></div>
        </dl>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Cuánto tiempo</legend>
          {duraciones.map((d) => (
            <label key={d.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name={`duracion-${sentido}`} value={d.id} checked={duracion === d.id}
                onChange={() => setDuracion(d.id)} className="cursor-pointer" />
              {d.texto}
            </label>
          ))}
        </fieldset>
        {sesion === "publica" && (
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="checkbox" checked={expreso} onChange={(e) => setExpreso(e.target.checked)} className="mt-0.5 cursor-pointer" />
            <span>Doy mi permiso expreso para este sentido en sesiones públicas.</span>
          </label>
        )}
        {problema && (
          <p role="alert" className="rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{problema}</p>
        )}
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onDenegar}
            className="cursor-pointer rounded-md border border-white/20 px-4 py-2 text-sm transition-colors duration-200 hover:bg-white/10">No</button>
          <button type="button" onClick={conceder} disabled={ocupado}
            className="flex cursor-pointer items-center gap-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60">
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {ocupado ? "Pidiendo permiso…" : "Permitir"}
          </button>
        </div>
      </div>
    </div>
  );
}
