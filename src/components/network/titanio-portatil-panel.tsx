"use client";

/**
 * Panel «Titanio portátil» (§8.1 de architecture/malla-cristalina-sio2.md):
 * routers portátiles como titanio móvil de la malla, con SIM o sin ella.
 * Enseña la compatibilidad honesta de portatil.ts, la coordinación según
 * batería, el resumen sin SIM y la puerta a internet opcional (tipo, con
 * quién se comparte, tope mensual y reserva del dueño) con sus guiones UCI
 * listos para copiar. Solo UI: los cálculos viven en módulos puros.
 */

import { useMemo, useState } from "react";
import { BatteryCharging, Copy, DoorOpen, SimCard } from "lucide-react";
import {
  compatibilidadPortatil,
  coordinacionPortatil,
  resumenSinSim,
  TIPOS_PORTATIL,
  type RouterPortatil,
  type TipoPortatil,
} from "@/lib/network/routers-malla/portatil";
import type { EntradaTabla } from "@/lib/network/routers-malla/compatibilidad-openwrt";
import {
  guionGuardianTope,
  uciClientePuerta,
  uciPuerta,
  type CfgPuerta,
  type TipoPuerta,
} from "@/lib/network/routers-malla/uci-puerta";
import { COMPARTIR } from "@/lib/malla/cristal/puertas-internet";
import type { RouterGuardado } from "./routers-malla-panel";

const BOTON =
  "cursor-pointer rounded-lg border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-[12px] text-amber-100 hover:bg-amber-500/25 inline-flex items-center gap-1";
const SEL =
  "cursor-pointer rounded-md border border-white/10 bg-white/5 px-1 text-sm text-white";
const TIPOS_PUERTA: TipoPuerta[] = ["movil-4g", "movil-5g", "wifi-externa", "usb-telefono", "cable"];

