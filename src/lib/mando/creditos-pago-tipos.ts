// (2026-10-06) Tipos y funciones PURAS de los créditos de pago, sin nada de Node: las usa
// `medidores.ts`, que acaba en el bundle del navegador (centro-mando.tsx). Con `node:fs`
// aquí, `next build` fallaba («UnhandledSchemeError: node:fs») y el Mando no se podía
// reconstruir. La lectura del disco vive en `creditos-pago.ts` (solo servidor).
export interface VentanaCredito { id:string; etiqueta:string; usado_pct:number; reinicia:string|null }
export interface Saldo { valor:number; unidad:string }
export interface MedidorCredito {
  id:string; proveedor:string; nombre:string; tipo:string; plan?:string|null;
  ventanas:VentanaCredito[]; saldo:Saldo|null; extras?:Record<string,unknown>;
  fuente?:string; leido?:string; ok?:boolean; obsoleto?:boolean; error?:string|null; enlace?:string;
}
export interface DocCreditos { version:number; t:string; medidores:Record<string,MedidorCredito>; historial?:unknown }


type Tono='peligro'|'aviso'|'ok'
const tonoDePorcentaje=(p:number):Tono=>p>=90?'peligro':p>=70?'aviso':'ok'
const fmt=(d:Date,o:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('es',o).format(d)

export interface VentanaEstado{ id:string; etiqueta:string; usado_pct:number; reinicia:string|null; tono:Tono; queda:number; reiniciada:boolean; minutosParaReinicio:number|null }
export interface MedidorEstado{ id:string; nombre:string; proveedor:string; plan?:string|null; tono:Tono; haceMin:number|null; obsoleto:boolean; resumen:string; textoExtras:string[]; ventanas:VentanaEstado[]; saldo:Saldo|null; ok?:boolean }

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
  const lista=Array.isArray(m.ventanas)?m.ventanas:[]
  const ventanas=lista.map(v=>{
    const reiniciaMs=v.reinicia?Date.parse(v.reinicia):NaN
    const reiniciada=Number.isFinite(reiniciaMs)&&reiniciaMs<=ahora
    const usado=reiniciada?0:v.usado_pct
    return { id:v.id,etiqueta:v.etiqueta,usado_pct:usado,reinicia:v.reinicia??null,tono:tonoDePorcentaje(usado),queda:Math.max(0,100-usado),reiniciada,minutosParaReinicio:Number.isFinite(reiniciaMs)?Math.max(0,Math.floor((reiniciaMs-ahora)/60000)):null }
  })
  let tono=ventanas.reduce<Tono>((a,v)=>v.tono==='peligro'?'peligro':v.tono==='aviso'&&a!=='peligro'?'aviso':a,'ok')
  if(obsoleto&&tono==='ok') tono='aviso'
  if(m.ok===false&&ventanas.length===0&&!m.saldo) tono='aviso'
  const nombre=typeof m.nombre==='string'&&m.nombre?m.nombre:m.id
  return { id:m.id,nombre,proveedor:m.proveedor,plan:m.plan??null,tono,haceMin,obsoleto,resumen:resumenCredito(m,ahora),textoExtras:textoExtras(m),ventanas,saldo:m.saldo??null,ok:m.ok }
}

export function resumenCredito(m:MedidorCredito,ahora?:number):string{
  const lista=Array.isArray(m.ventanas)?m.ventanas:[]
  if(lista.length){
    const ajustada=(v:VentanaCredito)=>ahora!==undefined&&v.reinicia&&Number.isFinite(Date.parse(v.reinicia))&&Date.parse(v.reinicia)<=ahora?0:v.usado_pct
    const v=[...lista].sort((a,b)=>ajustada(b)-ajustada(a))[0]
    const pct=ajustada(v)
    const reiniciaMs=v.reinicia?Date.parse(v.reinicia):NaN
    if(Number.isFinite(reiniciaMs)&&!(ahora!==undefined&&reiniciaMs<=ahora)){
      const f=new Date(reiniciaMs)
      const dia=fmt(f,{weekday:'short'}); const hora=fmt(f,{hour:'numeric',minute:'2-digit',hour12:false})
      return `${pct} % ${v.id} · reinicia ${dia} ${hora}`
    }
    return `${pct} % ${v.id}`
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
  if(typeof m.error==='string'&&m.error){ const corto=m.error.length>80?m.error.slice(0,77)+'…':m.error; out.push(`error: ${corto}`) }
  return out
}
