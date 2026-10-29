"use client";

/**
 * Panel «Titanio portátil» (§8.1 de architecture/malla-cristalina-sio2.md): routers de viaje y
 * MiFi como titanio móvil de la malla: tipo, batería y «está cargando», módem y SIM opcionales,
 * compatibilidad honesta, coordinación según batería y el «sin SIM es un titanio igual». Puerta
 * a internet opcional: tipo, con quién se comparte (nadie por defecto), tope mensual y reserva
 * del dueño (20 %); copia el guion UCI de la puerta (con guardián de tope) y el de cliente.
 */

import { useState } from "react";
import { BatteryCharging, Copy, DoorOpen, ShieldAlert } from "lucide-react";
import { COMPARTIR, type Compartir } from "@/lib/malla/cristal/puertas-internet";
import { compatibilidadPortatil, coordinacionPortatil, resumenSinSim, TIPOS_PORTATIL, type RouterPortatil, type TipoPortatil } from "@/lib/network/routers-malla/portatil";
import { guionGuardianTope, uciClientePuerta, uciPuerta, type CfgPuerta, type TipoPuerta } from "@/lib/network/routers-malla/uci-puerta";

const SEL = "cursor-pointer rounded-md border border-white/10 bg-white/5 px-1 text-sm text-white";
const BOTON = "cursor-pointer rounded-lg border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-[12px] text-amber-100 hover:bg-amber-500/25";
const CASILLA = "flex cursor-pointer items-center gap-2 text-[12px] text-white/60";
const MINI = "text-[12px] text-white/60";

/** Etiquetas de tipos de portátil, de compartición y de puerta; interfaz que cuenta el guardián. */
const ETIQUETA_TIPO: Record<TipoPortatil, string> = { "viaje-openwrt": "De viaje con OpenWrt de fábrica", "viaje-otro": "De viaje (otro sistema)", "mifi-operador": "MiFi de operador" };
const ETIQUETA_COMPARTIR: Record<Compartir, string> = { nadie: "nadie", "mi-cuenta": "solo mi cuenta", vinculos: "mis vínculos", grupo: "mi grupo", publico: "público" };
const ETIQUETA_PUERTA: Record<TipoPuerta, string> = { "movil-4g": "SIM 4G", "movil-5g": "SIM 5G", "wifi-externa": "Wi‑Fi de otra red (casa, hotel)", "usb-telefono": "Teléfono por USB", cable: "Cable (fibra o red)" };
const INTERFAZ: Record<TipoPuerta, string> = { "movil-4g": "wwan", "movil-5g": "wwan", "wifi-externa": "wwan", "usb-telefono": "usb0", cable: "wan" };

interface Props { nombre?: string; fabricante?: string; modelo?: string; tipoInicial?: TipoPortatil }