export function TitanioPortatilPanel({
  tabla,
  router,
}: {
  tabla?: EntradaTabla[];
  router?: RouterGuardado;
}) {
  const [tipo, setTipo] = useState<TipoPortatil>("viaje-openwrt");
  const [bateriaPct, setBateriaPct] = useState("100");
  const [cargando, setCargando] = useState(true);
  const [modulo, setModulo] = useState(false);
  const [sim, setSim] = useState(false);
  const [tipoPuerta, setTipoPuerta] = useState<TipoPuerta>("movil-4g");
  const [compartir, setCompartir] = useState<(typeof COMPARTIR)[number]>("nadie");
  const [topeMb, setTopeMb] = useState("50");
  const [reservaPct, setReservaPct] = useState("20");
  const [estado, setEstado] = useState("");

  /** El titanio que el panel enseña: sus datos entran a los módulos puros. */
  const portatil: RouterPortatil = useMemo(
    () => ({
      id: router?.id ?? "portatil",
      tipo,
      bateriaPct: Number.isFinite(Number(bateriaPct)) ? Number(bateriaPct) : null,
      cargando,
      modem: modulo ? { generacion: "4g", conSim: sim } : null,
    }),
    [router, tipo, bateriaPct, cargando, modulo, sim],
  );
  const compat = useMemo(
    () =>
      compatibilidadPortatil(
        {
          fabricante: router?.fabricante ?? "-",
          modelo: router?.modelo ?? "-",
          version: router?.version,
          deOperador: router?.deOperador,
          tipo,
        },
        tabla ?? [],
      ),
    [router, tipo, tabla],
  );
  const coordinacion = coordinacionPortatil(portatil);

  /** Guion de la puerta: UCI (network + firewall) con bat0 en gw_mode server y el guardián de tope. */
  const copiarPuerta = async () => {
    const cfg: CfgPuerta = { tipo: tipoPuerta, bajadaKbps: 5000, subidaKbps: 1000 };
    const { network, firewall } = uciPuerta(cfg);
    const guardian = guionGuardianTope({
      interfaz: "wwan0",
      topeMb: Number(topeMb) || 50,
      reservaPct: Number(reservaPct),
      bajadaKbps: cfg.bajadaKbps,
      subidaKbps: cfg.subidaKbps,
    });
    const todo = [
      `# Puerta a internet (compartir con: ${compartir}, tope ${topeMb} MB/mes, reserva del dueño ${reservaPct}%)`,
      "# /etc/config/network",
      network,
      "# /etc/config/firewall",
      firewall.trimEnd(),
      "# /etc/starseed/guardian-puerta.sh, con cron cada 5 min (vuelve a server con el mes nuevo)",
      guardian,
    ].join("\n\n");
    try {
      await navigator.clipboard.writeText(todo);
      setEstado("Guion de la puerta copiado: pégalo por SSH en el titanio que comparte.");
    } catch {
      setEstado("No pude copiar el guion de la puerta.");
    }
  };

  const copiarCliente = async () => {
    try {
      await navigator.clipboard.writeText(uciClientePuerta());
      setEstado("Guion de cliente copiado: bat0 queda en gw_mode client.");
    } catch {
      setEstado("No pude copiar el guion de cliente.");
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-[11px] uppercase tracking-widest text-white/45">Titanio portátil</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <label className="text-[12px] text-white/60">Tipo de router portátil
          <select className={`w-full ${SEL}`} value={tipo} onChange={(e) => setTipo(e.target.value as TipoPortatil)}>
            {TIPOS_PORTATIL.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="text-[12px] text-white/60">
          <BatteryCharging className="mr-1 inline size-3" />Batería (%)
          <input type="number" min={0} max={100} className={`w-full ${SEL}`} value={bateriaPct} onChange={(e) => setBateriaPct(e.target.value)} />
        </label>
        <label className="flex cursor-pointer items-end gap-1 text-[12px] text-white/60">
          <input type="checkbox" className="cursor-pointer" checked={cargando} onChange={(e) => setCargando(e.target.checked)} />está cargando
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-white/60">
        <label className="flex cursor-pointer items-center gap-1">
          <input type="checkbox" className="cursor-pointer" checked={modulo} onChange={(e) => setModulo(e.target.checked)} />Tiene módem
        </label>
        {modulo && (
          <label className="flex cursor-pointer items-center gap-1">
            <input type="checkbox" className="cursor-pointer" checked={sim} onChange={(e) => setSim(e.target.checked)} />Lleva SIM
          </label>
        )}
        <span>Coordinación que tendrá: <strong className="text-white/85">{coordinacion}</strong> enlaces</span>
      </div>
      <div className="mt-2 rounded-lg border border-white/10 bg-black/30 p-2 text-[12px]">
        <span className="text-white/55">Estado: {compat.estado}</span>
        <ol className="list-decimal space-y-0.5 pl-5 text-white/60">
          {compat.pasos.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>
        {compat.enlace && (
          <a href={compat.enlace} target="_blank" rel="noreferrer" className="cursor-pointer text-amber-300 underline hover:text-amber-200">Imagen exacta en OpenWrt</a>
        )}
        <p className="text-rose-300/90">{compat.aviso}</p>
        <p className="text-white/55"><SimCard className="mr-1 inline size-3" />{resumenSinSim(portatil)}</p>
      </div>
      <div className="mt-3 border-t border-white/10 pt-2">
        <div className="flex items-center gap-1 text-[12px] text-white/70"><DoorOpen className="size-3" />Puerta a internet (opcional)</div>
        <div className="mt-1 grid gap-2 sm:grid-cols-4">
          <label className="text-[12px] text-white/60">Tipo
            <select className={`w-full ${SEL}`} value={tipoPuerta} onChange={(e) => setTipoPuerta(e.target.value as TipoPuerta)}>
              {TIPOS_PUERTA.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="text-[12px] text-white/60">Con quién se comparte la puerta
            <select className={`w-full ${SEL}`} value={compartir} onChange={(e) => setCompartir(e.target.value as (typeof COMPARTIR)[number])}>
              {COMPARTIR.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="text-[12px] text-white/60">Tope mensual (MB)
            <input type="number" min={0} className={`w-full ${SEL}`} value={topeMb} onChange={(e) => setTopeMb(e.target.value)} />
          </label>
          <label className="text-[12px] text-white/60">Reserva del dueño (%)
            <input type="number" min={0} max={100} className={`w-full ${SEL}`} value={reservaPct} onChange={(e) => setReservaPct(e.target.value)} />
          </label>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button onClick={copiarPuerta} className={BOTON}><Copy className="size-3" />Copiar guion de la puerta</button>
          <button onClick={copiarCliente} className={BOTON}><Copy className="size-3" />Copiar guion de cliente</button>
          {estado && <span className="text-[12px] text-white/50">{estado}</span>}
        </div>
        <p className="mt-1 text-[12px] text-amber-200/70">Algunas operadoras no permiten compartir los datos de tu línea: revisa tu contrato antes de compartir fuera de tu cuenta.</p>
        <p className="text-[12px] text-white/50">StarSeed no pide ni guarda el PIN de tu SIM.</p>
      </div>
    </div>
  );
}
