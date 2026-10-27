"use client";

/** «Routers de la malla» (§8 de architecture/malla-cristalina-sio2.md, Ola 1012Q): alta de routers con
 * su compatibilidad OpenWrt (tabla por prop; sin ella «desconocido» + enlace a toh/start), plan por
 * troncal con planRadios (banda, canal, ancho y PIRE editables dentro de lo legal), «Copiar guion»
 * (guionAplicar) y «Descargar configuración» (.txt). La clave nace en el navegador (24 bytes
 * base64url) y solo se ve al copiarla; la lista va a localStorage sin ninguna clave dentro. */

import { useMemo, useState } from "react";
import { compatibilidad, type EntradaTabla, type ResultadoCompatibilidad } from "@/lib/network/routers-malla/compatibilidad-openwrt";
import { planRadios, type RadioRouter, type TroncalResult } from "@/lib/network/routers-malla/plan-radios";
import { guionAplicar, uciMalla, type BandaWifi, type CfgUciMalla } from "@/lib/network/routers-malla/uci-malla";
import { PERFILES_WIFI, type CanalWifi } from "@/ai/astraura/mesh/camr/regulacion";

const BUSCAR_TABLA = "https://openwrt.org/toh/start"; // modelo sin tabla: buscarlo aquí
const CLAVE_LS = "starseed.routers-malla.v1"; // lista de routers; nunca lleva claves
const RADIOS_FIJAS: RadioRouter[] = [{ id: "d2", banda: "2g", anchosMhz: [20, 40] }, { id: "d5", banda: "5g", anchosMhz: [20, 40, 80, 160] }]; // radios asumidas por titanio
const CLASE_INP = "rounded border border-white/10 bg-white/5 px-1 py-0.5 text-sm text-white";
const CLASE_BTN = "cursor-pointer rounded border border-white/15 bg-white/5 px-2 py-0.5 text-sm text-white/80 hover:bg-white/10";

/** Un router dado de alta por la persona (sin ninguna clave dentro). */
type Ficha = { id: string; fabricante: string; modelo: string; version: string; deOperador: boolean; yaOpenWrt: boolean; res: ResultadoCompatibilidad };

/** 24 bytes del navegador en base64url (32 caracteres ASCII, válidos como WPA). */
export function generarClaveMalla(): string {
  const bytes = new Uint8Array(24);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes); else for (let i = 0; i < 24; i++) bytes[i] = Math.floor(Math.random() * 256);
  let cruda = "";
  bytes.forEach((x) => (cruda += String.fromCharCode(x)));
  return btoa(cruda).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function canalOk(b: BandaWifi, c: number): boolean {
  return b === "2g" ? c >= 1 && c <= 14 : b === "6g" ? c === 2 || (c >= 1 && c <= 233 && c % 4 === 1) : (c >= 32 && c <= 144 && c % 4 === 0) || (c >= 149 && c <= 177 && c % 4 === 1);
}

function cargarFichas(): Ficha[] {
  try { const dato = JSON.parse(window.localStorage.getItem(CLAVE_LS) ?? "[]"); return Array.isArray(dato) ? (dato as Ficha[]) : []; } catch { return []; }
}

