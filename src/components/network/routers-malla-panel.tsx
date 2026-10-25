"use client";
/** Panel «Routers de la malla» (Ola 1012Q · §8 del contrato de la malla cristalina SiO₂): añade routers
 * (fabricante, modelo, versión, ¿del operador?), muestra su compatibilidad OpenWrt (tabla por prop; sin
 * ella, «desconocido» + enlace a la tabla de hardware) y, tras «ya tiene OpenWrt», región, troncales y
 * el plan de radios (editable dentro de lo legal). La clave de la malla nace en el navegador
 * (crypto.getRandomValues, 24 B en base64url) y solo se muestra al copiar; la lista (SIN claves) va a
 * localStorage con try/catch. Sin Supabase ni node:*; se monta desde el navegador (router-center). */
import { compatibilidad, type EntradaTabla } from "@/lib/network/routers-malla/compatibilidad-openwrt";
import { planRadios, type TroncalResult } from "@/lib/network/routers-malla/plan-radios";
import { guionAplicar, type CfgUciMalla } from "@/lib/network/routers-malla/uci-malla";
import { PERFILES_WIFI } from "@/ai/astraura/mesh/camr/regulacion";
import { useMemo, useState } from "react";

interface Registro { id: string; fabricante: string; modelo: string; version: string; deOperador: boolean; openwrt: boolean }
type Banda = "2g" | "5g" | "6g"; type Cmd = { banda?: Banda; canal?: number; ancho?: number; pire?: number };
type Vacia = { fabricante: string; modelo: string; version: string; deOperador: boolean };
const LS = "starseed.routers-malla.v1"; const vacia: Vacia = { fabricante: "", modelo: "", version: "", deOperador: false };
/** Radios que asumimos por router: 2,4 GHz para aparatos y 5 GHz para las troncales. */
const RADIOS = (): { id: string; banda: Banda; anchosMhz: number[] }[] => [{ id: "w2g", banda: "2g", anchosMhz: [20, 40] }, { id: "w5g", banda: "5g", anchosMhz: [20, 40, 80] }];
const inp = "rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white";
const btn = "cursor-pointer rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[12px] text-white/80 hover:bg-white/10";
const cargar = (): Registro[] => { try { return JSON.parse(localStorage.getItem(LS) ?? "[]") as Registro[]; } catch { return []; } };
const guardar = (l: Registro[]): void => { try { localStorage.setItem(LS, JSON.stringify(l)); } catch { /* sin disco */ } };
/** Clave de la malla: 24 bytes aleatorios del navegador en base64url; jamás se guarda ni se muestra. */
const generarClave = (): string => { const b = new Uint8Array(24); crypto.getRandomValues(b);
  let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
export function RoutersMallaPanel({ tabla }: { tabla?: EntradaTabla[] }) {
  const [lista, setLista] = useState<Registro[]>(cargar); const [form, setForm] = useState<Vacia>(vacia);
  const [region, setRegion] = useState("ES"); const [par, setPar] = useState<[string, string]>(["", ""]);
  const [troncales, setTroncales] = useState<Array<[string, string]>>([]); const [edits, setEdits] = useState<Record<string, Cmd>>({});
  const [clave, setClave] = useState<string | null>(null); const [aviso, setAviso] = useState("");
  const openwrt = useMemo(() => lista.filter((r) => r.openwrt), [lista]);
  const plan = useMemo(() => planRadios({ region: region.toUpperCase(), routers: openwrt.map((r) => ({ id: r.id, radios: RADIOS() })), troncales }), [openwrt, troncales, region]);
  /** Aplica los ajustes editados (siempre dentro de lo legal) sobre una troncal del plan. */
  const conEdits = (t: TroncalResult): TroncalResult => { const e = edits[`${t.a}|${t.b}`];
    return e ? { ...t, banda: e.banda ?? t.banda, canal: e.canal ?? t.canal, anchoMhz: e.ancho ?? t.anchoMhz, pireDbm: e.pire ?? t.pireDbm } : t; };
  const edit = (k: string, p: Cmd) => setEdits({ ...edits, [k]: { ...edits[k], ...p } });
  const anadir = () => { const { fabricante, modelo, version, deOperador } = form; if (!fabricante.trim() || !modelo.trim()) return;
    const nl = [...lista, { id: `rt-${Date.now().toString(36)}`, fabricante: fabricante.trim(), modelo: modelo.trim(), version: version.trim(), deOperador, openwrt: false }];
    setLista(nl); guardar(nl); setForm(vacia);
  };
  const mutate = (id: string, p: Partial<Registro>) => { const nl = lista.map((r) => (r.id === id ? { ...r, ...p } : r)); setLista(nl); guardar(nl); };
  const quitar = (id: string) => { const nl = lista.filter((r) => r.id !== id); setLista(nl); guardar(nl); setTroncales(troncales.filter(([a, b]) => a !== id && b !== id)); };
  const anadirTroncal = () => { const [a, b] = par;
    if (a && b && a !== b && !troncales.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) setTroncales([...troncales, [a, b]]); };
  /** Config UCI/sh del router con su troncal del plan (o una prudente por omisión). */
  const guionDe = (r: Registro): string => {
    const c = clave ?? generarClave(); setClave(c);
    const e0 = plan.troncales.find((x) => x.a === r.id || x.b === r.id), e = e0 ? conEdits(e0) : null;
    const cli = plan.clientes.find((x) => x.router === r.id)?.canal ?? 1;
    const cfg: CfgUciMalla = { router: `${r.fabricante} ${r.modelo}`.trim(), meshId: "starseed-mesh", claveMalla: c, region: region.toUpperCase(),
      troncal: { banda: e?.banda ?? "5g", canal: e?.canal ?? 36, anchoMhz: e?.anchoMhz ?? 20, pireDbm: e?.pireDbm ?? 23 }, cliente: { canal: cli, ssid: "StarSeedNet", clave: c } };
    return guionAplicar(cfg);
  };
  const copiarGuion = async (r: Registro) => { try { await navigator.clipboard.writeText(guionDe(r)); setAviso(`Guion copiado: pégalo por SSH en «${r.modelo.trim()}».`); } catch (e0) { setAviso(`No pude preparar el guion: ${e0 instanceof Error ? e0.message : "?"}`); } };
  const descargar = (r: Registro) => { try {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([guionDe(r)], { type: "text/plain" })); a.download = `${r.modelo.trim().replace(/\s+/g, "-").toLowerCase()}-malla.txt`;
    a.click(); URL.revokeObjectURL(a.href); setAviso("Configuración descargada como guion .txt.");
  } catch (e0) { setAviso(`No pude descargar: ${e0 instanceof Error ? e0.message : "?"}`); } };
  const copiarClave = async () => { const c = clave ?? generarClave(); setClave(c); try { await navigator.clipboard.writeText(c);
    setAviso("Clave de la malla copiada al portapapeles (no se vuelve a mostrar)."); } catch { setAviso("No pude copiar la clave; inténtalo de nuevo."); } };

  const perfil = PERFILES_WIFI[region.toUpperCase()] ?? PERFILES_WIFI.EU;
  const canalesDe = (b: Banda) => (b === "2g" ? perfil.g24 : b === "5g" ? perfil.g5 : perfil.g6);
  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-[11px] uppercase tracking-widest text-white/45">Routers de la malla</div>
      <p className="text-sm text-white/70">El router con OpenWrt entra como nodo de la retícula; quien flashea eres tú.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input className={inp} value={form.fabricante} onChange={(e) => setForm({ ...form, fabricante: e.target.value })} placeholder="fabricante" />
        <input className={inp} value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} placeholder="modelo (p. ej. Archer C7)" />
        <input className={inp} value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="versión (opcional)" />
        <label className="flex cursor-pointer items-center gap-1 text-[12px] text-white/60"><input type="checkbox" className="cursor-pointer" checked={form.deOperador} onChange={(e) => setForm({ ...form, deOperador: e.target.checked })} /> del operador</label>
        <button onClick={anadir} className={btn}>Añadir router</button>
        <button onClick={copiarClave} className={btn}>Copiar clave de la malla</button>
      </div>
      {lista.map((r) => { const c = compatibilidad({ fabricante: r.fabricante, modelo: r.modelo, version: r.version || undefined, deOperador: r.deOperador }, tabla ?? []); return (
        <div key={r.id} className="rounded-lg border border-white/10 bg-black/20 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-white/85">{r.fabricante.trim()} {r.modelo.trim()}</span>
            <span className="text-[12px] text-white/50">OpenWrt: {c.estado}</span>
            {c.estado === "desconocido" && <a href="https://openwrt.org/toh/start" target="_blank" rel="noreferrer" className="cursor-pointer text-[12px] text-amber-300 underline">buscar en la tabla de OpenWrt</a>}
            {c.enlace && <a href={c.enlace} target="_blank" rel="noreferrer" className="cursor-pointer text-[12px] text-amber-300 underline">imagen exacta para este modelo</a>}
            <label className="ml-auto flex cursor-pointer items-center gap-1 text-[12px] text-white/60"><input type="checkbox" className="cursor-pointer" checked={r.openwrt} onChange={(e) => mutate(r.id, { openwrt: e.target.checked })} /> ya tiene OpenWrt</label>
            {r.openwrt && <button onClick={() => copiarGuion(r)} className={btn}>Copiar guion</button>}
            {r.openwrt && <button onClick={() => descargar(r)} className={btn}>Descargar configuración</button>}
            <button onClick={() => quitar(r.id)} className={btn}>Quitar</button>
          </div>
          <ol className="list-decimal pl-5 text-[12px] text-white/50">{c.pasos.map((p) => <li key={p}>{p}</li>)}</ol><p className="text-[12px] text-rose-300/90">{c.aviso}</p>
        </div>
      ); })}
      {openwrt.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-black/20 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-white/60">Región (país, 2 letras):</span>
            <input className={`${inp} w-16`} maxLength={2} value={region} onChange={(e) => setRegion(e.target.value.toUpperCase())} placeholder="ES" />
            <select className={inp} value={par[0]} onChange={(e) => setPar([e.target.value, par[1]])}><option value="">colgar de…</option>{openwrt.map((r) => <option key={r.id} value={r.id}>{r.modelo.trim()}</option>)}</select>
            <select className={inp} value={par[1]} onChange={(e) => setPar([par[0], e.target.value])}><option value="">conectar con…</option>{openwrt.map((r) => <option key={r.id} value={r.id}>{r.modelo.trim()}</option>)}</select>
            <button onClick={anadirTroncal} className={btn}>Añadir troncal</button>
          </div>
          <table className="mt-2 w-full text-[12px] text-white/75"><thead><tr>{["enlace", "banda", "canal", "ancho", "PIRE máx. (dBm)"].map((h) => <th key={h} className="text-left font-normal text-white/45">{h}</th>)}</tr></thead>
          <tbody>
            {plan.troncales.map((t0) => { const k = `${t0.a}|${t0.b}`, e = edits[k] ?? {}, t = conEdits(t0), nom = (id: string) => openwrt.find((r) => r.id === id)?.modelo.trim() ?? id; return (
              <tr key={k}><td className="pr-2">{nom(t.a)}–{nom(t.b)}</td>
                <td className="pr-2"><select value={t.banda} onChange={(ev) => edit(k, { banda: ev.target.value as Banda })}>{(["2g", "5g", "6g"] as Banda[]).map((b) => <option key={b} value={b}>{b}</option>)}</select></td>
                <td className="pr-2"><select value={t.canal} onChange={(ev) => edit(k, { canal: Number(ev.target.value) })}>{canalesDe(t.banda).map((c2) => <option key={c2.canal} value={c2.canal}>{c2.canal}</option>)}</select></td>
                <td className="pr-2"><select value={t.anchoMhz} onChange={(ev) => edit(k, { ancho: Number(ev.target.value) })}>{(t.banda === "2g" ? [20, 40] : [20, 40, 80, 160]).map((w) => <option key={w} value={w}>{w} MHz</option>)}</select></td>
                <td><input type="number" className="w-16" min={0} max={t0.pireDbm} value={t.pireDbm} onChange={(ev) => edit(k, { pire: Math.min(Number(ev.target.value), t0.pireDbm) })} /></td>
              </tr>); })}
            {plan.troncales.length === 0 && <tr><td colSpan={5} className="text-white/40">Sin troncales: elige un par de routers arriba.</td></tr>}
          </tbody>
          </table>
          {plan.avisos.map((a) => <p key={a} className="text-[12px] text-amber-300/80">{a}</p>)}
        </div>
      )}
      {aviso && <p className="text-[12px] text-white/55">{aviso}</p>}
    </div>
  );
}
