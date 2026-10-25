"use client";

import { useEffect, useState } from "react";
import { PERFILES_WIFI } from "@/ai/astraura/mesh/camr/regulacion";
import { compatibilidad, type EntradaTabla } from "@/lib/network/routers-malla/compatibilidad-openwrt";
import { planRadios, type RouterMalla, type TroncalResult } from "@/lib/network/routers-malla/plan-radios";
import { guionAplicar, type CfgUciMalla } from "@/lib/network/routers-malla/uci-malla";

/* Routers como titanio de la malla (§8): aviso honesto del flasheo, tabla de
 * compatibilidad, radios legales por enlace y guion UCI para cada router. */
type RouterItem = { id: string; fabricante: string; modelo: string; version: string; deOperador: boolean; openwrt: boolean };
type Estado = { routers: RouterItem[]; region: string; troncales: Array<[string, string]> };
type Campo = "canal" | "anchoMhz" | "pireDbm";

const LS = "starseed.routers-malla";
const REGIONES = ["EU", "US", "JP"];
const PAIS: Record<string, string> = { EU: "ES", US: "US", JP: "JP" };
const ANCHOS: Record<string, number[]> = { "2g": [20, 40], "5g": [20, 40, 80], "6g": [20, 40, 80, 160] };
const VACIO: Estado = { routers: [], region: "EU", troncales: [] };
const INPUT = "rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white";
const BOTON = "cursor-pointer rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10";

function cargar(): Estado {
  if (typeof window === "undefined") return VACIO;
  try {
    const d = JSON.parse(localStorage.getItem(LS) ?? "{}") as Partial<Estado>;
    return { routers: Array.isArray(d.routers) ? d.routers : [], region: typeof d.region === "string" ? d.region : "EU", troncales: Array.isArray(d.troncales) ? d.troncales : [] };
  } catch { return VACIO; }
}

const claveMalla = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const canales = (region: string, banda: string) => { const p = PERFILES_WIFI[region] ?? PERFILES_WIFI.EU; return banda === "2g" ? p.g24 : banda === "5g" ? p.g5 : p.g6; };
const legal = (region: string, banda: string, canal: number) => canales(region, banda).find((c) => c.canal === canal) ?? canales(region, banda)[0];
const radiosDe = (): RouterMalla["radios"] => [{ id: "2g", banda: "2g", anchosMhz: ANCHOS["2g"] }, { id: "5g", banda: "5g", anchosMhz: ANCHOS["5g"] }];

