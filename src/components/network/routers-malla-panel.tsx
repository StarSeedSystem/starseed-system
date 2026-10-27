"use client";

import { useEffect, useMemo, useState } from "react";
import { compatibilidad, type EntradaTabla, type ModeloRouter, type ResultadoCompatibilidad } from "@/lib/network/routers-malla/compatibilidad-openwrt";

type RouterMalla = ModeloRouter & { id: string; tieneOpenWrt?: boolean; region?: string };

function base64Url(bytes: Uint8Array) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function RoutersMallaPanel({ tabla = [] }: { tabla?: EntradaTabla[] }) {
  const [fabricante, setFabricante] = useState("");
  const [modelo, setModelo] = useState("");
  const [version, setVersion] = useState("");
  const [deOperador, setDeOperador] = useState(false);
  const [resultado, setResultado] = useState<ResultadoCompatibilidad | null>(null);
  const [routers, setRouters] = useState<RouterMalla[]>([]);
  const [clave, setClave] = useState<string | null>(null);

  useEffect(() => { try { const raw = localStorage.getItem("starseed.routers-malla"); if (raw) setRouters(JSON.parse(raw)); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem("starseed.routers-malla", JSON.stringify(routers)); } catch {} }, [routers]);

  const comprobar = () => {
    if (!fabricante.trim() || !modelo.trim()) return;
    setResultado(compatibilidad({ fabricante, modelo, version: version || undefined, deOperador }, tabla));
  };

  const anadir = () => {
    if (!fabricante.trim() || !modelo.trim()) return;
    const r: RouterMalla = { id: crypto.randomUUID(), fabricante, modelo, version: version || undefined, deOperador };
    setRouters((p) => [...p, r]);
    setFabricante(""); setModelo(""); setVersion(""); setDeOperador(false);
  };

  const generarClave = () => {
    if (clave) return;
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    setClave(base64Url(bytes));
  };

  const guionAplicar = (r: RouterMalla) => `Clave malla: ${clave ?? ""}\nRouter ${r.fabricante} ${r.modelo}`;
  const descargar = (r: RouterMalla) => {
    const blob = new Blob(["# StarSeed malla\n" + guionAplicar(r)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${r.fabricante}-${r.modelo}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
      <div className="text-[11px] uppercase tracking-widest text-white/45">Routers de la malla</div>
      <div className="grid gap-2 sm:grid-cols-3">
        <input className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm" placeholder="fabricante" value={fabricante} onChange={e=>setFabricante(e.target.value)} />
        <input className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm" placeholder="modelo" value={modelo} onChange={e=>setModelo(e.target.value)} />
        <input className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm" placeholder="versión" value={version} onChange={e=>setVersion(e.target.value)} />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-[12px] text-white/60">
        <input type="checkbox" className="cursor-pointer" checked={deOperador} onChange={e=>setDeOperador(e.target.checked)} />
        Es del operador
      </label>
      <div className="flex gap-2">
        <button onClick={comprobar} className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm">Comprobar</button>
        <button onClick={anadir} className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm">Añadir router</button>
      </div>
      {resultado && (
        <div className="rounded-lg border border-white/10 bg-black/30 p-2 text-sm">
          <div>Estado: <b>{resultado.estado}</b></div>
          {resultado.enlace ? <a className="text-amber-300 underline cursor-pointer" href={resultado.enlace} target="_blank">Tabla OpenWrt</a> : <a className="text-amber-300 underline cursor-pointer" href="https://openwrt.org/toh/start" target="_blank">Buscar en OpenWrt</a>}
          <ol className="list-decimal pl-5 text-[12px] text-white/60">{resultado.pasos.map(p=> <li key={p}>{p}</li>)}</ol>
          <p className="text-[12px] text-rose-300">{resultado.aviso}</p>
        </div>
      )}
      <div className="space-y-2">
        {routers.map(r => (
          <div key={r.id} className="rounded-md border border-white/10 bg-black/20 p-2 text-sm">
            <div>{r.fabricante} {r.modelo}{r.version?` ${r.version}`:""} {r.deOperador? "· operador":""}</div>
            <div className="flex gap-2 mt-1">
              <button onClick={()=>{ generarClave(); navigator.clipboard.writeText(guionAplicar(r)); }} className="cursor-pointer rounded border px-2 py-1 text-xs">Copiar guion</button>
              <button onClick={()=>descargar(r)} className="cursor-pointer rounded border px-2 py-1 text-xs">Descargar configuración</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default RoutersMallaPanel;
