"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PrestarRecursosPrefs {
  computacion: boolean;
  almacenamiento: boolean;
  apps: string[];
  ancho: number;
  aQuien: {
    cuenta: boolean;
    grupos: boolean;
    publico: boolean;
  };
  topes: {
    cpu: number; // percent
    ram: number; // MB
    disco: number; // MB
    soloCargando: boolean;
  };
}

export function PrestarRecursos({
  prefs,
  onChange,
}: {
  prefs: PrestarRecursosPrefs;
  onChange: (prefs: PrestarRecursosPrefs) => void;
}) {
  const [localPrefs, setLocalPrefs] = useState(() => prefs);

  const handleChange = (newPrefs: PrestarRecursosPrefs) => {
    setLocalPrefs(newPrefs);
    onChange(newPrefs);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-[12px] font-semibold text-white/85">
        Prestar recursos
      </h3>
      <div className="space-y-2 text-[11px] text-white/60">
        <div className="flex items-center gap-2">
          <label htmlFor="prestar-computacion" className="flex items-center gap-1.5">
            <Switch
              id="prestar-computacion"
              checked={localPrefs.computacion}
              onChange={checked =>
                handleChange({
                  ...localPrefs,
                  computacion: checked,
                })
              }
            />
          </label>
          <span>Dejar que mis otras neuronas usen esta para calcular</span>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="prestar-almacenamiento" className="flex items-center gap-1.5">
            <Switch
              id="prestar-almacenamiento"
              checked={localPrefs.almacenamiento}
              onChange={checked =>
                handleChange({
                  ...localPrefs,
                  almacenamiento: checked,
                })
              }
            />
          </label>
          <span>Prestar espacio</span>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="prestar-ancho" className="flex items-center gap-1.5">
            <Input
              id="prestar-ancho"
              type="number"
              value={localPrefs.ancho.toString()}
              onChange={e => {
                const value = parseInt(e.target.value, 10) || 0;
                handleChange({
                  ...localPrefs,
                  ancho: value,
                });
              }}
              className="w-20"
              min="0"
              step="1"
            />
          </label>
          <span>Ancho (Mbps)</span>
        </div>
        <div className="flex items-center gap-2">
           <label htmlFor="prestar-solo-cargando" className="flex items-center gap-1.5">
             <Switch
               id="prestar-solo-cargando"
               checked={localPrefs.topes.soloCargando}
               onChange={checked =>
                 handleChange({
                   ...localPrefs,
                   topes: {
                     ...localPrefs.topes,
                     soloCargando: checked,
                   },
                 })
               }
             />
             Solo cuando esté cargando
           </label>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-white/50">Topes máximos</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
               <label htmlFor="prestar-topes-cpu" className="flex items-center gap-1.5">
                 <Input
                   id="prestar-topes-cpu"
                   type="number"
                   value={localPrefs.topes.cpu.toString()}
                   onChange={e => {
                     const value = parseInt(e.target.value, 10) || 0;
                     handleChange({
                       ...localPrefs,
                       topes: {
                         ...localPrefs.topes,
                         cpu: value,
                       }
                     );
                   }}
                   className="w-20"
                   min="0"
                   max="100"
                   step="1"
                 />
                 CPU (%)
               </label>
            </div>
            <div>
               <label htmlFor="prestar-topes-ram" className="flex items-center gap-1.5">
                 <Input
                   id="prestar-topes-ram"
                   type="number"
                   value={localPrefs.topes.ram.toString()}
                   onChange={e => {
                     const value = parseInt(e.target.value, 10) || 0;
                     handleChange({
                       ...localPrefs,
                       topes: {
                         ...localPrefs.topes,
                         ram: value,
                       }
                     );
                   }}
                   className="w-20"
                   min="0"
                   step="1"
                 />
                 RAM (MB)
               </label>
            </div>
            <div>
               <label htmlFor="prestar-topes-disco" className="flex items-center gap-1.5">
                 <Input
                   id="prestar-topes-disco"
                   type="number"
                   value={localPrefs.topes.disco.toString()}
                   onChange={e => {
                     const value = parseInt(e.target.value, 10) || 0;
                     handleChange({
                       ...localPrefs,
                       topes: {
                         ...localPrefs.topes,
                         disco: value,
                       }
                     );
                   }}
                   className="w-20"
                   min="0"
                   step="1"
                 />
                 Disco (MB)
               </label>
            </div>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-white/50">A quién presto</p>
          <div className="flex items-center gap-2">
             <label htmlFor="prestar-aquien-cuenta" className="flex items-center gap-1.5">
               <Switch
                 id="prestar-aquien-cuenta"
                 checked={localPrefs.aQuien.cuenta}
                 onChange={checked =>
                   handleChange({
                     ...localPrefs,
                     aQuien: {
                       ...localPrefs.aQuien,
                       cuenta: checked,
                     },
                   })
                 }
               />
               Mi cuenta
             </label>
          </div>
          <div className="flex items-center gap-2">
             <label htmlFor="prestar-aquien-grupos" className="flex items-center gap-1.5">
               <Switch
                 id="prestar-aquien-grupos"
                 checked={localPrefs.aQuien.grupos}
                 onChange={checked =>
                   handleChange({
                     ...localPrefs,
                     aQuien: {
                       ...localPrefs.aQuien,
                       grupos: checked,
                     },
                   })
                 }
               />
               Mis grupos
             </label>
          </div>
          <div className="flex items-center gap-2">
             <label htmlFor="prestar-aquien-publico" className="flex items-center gap-1.5">
               <Switch
                 id="prestar-aquien-publico"
                 checked={localPrefs.aQuien.publico}
                 onChange={checked =>
                   handleChange({
                     ...localPrefs,
                     aQuien: {
                       ...localPrefs.aQuien,
                       publico: checked,
                     },
                   })
                 }
               />
               Público
             </label>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="prestar-apps" className="flex items-center gap-1.5">
            <Input
              id="prestar-apps"
              type="text"
              value={localPrefs.apps.join(", ")}
              onChange={e => {
                const value = e.target.value
                  .split(",")
                  .map(s => s.trim())
                  .filter(s => s.length > 0);
                handleChange({
                  ...localPrefs,
                  apps: value,
                });
              }}
              placeholder="app1, app2, app3"
            />
          </label>
          <span>Apps que otras neuronas pueden abrir desde aquí</span>
        </div>
        <p className="text-[9px] text-white/40 italic">
          Aviso: lo privado nunca sale de la cuenta ni va a la nube compartida.
        </p>
      </div>
    </div>
  );
}