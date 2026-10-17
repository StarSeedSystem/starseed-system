"use client";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Clock } from "lucide-react";
import type { Ambito, Consentimiento, MetricaSalud, Sesion } from "@/lib/protomolecula/tipos";
import { AVISO_SALUD, decidirSalud, crearConsentimiento, revocarConsentimiento } from "@/lib/protomolecula/permisos";
export interface ConsentimientosSaludProps {
  sesion: Sesion;
  usuarioId: string;
  actualizarConsentimientos: (cs: Consentimiento[]) => void;
  ahora: number;
}
const OPCIONES_DURACION = [
  { label: "1 hora", valor: 60 * 60 * 1000 },
  { label: "1 día", valor: 24 * 60 * 60 * 1000 },
  { label: "1 semana", valor: 7 * 24 * 60 * 60 * 1000 },
  { label: "Indefinido", valor: undefined },
] as const;
export function ConsentimientosSalud({
  sesion,
  usuarioId,
  actualizarConsentimientos,
  ahora,
}: ConsentimientosSaludProps) {
  const [expandidas, setExpandidas] = useState<Record<string, boolean>>({});
  const [duraciones, setDuraciones] = useState<Record<string, number | undefined>>({});
  const [expresos, setExpresos] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const inicial: Record<string, boolean> = {};
    const inicialDuraciones: Record<string, number | undefined> = {};
    const inicialExpresos: Record<string, boolean> = {};
    METRICAS_SALUD.forEach((m) => {
      inicial[m] = false;
      inicialDuraciones[m] = undefined;
      inicialExpresos[m] = false;
    });
    setExpandidas(inicial);
    setDuraciones(inicialDuraciones);
    setExpresos(inicialExpresos);
  }, []);
  const toggleExpansion = (metrica: MetricaSalud) => {
    setExpandidas((prev) => ({ ...prev, [metrica]: !prev[metrica] }));
  };
  const cambiarDuracion = (metrica: MetricaSalud, duracion: number | undefined) => {
    setDuraciones((prev) => ({ ...prev, [metrica]: duracion }));
  };
  const cambiarExpreso = (metrica: MetricaSalud, expreso: boolean) => {
    setExpresos((prev) => ({ ...prev, [metrica]: expreso }));
  };
  const concederConsentimiento = (metrica: MetricaSalud) => {
    const duracion = duraciones[metrica];
    const expreso = expresos[metrica];
    const nuevoConsentimiento = crearConsentimiento(metrica, sesion.ambito, usuarioId, ahora, {
      duracionMs: duracion,
      expreso,
    });
    actualizarConsentimientos([
      ...sesion.consentimientos.filter((c) => c.metrica !== metrica || c.concedidoPor !== usuarioId),
      nuevoConsentimiento,
    ]);
  };
  const revocarConsentimientoMetrica = (metrica: MetricaSalud) => {
    actualizarConsentimientos(
      revocarConsentimiento(sesion.consentimientos, metrica, usuarioId)
    );
  };
  const getDecisionSalud = (metrica: MetricaSalud) => {
    return decidirSalud(metrica, sesion.ambito, sesion.consentimientos, usuarioId, ahora);
  };
  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Consentimientos de salud</h3>
          <button
            type="button"
            onClick={() => {
              const todasExpandidas = Object.values(expandidas).every((v) => v);
              METRICAS_SALUD.forEach((m) => setExpandidas((prev) => ({ ...prev, [m]: !todasExpandidas })));
            }}
            className="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
          >
            {Object.values(expandidas).every((v) => v) ? "Colapsar todo" : "Expandir todo"}
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          {AVISO_SALUD}
        </p>
        {METRICAS_SALUD.map((metrica) => (
          <div key={metrica} className="border rounded-lg p-3 mb-2">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{metrica}</span>
              </div>
              <button
                type="button"
                onClick={() => toggleExpansion(metrica)}
                className="cursor-pointer p-1 rounded-hover text-muted-foreground hover:text-foreground"
              >
                {expandidas[metrica] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>
            {expandidas[metrica] && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold">Ámbito máximo:</span>
                    <span className="capitalize">{sesion.ambito}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold">Duración:</span>
                    <select
                      value={duraciones[metrica] ?? undefined}
                      onChange={(e) => {
                        const valor = e.target.value;
                        cambiarDuracion(metrica, valor === "" ? undefined : Number(valor));
                      }}
                      className="border rounded px-2 py-1 text-sm"
                    >
                      <option value="">Indefinido</option>
                      {OPCIONES_DURACION.map((op) => (
                        <option key={op.valor} value={op.valor ?? ""}>
                          {op.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {sesion.ambito === "publica" && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold">Permiso expreso:</span>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={expresos[metrica] || false}
                          onChange={(e) => cambiarExpreso(metrica, e.target.checked)}
                          className="h-3 w-3 text-primary"
                        />
                        <span>Requerido para sesión pública</span>
                      </label>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => concederConsentimiento(metrica)}
                      disabled={
                        !(duraciones[metrica] !== undefined || duraciones[metrica] === null) ||
                        (sesion.ambito === "publica" && !expresos[metrica])
                      }
                      className="cursor-pointer px-3 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Conceder
                    </button>
                    <button
                      type="button"
                      onClick={() => revocarConsentimientoMetrica(metrica)}
                      className="cursor-pointer ml-2 px-3 py-1 bg-border text-foreground rounded hover:bg-border/hover"
                    >
                      Revocar
                    </button>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-border/50">
                  <div className="text-xs text-muted-foreground">
                    <strong>Estado actual:</strong>{" "}
                    {getDecisionSalud(metrica).difundir ? (
                      <span className="text-success">✓ Puede difundirse a la sesión</span>
                    ) : (
                      <span className="text-destructive">✗ Solo local: {getDecisionSalud(metrica).motivo}</span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
export default ConsentimientosSalud;
/** El montaje de este componente en el panel lo hace una tarea sucesora: anotarlo en la última línea de esa tarea. */