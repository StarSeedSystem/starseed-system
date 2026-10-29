"use client";

/**
 * Titanio portátil (§8.1 de architecture/malla-cristalina-sio2.md): routers de
 * viaje y MiFi como titanio móvil de la malla, con SIM opcional y una puerta a
 * internet opcional. Enseña compatibilidad honesta, coordinación según batería
 * y los guiones UCI de puerta y de cliente batman-adv, que salen de los módulos
 * puros de src/lib/network/routers-malla; aquí solo hay interfaz, nada se
 * guarda y StarSeed no pide el PIN de la SIM.
 */
import { useState } from "react";
import { compatibilidadPortatil, coordinacionPortatil, resumenSinSim, TIPOS_PORTATIL, type RouterPortatil, type TipoPortatil } from "@/lib/network/routers-malla/portatil";
import { guionGuardianTope, uciClientePuerta, uciPuerta, type TipoPuerta } from "@/lib/network/routers-malla/uci-puerta";
import { COMPARTIR, type Compartir } from "@/lib/malla/cristal/puertas-internet";
import type { EntradaTabla } from "@/lib/network/routers-malla/compatibilidad-openwrt";
const SEL = "cursor-pointer rounded-md border border-white/10 bg-white/5 px-1 text-sm text-white";
const NUM = "ml-1 w-16 cursor-pointer rounded-md border border-white/10 bg-white/5 px-1 text-sm text-white";
const LBL = "text-[12px] text-white/60";
const CHK = `${LBL} flex cursor-pointer items-center gap-1.5`;
const TIPO_TXT: Record<TipoPortatil, string> = { "viaje-openwrt": "de viaje con OpenWrt de fábrica (no se flashea)", "viaje-otro": "de viaje con otro sistema (tabla de OpenWrt)", "mifi-operador": "MiFi de bolsillo del operador" };
const PUERTA_TXT: Record<TipoPuerta, string> = { "movil-4g": "SIM 4G", "movil-5g": "SIM 5G", "wifi-externa": "Wi-Fi de otra red (casa, hotel)", "usb-telefono": "Teléfono por USB", cable: "Cable o satélite" };
const COMPARTIR_TXT: Record<Compartir, string> = { nadie: "nadie", "mi-cuenta": "solo mi cuenta", vinculos: "mis vínculos", grupo: "grupo", publico: "público" };
/** Datos de identificación del portátil para su compatibilidad (§8 y §8.1). */
export interface TitanioPortatilBase { fabricante: string; modelo: string; version?: string; deOperador?: boolean }
export function TitanioPortatilPanel({ tabla, base }: { tabla?: EntradaTabla[]; base?: TitanioPortatilBase }) {
  const [tipo, setTipo] = useState<TipoPortatil>("viaje-openwrt");
  const [bateria, setBateria] = useState("");
  const [cargando, setCargando] = useState(false);
  const [conModem, setConModem] = useState(false);
  const [generacion, setGeneracion] = useState<"4g" | "5g">("4g");
  const [conSim, setConSim] = useState(false);
  const [tipoPuerta, setTipoPuerta] = useState<TipoPuerta>("movil-4g");
  const [compartir, setCompartir] = useState<Compartir>("nadie");
  const [topeMb, setTopeMb] = useState(5000);
  const [reserva, setReserva] = useState(20);
  const [bajada, setBajada] = useState(5000);
  const [subida, setSubida] = useState(1000);
  const [estado, setEstado] = useState("");

  const router: RouterPortatil = {
    id: "titanio-portatil-panel", tipo, cargando,
    bateriaPct: bateria === "" ? null : Math.min(100, Math.max(0, Number(bateria))),
    modem: conModem ? { generacion, conSim } : null,
  };
  const compat = compatibilidadPortatil({ fabricante: base?.fabricante ?? "", modelo: base?.modelo ?? "", version: base?.version, deOperador: base?.deOperador, tipo }, tabla ?? []);
  const coord = coordinacionPortatil(router);

  const guionPuerta = () => {
    const u = uciPuerta({ tipo: tipoPuerta, bajadaKbps: bajada, subidaKbps: subida });
    return `${u.network}${u.firewall}${guionGuardianTope({ interfaz: "wwan", topeMb, reservaPct: reserva, bajadaKbps: bajada, subidaKbps: subida })}`;
  };
  const copiar = async (texto: string, mensaje: string) => {
    try { await navigator.clipboard.writeText(texto); setEstado(mensaje); }
    catch { setEstado("No pude usar el portapapeles; revisa los permisos del navegador."); }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-[11px] uppercase tracking-widest text-white/45">Titanio portátil · malla con SIM opcional</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className={LBL}>Tipo de router portátil
          <select className={`ml-1 ${SEL}`} value={tipo} onChange={(e) => setTipo(e.target.value as TipoPortatil)}>
            {TIPOS_PORTATIL.map((t) => <option key={t} value={t}>{TIPO_TXT[t]}</option>)}
          </select>
        </label>
        <label className={LBL}>Batería (%) <input type="number" min={0} max={100} className={NUM} value={bateria} onChange={(e) => setBateria(e.target.value)} placeholder="—" /></label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className={CHK}>
          <input type="checkbox" className="cursor-pointer" checked={cargando} onChange={(e) => setCargando(e.target.checked)} /> Está cargando
        </label>
        <label className={CHK}>
          <input type="checkbox" className="cursor-pointer" checked={conModem} onChange={(e) => setConModem(e.target.checked)} /> Tiene módem
        </label>
        {conModem && (
          <>
            <select className={SEL} value={generacion} onChange={(e) => setGeneracion(e.target.value === "5g" ? "5g" : "4g")}>
              <option value="4g">módem 4G</option><option value="5g">módem 5G</option>
            </select>
            <label className={CHK}>
              <input type="checkbox" className="cursor-pointer" checked={conSim} onChange={(e) => setConSim(e.target.checked)} /> Lleva SIM
            </label>
          </>
        )}
      </div>
      <p className="mt-2 text-[12px] text-white/55">{resumenSinSim(router)}</p>
      <p className="mt-1 text-[12px] text-white/55">Coordinación que tendrá como titanio: {coord} enlaces · compatibilidad: {compat.estado}</p>
      <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[12px] text-white/60">
        {compat.pasos.map((p) => <li key={p}>{p}</li>)}
      </ol>
      <p className="mt-1 text-[12px] text-rose-300/90">{compat.aviso}</p>
      <div className="mt-3 border-t border-white/10 pt-3">
        <div className="text-[11px] uppercase tracking-widest text-white/45">Puerta a internet (opcional)</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className={LBL}>Tipo de puerta
            <select className={`ml-1 ${SEL}`} value={tipoPuerta} onChange={(e) => setTipoPuerta(e.target.value as TipoPuerta)}>
              {(Object.keys(PUERTA_TXT) as TipoPuerta[]).map((t) => <option key={t} value={t}>{PUERTA_TXT[t]}</option>)}
            </select>
          </label>
          <label className={LBL}>Con quién se comparte
            <select className={`ml-1 ${SEL}`} value={compartir} onChange={(e) => setCompartir(e.target.value as Compartir)}>
              {COMPARTIR.map((c) => <option key={c} value={c}>{COMPARTIR_TXT[c]}</option>)}
            </select>
          </label>
          <label className={LBL}>Tope mensual (MB) <input type="number" min={0} className={NUM} value={topeMb} onChange={(e) => setTopeMb(Number(e.target.value) || 0)} /></label>
          <label className={LBL}>Reserva del dueño (%) <input type="number" min={0} max={100} className={NUM} value={reserva} onChange={(e) => setReserva(Number(e.target.value) || 0)} /></label>
          <label className={LBL}>Bajada (kbps) <input type="number" min={0} className={NUM} value={bajada} onChange={(e) => setBajada(Number(e.target.value) || 0)} /></label>
          <label className={LBL}>Subida (kbps) <input type="number" min={0} className={NUM} value={subida} onChange={(e) => setSubida(Number(e.target.value) || 0)} /></label>
        </div>
        <p className="mt-2 text-[12px] text-amber-300/90">Algunas operadoras no permiten compartir los datos de tu línea: revisa tu contrato antes de compartir fuera de tu cuenta.</p>
        <p className="mt-1 text-[12px] text-white/50">StarSeed no pide ni guarda el PIN de tu SIM.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={() => void copiar(guionPuerta(), "Guion de la puerta copiado: network + firewall + guardián de tope.")} className="cursor-pointer rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-[12px] text-amber-100 hover:bg-amber-500/25">Copiar guion de la puerta</button>
          <button onClick={() => void copiar(uciClientePuerta(), "Guion de cliente copiado: bat0 en gw_mode client con su histéresis.")} className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] text-white/80 hover:bg-white/10">Copiar guion de cliente</button>
        </div>
        {estado && <p className="mt-2 text-[12px] text-white/50">{estado}</p>}
      </div>
    </div>
  );
}
