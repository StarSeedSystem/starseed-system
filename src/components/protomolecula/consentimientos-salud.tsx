"use client";

/**
 * Protomolécula · CONSENTIMIENTOS DE SALUD (F6, §8.3). Lista las métricas y deja conceder o
 * revocar cada una, con caducidad opcional; en sesión pública el permiso expreso va APARTE.
 * No interpreta cifras ni afirma nada médico: muestra `AVISO_SALUD`. Web Bluetooth solo existe
 * en navegadores Chromium; el resto de wearables necesita app nativa y se anuncia como tal.
 */
import { useEffect, useState } from "react";
import { AVISO_SALUD, crearConsentimiento, revocarConsentimiento } from "@/lib/protomolecula/permisos";
import { METRICAS_SALUD, type Ambito, type Consentimiento, type MetricaSalud } from "@/lib/protomolecula/tipos";
import { hayBluetooth, SIN_BLUETOOTH, type NavegadorBluetooth } from "@/lib/protomolecula/adaptador-wearable";

export interface ConsentimientosSaludProps {
  consentimientos: Consentimiento[];
  usuarioId: string;
  ambito: Ambito;
  ahora: () => number;
  navegadorBluetooth?: { bluetooth?: NavegadorBluetooth | null } | null;
  alCambiar?: (consentimientos: Consentimiento[]) => void;
}

const NOMBRE: Record<MetricaSalud, string> = {
  pulso: "Pulso", "variabilidad-cardiaca": "Variabilidad cardiaca", oxigeno: "Oxígeno",
  temperatura: "Temperatura", respiracion: "Respiración", sueno: "Sueño", estres: "Estrés",
  ecg: "ECG", pasos: "Pasos",
};
const DURACIONES = { sin: undefined, "1h": 3_600_000, "1d": 86_400_000 } as const;
type Duracion = keyof typeof DURACIONES;
const AMBITOS_HASTA: Ambito[] = ["personal", "perfil", "grupo"];
const NATIVAS = ["Pulsera o anillo con SDK propio", "Health Connect (Android)", "HealthKit (Apple)"];
const BOTON = "cursor-pointer rounded-md border border-input px-2 py-1 text-xs transition-opacity duration-200 hover:bg-accent";
const SELECT = "cursor-pointer rounded-md border border-input bg-background px-2 py-1 text-sm";

const vigente = (c: Consentimiento, ahora: number) => c.caducaEn === undefined || c.caducaEn > ahora;
const cuandoCaduca = (c: Consentimiento) => c.caducaEn === undefined ? "sin caducidad" : `hasta ${new Date(c.caducaEn).toLocaleString("es-ES")}`;

export default function ConsentimientosSalud({
  consentimientos,
  usuarioId,
  ambito,
  ahora,
  navegadorBluetooth = null,
  alCambiar,
}: ConsentimientosSaludProps) {
  const [ambitoMax, setAmbitoMax] = useState<Ambito>("grupo");
  const [duracion, setDuracion] = useState<Duracion>("sin");
  const [bluetooth, setBluetooth] = useState<boolean | null>(null);
  useEffect(() => {
    const nav = navegadorBluetooth ?? (typeof navigator === "undefined" ? null : (navigator as { bluetooth?: NavegadorBluetooth }));
    setBluetooth(hayBluetooth(nav));
  }, [navegadorBluetooth]);

  const ahoraMs = ahora();
  const conceder = (metrica: MetricaSalud, expreso: boolean) => {
    const max: Ambito = expreso ? "publica" : ambitoMax;
    const c = crearConsentimiento(metrica, max, usuarioId, ahoraMs, { expreso, duracionMs: DURACIONES[duracion] });
    alCambiar?.([...revocarConsentimiento(consentimientos, metrica, usuarioId), c]);
  };
  const revocar = (metrica: MetricaSalud) => alCambiar?.(revocarConsentimiento(consentimientos, metrica, usuarioId));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{AVISO_SALUD}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          Hasta el ámbito
          <select aria-label="Ámbito máximo de la métrica" value={ambitoMax} onChange={(e) => setAmbitoMax(e.target.value as Ambito)} className={SELECT}>
            {AMBITOS_HASTA.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Caducidad
          <select aria-label="Caducidad del consentimiento" value={duracion} onChange={(e) => setDuracion(e.target.value as Duracion)} className={SELECT}>
            <option value="sin">Sin caducidad</option>
            <option value="1h">1 hora</option>
            <option value="1d">1 día</option>
          </select>
        </label>
      </div>
      <ul className="space-y-2">
        {METRICAS_SALUD.map((m) => {
          const c = consentimientos.find((x) => x.metrica === m && x.concedidoPor === usuarioId && vigente(x, ahoraMs));
          return (
            <li key={m} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-input px-3 py-2 text-sm">
              <span>
                {NOMBRE[m]}
                {c ? <span className="ml-2 text-xs text-muted-foreground">concedido {cuandoCaduca(c)}</span> : null}
              </span>
              {alCambiar ? (
                <span className="flex flex-wrap gap-2">
                  <button type="button" className={BOTON} onClick={() => conceder(m, false)}>Conceder</button>
                  {c ? <button type="button" className={BOTON} onClick={() => revocar(m)}>Revocar</button> : null}
                  {ambito === "publica" ? <button type="button" className={BOTON} onClick={() => conceder(m, true)}>Permitir en sesión pública</button> : null}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {!alCambiar ? <p role="status" className="text-xs text-muted-foreground">El panel aún no está conectado para guardar consentimientos.</p> : null}
      <div className="space-y-1 text-xs text-muted-foreground">
        <p role="status">
          {bluetooth === null ? "Comprobando Bluetooth web…" : bluetooth ? "Este navegador ofrece Bluetooth web; el pulsómetro se conecta desde el panel de vínculos." : SIN_BLUETOOTH}
        </p>
        <p>Las cifras se muestran tal cual: no se interpretan ni se etiquetan.</p>
        <ul className="list-disc pl-5">
          {NATIVAS.map((n) => <li key={n}>{n}: próximamente: requiere la app nativa.</li>)}
        </ul>
      </div>
    </div>
  );
}
