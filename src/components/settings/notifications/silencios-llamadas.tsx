"use client";

/**
 * Ajustes › Notificaciones › Llamadas silenciadas (LLA1108F). La lista de silencios activos («Silenciar…» en una llamada
 * entrante) con su alcance, hasta cuándo y un botón para quitarlos. La misma lista se espeja a la parte nativa.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { BellOff, X } from "lucide-react";
import { quitarSilencio } from "@/lib/llamadas/nativa/acciones-timbre";
import { silenciosActivos, silenciosGuardados, suscribirSilencios, TEXTO_AMBITO, textoHasta } from "@/lib/llamadas/silencio-llamadas";

export function SilenciosLlamadasAjustes() {
  const lista = useSyncExternalStore(suscribirSilencios, silenciosGuardados, silenciosGuardados);
  // Para que «hasta las 18:30» se ponga al día y los caducados salgan de la lista sin recargar.
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const activos = silenciosActivos(lista, ahora);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" aria-labelledby="silencios-llamadas-titulo" data-testid="silencios-llamadas">
      <h3 id="silencios-llamadas-titulo" className="flex items-center gap-2 text-sm font-semibold">
        <BellOff className="h-4 w-4" aria-hidden /> Llamadas silenciadas
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Las llamadas que encajan aquí no suenan ni abren ventana: quedan como «Llamada silenciada» con «Deshacer». Se crean con «Silenciar…» al recibir una llamada.
      </p>
      {activos.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">No hay llamadas silenciadas.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {activos.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.ambito === "todas" ? TEXTO_AMBITO.todas : `${TEXTO_AMBITO[s.ambito]}: ${s.etiqueta}`}</p>
                <p className="text-xs text-muted-foreground">{textoHasta(s.hasta, ahora)}</p>
              </div>
              <button type="button" onClick={() => quitarSilencio(s.id)} className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold hover:bg-white/10" aria-label={`Quitar el silencio de ${s.etiqueta}`}>
                <X className="h-3.5 w-3.5" aria-hidden /> Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