export function RoutersMallaPanel({ tabla = [] }: { tabla?: EntradaTabla[] }) {
  const [fichas, setFichas] = useState<Ficha[]>(cargarFichas);
  const [f, setF] = useState({ fabricante: "", modelo: "", version: "", deOperador: false });
  const [region, setRegion] = useState("ES");
  const [pares, setPares] = useState<Array<[string, string]>>([]);
  const [edits, setEdits] = useState<Record<string, Partial<TroncalResult>>>({});
  const [clave, setClave] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [sel, setSel] = useState<[string, string]>(["", ""]);
  const persistir = (sig: Ficha[]) => { try { window.localStorage.setItem(CLAVE_LS, JSON.stringify(sig)); } catch { /* almacenamiento no disponible */ } setFichas(sig); };
  const añadir = () => {
    if (!f.fabricante.trim() || !f.modelo.trim()) return;
    const res = compatibilidad({ fabricante: f.fabricante, modelo: f.modelo, version: f.version.trim() || undefined, deOperador: f.deOperador }, tabla);
    persistir([...fichas, { id: `rt${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, fabricante: f.fabricante.trim(), modelo: f.modelo.trim(), version: f.version.trim(), deOperador: f.deOperador, yaOpenWrt: false, res }]);
    setF({ fabricante: "", modelo: "", version: "", deOperador: false });
  };
  const marcarOpenWrt = (id: string, ya: boolean) => { persistir(fichas.map((x) => (x.id === id ? { ...x, yaOpenWrt: ya } : x))); if (ya && !clave) setClave(generarClaveMalla()); };
  const titanes = fichas.filter((x) => x.yaOpenWrt);
  const perfil = PERFILES_WIFI[region.trim().toUpperCase()] ?? PERFILES_WIFI.EU; // región sin perfil: el legal de la UE

  const canalesDe = (b: BandaWifi): CanalWifi[] => (b === "2g" ? perfil.g24 : b === "5g" ? perfil.g5 : perfil.g6);
  const etiqueta = (id: string) => { const x = fichas.find((q) => q.id === id); return x ? `${x.fabricante} ${x.modelo}` : id; };
  const plan = useMemo(() => planRadios({ region, routers: titanes.map((t) => ({ id: t.id, radios: RADIOS_FIJAS })), troncales: pares }), [region, titanes, pares]);
  const llaveEnlace = (t: TroncalResult): string => `${t.a}-${t.b}`;
  const valor = (t: TroncalResult): TroncalResult => ({ ...t, ...edits[llaveEnlace(t)] }); // edición por enlace
  const editar = (k: string, v: Partial<TroncalResult>) => setEdits({ ...edits, [k]: { ...edits[k], ...v } });
  /** Config UCI de un titanio: su troncal del plan (con ediciones) o valores legales por defecto. */
  const cfgDe = (idR: string): CfgUciMalla => {
    const k = clave ?? (() => { const g = generarClaveMalla(); setClave(g); return g; })();
    const t0 = plan.troncales.map(valor).find((t) => t.a === idR || t.b === idR); const banda: BandaWifi = t0?.banda === "2g" ? "2g" : t0?.banda === "6g" ? "6g" : "5g";
    const legales = canalesDe(banda); const canal = t0 && canalOk(banda, t0.canal) ? t0.canal : legales[0]?.canal ?? 36;
    const pire = legales.find((c) => c.canal === canal)?.pireDbm ?? 20; const pais = region.trim().toUpperCase();
    const ficha = fichas.find((x) => x.id === idR);
    return { router: ficha ? `${ficha.fabricante} ${ficha.modelo}` : idR, meshId: "starseed-malla", claveMalla: k, region: /^[A-Z]{2}$/.test(pais) ? pais : "ES",
      troncal: { banda, canal, pireDbm: Math.max(0, Math.min(t0?.pireDbm ?? pire, pire)), anchoMhz: banda === "2g" ? Math.min(40, t0?.anchoMhz ?? 20) : Math.min(160, t0?.anchoMhz ?? 80) },
      cliente: { canal: plan.clientes.find((c) => c.router === idR)?.canal ?? 6, ssid: "starseed-ap", clave: k } };
  };
  const copiarGuion = async (idR: string) => { try { await navigator.clipboard.writeText(guionAplicar(cfgDe(idR))); setNota("Guion copiado: pégalo por SSH o en la consola del router."); } catch (e) { setNota(`No pude generar el guion: ${(e as Error).message}`); } };
  const descargar = (idR: string) => {
    try { const u = uciMalla(cfgDe(idR)); const url = URL.createObjectURL(new Blob([`# UCI wireless\n${u.wireless}\n\n# UCI network\n${u.network}\n`], { type: "text/plain" }));
      const a = document.createElement("a"); a.href = url; a.download = `starseed-malla-${idR}.txt`; a.click(); URL.revokeObjectURL(url); }
    catch (e) { setNota(`No pude generar la configuración: ${(e as Error).message}`); }
  };
  const copiarClave = async () => { try { await navigator.clipboard.writeText(clave ?? ""); setNota(`Clave de la malla (solo así se muestra): ${clave}`); } catch { setNota("No pude usar el portapapeles."); } };
  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-[11px] uppercase tracking-widest text-white/45">Routers de la malla · OpenWrt</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input className={CLASE_INP} value={f.fabricante} onChange={(e) => setF({ ...f, fabricante: e.target.value })} placeholder="fabricante (p. ej. TP-Link)" />
        <input className={CLASE_INP} value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} placeholder="modelo (p. ej. Archer C7)" />
        <input className={CLASE_INP} value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} placeholder="versión (pegatina; opcional)" />
      </div>
      <div className="flex flex-wrap items-center gap-2">Flashear es cosa de la persona: lee el aviso. <label className="flex cursor-pointer items-center gap-2 text-[12px] text-white/60"><input type="checkbox" className="cursor-pointer" checked={f.deOperador} onChange={(e) => setF({ ...f, deOperador: e.target.checked })} /> Es del operador</label><button onClick={añadir} className={CLASE_BTN}>Añadir router</button></div>
      {fichas.map((x) => { const enlace = x.res.enlace ?? (x.res.estado === "desconocido" ? BUSCAR_TABLA : null); return (<div key={x.id} className="space-y-1 rounded-lg border border-white/10 bg-black/30 p-2 text-[12px] text-white/60">
          <div className="flex flex-wrap items-center gap-2"><span className="text-sm text-white/85">{x.fabricante} {x.modelo}{x.version ? ` v${x.version}` : ""}</span><span className="rounded bg-white/10 px-1.5 text-[11px] text-white/70">{x.res.estado}</span><button onClick={() => { persistir(fichas.filter((q) => q.id !== x.id)); setPares(pares.filter(([a, b]) => a !== x.id && b !== x.id)); }} className="ml-auto cursor-pointer text-white/40 hover:text-rose-300">Quitar</button></div>
          {enlace && <a href={enlace} target="_blank" rel="noreferrer" className="cursor-pointer text-amber-300 underline">{enlace === BUSCAR_TABLA ? "Buscar en la tabla de OpenWrt" : enlace}</a>}
          <ol className="list-decimal pl-4">{x.res.pasos.map((p) => <li key={p}>{p}</li>)}</ol><p className="text-rose-300/90">{x.res.aviso}</p>
          {x.res.estado !== "bloqueado-operador" && <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" className="cursor-pointer" checked={x.yaOpenWrt} onChange={(e) => marcarOpenWrt(x.id, e.target.checked)} /> ya tiene OpenWrt</label>}
        </div>); })}
      {titanes.length > 0 && (
        <div className="space-y-2 rounded-lg border border-white/10 bg-black/30 p-2 text-[12px] text-white/60">
          <label className="flex flex-wrap items-center gap-2">Región (país, dos letras) <input className={`${CLASE_INP} w-20`} value={region} onChange={(e) => setRegion(e.target.value.toUpperCase())} placeholder="ES" /></label>
          <div className="flex flex-wrap items-center gap-2">Troncales entre routers: <select className={CLASE_INP} value={sel[0]} onChange={(e) => setSel([e.target.value, sel[1]])}><option value="">router A…</option>{titanes.map((t) => <option key={t.id} value={t.id}>{etiqueta(t.id)}</option>)}</select><select className={CLASE_INP} value={sel[1]} onChange={(e) => setSel([sel[0], e.target.value])}><option value="">router B…</option>{titanes.map((t) => <option key={t.id} value={t.id}>{etiqueta(t.id)}</option>)}</select><button onClick={() => { const [a, b] = sel; if (a && b && a !== b && !pares.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) setPares([...pares, [a, b]]); }} className={CLASE_BTN}>Añadir troncal</button>{pares.map(([a, b], i) => <span key={`${a}-${b}-${i}`} className="rounded bg-white/10 px-1.5">{etiqueta(a)} ↔ {etiqueta(b)}<button onClick={() => setPares(pares.filter((_, j) => j !== i))} className="ml-1 cursor-pointer text-white/40 hover:text-rose-300">quitar</button></span>)}</div>
          <table className="w-full text-left"><thead className="text-white/45"><tr><th className="py-1">Enlace</th><th>Banda</th><th>Canal</th><th>Ancho</th><th>PIRE (dBm)</th></tr></thead><tbody>
            {plan.troncales.map((t) => { const k = llaveEnlace(t); const v = valor(t); const legales = canalesDe(v.banda); const maxP = legales.find((c) => c.canal === v.canal)?.pireDbm ?? v.pireDbm; return (<tr key={k} className="border-t border-white/5"><td className="py-1 pr-2">{etiqueta(t.a)} ↔ {etiqueta(t.b)}</td>
              <td><select className={CLASE_INP} value={v.banda} onChange={(e) => { const b = e.target.value as BandaWifi; editar(k, { banda: b, canal: canalesDe(b)[0]?.canal ?? v.canal, anchoMhz: b === "2g" ? Math.min(40, v.anchoMhz) : v.anchoMhz }); }}>{(["2g", "5g"] as BandaWifi[]).map((b) => <option key={b} value={b}>{b}</option>)}</select></td>
              <td><select className={CLASE_INP} value={v.canal} onChange={(e) => editar(k, { canal: Number(e.target.value), pireDbm: legales.find((c) => c.canal === Number(e.target.value))?.pireDbm ?? v.pireDbm })}>{legales.map((c) => <option key={c.canal} value={c.canal}>{c.canal}</option>)}</select></td>
              <td><select className={CLASE_INP} value={v.anchoMhz} onChange={(e) => editar(k, { anchoMhz: Number(e.target.value) })}>{(v.banda === "2g" ? [20, 40] : [20, 40, 80, 160]).map((a) => <option key={a} value={a}>{a} MHz</option>)}</select></td>
              <td><input type="number" className="w-16 rounded border border-white/10 bg-white/5 px-1" value={v.pireDbm} min={0} max={maxP} onChange={(e) => editar(k, { pireDbm: Math.max(0, Math.min(Number(e.target.value) || 0, maxP)) })} /></td>
            </tr>); })}
          </tbody></table>
          {titanes.map((t) => (<div key={t.id} className="flex flex-wrap items-center gap-2"><span className="text-white/70">{etiqueta(t.id)} · AP 2g canal {plan.clientes.find((c) => c.router === t.id)?.canal ?? 6}</span><button onClick={() => copiarGuion(t.id)} className={CLASE_BTN}>Copiar guion</button><button onClick={() => descargar(t.id)} className={CLASE_BTN}>Descargar configuración</button></div>))}
          <div className="flex flex-wrap items-center gap-2"><span>Clave de la malla: {clave ? "generada en este navegador, oculta" : "sin generar"}</span><button onClick={() => { setClave(generarClaveMalla()); setNota("Clave nueva generada en el navegador."); }} className={CLASE_BTN}>Generar clave</button><button disabled={!clave} onClick={copiarClave} className={`${CLASE_BTN} disabled:opacity-40`}>Copiar clave</button></div>
        </div>
      )}
      {nota && <p className="break-all text-[12px] text-emerald-200/90">{nota}</p>}
    </div>
  );
}
