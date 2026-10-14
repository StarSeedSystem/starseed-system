import React from 'react';
type T='mac'|'a1'|'neurona'|'nube'|'otro';
interface H{id:string;n:string;t:T;c:number|null;nuc:number|null;car:number|null;ru:number|null;rt:number|null;gp:number|null;gn:string|null;dl:number|null;dt:number|null;ba:number|null;ca:boolean|null;m:number|null;f:string;}
interface U{cpu:number;ram:number;dis:number;ba:number;}
export function ProcesosHardware({h,u,o}:{h:H[];u:U;o?:string[]}){
  const s=h.filter((x)=>!o?.includes(x.id));
  const f=(t:number|null)=>t===null?'sin hora':new Date(t*1000).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
  return (<div>{s.map((x)=>(
    <div key={x.id} className="border rounded-lg p-4 mb-4">
      <div className="flex flex-wrap gap-4 mb-4">
        <h3 className="font-semibold">{x.n}</h3>
        <span className="text-sm text-muted-foreground">{x.t}</span>
        <span className="text-xs text-muted-foreground">{f(x.m)}</span>
        <span className="text-xs text-muted-foreground">Fuente: {x.f}</span>
      </div>
      <div className="space-y-2">
        {/* CPU */}
        <div className={`flex items-center gap-2 ${x.c!==null&&x.c>u.cpu?'bg-amber-50':''}`}>
          <span className="w-20">CPU:</span>
          <div className="flex-1">
            {x.c===null?(<span>sin medida en este aparato</span>):(<>
              <div className="bg-gray-200 rounded-full h-2.5 w-full"><div className={`bg-amber-600 h-2.5 rounded-full w-${x.c}%`} role="progressbar" aria-valuenow={x.c} aria-valuemin="0" aria-valuemax="100" /></div></div>
              <span className="ml-2 text-sm">{x.c}% ({x.nuc??'N/A'} núcleos, carga: {x.car??'N/A'})</span>
            </>)}
            {x.c!==null&&x.c>u.cpu&&(<span className="ml-2 text-xs text-amber-600">(umbral: {u.cpu}%)</span>)}
          </div>
        </div>
        {/* RAM */}
        <div className={`flex items-center gap-2 ${x.ru!==null&&x.rt!==null&&(x.ru/x.rt)*100>u.ram?'bg-amber-50':''}`}>
          <span className="w-20">RAM:</span>
          <div className="flex-1">
            {x.ru===null||x.rt===null?(<span>sin medida en este aparato</span>):(<>
              <div className="bg-gray-200 rounded-full h-2.5 w-full"><div className={`bg-amber-600 h-2.5 rounded-full w-${(x.ru/x.rt)*100}%`} role="progressbar" aria-valuenow={(x.ru/x.rt)*100} aria-valuemin="0" aria-valuemax="100" /></div></div>
              <span className="ml-2 text-sm">${(x.ru/1024).toFixed(1)} GB / ${(x.rt/1024).toFixed(1)} GB (${(x.ru/x.rt)*100}%)</span>
            </>)}
            {x.ru!==null&&x.rt!==null&&(x.ru/x.rt)*100>u.ram&&(<span className="ml-2 text-xs text-amber-600">(umbral: {u.ram}%)</span>)}
          </div>
        </div>
        {/* GPU - no umbral */}
        <div className="flex items-center gap-2">
          <span className="w-20">GPU:</span>
          <div className="flex-1">
            {x.gp===null?(<span>sin medida en este aparato</span>):(<>
              <div className="bg-gray-200 rounded-full h-2.5 w-full"><div className={`bg-amber-600 h-2.5 rounded-full w-${x.gp}%`} role="progressbar" aria-valuenow={x.gp} aria-valuemin="0" aria-valuemax="100" /></div></div>
              <span className="ml-2 text-sm">{x.gp}% ${x.gn??''}</span>
            </>)}
          </div>
        </div>
        {/* Disco */}
        <div className={`flex items-center gap-2 ${x.dl!==null&&x.dt!==null&&((x.dt-x.dl)/x.dt)*100>u.dis?'bg-amber-50':''}`}>
          <span className="w-20">Disco:</span>
          <div className="flex-1">
            {x.dl===null||x.dt===null?(<span>sin medida en este aparato</span>):(<>
              <div className="bg-gray-200 rounded-full h-2.5 w-full"><div className={`bg-amber-600 h-2.5 rounded-full w-${((x.dt-x.dl)/x.dt)*100}%`} role="progressbar" aria-valuenow={((x.dt-x.dl)/x.dt)*100} aria-valuemin="0" aria-valuemax="100" /></div></div>
              <span className="ml-2 text-sm">${x.dl.toFixed(1)} GB libre / ${x.dt.toFixed(1)} GB total (${
                ((x.dt-x.dl)/x.dt)*100
              }% usado)</span>
            </>)}
            {x.dl!==null&&x.dt!==null&&((x.dt-x.dl)/x.dt)*100>u.dis&&(<span className="ml-2 text-xs text-amber-600">(umbral: {u.dis}%)</span>)}
          </div>
        </div>
        {/* Batería */}
        <div className={`flex items-center gap-2 ${x.ba!==null&&x.ba<u.ba?'bg-amber-50':''}`}>
          <span className="w-20">Batería:</span>
          <div className="flex-1">
            {x.ba===null?(<span>sin medida en este aparato</span>):(<>
              <div className="bg-gray-200 rounded-full h-2.5 w-full"><div className={`bg-amber-600 h-2.5 rounded-full w-${x.ba}%`} role="progressbar" aria-valuenow={x.ba} aria-valuemin="0" aria-valuemax="100" /></div></div>
              <span className="ml-2 text-sm">{x.ba}% ${x.ca?'(cargando)':'(descargando)'}</span>
            </>)}
            {x.ba!==null&&x.ba<u.ba&&(<span className="ml-2 text-xs text-amber-600">(umbral: {u.ba}%)</span>)}
          </div>
        </div>
      </div>
    </div>
  ))}</div>
);
}
export default ProcesosHardware;