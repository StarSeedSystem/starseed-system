"use client";

import { useState, useMemo, useEffect } from "react";
import { Copy, Download } from "lucide-react";

type EntradaTabla = {
  fabricante: string;
  modelo: string;
  versiones?: string[];
  target: string;
  perfil: string;
  soportado: boolean;
  nota?: string;
};

type ResultadoCompatibilidad = {
  estado: "soportado" | "no-soportado" | "bloqueado-operador" | "desconocido";
  enlace: string | null;
  pasos: string[];
  aviso: string;
};

type RouterMalla = {
  id: string;
  fabricante: string;
  modelo: string;
  version?: string;
  esDelOperador: boolean;
  tieneOpenWrt: boolean;
  region?: string;
};

const STORAGE_KEY = "starseed.routers.malla.v1";

function generarClaveMalla(): string {
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function RouterMallaPanel() {
  const [routers, setRouters] = useState<RouterMalla[]>([]);
  const [tabla, setTabla] = useState<EntradaTabla[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setRouters(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(routers));
    } catch {}
  }, [routers]);

  const toggleOpenWrt = (id: string) => {
    setRouters(routers.map(r => r.id === id ? { ...r, tieneOpenWrt: !r.tieneOpenWrt } : r));
  };

  return (
    <div className="space-y-4">
      <div className="text-[11px] uppercase tracking-widest text-white/45">Routers de la malla</div>
      
      <RouterForm onAdd={(r) => setRouters([...routers, r])} />

      {routers.map(router => (
        <RouterEntry 
          key={router.id} 
          router={router}
          tabla={tabla}
          onUpdate={(updated) => setRouters(routers.map(r => r.id === router.id ? updated : r))}
          onToggleOpenWrt={() => toggleOpenWrt(router.id)}
        />
      ))}
    </div>
  );
}

function RouterForm({ onAdd }: { onAdd: (r: RouterMalla) => void }) {
  const [fabricante, setFabricante] = useState("");
  const [modelo, setModelo] = useState("");
  const [version, setVersion] = useState("");
  const [esOperador, setEsOperador] = useState(false);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white cursor-text" value={fabricante} onChange={e => setFabricante(e.target.value)} placeholder="fabricante" />
        <input className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white cursor-text" value={modelo} onChange={e => setModelo(e.target.value)} placeholder="modelo" />
        <input className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white cursor-text" value={version} onChange={e => setVersion(e.target.value)} placeholder="versión" />
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-[12px] text-white/60 cursor-pointer">
          <input type="checkbox" checked={esOperador} onChange={e => setEsOperador(e.target.checked)} className="cursor-pointer" />
          Es del operador
        </label>
        <button onClick={() => {
          if (!fabricante || !modelo) return;
          onAdd({ id: Date.now().toString(), fabricante, modelo, version, esDelOperador: esOperador, tieneOpenWrt: false });
          setFabricante(""); setModelo(""); setVersion(""); setEsOperador(false);
        }} className="cursor-pointer ml-auto rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10">
          Añadir router
        </button>
      </div>
    </div>
  );
}

function RouterEntry({ router, tabla, onUpdate, onToggleOpenWrt }: {
  router: RouterMalla;
  tabla: EntradaTabla[];
  onUpdate: (r: RouterMalla) => void;
  onToggleOpenWrt: () => void;
}) {
  const compatibilidad = useMemo(() => {
    if (!router.fabricante || !router.modelo) return null;
    
    const normalizar = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ').replace(/-/g, ' ');
    
    const entrada = tabla.find(e => 
      normalizar(e.fabricante) === normalizar(router.fabricante) &&
      normalizar(e.modelo) === normalizar(router.modelo)
    );

    // Router del operador sin entrada en tabla: bloqueado-operador
    if (router.esDelOperador) {
      return {
        estado: "bloqueado-operador" as const,
        enlace: null,
        pasos: [
          "Los routers del operador suelen ir bloqueados y no dejan instalar OpenWrt",
          "Alternativa: pon detrás un router compatible con OpenWrt en modo puente"
        ],
        aviso: "Flashear puede dejar el router inservible"
      };
    }

    // DEBUG
    console.log("Compatibilidad:", entrada, router);

    if (!entrada) {
      return {
        estado: "desconocido" as const,
        enlace: null,
        pasos: [
          "No consta en la tabla: confirma modelo exacto y versión",
          "Busca en https://openwrt.org/toh/start"
        ],
        aviso: "Flashear puede dejar el router inservible"
      };
    }

    if (!entrada.soportado) {
      return {
        estado: "no-soportado" as const,
        enlace: null,
        pasos: ["Este modelo no soportado"],
        aviso: "Flashear puede dejar el router inservible"
      };
    }

    return {
      estado: "soportado" as const,
      enlace: `https://firmware-selector.openwrt.org/?target=${encodeURIComponent(entrada.target)}&id=${encodeURIComponent(entrada.perfil)}`,
      pasos: ["Descargar imagen factory", "Flashear por cable"],
      aviso: "Flashear puede dejar el router inservible"
    };
  }, [router, tabla]);

  const meshKey = useMemo(() => generarClaveMalla(), [router.tieneOpenWrt]);

  const copiarGuion = async () => {
    const guion = `# StarSeed: guion de aplicación para ${router.fabricante} ${router.modelo}\n# Clave malla: ${meshKey}`;
    try {
      await navigator.clipboard.writeText(guion);
    } catch {}
  };

  const descargarConfig = () => {
    const blob = new Blob([`# Configuración para ${router.fabricante} ${router.modelo}\nClave: ${meshKey}`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${router.fabricante}-${router.modelo}-config.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm text-white/80">{router.fabricante} {router.modelo} {router.version && `v${router.version}`}</div>
        <button onClick={onToggleOpenWrt} className="cursor-pointer text-xs text-amber-300 hover:text-amber-200">
          {router.tieneOpenWrt ? "Quitar OpenWrt" : "Tiene OpenWrt"}
        </button>
      </div>

      {compatibilidad && (
        <div className="text-xs text-white/60">
          Compatibilidad: <span className="text-white/90">{compatibilidad.estado}</span>
          {compatibilidad.enlace && (
            <a href="https://openwrt.org/toh/start" target="_blank" className="cursor-pointer ml-2 text-amber-300 hover:text-amber-200">Buscar en OpenWrt</a>
          )}
          <div className="mt-1 text-rose-300/80">{compatibilidad.aviso}</div>
        </div>
      )}

      {router.tieneOpenWrt && (
        <div className="space-y-2">
          <input 
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white cursor-text w-full"
            placeholder="Región (p.ej. ES)"
            value={router.region || ""}
            onChange={e => onUpdate({ ...router, region: e.target.value })}
          />
          
          <div className="flex gap-2">
            <button onClick={copiarGuion} className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10">
              <Copy className="w-3 h-3 inline mr-1" /> Copiar guion
            </button>
            <button onClick={descargarConfig} className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10">
              <Download className="w-3 h-3 inline mr-1" /> Descargar configuración
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