export function RoutersMallaPanel({ tabla = [] }: { tabla?: EntradaTabla[] }) {
  const [estado, setEstado] = useState<Estado>(VACIO);
  const [listo, setListo] = useState(false);
  const [nuevo, setNuevo] = useState({ fabricante: "", modelo: "", version: "", deOperador: false });
  const [par, setPar] = useState<[string, string]>(["", ""]);
  const [overrides, setOverrides] = useState<Record<string, TroncalResult>>({});
  const [clave, setClave] = useState("");
  const [aviso, setAviso] = useState("");
  useEffect(() => { setEstado(cargar()); setListo(true); }, []);
  useEffect(() => { if (listo) { try { localStorage.setItem(LS, JSON.stringify(estado)); } catch { /* sin persistencia */ } } }, [estado, listo]);
  const { routers, region, troncales } = estado;
  const adoptados = routers.filter((r) => r.openwrt);
  const plan = planRadios({ region, routers: adoptados.map((r) => ({ id: r.id, radios: radiosDe() })), troncales: troncales.filter(([a, b]) => adoptados.some((r) => r.id === a) && adoptados.some((r) => r.id === b)) });
  const filas = plan.troncales.map((t) => overrides[`${t.a}|${t.b}`] ?? t);
  const nombre = (id: string) => routers.find((r) => r.id === id)?.modelo || id;
  const agregar = () => { if (!nuevo.fabricante.trim() || !nuevo.modelo.trim()) return; setEstado((e) => ({ ...e, routers: [...e.routers, { ...nuevo, id: `r-${Date.now().toString(36)}`, openwrt: false }] })); setNuevo({ fabricante: "", modelo: "", version: "", deOperador: false }); };
  const marcar = (id: string, openwrt: boolean) => setEstado((e) => ({ ...e, routers: e.routers.map((r) => (r.id === id ? { ...r, openwrt } : r)) }));
  const agregarTroncal = () => { const [a, b] = par; if (!a || !b || a === b || troncales.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return; setEstado((e) => ({ ...e, troncales: [...e.troncales, [a, b]] })); };
  const editar = (t: TroncalResult, campo: Campo, valor: number) => {
    const canal = campo === "canal" ? (canales(region, t.banda).some((c) => c.canal === valor) ? valor : t.canal) : t.canal;
    const max = legal(region, t.banda, canal).pireDbm;
    setOverrides((o) => ({ ...o, [`${t.a}|${t.b}`]: { ...t, canal, anchoMhz: campo === "anchoMhz" ? valor : t.anchoMhz, pireDbm: campo === "pireDbm" ? Math.max(0, Math.min(max, valor)) : Math.min(t.pireDbm, max) } }));
  };
  const conClave = () => { const k = clave || claveMalla(); if (!clave) setClave(k); return k; };
  const cfg = (r: RouterItem, k: string): CfgUciMalla => { const t = filas.find((f) => f.a === r.id || f.b === r.id) ?? { banda: "5g" as const, canal: 36, anchoMhz: 20, pireDbm: 23 }; return { router: `${r.fabricante} ${r.modelo}`, meshId: "starseed-malla", claveMalla: k, region: PAIS[region] ?? "ES", troncal: { banda: t.banda, canal: t.canal, anchoMhz: t.anchoMhz, pireDbm: t.pireDbm }, cliente: { canal: 1, ssid: `StarSeed-${r.id}`, clave: k } }; };
  const copiar = async (r: RouterItem) => { try { const k = conClave(); await navigator.clipboard.writeText(guionAplicar(cfg(r, k))); setAviso(`Guion de ${r.modelo} copiado · clave de malla: ${k}`); } catch { setAviso("No pude copiar el guion."); } };
  const descargar = (r: RouterItem) => { try { const url = URL.createObjectURL(new Blob([guionAplicar(cfg(r, conClave()))], { type: "text/plain" })); const a = document.createElement("a"); a.href = url; a.download = `starseed-${r.id}.txt`; a.click(); URL.revokeObjectURL(url); setAviso(`Configuración de ${r.modelo} descargada.`); } catch { setAviso("No pude generar la configuración."); } };

  return (
    <section className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-[11px] uppercase tracking-widest text-white/45">Routers de la malla</div>
      <p className="text-[12px] text-white/55">Añade cada router y comprueba si admite OpenWrt. Cuando lo tenga, planifica sus radios dentro de lo legal y copia el guion. Flashear es cosa tuya: un fallo puede dejar el router inservible.</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input aria-label="Fabricante" className={INPUT} value={nuevo.fabricante} onChange={(e) => setNuevo({ ...nuevo, fabricante: e.target.value })} placeholder="fabricante" />
        <input aria-label="Modelo" className={INPUT} value={nuevo.modelo} onChange={(e) => setNuevo({ ...nuevo, modelo: e.target.value })} placeholder="modelo" />
        <input aria-label="Versión" className={INPUT} value={nuevo.version} onChange={(e) => setNuevo({ ...nuevo, version: e.target.value })} placeholder="versión (opcional)" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-white/60"><input type="checkbox" className="cursor-pointer" checked={nuevo.deOperador} onChange={(e) => setNuevo({ ...nuevo, deOperador: e.target.checked })} />¿Es del operador?</label>
        <button onClick={agregar} className={BOTON}>Añadir router</button>
      </div>
      {routers.map((r) => {
        const c = compatibilidad({ fabricante: r.fabricante, modelo: r.modelo, version: r.version || undefined, deOperador: r.deOperador }, tabla);
        return (
          <div key={r.id} className="space-y-1 rounded-lg border border-white/10 bg-black/20 p-2">
            <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-white/90">{r.fabricante} {r.modelo}{r.version ? ` · ${r.version}` : ""}</span><label className="ml-auto flex cursor-pointer items-center gap-1 text-[12px] text-white/60"><input type="checkbox" className="cursor-pointer" checked={r.openwrt} onChange={(e) => marcar(r.id, e.target.checked)} />Ya tiene OpenWrt</label></div>
            <div className="text-[12px] text-white/75">Estado: {c.estado}</div>
            {c.enlace ? <a href={c.enlace} target="_blank" rel="noreferrer" className="block break-all text-[11px] text-amber-300 underline">{c.enlace}</a> : c.estado === "desconocido" ? <a href="https://openwrt.org/toh/start" target="_blank" rel="noreferrer" className="text-[11px] text-amber-300 underline">Buscar este modelo en la tabla de OpenWrt</a> : null}
            <ol className="list-decimal space-y-0.5 pl-5 text-[11px] text-white/55">{c.pasos.map((p) => <li key={p}>{p}</li>)}</ol>
            <p className="text-[11px] text-rose-300/90">{c.aviso}</p>
            {r.openwrt && <div className="flex flex-wrap gap-2"><button onClick={() => copiar(r)} className={BOTON}>Copiar guion</button><button onClick={() => descargar(r)} className={BOTON}>Descargar configuración</button></div>}
          </div>
        );
      })}
      {adoptados.length > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-950/10 p-2">
          <div className="flex flex-wrap items-center gap-2"><span className="text-[11px] uppercase tracking-widest text-amber-300/60">Región legal del Wi-Fi</span><select aria-label="Región" className={INPUT} value={region} onChange={(e) => { setEstado((s) => ({ ...s, region: e.target.value })); setOverrides({}); }}>{REGIONES.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
          {adoptados.length > 1 && <div className="flex flex-wrap items-center gap-2"><select aria-label="Router A" className={INPUT} value={par[0]} onChange={(e) => setPar([e.target.value, par[1]])}><option value="">Router A</option>{adoptados.map((r) => <option key={r.id} value={r.id}>{r.modelo}</option>)}</select><select aria-label="Router B" className={INPUT} value={par[1]} onChange={(e) => setPar([par[0], e.target.value])}><option value="">Router B</option>{adoptados.map((r) => <option key={r.id} value={r.id}>{r.modelo}</option>)}</select><button onClick={agregarTroncal} className={BOTON}>Añadir troncal</button></div>}
          {filas.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-[11px] text-white/70"><thead><tr><th className="p-1">Enlace</th><th className="p-1">Banda</th><th className="p-1">Canal</th><th className="p-1">Ancho</th><th className="p-1">Potencia</th></tr></thead><tbody>{filas.map((t) => (
            <tr key={`${t.a}|${t.b}`} className="border-t border-white/10">
              <td className="p-1">{nombre(t.a)} ↔ {nombre(t.b)}</td><td className="p-1">{t.banda}</td>
              <td className="p-1"><select aria-label={`Canal ${t.a}-${t.b}`} className={INPUT} value={t.canal} onChange={(e) => editar(t, "canal", Number(e.target.value))}>{canales(region, t.banda).map((c) => <option key={c.canal} value={c.canal}>{c.canal}</option>)}</select></td>
              <td className="p-1"><select aria-label={`Ancho ${t.a}-${t.b}`} className={INPUT} value={t.anchoMhz} onChange={(e) => editar(t, "anchoMhz", Number(e.target.value))}>{ANCHOS[t.banda].map((a) => <option key={a} value={a}>{a} MHz</option>)}</select></td>
              <td className="p-1"><input aria-label={`Potencia ${t.a}-${t.b}`} type="number" min={0} max={legal(region, t.banda, t.canal).pireDbm} className={INPUT} value={t.pireDbm} onChange={(e) => editar(t, "pireDbm", Number(e.target.value))} /></td>
            </tr>))}</tbody></table></div>}
          {plan.avisos.map((a) => <p key={a} className="text-[11px] text-white/50">{a}</p>)}
        </div>
      )}
      {aviso && <p className="text-[12px] text-amber-200/90">{aviso}</p>}
    </section>
  );
}

export default RoutersMallaPanel;
