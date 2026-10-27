"use client";
/** Panel «Routers de la malla» (contrato SiO₂ Ola 1012Q §8): añadir routers y ver su
 * compatibilidad OpenWrt; tras «ya tiene OpenWrt»: región, troncales entre routers y plan
 * de radios editable dentro de lo legal (PERFILES_WIFI), con «Copiar guion» (guionAplicar)
 * y «Descargar configuración» (.txt) por router. La clave de la malla nace aquí
 * (crypto.getRandomValues, 24 bytes base64url) y solo se muestra al copiar; la lista de
 * routers (sin claves) se guarda en localStorage con try/catch. Lógica pura en
 * src/lib/network/routers-malla/. */
import { useEffect, useRef, useState } from "react";
import { compatibilidad, type EntradaTabla } from "@/lib/network/routers-malla/compatibilidad-openwrt";
import { type CfgUciMalla, guionAplicar, uciMalla } from "@/lib/network/routers-malla/uci-malla";
import { planRadios, type RouterMalla } from "@/lib/network/routers-malla/plan-radios";
import { PERFILES_WIFI } from "@/ai/astraura/mesh/camr/regulacion";

export interface FilaPlan { enlace: string; banda: "2g" | "5g" | "6g"; canal: number; anchoMhz: number; pireDbm: number }
export interface RouterMallaRegistro {
  id: string; fabricante: string; modelo: string; version: string; deOperador: boolean;
  /** true cuando la persona confirmó «ya tiene OpenWrt». */
  abierto: boolean;
  /** id de los router hermanos con los que tiene troncal (pares con casilla). */
  troncales: string[];
}
export interface RouterMallaPanelProps {
  /** Tabla de hardware OpenWrt (por prop; si falta, estado «desconocido»). */
  tabla?: EntradaTabla[];
}
type Banda = FilaPlan["banda"];
const REGIONES = ["ES", "FR", "DE", "PT", "US", "JP"] as const;
const BANDAS: Banda[] = ["2g", "5g", "6g"];
const ANCHOS = [20, 40, 80, 160];
const CLAVE_LOCAL = "routers-malla-lista";
/** País → perfil legal (uciMalla exige país de dos letras, no «EU»; huesped EU si no consta). */
const perfilDe = (region: string) => PERFILES_WIFI[region] ?? PERFILES_WIFI.EU;

