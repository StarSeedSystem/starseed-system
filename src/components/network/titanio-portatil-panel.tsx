"use client";

/**
 * Panel «Titanio portátil» (§8.1 de architecture/malla-cristalina-sio2.md):
 * router de viaje o MiFi como titanio móvil de la malla, con batería y
 * «está cargando», módem y SIM opcionales, y puerta a internet opcional
 * compartible con tope mensual y reserva del dueño. UI pura: nada queda
 * guardado en disco; los guiones se copian al portapapeles.
 */

import { useState } from "react";
import { Copy, DoorOpen, Share2 } from "lucide-react";
import { compatibilidadPortatil, coordinacionPortatil, resumenSinSim, TIPOS_PORTATIL, type RouterPortatil, type TipoPortatil } from "@/lib/network/routers-malla/portatil";
import { guionGuardianTope, uciClientePuerta, uciPuerta, type TipoPuerta } from "@/lib/network/routers-malla/uci-puerta";
import type { EntradaTabla, ModeloRouter } from "@/lib/network/routers-malla/compatibilidad-openwrt";

/** Con quién se comparte una puerta a internet (§8.1): por defecto, nadie. */
export type CompartirCon = "nadie" | "mi-cuenta" | "vinculos" | "grupo" | "publico";

const COMPARTIR: CompartirCon[] = ["nadie", "mi-cuenta", "vinculos", "grupo", "publico"];
const PUERTAS: TipoPuerta[] = ["movil-4g", "movil-5g", "wifi-externa", "usb-telefono", "cable"];
const SEL = "cursor-pointer rounded-md border border-white/10 bg-white/5 px-1 text-sm text-white";

