import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export interface VentanaCredito { id:string; etiqueta:string; usado_pct:number; reinicia:string }
export interface Saldo { valor:number; unidad:string }
export interface MedidorCredito {
  id:string; proveedor:string; nombre:string; tipo:string; plan?:string|null;
  ventanas:VentanaCredito[]; saldo:Saldo|null; extras?:Record<string,unknown>;
  fuente?:string; leido?:string; ok?:boolean; obsoleto?:boolean; error?:string|null; enlace?:string;
}
export interface DocCreditos { version:number; t:string; medidores:Record<string,MedidorCredito>; historial?:unknown }

export async function leerCreditosPago(ruta=path.join(os.homedir(),'.starseed','medidores-credito.json')):Promise<DocCreditos|null>{
  try{ const d=await fs.readFile(ruta,'utf8'); return JSON.parse(d) as DocCreditos }catch{ return null }
}

type Tono='peligro'|'aviso'|'ok'
const tonoDePorcentaje=(p:number):Tono=>p>=90?'peligro':p>=70?'aviso':'ok'
const fmt=(d:Date,o:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('es',o).format(d)

export interface VentanaEstado{ id:string; etiqueta:string; usado_pct:number; reinicia:string; tono:Tono; queda:number; reiniciada:boolean; minutosParaReinicio:number }
export interface MedidorEstado{ id:string; nombre:string; proveedor:string; plan?:string|null; tono:Tono; haceMin:number|null; obsoleto:boolean; resumen:string; textoExtras:string[]; ventanas:VentanaEstado[]; saldo:Saldo|null; ok?:boolean; fuente?:string; enlace?:string }

export function estadoCreditos(doc:DocCreditos|null,ahora:number):MedidorEstado[]{
  if(!doc||!doc.medidores) return []
  const lista=Object.values(doc.medidores)
  const orden=[...lista].sort((a,b)=>{
    const prio=(id:string)=>id==='claude'?0:id==='codex'?1:2
    const pa=prio(a.id),pb=prio(b.id)
    return pa!==pb?pa-pb:a.nombre.localeCompare(b.nombre)
  })
  return orden.map(m=>estadoMedidor(m,ahora))
}

function estadoMedidor(m:MedidorCredito,ahora:number):MedidorEstado{
  const leidoMs=m.leido?Date.parse(m.leido):NaN
  const haceMin=Number.isFinite(leidoMs)?Math.floor((ahora-leidoMs)/60000):null
  const obsoleto=Boolean(m.obsoleto)||(haceMin!==null&&haceMin>45)
  const ventanas=m.ventanas.map(v=>{
    const reiniciaMs=Date.parse(v.reinicia)
    const reiniciada=Number.isFinite(reiniciaMs)&&reiniciaMs<=ahora
    const usado=reiniciada?0:v.usado_pct
    return { id:v.id,etiqueta:v.etiqueta,usado_pct:usado,reinicia:v.reinicia,tono:tonoDePorcentaje(usado),queda:Math.max(0,100-usado),reiniciada,minutosParaReinicio:Number.isFinite(reiniciaMs)?Math.max(0,Math.floor((reiniciaMs-ahora)/60000)):0 }
  })
  let tono=ventanas.reduce<Tono>((a,v)=>v.tono==='peligro'?'peligro':v.tono==='aviso'&&a!=='peligro'?'aviso':a,'ok')
  if(obsoleto&&tono==='ok') tono='aviso'
  return { id:m.id,nombre:m.nombre,proveedor:m.proveedor,plan:m.plan??null,tono,haceMin,obsoleto,resumen:resumenCredito(m),textoExtras:textoExtras(m),ventanas,saldo:m.saldo,ok:m.ok,fuente:m.fuente,enlace:m.enlace }
}

export function resumenCredito(m:MedidorCredito):string{
  if(m.ventanas.length){
    const v=[...m.ventanas].sort((a,b)=>b.usado_pct-a.usado_pct)[0]
    const f=new Date(v.reinicia)
    const dia=fmt(f,{weekday:'short'}); const hora=fmt(f,{hour:'numeric',minute:'2-digit',hour12:false})
    return `${v.usado_pct} % ${v.id} · reinicia ${dia} ${hora}`
  }
  if(m.saldo){ const val=new Intl.NumberFormat('es',{minimumFractionDigits:2,maximumFractionDigits:2}).format(m.saldo.valor); return `saldo ${val} ${m.saldo.unidad}` }
  return 'sin lectura'
}

export function textoExtras(m:MedidorCredito):string[]{
  const e=m.extras??{}, out=[]
  const r=typeof e.reinicios_gratis==='number'?e.reinicios_gratis as number:0
  const v=typeof e.reinicio_gratis_vence==='string'?e.reinicio_gratis_vence as string:''
  if(r>0&&v){ const f=new Date(v); const dia=fmt(f,{day:'numeric',month:'short'}).replace(/\.$/,''); out.push(`${r} reinicio${r>1?'s':''} gratis hasta el ${dia}`) }
  if(typeof e.bloqueado==='string') out.push(`bloqueado: ${e.bloqueado}`)
  if(e.uso_normal===false) out.push('uso normal cortado')
  return out
}
