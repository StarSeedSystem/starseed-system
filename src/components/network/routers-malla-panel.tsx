'use client';

import { useEffect, useState } from 'react';
import { 
  compatibilidad, 
  type ModeloRouter, 
  type ResultadoCompatibilidad,
  type EntradaTabla
} from '@/lib/network/routers-malla/compatibilidad-openwrt';
import { 
  planRadios, 
  type PlanRadiosInput, 
  type PlanRadiosOutput,
  type TroncalResult,
  type ClienteResult
} from '@/lib/network/routers-malla/plan-radios';
import { 
  uciMalla, 
  type CfgUciMalla,
  guionAplicar
} from '@/lib/network/routers-malla/uci-malla';
import { PERFILES_WIFI } from '@/ai/astraura/mesh/camr/regulacion';

interface RouterConDatos {
  id: string;
  fabricante: string;
  modelo: string;
  version?: string;
  deOperador: boolean;
  compatibilidad: ResultadoCompatibilidad | null;
  tieneOpenWrt: boolean;
  region?: string;
}

interface TroncalSeleccionado {
  a: string;
  b: string;
}

interface RouterMallaInput {
  id: string;
  radios: {
    banda: '2g' | '5g' | '6g';
    anchosMhz: number[];
  }[];
}

export function RoutersMallaPanel({
  tablaHardware = [] as EntradaTabla[]
}: {
  tablaHardware?: EntradaTabla[];
}) {
  const [routers, setRouters] = useState<RouterConDatos[]>([]);
  const [routerForm, setRouterForm] = useState<ModeloRouter>({
    fabricante: '',
    modelo: '',
    version: '',
    deOperador: false
  });
  const [troncalForm, setTroncalForm] = useState<TroncalSeleccionado>({
    a: '',
    b: ''
  });
  const [region, setRegion] = useState<string>('');
  const [planRadiosResult, setPlanRadiosResult] = useState<PlanRadiosOutput | null>(null);
  const [meshKey, setMeshKey] = useState<string | null>(null);
  const [mostrandoMeshKey, setMostrandoMeshKey] = useState<boolean>(false);
  const [troncalSeleccionado, setTroncalSeleccionado] = useState<TroncalSeleccionado | null>(null);
  const [planRadiosInput, setPlanRadiosInput] = useState<PlanRadiosInput>({
    region: '',
    routers: [],
    troncales: []
  });

  // Load routers from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('starSeedRoutersMalla');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Only restore non-sensitive data
        setRouters(parsed.map((r: Omit<RouterConDatos, 'compatibilidad'>) => ({
          ...r,
          compatibilidad: null
        })));
      }
    } catch (e) {
      console.warn('No se pudo cargar la lista de routers de localStorage', e);
    }
  }, []);

  // Save routers to localStorage (without sensitive data)
  useEffect(() => {
    try {
      const toSave = routers.map(({ compatibilidad, ...rest }) => rest);
      localStorage.setItem('starSeedRoutersMalla', JSON.stringify(toSave));
    } catch (e) {
      console.warn('No se pudo guardar la lista de routers en localStorage', e);
    }
  }, [routers]);

  // Handle router form changes
  const handleRouterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type, checked } = e.target;
    setRouterForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Handle adding a router
  const handleAddRouter = () => {
    if (!routerForm.fabricante.trim() || !routerForm.modelo.trim()) {
      return;
    }

    const nuevoRouter: RouterConDatos = {
      id: `${routerForm.fabricante}-${routerForm.modelo}-${Date.now()}`,
      fabricante: routerForm.fabricante,
      modelo: routerForm.modelo,
      version: routerForm.version.trim() || undefined,
      deOperador: routerForm.deOperador,
      compatibilidad: null,
      tieneOpenWrt: false
    };

    // Check compatibility
    const resultado = compatibilidad(
      {
        fabricante: routerForm.fabricante,
        modelo: routerForm.modelo,
        version: routerForm.version.trim() || undefined,
        deOperador: routerForm.deOperador
      },
      tablaHardware
    );

    nuevoRouter.compatibilidad = resultado;

    setRouters([...routers, nuevoRouter]);
    // Reset form
    setRouterForm({
      fabricante: '',
      modelo: '',
      version: '',
      deOperador: false
    });
  };

  // Handle removing a router
  const handleRemoveRouter = (id: string) => {
    setRouters(routers.filter(r => r.id !== id));
  };

  // Handle toggling OpenWrt status
  const handleToggleOpenWrt = (id: string) => {
    setRouters(routers.map(r => 
      r.id === id ? { ...r, tieneOpenWrt: !r.tieneOpenWrt } : r
    ));
  };

  // Handle region change
  const handleRegionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRegion(e.target.value);
    setPlanRadiosInput(prev => ({ ...prev, region: e.target.value }));
  };

  // Handle troncal selection change
  const handleTroncalChange = (e: React.ChangeEvent<HTMLSelectElement>, campo: 'a' | 'b') => {
    setTroncalForm(prev => ({ ...prev, [campo]: e.target.value }));
    setTroncalSeleccionado(prev => {
      if (!prev) return { a: '', b: '' };
      return { ...prev, [campo]: e.target.value };
    });
  };

  // Handle adding a troncal
  const handleAddTroncal = () => {
    if (!troncalForm.a || !troncalForm.b || troncalForm.a === troncalForm.b) {
      return;
    }

    // Check if this troncal already exists
    const existe = planRadiosInput.troncales.some(
      ([a, b]) => 
        (a === troncalForm.a && b === troncalForm.b) ||
        (a === troncalForm.b && b === troncalForm.a)
    );

    if (!existe) {
      setPlanRadiosInput(prev => ({
        ...prev,
        troncales: [...prev.troncales, [troncalForm.a, troncalForm.b]]
      }));
      // Reset form
      setTroncalForm({ a: '', b: '' });
      setTroncalSeleccionado(null);
    }
  };

  // Handle removing a troncal
  const handleRemoveTroncal = (index: number) => {
    setPlanRadiosInput(prev => {
      const troncales = [...prev.troncales];
      troncales.splice(index, 1);
      return { ...prev, troncales };
    });
  };

  // Handle generating planRadios
  const handleGenerarPlanRadios = () => {
    // Prepare routers data for planRadios
    const routersParaPlan: RouterMallaInput[] = routers
      .filter(r => r.tieneOpenWrt)
      .map(r => ({
        id: r.id,
        radios: [
          { banda: '2g' as const, anchosMhz: [20, 40] },
          { banda: '5g' as const, anchosMhz: [20, 40, 80, 160] },
          { banda: '6g' as const, anchosMhz: [20, 40, 80, 160] }
        ]
      }));

    const input: PlanRadiosInput = {
      region,
      routers: routersParaPlan,
      troncales: planRadiosInput.troncales
    };

    const resultado = planRadios(input);
    setPlanRadiosResult(resultado);
    setPlanRadiosInput(prev => ({ ...prev, routers: routersParaPlan }));
  };

  // Handle generating mesh key
  const handleGenerarClaveMalla = () => {
    if (typeof window !== 'undefined' && window.crypto) {
      const bytes = new Uint8Array(24);
      window.crypto.getRandomValues(bytes);
      // Convert to base64url
      const key = btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
      setMeshKey(key);
    }
  };

  // Handle copying mesh key
  const handleCopiarClaveMalla = async () => {
    if (meshKey) {
      try {
        await navigator.clipboard.writeText(meshKey);
        setMostrandoMeshKey(true);
        // Hide after 5 seconds
        setTimeout(() => setMostrandoMeshKey(false), 5000);
      } catch (e) {
        console.warn('No se pudo copiar al portapapeles', e);
      }
    }
  };

  // Handle downloading configuration for a router
  const handleDescargarConfig = (router: RouterConDatos) => {
    if (!router.tieneOpenWrt || !meshKey || !region) {
      return;
    }

    // Find the troncal for this router (first one that involves this router)
    const troncalParaRouter = planRadiosResult?.troncales.find(
      t => t.a === router.id || t.b === router.id
    );

    if (!troncalParaRouter) {
      return;
    }

    // Determine which side of the troncal this router is
    const esA = troncalParaRouter.a === router.id;
    const otroRouterId = esA ? troncalParaRouter.b : troncalParaRouter.a;

    // Find the other router
    const otroRouter = routers.find(r => r.id === otroRouterId);
    if (!otroRouter) return;

    // Create config for this router
    const cfg: CfgUciMalla = {
      router: router.id,
      meshId: `starseed-mesh-${meshKey.substring(0, 8)}`,
      claveMalla: meshKey,
      region,
      troncal: {
        banda: troncalParaRouter.banda,
        canal: troncalParaRouter.canal,
        anchoMhz: troncalParaRouter.anchoMhz,
        pireDbm: troncalParaRouter.pireDbm
      },
      cliente: {
        canal: 1, // Default for client
        ssid: `StarSeed-${router.id.substring(0, 8)}`,
        clave: meshKey.substring(0, 16) // First 16 chars for wifi password
      }
    };

    try {
      const { wireless, network } = uciMalla(cfg);
      const config = `# StarSeed Malla Configuración para ${router.id}\n\n[wireless]\n${wireless}\n[network]\n${network}`;
      
      const blob = new Blob([config], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `starseed-mesh-${router.id}.conf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('No se pudo generar la configuración UCI', e);
    }
  };

  // Handle copying script for a router
  const handleCopiarGuion = (router: RouterConDatos) => {
    if (!router.tieneOpenWrt || !meshKey || !region) {
      return;
    }

    // Find the troncal for this router (first one that involves this router)
    const troncalParaRouter = planRadiosResult?.troncales.find(
      t => t.a === router.id || t.b === router.id
    );

    if (!troncalParaRouter) {
      return;
    }

    // Determine which side of the troncal this router is
    const esA = troncalParaRouter.a === router.id;
    const otroRouterId = esA ? troncalParaRouter.b : troncalParaRouter.a;

    // Find the other router
    const otroRouter = routers.find(r => r.id === otroRouterId);
    if (!otroRouter) return;

    // Create config for this router
    const cfg: CfgUciMalla = {
      router: router.id,
      meshId: `starseed-mesh-${meshKey.substring(0, 8)}`,
      claveMalla: meshKey,
      region,
      troncal: {
        banda: troncalParaRouter.banda,
        canal: troncalParaRouter.canal,
        anchoMhz: troncalParaRouter.anchoMhz,
        pireDbm: troncalParaRouter.pireDbm
      },
      cliente: {
        canal: 1, // Default for client
        ssid: `StarSeed-${router.id.substring(0, 8)}`,
        clave: meshKey.substring(0, 16) // First 16 chars for wifi password
      }
    };

    try {
      const guion = guionAplicar(cfg);
      navigator.clipboard.writeText(guion).then(() => {
        // Show temporary success message
        alert('Guion copiado al portapapeles');
      }).catch(e => {
        console.warn('No se pudo copiar el guion', e);
      });
    } catch (e) {
      console.warn('No se pudo generar el guion', e);
    }
  };

  // Get available routers for troncal selection (those with OpenWrt)
  const routersConOpenWrt = routers.filter(r => r.tieneOpenWrt);

  return (
    <div className="space-y-6">
      <div className="border rounded-xl p-4 border-white/10 bg-white/5">
        <h3 className="text-[14px] font-bold mb-3 text-white">Routers de la malla</h3>
        
        {/* Router form */}
        <div className="mb-4">
          <h4 className="text-[12px] font-medium mb-2 text-white/70">Añadir router</h4>
          <div className="grid grid-cols-1 gap-2 mb-3">
            <input
              type="text"
              placeholder="Fabricante (ej. TP-Link)"
              value={routerForm.fabricante}
              onChange={handleRouterChange}
              name="fabricante"
              className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white"
            />
            <input
              type="text"
              placeholder="Modelo (ej. Archer C7)"
              value={routerForm.modelo}
              onChange={handleRouterChange}
              name="modelo"
              className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white"
            />
            <input
              type="text"
              placeholder="Versión (opcional)"
              value={routerForm.version}
              onChange={handleRouterChange}
              name="version"
              className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white"
            />
            <label className="flex items-center gap-2 text-[12px] text-white/60 cursor-pointer">
              <input
                type="checkbox"
                checked={routerForm.deOperador}
                onChange={handleRouterChange}
                name="deOperador"
                className="cursor-pointer"
              />
              Es router del operador
            </label>
          </div>
          <button
            onClick={handleAddRouter}
            className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-white/80 hover:bg-white/10"
          >
            Añadir router
          </button>
        </div>

        {/* Routers list */}
        {routers.length > 0 && (
          <div className="mb-4">
            <h4 className="text-[12px] font-medium mb-2 text-white/70">Routers registrados</h4>
            <div className="space-y-3">
              {routers.map(router => (
                <div key={router.id} className="border rounded-lg p-3 border-white/10 bg-white/5">
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-medium text-white">{router.fabricante} {router.modelo}</div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggleOpenWrt(router.id)}
                        className={`rounded-md border px-2 py-1 text-[11px] ${
                          router.tieneOpenWrt 
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                            : 'border-white/10 bg-white/5 text-white/60'
                        }`}
                      >
                        {router.tieneOpenWrt ? 'Tiene OpenWrt' : 'No tiene OpenWrt'}
                      </button>
                      <button
                        onClick={() => handleRemoveRouter(router.id)}
                        className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-500/20"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                  
                  {/* Compatibility result */}
                  {router.compatibilidad && (
                    <div className="mt-2 space-y-1.5 text-[11px]">
                      <div className="flex items-start">
                        <div className="font-medium text-[12px]">Compatibilidad:</div>
                        <div className="ml-2 flex-1">
                          <span className={`px-2 py-0.5 rounded ${
                            router.compatibilidad.estado === 'soportado' 
                              ? 'bg-emerald-900 text-emerald-200'
                              : router.compatibilidad.estado === 'no-soportado'
                                ? 'bg-amber-900 text-amber-200'
                                : router.compatibilidad.estado === 'bloqueado-operador'
                                  ? 'bg-rose-900 text-rose-200'
                                  : 'bg-gray-900 text-gray-200'
                          }`}>
                            {router.compatibilidad.estado}
                          </span>
                        </div>
                      </div>
                      {router.compatibilidad.enlace && (
                        <div className="flex items-start mt-1">
                          <div className="text-[10px] text-white/50">Enlace OpenWrt:</div>
                          <a
                            href={router.compatibilidad.enlace}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] underline text-amber-300 hover:text-amber-200"
                          >
                            {router.compatibilidad.enlace}
                          </a>
                        </div>
                      )}
                      {router.compatibilidad.pasos.length > 0 && (
                        <div className="mt-1">
                          <div className="text-[10px] text-white/50 mb-1">Pasos:</div>
                          <ol className="list-decimal list-inside text-[10px] text-white/60 pl-3">
                            {router.compatibilidad.pasos.map((paso, i) => (
                              <li key={i}>{paso}</li>
                            ))}
                          </ol>
                        </div>
                      )}
                      <div className="mt-1 text-[10px] text-rose-300">
                        {router.compatibilidad.aviso}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* OpenWrt configuration section */}
        {routersConOpenWrt.length > 0 && (
          <div className="border rounded-xl p-4 border-white/10 bg-white/5">
            <h3 className="text-[14px] font-bold mb-3 text-white">Configuración de malla</h3>
            
            {/* Region selection */}
            <div className="mb-4">
              <label className="block text-[12px] font-medium mb-2 text-white/70">
                Región (para canales legales):
              </label>
              <select
                value={region}
                onChange={handleRegionChange}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white"
              >
                <option value="">Seleccionar región</option>
                {Object.keys(PERFILES_WIFI).map(region => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </div>

            {/* Troncal selection */}
            {routersConOpenWrt.length >= 2 && (
              <div className="mb-4">
                <h4 className="text-[12px] font-medium mb-2 text-white/70">Troncales (enlaces entre routers)</h4>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={troncalForm.a}
                      onChange={(e) => handleTroncalChange(e, 'a')}
                      className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white"
                    >
                      <option value="">Seleccionar router A</option>
                      {routersConOpenWrt.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.fabricante} {r.modelo}
                        </option>
                      ))}
                    </select>
                      <select
                        value={troncalForm.b}
                        onChange={(e) => handleTroncalChange(e, 'b')}
                        className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white"
                      >
                        <option value="">Seleccionar router B</option>
                        {routersConOpenWrt.map(r => (
                          <option key={r.id} value={r.id}>
                            {r.fabricante} {r.modelo}
                          </option>
                        ))}
                      </select>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={handleAddTroncal}
                      disabled={!troncalForm.a || !troncalForm.b || troncalForm.a === troncalForm.b}
                      className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white/80 hover:bg-white/10"
                    >
                      Añadir troncal
                    </button>
                  </div>
                </div>
                
                {/* Existing troncales list */}
                {planRadiosInput.troncales.length > 0 && (
                  <div className="mt-3">
                    <h4 className="text-[11px] font-medium mb-1 text-white/60">Troncales configurados</h4>
                    <div className="space-y-1">
                      {planRadiosInput.troncales.map(([aId, bId], index) => {
                        const aRouter = routers.find(r => r.id === aId);
                        const bRouter = routers.find(r => r.id === bId);
                        if (!aRouter || !bRouter) return null;
                        
                             return (
                               <div key={index} className="flex justify-between items-center p-2 rounded border border-white/10 bg-white/5">
                                 <div className="text-[11px]">
                                   {aRouter.fabricante} {aRouter.modelo} — {bRouter.fabricante} {bRouter.modelo}
                 </div>
                </div>
                })
                
                                 <button
                                   onClick={() => handleRemoveTroncal(index)}
                                   className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-300 hover:bg-rose-500/20"
                                 >
                                   Eliminar
                                 </button>
                               </div>
                             );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Generate planRadios button */}
            {routersConOpenWrt.length >= 2 && planRadiosInput.troncales.length > 0 && region && (
              <div className="mb-4">
                <button
                  onClick={handleGenerarPlanRadios}
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-white/80 hover:bg-white/10"
                >
                  Generar plan de radios
                </button>
              </div>
            )}

            {/* PlanRadios results */}
            {planRadiosResult && (
              <div className="border rounded-xl p-4 border-white/10 bg-white/5">
                <h4 className="text-[12px] font-bold mb-3 text-white">Plan de radios generado</h4>
                
                {/* Mesh key generation */}
                <div className="mb-4">
                  <button
                    onClick={handleGenerarClaveMalla}
                    className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-white/80 hover:bg-white/10"
                  >
                    {meshKey ? 'Cambiar clave de malla' : 'Generar clave de malla'}
                  </button>
                  {meshKey && (
                    <div className="mt-2 flex justify-between items-center">
                      <div className="text-[11px] text-white/60">Clave de malla:</div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleCopiarClaveMalla}
                          className="rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-white/80 hover:bg-white/10 text-[10px]"
                        >
                          {mostrandoMeshKey ? '¡Copiada!' : 'Copiar'}
                        </button>
                        <button
                          onClick={handleDescargarConfig}
                          disabled={routersConOpenWrt.length === 0}
                          className="rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-white/80 hover:bg-white/10 text-[10px]"
                        >
                          Descargar configs
                        </button>
                      </div>
                    </div>
                  )}
                  {meshKey && mostrandoMeshKey && (
                    <div className="mt-1 text-[10px] text-emerald-300">
                      La clave se mostró al copiar (por seguridad)
                    )
                  )}
                </div>

                {/* Troncales results */}
                {planRadiosResult.troncales.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-[11px] font-medium mb-2 text-white/70">Troncales (router-router)</h4>
                    <div className="overflow-auto rounded border border-white/10 bg-white/5">
                      <table className="w-full text-[10px] text-white/60">
                        <thead>
                          <tr className="bg-white/5">
                            <th className="p-2 text-left">Enlace</th>
                            <th className="p-2 text-left">Banda</th>
                            <th className="p-2 text-left">Canal</th>
                            <th className="p-2 text-left">Ancho (MHz)</th>
                            <th className="p-2 text-left">PIRE (dBm)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {planRadiosResult.troncales.map((troncal, index) => (
                            <tr key={index} className="border-t border-white/10">
                              <td className="p-2">
                                {troncal.a.substring(0, 8)}… — {troncal.b.substring(0, 8)}…
                              </td>
                              <td className="p-2">{troncal.banda}</td>
                              <td className="p-2">{troncal.canal}</td>
                              <td className="p-2">{troncal.anchoMhz}</td>
                              <td className="p-2">{troncal.pireDbm}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Clientes results */}
                {planRadiosResult.clientes.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-[11px] font-medium mb-2 text-white/70">Clientes (router-dispositivo)</h4>
                    <div className="overflow-auto rounded border border-white/10 bg-white/5">
                      <table className="w-full text-[10px] text-white/60">
                        <thead>
                          <tr className="bg-white/5">
                            <th className="p-2 text-left">Router</th>
                            <th className="p-2 text-left">Banda</th>
                            <th className="p-2 text-left">Canal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {planRadiosResult.clientes.map((cliente, index) => (
                            <tr key={index} className="border-t border-white/10">
                              <td className="p-2">
                                {cliente.router.substring(0, 8)}…
                              </td>
                              <td className="p-2">{cliente.banda}</td>
                              <td className="p-2">{cliente.canal}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {planRadiosResult.avisos.length > 0 && (
                  <div className="mt-3 p-3 rounded border border-white/10 bg-white/5">
                    <h4 className="text-[11px] font-medium mb-2 text-white/70">Avisos:</h4>
                    <ul className="list-discard list-inside text-[10px] text-white/60 pl-3">
                      {planRadiosResult.avisos.map((aviso, index) => (
                        <li key={index}>{aviso}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Individual router actions */}
            {routersConOpenWrt.length > 0 && planRadiosResult && (
              <div className="mt-4">
                <h4 className="text-[12px] font-medium mb-2 text-white/70">Acciones por router</h4>
                <div className="space-y-2">
                  {routersConOpenWrt.map(router => (
                    <div key={router.id} className="border rounded-lg p-3 border-white/10 bg-white/5">
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-medium text-white">{router.fabricante} {router.modelo}</div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleCopiarGuion(router)}
                            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-white/80 hover:bg-white/10 text-[10px]"
                          >
                            Copiar guion
                          </button>
                          <button
                            onClick={() => handleDescargarConfig(router)}
                            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-white/80 hover:bg-white/10 text-[10px]"
                          >
                            Descargar config
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}