/** Clave aleatoria de 24 bytes en base64url (se genera en el navegador). */
function claveNueva(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...Array.from(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function RoutersMallaPanel({ tabla }: RouterMallaPanelProps) {
  const lista = tabla ?? [];
  const [routers, setRouters] = useState<RouterMallaRegistro[]>([]);
  const [region, setRegion] = useState("ES");
  const [plan, setPlan] = useState<FilaPlan[]>([]);
  const [nuevo, setNuevo] = useState({ fabricante: "", modelo: "", version: "", deOperador: false });
  const [estado, setEstado] = useState("");
  const claveMalla = useRef<string>(""), claveCliente = useRef<string>("");
  const guardar = (rs: RouterMallaRegistro[], reg = region) => {
    try { window.localStorage.setItem(CLAVE_LOCAL, JSON.stringify({ region: reg, routers: rs })); } catch { /* sin memoria queda en la vista */ }
  };
  useEffect(() => {
    try {
      const d = JSON.parse(window.localStorage.getItem(CLAVE_LOCAL) ?? "null") as { region?: string; routers?: RouterMallaRegistro[] } | null;
      if (Array.isArray(d?.routers)) setRouters(d.routers);
      if (typeof d?.region === "string") setRegion(d.region);
    } catch { /* empieza vacío */ }
  }, []);
  const anadir = () => {
    if (!nuevo.fabricante.trim() || !nuevo.modelo.trim()) return;
    const r: RouterMallaRegistro = { id: `rm-${Date.now().toString(36)}`, fabricante: nuevo.fabricante.trim(), modelo: nuevo.modelo.trim(), version: nuevo.version.trim(), deOperador: nuevo.deOperador, abierto: false, troncales: [] };
    setRouters((rs) => { const s = [...rs, r]; guardar(s); return s; });
    setNuevo({ fabricante: "", modelo: "", version: "", deOperador: false });
  };
  const adoptar = (id: string) => {
    setRouters((rs) => { const s = rs.map((r) => (r.id === id ? { ...r, abierto: true } : r)); guardar(s); return s; });
    if (!claveMalla.current) claveMalla.current = claveNueva();
    if (!claveCliente.current) claveCliente.current = claveNueva();
  };
  const cambiarRegion = (r: string) => { setRegion(r); guardar(routers, r); };
  const cambiarTroncal = (id: string, otro: string, anadir: boolean) => {
    setRouters((rs) => {
      const s = rs.map((r) => r.id !== id ? r : r.troncales.includes(otro) && !anadir ? { ...r, troncales: r.troncales.filter((t) => t !== otro) } : r.troncales.includes(otro) || otro === id ? r : { ...r, troncales: [...r.troncales, otro] });
      guardar(s); return s;
    });
  };
  // Plan inicial con planRadios cuando hay adoptados (radios dadas: 5g+2g, coordinación 6 de titanio).
  useEffect(() => {
    if (!routers.some((r) => r.abierto)) return;
    const salida = planRadios({ region, routers: routers.map((r) => ({ id: r.id, radios: [{ id: "t", banda: "5g" as const, anchosMhz: [20, 40, 80, 160] }, { id: "c", banda: "2g" as const, anchosMhz: [20, 40] }] })), troncales: routers.flatMap((r) => r.troncales.map((o) => [r.id, o] as [string, string])) });
    setPlan(salida.troncales.map((t) => ({ enlace: `${t.a}<->${t.b}`, banda: t.banda, canal: t.canal, anchoMhz: t.anchoMhz, pireDbm: t.pireDbm })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routers, region]);
  /** Edita una fila del plan solo dentro de lo legal (canal y ancho de la lista; PIRE acotada). */
  const editarPlan = (enlace: string, campo: "banda" | "canal" | "anchoMhz" | "pireDbm", valor: string) => {
    const gama = (b: Banda) => perfilDe(region)[b === "2g" ? "g24" : b === "5g" ? "g5" : "g6"];
    setPlan((fs) => fs.map((f) => {
      if (f.enlace !== enlace) return f;
      if (campo === "banda" && BANDAS.includes(valor as Banda)) return { ...f, banda: valor as Banda, canal: gama(valor as Banda)[0].canal, pireDbm: gama(valor as Banda)[0].pireDbm };
      if (campo === "canal") { const c = gama(f.banda).find((x) => String(x.canal) === valor); return c ? { ...f, canal: c.canal, pireDbm: c.pireDbm } : f; }
      if (campo === "anchoMhz" && ANCHOS.includes(Number(valor))) return { ...f, anchoMhz: Number(valor) };
      if (campo === "pireDbm") return { ...f, pireDbm: Math.max(0, Math.min(Number(valor) || 0, gama(f.banda).find((x) => x.canal === f.canal)?.pireDbm ?? 36)) };
      return f;
    }));
  };
  const cfgDe = (r: RouterMallaRegistro): CfgUciMalla => {
    const f = plan.find((x) => x.enlace.startsWith(r.id) || x.enlace.endsWith(r.id));
    const troncal = f ? { banda: f.banda, canal: f.canal, anchoMhz: f.anchoMhz, pireDbm: f.pireDbm } : { banda: "2g" as Banda, canal: 1, anchoMhz: 20, pireDbm: 20 };
    return { router: `${r.fabricante} ${r.modelo}`, meshId: "starseed-malla", claveMalla: claveMalla.current || claveNueva(), region, troncal, cliente: { canal: 1, ssid: "starseed-malla", clave: claveCliente.current || claveNueva() } };
  };
  const copiarGuion = async (r: RouterMallaRegistro) => {
    try {
      if (!claveMalla.current) { claveMalla.current = claveNueva(); claveCliente.current = claveNueva(); }
      await navigator.clipboard.writeText(guionAplicar(cfgDe(r)));
      setEstado(`Guion de ${r.modelo} copiado. Clave de la malla (solo se enseña al copiar): ${claveMalla.current}`);
    } catch (e) { setEstado(`No pude preparar el guion de ${r.modelo}: ${e instanceof Error ? e.message : "error"}`); }
  };
  const descargar = (r: RouterMallaRegistro) => {
    try {
      if (!claveMalla.current) { claveMalla.current = claveNueva(); claveCliente.current = claveNueva(); }
      const cfg = cfgDe(r), uci = uciMalla(cfg);
      const texto = `# StarSeed malla (${cfg.router})\n\n# /etc/config/wireless\n${uci.wireless}\n# /etc/config/network\n${uci.network}`;
      const url = URL.createObjectURL(new Blob([texto], { type: "text/plain;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = `${r.id}-malla.txt`; a.click(); URL.revokeObjectURL(url);
      setEstado(`Configuración de ${r.modelo} descargada (.txt).`);
    } catch (e) { setEstado(`No pude generar la configuración de ${r.modelo}: ${e instanceof Error ? e.message : "error"}`); }
  };
  const input = "min-w-[120px] flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white";
  const boton = "cursor-pointer rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10";
  const sel = "rounded-md border border-white/10 bg-white/5 px-2 py-1 text-sm text-white";
  const gamaAjena = (b: Banda) => perfilDe(region)[b === "2g" ? "g24" : b === "5g" ? "g5" : "g6"];
  return (
    <div className="space-y-3 rounded-xl border border-amber-500/20 bg-amber-950/10 p-3">
      <div className="text-[11px] uppercase tracking-widest text-amber-300/60">Routers de la malla</div>
      <div className="flex flex-wrap items-center gap-2">
        <input className={input} placeholder="fabricante" value={nuevo.fabricante} onChange={(e) => setNuevo({ ...nuevo, fabricante: e.target.value })} />
        <input className={input} placeholder="modelo" value={nuevo.modelo} onChange={(e) => setNuevo({ ...nuevo, modelo: e.target.value })} />
        <input className={input} placeholder="versión" value={nuevo.version} onChange={(e) => setNuevo({ ...nuevo, version: e.target.value })} />
        <label className="flex cursor-pointer items-center gap-1 text-[12px] text-white/60">
          <input type="checkbox" className="cursor-pointer" checked={nuevo.deOperador} onChange={(e) => setNuevo({ ...nuevo, deOperador: e.target.checked })} />
          Router del operador
        </label>
        <button onClick={anadir} className={boton}>Añadir</button>
      </div>
      {routers.map((r) => {
        const res = compatibilidad({ fabricante: r.fabricante, modelo: r.modelo, version: r.version || undefined, deOperador: r.deOperador }, lista);
        return (
          <div key={r.id} className="rounded-lg border border-white/10 bg-white/5 p-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/85">{r.fabricante} {r.modelo}</span>
              <span className="rounded-full border border-white/10 px-2 text-[11px] text-white/70">{res.estado}</span>
            </div>
            <a href={res.enlace ?? "https://openwrt.org/toh/start"} target="_blank" rel="noreferrer" className="cursor-pointer text-[12px] text-amber-300 underline">
              {res.enlace ? "Imagen de OpenWrt" : "Buscar en la tabla de OpenWrt"}
            </a>
            <ol className="list-decimal pl-5 text-[12px] text-white/60">{res.pasos.map((p) => <li key={p}>{p}</li>)}</ol>
            <p className="text-[12px] text-rose-300/90">{res.aviso}</p>
            {!r.abierto ? (
              <button onClick={() => adoptar(r.id)} className={boton}>Ya tiene OpenWrt</button>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-white/50">Región</span>
                <select className={sel} value={region} onChange={(e) => cambiarRegion(e.target.value)}>
                  {REGIONES.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
                {routers.filter((o) => o.id !== r.id).map((o) => (
                  <label key={o.id} className="flex cursor-pointer items-center gap-1 text-[12px] text-white/60">
                    <input type="checkbox" className="cursor-pointer" checked={r.troncales.includes(o.id)} onChange={(e) => cambiarTroncal(r.id, o.id, e.target.checked)} />
                    Troncal con {o.modelo}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {plan.map((f) => (
        <div key={f.enlace} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/30 p-2 text-[12px] text-white/70">
          <span>Enlace {f.enlace}</span>
          <select className={sel} value={f.banda} onChange={(e) => editarPlan(f.enlace, "banda", e.target.value)}>
            {BANDAS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className={sel} value={f.canal} onChange={(e) => editarPlan(f.enlace, "canal", e.target.value)} aria-label={`canal ${f.enlace}`}>
            {gamaAjena(f.banda).map((c) => <option key={c.canal} value={c.canal}>canal {c.canal}</option>)}
          </select>
          <select className={sel} value={f.anchoMhz} onChange={(e) => editarPlan(f.enlace, "anchoMhz", e.target.value)}>
            {ANCHOS.map((a) => <option key={a} value={a}>{a} MHz</option>)}
          </select>
          <label className="flex items-center gap-1">
            potencia
            <input type="number" className="w-16 rounded-md border border-white/10 bg-white/5 px-1 py-1 text-sm text-white" value={f.pireDbm} onChange={(e) => editarPlan(f.enlace, "pireDbm", e.target.value)} />
            dBm
          </label>
        </div>
      ))}
      {routers.filter((r) => r.abierto).map((r) => (
        <div key={`a-${r.id}`} className="flex flex-wrap gap-2">
          <button onClick={() => copiarGuion(r)} className={boton}>Copiar guion — {r.modelo}</button>
          <button onClick={() => descargar(r)} className={boton}>Descargar configuración — {r.modelo}</button>
        </div>
      ))}
      {estado && <p className="text-[12px] text-emerald-300/80">{estado}</p>}
    </div>
  );
}

export default RoutersMallaPanel;
