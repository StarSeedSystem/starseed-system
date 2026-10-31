"use client";

/**
 * Panel «Routers de la malla» (§8 de architecture/malla-cristalina-sio2.md):
 * comprobar si un router puede instalar OpenWrt (con la tabla por prop; sin
 * tabla se enlaza openwrt.org/toh/start) y, marcado «ya tiene OpenWrt»,
 * planificar la malla: región, troncales entre routers, radios por enlace
 * editables dentro de lo legal, y por router el guion (guionAplicar) o la
 * configuración UCI descargable. La clave de la malla se genera en el
 * navegador (crypto.getRandomValues, 24 bytes en base64url) y solo se muestra
 * al copiar; localStorage guarda la lista de routers SIN claves.
 */

import { useEffect, useMemo, useState } from "react";
import { compatibilidad, type EntradaTabla, type ResultadoCompatibilidad } from "@/lib/network/routers-malla/compatibilidad-openwrt";
import { planRadios, type RouterMalla, type TroncalResult } from "@/lib/network/routers-malla/plan-radios";
import { guionAplicar, uciMalla, type BandaWifi, type CfgUciMalla } from "@/lib/network/routers-malla/uci-malla";
import { PERFILES_WIFI, type CanalWifi } from "@/ai/astraura/mesh/camr/regulacion";
import { TitanioPortatilPanel } from "@/components/network/titanio-portatil-panel";
import { type TroncalesRouter } from "@/lib/malla/cristal/titanio";
import { Router as LucideRouter } from "lucide-react";

const LISTA = "starseed.routers-malla.v1";
const BUSCAR = "https://openwrt.org/toh/start";
const SEL = "cursor-pointer rounded-md border border-white/10 bg-white/5 px-1 text-sm text-white";
type Campo = "banda" | "canal" | "anchoMhz" | "pireDbm";

/** Router de la lista guardada: solo datos, NINGUNA clave. */
export interface RouterGuardado {
  id: string; fabricante: string; modelo: string; version?: string;
  deOperador: boolean; openwrt: boolean; cuenta?: string; /** Portátil de viaje o MiFi (§8.1). */
  portatil?: boolean;
}

