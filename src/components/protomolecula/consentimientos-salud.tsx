"use client";

import { useState, useEffect } from "react";
import type { MetricaSalud, Consentimiento, DecisionSalud } from "../lib/protomolecula/tipos";
import { AVISO_SALUD } from "../lib/protomolecula/permisos";

interface Props {
  metricas: readonly MetricaSalud[];
  consentimientos: Consentimiento[];
  ambito: "personal" | "perfil" | "grupo" | "publica";
  usuarioId: string;
  ahora: number;
  decidirSalud: (
    metrica: MetricaSalud,
    ambito: "personal" | "perfil" | "grupo" | "publica",
    cs: Consentimiento[],
    usuarioId: string,
    ahora: number
  ) => DecisionSalud;
  onConsentChange?: () => void;
}

export function ConsentimientosSalud({
  metricas,
  consentimientos,
  ambito,
  usuarioId,
  ahora,
  decidirSalud,
  onConsentChange,
}: Props) {
  const [consentimientosLocales, setConsentimientosLocales] = useState<Record<MetricaSalud, { concedido: boolean; expiraEn?: number | null }>}>(
    () => {
      const r: Record<MetricaSalud, { concedido: boolean; expiraEn?: number | null }> = {} as Record<MetricaSalud, { concedido: boolean; expiraEn?: number | null }>;
      for (const m of metricas) {
        const c = consentimientos.find((x) => x.metrica === m && x.concedidoPor === usuarioId && (!x.caducaEn || x.caducaEn > ahora));
        r[m] = { concedido: !!c, expiraEn: c?.caducaEn ?? null };
      }
      return r;
    }
  );

  const [consentimientoExpreso, setConsentimientoExpreso] = useState<Record<MetricaSalud, boolean>>(() => {
    const r: Record<MetricaSalud, boolean> = {} as Record<MetricaSalud, boolean>;
    for (const m of metricas) {
      const c = consentimientos.find((x) => x.metrica === m && x.concedidoPor === usuarioId && x.expreso === true && (!x.caducaEn || x.caducaEn > ahora));
      r[m] = !!c;
    }
    return r;
  });

  const [caducidades, setCaducidades] = useState<Record<MetricaSalud, string>>(() => {
    const r: Record<MetricaSalud, string> = {} as Record<MetricaSalud, string>;
    for (const m of metricas) {
      const c = consentimientos.find((x) => x.metrica === m && x.concedidoPor === usuarioId && (!x.caducaEn || x.caducaEn > ahora));
      if (c?.caducaEn) {
        const desde = new Date(c.caducaEn).toLocaleString();
        r[m] = desde;
      }
    }
    return r;
  });

  const toggleConsent = (metrica: MetricaSalud, duracionMeses?: number) => {
    const nuevoConcedido = !consentimientosLocales[metrica].concedido;
    const ahora = Date.now();
    const nuevaExpiracion = duracionMeses ? ahora + duracionMeses * 30 * 24 * 60 * 60 * 1000 : null;

    setConsentimientosLocales((prev) => ({
      ...prev,
      [metrica]: { concedido: nuevoConcedido, expiraEn: nuevaExpiracion },
    }));

    if (duracionMeses) {
      setCaducidades((prev) => ({
        ...prev,
        [metrica]: new Date(nuevaExpiracion!).toLocaleString(),
      }));
    }

    onConsentChange?.();
  };

  const decidirExpreso = (metrica: MetricaSalud) => {
    const nuevoExpreso = !consentimientoExpreso[metrica];
    setConsentimientoExpreso((prev) => ({ ...prev, [metrica]: nuevoExpreso }));
    onConsentChange?.();
  };

  const decisones = metricas.map((m) => decidirSalud(m, ambito, consentimientos, usuarioId, ahora));
  const hayError = (m: MetricaSalud) => !decisiones.find((d) => d.motivo.includes(m)).motivo.includes("consentimiento");

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
      <h3 className="text-lg font-semibold">Consentimientos de métricas de salud</h3>
      <p className="text-sm text-yellow-800 bg-yellow-100 p-2 rounded">
        {AVISO_SALUD}
      </p>

      <div className="space-y-2">
        {metricas.map((m) => {
          const d = decisones.find((x) => x.motivo.includes(m));
          const concedido = consentimientosLocales[m].concedido;
          const expira = consentimientosLocales[m].expiraEn;
          const esPublico = ambito === "publica";
          const vigente = new Date().getTime() < (expira || Infinity);

          return (
            <div key={m} className="flex items-center justify-between p-3 border rounded bg-white">
              <div className="flex-1">
                <span className="font-medium">{m}</span>
                {d && (
                  <span className={`ml-2 text-xs ${d.difundir ? "text-green-700" : "text-red-700"}`}>{d.motivo}</span>
                )}
                {expira && vigente && (
                  <span className="ml-2 text-xs text-gray-600">(caduca: {caducidades[m]})</span>
                )}
                {expira && !vigente && (
                  <span className="ml-2 text-xs text-red-600">(caducado)</span>
                )}
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={concedido}
                    onChange={() => toggleConsent(m)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm">Concedido</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentimientoExpreso[m]}
                    onChange={() => decidirExpreso(m)}
                    disabled={!concedido || !esPublico}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
                  />
                  <span className="text-sm">Permiso expreso para sesión pública</span>
                </label>

                <select
                  onChange={(e) => {
                    const meses = e.target.value ? Number(e.target.value) : undefined;
                    toggleConsent(m, meses);
                  }}
                  value={expira ? Math.round((expira - Date.now()) / (30 * 24 * 60 * 60 * 1000)) : ""}
                  className="text-sm border rounded px-2 py-1 cursor-pointer"
                >
                  <option value="">Sin caducidad</option>
                  <option value="1">1 mes</option>
                  <option value="3">3 meses</option>
                  <option value="6">6 meses</option>
                  <option value="12">1 año</option>
                </select>
              </div>
            </div>
          );
        })}
      </div>

      {ambito === "publica" && (
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            * En sesiones públicas, las métricas de salud requieren tu permiso expreso adicional (marca la casilla correspondiente) para difundirse.
          </p>
        </div>
      )}
    </div>
  );
}