export function TitanioPortatilPanel({ nombre, fabricante = "", modelo = "", tipoInicial }: Props) {
  const [tipo, setTipo] = useState<TipoPortatil>(tipoInicial ?? "viaje-openwrt");
  const [fab, setFab] = useState(fabricante);
  const [mod, setMod] = useState(modelo);
  const [bateriaTxt, setBateriaTxt] = useState("");
  const [cargando, setCargando] = useState(false);
  const [tieneModem, setTieneModem] = useState(false);
  const [conSim, setConSim] = useState(false);
  const [genModem, setGenModem] = useState<"4g" | "5g">("4g");
  const [puerta, setPuerta] = useState<TipoPuerta | "">("");
  const [compartir, setCompartir] = useState<Compartir>("nadie");
  const [topeTxt, setTopeTxt] = useState("");
  const [reservaPct, setReservaPct] = useState(20);
  const [estado, setEstado] = useState("");
  const nBateria = Number.parseFloat(bateriaTxt);
  const portatil: RouterPortatil = {
    id: nombre ?? "titanio-portatil", tipo,
    bateriaPct: Number.isFinite(nBateria) ? Math.min(100, Math.max(0, nBateria)) : null, cargando,
    modem: tieneModem ? { generacion: genModem, conSim } : null,
  };
  const res = compatibilidadPortatil({ fabricante: fab, modelo: mod, tipo, deOperador: tipo === "mifi-operador" }, []);
  /** Guion de la puerta: UCI (gw_mode server) + guardián que respeta el tope del dueño. */
  const guionPuerta = (): string | null => {
    const topeMb = Number.parseFloat(topeTxt);
    if (!puerta || !Number.isFinite(topeMb) || topeMb <= 0) return null;
    const cfg: CfgPuerta = { tipo: puerta, bajadaKbps: 20000, subidaKbps: 7500 };
    const u = uciPuerta(cfg);
    return `${u.network}\n${u.firewall}\n` + guionGuardianTope({ interfaz: INTERFAZ[puerta], topeMb, reservaPct, bajadaKbps: cfg.bajadaKbps, subidaKbps: cfg.subidaKbps });
  };
  const copiarGuionPuerta = async () => {
    const guion = guionPuerta();
    if (!guion) { setEstado("Elige un tipo de puerta y pon su tope mensual en MB."); return; }
    try { await navigator.clipboard.writeText(guion); setEstado("Guion de la puerta copiado: pégalo por SSH en el titanio que la anuncia."); }
    catch { setEstado("No pude usar el portapapeles en este navegador."); }
  };
  const copiarGuionCliente = async () => {
    try { await navigator.clipboard.writeText(uciClientePuerta()); setEstado("Guion de cliente copiado: los demás routers van en gw_mode client."); }
    catch { setEstado("No pude usar el portapapeles en este navegador."); }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-2">
      <div className="text-[11px] uppercase tracking-widest text-white/45">Titanio portátil</div>
      {nombre && <div className="text-sm text-white/85">{nombre}</div>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className={MINI}>Tipo de portátil
          <select aria-label="Tipo de portátil" className={SEL} value={tipo} onChange={(e) => setTipo(e.target.value as TipoPortatil)}>{TIPOS_PORTATIL.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO[t]}</option>)}</select>
        </label>
        <input className={SEL} value={fab} onChange={(e) => setFab(e.target.value)} placeholder="fabricante" />
        <input className={SEL} value={mod} onChange={(e) => setMod(e.target.value)} placeholder="modelo" />
        <label className={CASILLA}><input type="checkbox" className="cursor-pointer" checked={cargando} onChange={(e) => setCargando(e.target.checked)} />Está cargando</label>
        <label className={MINI}>Batería (%)<input type="number" min={0} max={100} className={`w-16 ${SEL}`} value={bateriaTxt} onChange={(e) => setBateriaTxt(e.target.value)} /></label>
        <span className={`flex items-center gap-1 ${MINI}`}><BatteryCharging className="h-3.5 w-3.5" aria-hidden="true" /> Coordinación: {coordinacionPortatil(portatil)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className={CASILLA}><input type="checkbox" className="cursor-pointer" checked={tieneModem} onChange={(e) => setTieneModem(e.target.checked)} />¿Tiene módem?</label>
        {tieneModem && (
          <>
            <select aria-label="¿Qué generación de módem?" className={SEL} value={genModem} onChange={(e) => setGenModem(e.target.value === "5g" ? "5g" : "4g")}><option value="4g">4G</option><option value="5g">5G</option></select>
            <label className={CASILLA}><input type="checkbox" className="cursor-pointer" checked={conSim} onChange={(e) => setConSim(e.target.checked)} />¿Lleva SIM?</label>
          </>
        )}
      </div>
      <p className="mt-2 text-[12px] text-amber-300/90">Estado: {res.estado}</p>
      <ol className="list-decimal space-y-0.5 pl-5 text-[12px] text-white/60">{res.pasos.map((p) => <li key={p}>{p}</li>)}</ol>
      <p className="text-[12px] text-rose-300/90">{res.aviso}</p>
      <p className="text-[12px] text-white/55">{resumenSinSim(portatil)}</p>
      <div className="mt-2 border-t border-white/10 pt-2">
        <div className="flex items-center gap-1 text-[11px] uppercase tracking-widest text-white/45"><DoorOpen className="h-3.5 w-3.5" aria-hidden="true" /> Puerta a internet (opcional)</div>
        <p className="text-[12px] text-white/50">Lo interno y lo privado entre neuronas nunca necesita puerta: va por la malla P2P. Solo lo que deba salir a la internet global usa una.</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <label className={MINI}>Tipo
            <select aria-label="Tipo de puerta" className={SEL} value={puerta} onChange={(e) => setPuerta(e.target.value as TipoPuerta | "")}><option value="">ninguna</option>{(Object.keys(ETIQUETA_PUERTA) as TipoPuerta[]).map((t) => <option key={t} value={t}>{ETIQUETA_PUERTA[t]}</option>)}</select>
          </label>
          <label className={MINI}>¿Con quién se comparte?
            <select aria-label="¿Con quién se comparte?" className={SEL} value={compartir} onChange={(e) => setCompartir(e.target.value as Compartir)}>{COMPARTIR.map((c) => <option key={c} value={c}>{ETIQUETA_COMPARTIR[c]}</option>)}</select>
          </label>
          <label className={MINI}>Tope mensual (MB)<input type="number" min={0} className={`w-20 ${SEL}`} value={topeTxt} onChange={(e) => setTopeTxt(e.target.value)} /></label>
          <label className={MINI}>Reserva del dueño (%)<input type="number" min={0} max={100} className={`w-14 ${SEL}`} value={reservaPct} onChange={(e) => { const n = Number.parseInt(e.target.value, 10); if (Number.isFinite(n)) setReservaPct(Math.min(100, Math.max(0, n))); }} /></label>
          <button onClick={copiarGuionPuerta} className={BOTON}><Copy className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Copiar guion de la puerta</button>
          <button onClick={copiarGuionCliente} className={BOTON}><Copy className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Copiar guion de cliente</button>
        </div>
        <p className="mt-1 flex items-start gap-1 text-[12px] text-amber-300/90"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />Algunas operadoras no permiten compartir los datos de tu línea: revisa tu contrato antes de compartir fuera de tu cuenta.</p>
        <p className="text-[12px] text-white/50">StarSeed no pide ni guarda el PIN de tu SIM.</p>
        {estado && <p className="text-[12px] text-white/50">{estado}</p>}
      </div>
    </div>
  );
}