/** Clave de la malla en el navegador: 24 bytes de crypto.getRandomValues en base64url. */
export function generarClaveMalla(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let crudo = "";
  for (const b of bytes) crudo += String.fromCharCode(b);
  return btoa(crudo).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Canales con su PIRE legal de una banda en la región (perfil EU si no consta). */
function listaCanales(region: string, banda: BandaWifi): CanalWifi[] {
  const perfil = PERFILES_WIFI[region] ?? PERFILES_WIFI.EU;
  return banda === "2g" ? perfil.g24 : banda === "5g" ? perfil.g5 : perfil.g6;
}

function canalLegal(region: string, banda: BandaWifi, canal: number): CanalWifi | null {
  return listaCanales(region, banda).find((c) => c.canal === canal) ?? null;
}

export function RoutersMallaPanel({ tabla }: { tabla?: EntradaTabla[] }) {
  const [routers, setRouters] = useState<RouterGuardado[]>([]);
  const [form, setForm] = useState({ fabricante: "", modelo: "", version: "" });
  const [deOperador, setDeOperador] = useState(false);
  const [portatil, setPortatil] = useState(false);
  const [region, setRegion] = useState("ES");
  const [par, setPar] = useState<[string, string]>(["", ""]);
  const [troncales, setTroncales] = useState<Array<[string, string]>>([]);
  const [ajustes, setAjustes] = useState<Record<string, Partial<TroncalResult>>>({});
  const [clave, setClave] = useState<string | null>(null);
  const [estado, setEstado] = useState("");

  useEffect(() => {
    try {
      const crudo = localStorage.getItem(LISTA);
      if (crudo) setRouters(JSON.parse(crudo) as RouterGuardado[]);
    } catch { /* localStorage puede no estar disponible: se sigue sin lista */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(LISTA, JSON.stringify(routers)); } catch { /* noop; nunca se guardan claves */ }
  }, [routers]);

  const añadir = () => {
    if (!form.fabricante.trim() || !form.modelo.trim()) return;
    setRouters((rs) => [...rs, {
      id: `rt-${Date.now().toString(36)}`, fabricante: form.fabricante.trim(), modelo: form.modelo.trim(),
      version: form.version.trim() || undefined, deOperador, openwrt: false, portatil,
    }]);
    setForm({ fabricante: "", modelo: "", version: "" }); setDeOperador(false); setPortatil(false);
  };

  /** Compatibilidad de cada router con (o sin) la tabla de hardware por prop. */
  const resultados = useMemo(() => new Map(routers.map((r): [string, ResultadoCompatibilidad] => [r.id,
    compatibilidad({ fabricante: r.fabricante, modelo: r.modelo, version: r.version, deOperador: r.deOperador }, tabla ?? [])])), [routers, tabla]);

  /** Radios del panel: 2,4 GHz para los aparatos y 5 GHz para la troncal (§8). */
  const salida = useMemo(() => planRadios({
    region, troncales,
    routers: routers.map<RouterMalla>((r) => ({ id: r.id, radios: [
      { id: `${r.id}-2g`, banda: "2g", anchosMhz: [20, 40] }, { id: `${r.id}-5g`, banda: "5g", anchosMhz: [20, 40, 80] },
    ] })),
  }), [routers, troncales, region]);

  /** Filas del plan: lo que dice planRadios más los ajustes legales del usuario. */
  const filas = useMemo(() => salida.troncales.map((t) => {
    const aj = ajustes[`${t.a}|${t.b}`] ?? {};
    const banda = aj.banda ?? t.banda;
    const legal = canalLegal(region, banda, aj.canal ?? t.canal) ?? listaCanales(region, banda)[0] ?? null;
    return {
      claveFila: `${t.a}|${t.b}`, a: t.a, b: t.b, banda, canal: legal?.canal ?? t.canal,
      anchoMhz: aj.anchoMhz ?? t.anchoMhz, pireDbm: aj.pireDbm ?? legal?.pireDbm ?? t.pireDbm,
    };
  }), [salida, ajustes, region]);

  const con = (k: string, cambio: Partial<TroncalResult>) => setAjustes((a) => ({ ...a, [k]: { ...a[k], ...cambio } }));

  /** Solo se acepta lo legal: el canal existe en la banda y la potencia cabe en su PIRE. */
  const editar = (k: string, campo: Campo, bruto: string) => {
    const fila = filas.find((f) => f.claveFila === k);
    if (!fila) return;
    if (campo === "banda" && (bruto === "2g" || bruto === "5g" || bruto === "6g")) {
      const primero = listaCanales(region, bruto)[0];
      if (primero) con(k, { banda: bruto, canal: primero.canal, anchoMhz: 20, pireDbm: primero.pireDbm });
    } else if (campo === "canal") {
      const canal = Number.parseInt(bruto, 10);
      const legal = canalLegal(region, fila.banda, canal);
      if (legal) con(k, { canal, pireDbm: Math.min(fila.pireDbm, legal.pireDbm) });
    } else if (campo === "anchoMhz") {
      const anchoMhz = Number.parseInt(bruto, 10);
      if ([20, 40, 80, 160].includes(anchoMhz)) con(k, { anchoMhz });
    } else {
      const pireDbm = Number.parseFloat(bruto);
      const max = canalLegal(region, fila.banda, fila.canal)?.pireDbm ?? 0;
      if (Number.isFinite(pireDbm) && pireDbm >= 0 && pireDbm <= max) con(k, { pireDbm });
    }
  };

  const copiarClave = async () => {
    const c = clave ?? generarClaveMalla();
    setClave(c);
    try {
      await navigator.clipboard.writeText(c);
      setEstado(`Clave de la malla copiada (solo se muestra al copiar): ${c}`);
    } catch { setEstado("No pude usar el portapapeles; la clave queda solo en memoria."); }
  };

  /** CfgUciMalla de un router: su troncal y su AP «starseed-mesh»; la clave, solo en memoria. */
  const cfgDe = (r: RouterGuardado): CfgUciMalla | null => {
    if (!clave) return null;
    const fila = filas.find((f) => f.a === r.id || f.b === r.id);
    if (!fila) return null;
    return {
      router: `${r.fabricante} ${r.modelo}`.slice(0, 40).trim(), meshId: "starseed-mesh", claveMalla: clave, region,
      troncal: { banda: fila.banda, canal: fila.canal, anchoMhz: fila.anchoMhz, pireDbm: fila.pireDbm },
      cliente: { canal: salida.clientes.find((c) => c.router === r.id)?.canal ?? 1, ssid: "starseed-mesh", clave },
    };
  };

  const copiarGuion = async (r: RouterGuardado) => {
    const cfg = cfgDe(r);
    if (!cfg) { setEstado("Necesito la clave de la malla y una troncal con este router."); return; }
    try {
      await navigator.clipboard.writeText(guionAplicar(cfg));
      setEstado("Guion copiado: pégalo por SSH en el router con OpenWrt.");
    } catch { setEstado("No pude copiar el guion."); }
  };

  const descargar = (r: RouterGuardado) => {
    const cfg = cfgDe(r);
    if (!cfg) { setEstado("Necesito la clave de la malla y una troncal con este router."); return; }
    try {
      const u = uciMalla(cfg);
      const blob = new Blob([`${u.wireless}\n${u.network}`], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `starseed-uci-${r.id}.txt`;
      a.click(); URL.revokeObjectURL(a.href);
      setEstado("Configuración UCI descargada (.txt): wireless + network.");
    } catch { setEstado("No pude generar la configuración: revisa la región (país, no «EU») y el canal."); }
  };

  const etiqueta = (id: string) => {
    const r = routers.find((x) => x.id === id);
    return r ? `${r.fabricante} ${r.modelo}` : id;
  };

  /** Genera la tesela de un router titanio (solo para visualización, no se guarda) */
  const teselaParaRouter = (r: RouterGuardado): TroncalesRouter | null => {
    if (!r.openwrt) return null;
    const troncalesDelRouter = filas
      .filter((f) => f.a === r.id || f.b === r.id)
      .map((f) => ({
        a: f.a,
        b: f.b,
        rssiDbm: f.pireDbm,
        anchoBandaKbps: f.anchoMhz * 1000,
        frecuenciaMhz: f.banda === "5g" ? 5180 : f.banda === "6g" ? 5825 : 2412,
        anchoCanalMhz: f.anchoMhz,
      }));
    if (troncalesDelRouter.length === 0) return null;
    return {
      routerId: r.id,
      cuenta: r.cuenta ?? "auto",
      adoptadoPor: "auto",
      troncales: troncalesDelRouter,
      reloj: Date.now(),
      ahora: Date.now(),
    };
  };

  const añadirTroncal = () => {
    if (!par[0] || !par[1] || par[0] === par[1] || troncales.some(([x, y]) => x === par[0] ? y === par[1] : x === par[1] && y === par[0])) return;
    setTroncales((t) => [...t, par]); setPar(["", ""]);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-[11px] uppercase tracking-widest text-white/45">Routers de la malla</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <input className="cursor-pointer rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white" value={form.fabricante} onChange={(e) => setForm({ ...form, fabricante: e.target.value })} placeholder="fabricante (p. ej. TP-Link)" />
        <input className="cursor-pointer rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white" value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} placeholder="modelo (p. ej. Archer C7)" />
        <input className="cursor-pointer rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="versión (opcional)" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-white/60">
          <input type="checkbox" className="cursor-pointer" checked={deOperador} onChange={(e) => setDeOperador(e.target.checked)} />
          Es el router que me dio mi operador
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-white/60">
          <input type="checkbox" className="cursor-pointer" checked={portatil} onChange={(e) => setPortatil(e.target.checked)} />
          Es portátil (de viaje o MiFi)
        </label>
        <button onClick={añadir} className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10">Añadir</button>
      </div>
      <div className="mt-3 space-y-2">
        {routers.length === 0 && <div className="text-[12px] text-white/40">Sin routers todavía.</div>}
        {routers.map((r) => {
          const res = resultados.get(r.id)!;
          return (
            <div key={r.id} className="rounded-lg border border-white/10 bg-black/30 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-white/85">{etiqueta(r.id)}</span>
                <span className="text-[12px] text-white/55">Estado: {res.estado}</span>
                <a href={res.enlace ?? BUSCAR} target="_blank" rel="noreferrer" className="cursor-pointer text-[12px] text-amber-300 underline hover:text-amber-200">
                  {res.enlace ? "Imagen exacta en OpenWrt" : "Buscarlo en la tabla de hardware de OpenWrt"}
                </a>
              </div>
              <ol className="list-decimal space-y-0.5 pl-5 text-[12px] text-white/60">{res.pasos.map((p) => <li key={p}>{p}</li>)}</ol>
              <p className="text-[12px] text-rose-300/90">{res.aviso}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-[12px] text-white/60">
                  <input type="checkbox" className="cursor-pointer" checked={r.openwrt} onChange={(e) => setRouters((rs) => rs.map((x) => (x.id === r.id ? { ...x, openwrt: e.target.checked } : x)))} />
                  {r.openwrt ? "entra en la retícula como titanio" : "Ya tiene OpenWrt"}
                </label>
                <button onClick={() => setRouters((rs) => rs.filter((x) => x.id !== r.id))} className="cursor-pointer text-[12px] text-white/40 hover:text-rose-300">Quitar</button>
              </div>
              {r.openwrt && (
                <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2">
                  <div className="flex items-center gap-2 text-[11px] text-amber-200">
                    <LucideRouter className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Tesela de titanio generada desde los troncales del plan</span>
                  </div>
                  <p className="mt-1 text-[10px] text-amber-100">
                    {teselaParaRouter(r) ? `Router ${r.id} como Ti⁴⁺: ${teselaParaRouter(r)!.troncales.length} troncales` : "Sin troncales definidos"}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {routers.filter((r) => r.portatil).map((r) => (
        <div key={`tp-${r.id}`} className="mt-3">
          <TitanioPortatilPanel tabla={tabla} nombres={r} />
        </div>
      ))}

      {routers.some((r) => r.openwrt) && (
        <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[12px] text-white/60">
              Región (país, dos letras)
              <input className={`w-14 ${SEL}`} value={region} onChange={(e) => setRegion(e.target.value)} />
            </label>
            <button onClick={copiarClave} className="cursor-pointer rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-[12px] text-amber-100 hover:bg-amber-500/25">
              Generar y copiar la clave de la malla
            </button>
            <span className="text-[12px] text-white/45">la clave no se guarda; solo se ve al copiar</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className={SEL} value={par[0]} onChange={(e) => setPar([e.target.value, par[1]])}>
              <option value="">router…</option>
              {routers.map((x) => <option key={x.id} value={x.id}>{etiqueta(x.id)}</option>)}
            </select>
            <select className={SEL} value={par[1]} onChange={(e) => setPar([par[0], e.target.value])}>
              <option value="">con…</option>
              {routers.map((x) => <option key={x.id} value={x.id}>{etiqueta(x.id)}</option>)}
            </select>
            <button onClick={añadirTroncal} className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] text-white/80 hover:bg-white/10">Añadir troncal</button>
            {troncales.map(([x, y]) => (
              <span key={`${x}|${y}`} className="text-[12px] text-white/60">
                {etiqueta(x)} ↔ {etiqueta(y)}
                <button onClick={() => setTroncales((t) => t.filter(([a, b]) => !(a === x && b === y)))} className="ml-1 cursor-pointer text-white/40 hover:text-rose-300">quitar</button>
              </span>
            ))}
          </div>
          {filas.length > 0 && (
            <table className="w-full text-[12px] text-white/70">
              <thead>
                <tr className="text-left text-white/45">
                  <th className="font-normal">Enlace</th><th className="font-normal">Banda</th><th className="font-normal">Canal</th><th className="font-normal">Ancho (MHz)</th><th className="font-normal">PIRE (dBm)</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.claveFila}>
                    <td className="pr-2">{etiqueta(f.a)} ↔ {etiqueta(f.b)}</td>
                    <td><select className={SEL} value={f.banda} onChange={(e) => editar(f.claveFila, "banda", e.target.value)}>{["2g", "5g", "6g"].map((b) => <option key={b} value={b}>{b}</option>)}</select></td>
                    <td><select className={SEL} value={f.canal} onChange={(e) => editar(f.claveFila, "canal", e.target.value)}>{listaCanales(region, f.banda).map((c) => <option key={c.canal} value={c.canal}>{c.canal}</option>)}</select></td>
                    <td><select className={SEL} value={f.anchoMhz} onChange={(e) => editar(f.claveFila, "anchoMhz", e.target.value)}>{(f.banda === "2g" ? [20, 40] : [20, 40, 80, 160]).map((a) => <option key={a} value={a}>{a}</option>)}</select></td>
                    <td><input type="number" className={`w-14 ${SEL}`} value={f.pireDbm} onChange={(e) => editar(f.claveFila, "pireDbm", e.target.value)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {routers.filter((r) => r.openwrt).map((r) => {
            const listo = !!clave && filas.some((f) => f.a === r.id || f.b === r.id);
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-white/70">{etiqueta(r.id)}</span>
                <button disabled={!listo} onClick={() => copiarGuion(r)} className="cursor-pointer rounded-lg border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-[12px] text-amber-100 hover:bg-amber-500/25 disabled:opacity-40">Copiar guion</button>
                <button disabled={!listo} onClick={() => descargar(r)} className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[12px] text-white/80 hover:bg-white/10 disabled:opacity-40">Descargar configuración</button>
              </div>
            );
          })}
          {estado && <p className="text-[12px] text-white/50">{estado}</p>}
        </div>
      )}
    </div>
  );
}