/** Titanio portátil: SIM opcional y puerta compartida a elección (§8.1). */
export function TitanioPortatilPanel({ tabla, nombres }: {
  tabla?: EntradaTabla[];
  nombres?: Pick<ModeloRouter, "fabricante" | "modelo" | "version">;
}) {
  const [tipo, setTipo] = useState<TipoPortatil>("viaje-openwrt");
  const [bateriaPct, setBateriaPct] = useState(80);
  const [cargando, setCargando] = useState(false);
  const [generacion, setGeneracion] = useState<"4g" | "5g">("4g");
  const [conModem, setConModem] = useState(false);
  const [conSim, setConSim] = useState(false);
  const [puertaTipo, setPuertaTipo] = useState<TipoPuerta>("movil-4g");
  const [compartir, setCompartir] = useState<CompartirCon>("nadie");
  const [puerta, setPuerta] = useState({
    topeMb: 50_000, reservaPct: 20, bajadaKbps: 20_000, subidaKbps: 5_000, ssid: "",
  });
  const [estado, setEstado] = useState("");

  const portatil: RouterPortatil = {
    id: "titanio-portatil", tipo, cargando,
    bateriaPct: Math.min(100, Math.max(0, bateriaPct)),
    modem: conModem ? { generacion, conSim } : null,
  };
  const compat = compatibilidadPortatil(
    { fabricante: nombres?.fabricante ?? "", modelo: nombres?.modelo ?? "", version: nombres?.version, tipo },
    tabla ?? [],
  );

  /** Campo numérico etiquetado (tope, reserva, velocidad). */
  const num = (texto: string, valor: number, set: (n: number) => void) => (
    <label className="text-[12px] text-white/60">
      {texto}
      <input type="number" className={`w-24 ${SEL}`} value={valor} onChange={(e) => set(Number(e.target.value) || 0)} />
    </label>
  );
  const campo = (texto: string, valor: string, set: (v: string) => void, opciones: readonly string[]) => (
    <label className="text-[12px] text-white/60">
      {texto}
      <select className={SEL} value={valor} onChange={(e) => set(e.target.value)}>
        {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );

  /** Guion UCI de la puerta (uciPuerta) con su guardián de tope, o el de cliente. */
  const copiar = async (cliente: boolean) => {
    try {
      const u = uciPuerta({ tipo: puertaTipo, bajadaKbps: puerta.bajadaKbps, subidaKbps: puerta.subidaKbps, ssidExterno: puerta.ssid || undefined });
      const guardian = guionGuardianTope({ interfaz: puertaTipo === "cable" ? "wan" : "wwan", topeMb: puerta.topeMb, reservaPct: puerta.reservaPct, bajadaKbps: puerta.bajadaKbps, subidaKbps: puerta.subidaKbps });
      await navigator.clipboard.writeText(cliente ? uciClientePuerta() : `${u.network}${u.firewall}\n${guardian}`);
      setEstado(`Guion ${cliente ? "de cliente" : "de la puerta"} copiado: pégalo por SSH en el titanio con OpenWrt.`);
    } catch {
      setEstado("No pude copiar el guion.");
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center gap-2"><DoorOpen className="h-4 w-4 text-amber-300" aria-hidden="true" /><div className="text-[11px] uppercase tracking-widest text-white/45">Titanio portátil</div></div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {campo("Tipo de router portátil", tipo, (v) => setTipo(v as TipoPortatil), TIPOS_PORTATIL)}
        {num("Batería (%)", bateriaPct, setBateriaPct)}
        <label className="flex cursor-pointer items-center gap-1 text-[12px] text-white/60"><input type="checkbox" className="cursor-pointer" checked={cargando} onChange={(e) => setCargando(e.target.checked)} />Está cargando</label>
        <label className="flex cursor-pointer items-center gap-1 text-[12px] text-white/60"><input type="checkbox" className="cursor-pointer" checked={conModem} onChange={(e) => setConModem(e.target.checked)} />¿Tiene módem?</label>
        <label className="flex cursor-pointer items-center gap-1 text-[12px] text-white/60"><input type="checkbox" className="cursor-pointer" checked={conSim} disabled={!conModem} onChange={(e) => setConSim(e.target.checked)} />¿Lleva SIM?</label>
        <label className="text-[12px] text-white/60">Módem<select className={SEL} value={generacion} disabled={!conModem} onChange={(e) => setGeneracion(e.target.value as "4g" | "5g")}><option value="4g">4G</option><option value="5g">5G</option></select></label>
      </div>
      <div className="mt-2 rounded-lg border border-white/10 bg-black/30 p-2 text-[12px] text-white/70">
        <p>Estado: {compat.estado} · Coordinación: {coordinacionPortatil(portatil)} enlaces</p>
        <ol className="list-decimal pl-5">{compat.pasos.map((p) => <li key={p}>{p}</li>)}</ol>
        {compat.enlace && <a href={compat.enlace} target="_blank" rel="noreferrer" className="cursor-pointer text-amber-300 underline hover:text-amber-200">Imagen exacta en OpenWrt</a>}
        <p className="text-rose-300/90">{compat.aviso}</p>
        <p>{resumenSinSim(portatil)}</p>
      </div>
      <div className="mt-3 border-t border-white/10 pt-2">
        <div className="flex items-center gap-2"><Share2 className="h-4 w-4 text-emerald-300" aria-hidden="true" /><div className="text-[12px] text-white/70">Puerta a internet (opcional)</div></div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {campo("Tipo de puerta", puertaTipo, (v) => setPuertaTipo(v as TipoPuerta), PUERTAS)}
          {campo("Se comparte con", compartir, (v) => setCompartir(v as CompartirCon), COMPARTIR)}
          {num("Tope mensual (MB)", puerta.topeMb, (n) => setPuerta({ ...puerta, topeMb: n }))}
          {num("Reserva del dueño (%)", puerta.reservaPct, (n) => setPuerta({ ...puerta, reservaPct: n }))}
          {num("Bajada (kbps)", puerta.bajadaKbps, (n) => setPuerta({ ...puerta, bajadaKbps: n }))}
          {num("Subida (kbps)", puerta.subidaKbps, (n) => setPuerta({ ...puerta, subidaKbps: n }))}
          {puertaTipo === "wifi-externa" && <label className="text-[12px] text-white/60 sm:col-span-2 flex items-center gap-1">SSID de la red externa<input className={SEL} value={puerta.ssid} onChange={(e) => setPuerta({ ...puerta, ssid: e.target.value })} /></label>}
        </div>
        <p className="mt-2 text-[12px] text-amber-200/85">Algunas operadoras no permiten compartir los datos de tu línea: revisa tu contrato antes de compartir fuera de tu cuenta.</p>
        <p className="text-[12px] text-white/55">StarSeed no pide ni guarda el PIN de tu SIM.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button onClick={() => copiar(false)} className="cursor-pointer flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-[12px] text-amber-100 hover:bg-amber-500/25"><Copy className="h-3.5 w-3.5" aria-hidden="true" />Copiar guion de la puerta</button>
          <button onClick={() => copiar(true)} className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[12px] text-white/80 hover:bg-white/10">Copiar guion de cliente</button>
          {estado && <span className="text-[12px] text-white/50">{estado}</span>}
        </div>
      </div>
    </div>
  );
}
