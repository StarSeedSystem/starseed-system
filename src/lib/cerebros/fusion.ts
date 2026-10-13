import type{Brain,BrainIncludes,BrainServer}from"@/lib/brains/brains";
export interface ArchivoMemoria{id?:string;brain_id:string;name:string;content:string;updated_at?:string|null;meta?:Record<string,unknown>|null}
export type PrefsCerebro=Record<string,unknown>;
export interface PlanFusion{archivos:{name:string;accion:"copiar"|"anexar"|"omitir";contenido:string;bytesQueEntran:number;desde:string[];idDestino?:string}[];includes:BrainIncludes;servers:BrainServer[];config:Record<string,unknown>;prefs:PrefsCerebro;resumen:{archivosNuevos:number;archivosAnexados:number;archivosOmitidos:number;bytes:number}}
export function quitarFrontmatter(t:string){return (m=t.match(/^---[\s\S]*?---/))?t.slice(m.index+m[0].length).replace(/^\n*/,""):t}
export function normalizar(t:string){return quitarFrontmatter(t).replace(/\s+/g," ").trim()}
export function seccionesDe(t:string){const s:string[]=[];let a="";for(const l of t.split("\n")){if(l.startsWith("## ")){if(a)s.push(a);a=l}else a+="\n"+l}if(a)s.push(a);return s}
export function planFusion(e:{destino:Brain;origenes:Brain[];archivos:ArchivoMemoria[];prefs:Record<string,PrefsCerebro>;fecha:string}):PlanFusion{
const ap:Record<string,Record<string,ArchivoMemoria>>={}
for(const ar of e.archivos)(ap[ar.name]??={})[ar.brain_id]=ar
const p:PlanFusion={archivos:[],includes:{vaults:[],backends:[],personalities:[],runtimes:[],tokens:[],memories:[],connections:[],bindScope:false,permissions:[],aiProvider:undefined},servers:[],config:{},prefs:{},resumen:{archivosNuevos:0,archivosAnexados:0,archivosOmitidos:0,bytes:0}}
for(const n in ap){
const c=ap[n]
const d=c[e.destino.id]
const o=e.origenes.map(or=>c[or.id]).filter((a):a is ArchivoMemoria=>a!==undefined)
let acc:"copiar"|"anexar"|"omitir"="omitir"
let cont=""
let bq=0
const des:string[]=o.map(ob=>ob.brain_id)
let idD:string|undefined=undefined
if(d){
let add=""
for(const or of o){
for(const sec of seccionesDe(or.content)){
const sn=normalizar(sec)
const tot=d.content+add
if(!normalizar(tot).includes(sn))add+=`\n\n## Fusionado de «${or.name}» (${or.id.substring(0,8)})·${e.fecha}`+sec
}}
}
if(add===""){
acc="omitir"
cont=d.content
idD=d.id
}else{
acc="anexar"
cont=d.content+add
bq=new TextEncoder().encode(add).length
idD=d.id
}
}else{
if(o.length===0){
acc="omitir"
cont=""
idD=undefined
}else{
let base=o[0].content
let add=""
for(let i=1;i<o.length;i++){
const or=o[i]
for(const sec of seccionesDe(or.content)){
const sn=normalizar(sec)
const tot=base+add
if(!normalizar(tot).includes(sn))add+=`\n\n## Fusionado de «${or.name}» (${or.id.substring(0,8)})·${e.fecha}`+sec
}}
}
cont=base+add
bq=new TextEncoder().encode(cont).length
acc="copiar"
idD=undefined
}}
p.archivos.push({name:n,accion:acc,contenido:cont,bytesQueEntran:bq,desde:des,idDestino:idD})
if(acc==="copiar")p.resumen.archivosNuevos++
else if(acc==="anexar")p.resumen.archivosAnexados++
else if(acc==="omitir")p.resumen.archivosOmitidos++
p.resumen.bytes+=bq
}
const is:Record<keyof BrainIncludes,Set<string>>={vaults:new Set(),backends:new Set(),personalities:new Set(),runtimes:new Set(),tokens:new Set(),memories:new Set(),connections:new Set()}
let bs=false
const pm=new Map<string,BrainPermission["level"]>()
for(const br of[e.destino,...e.origenes]){
const inc=br.includes
is.vaults.add(...inc.vaults)
is.backends.add(...inc.backends)
is.personalities.add(...inc.personalities)
is.runtimes.add(...inc.runtimes)
is.tokens.add(...inc.tokens)
is.memories.add(...inc.memories)
is.connections.add(...inc.connections)
if(inc.bindScope)bs=true
if(Array.isArray(inc.permissions))for(const per of inc.permissions)if(!pm.has(per.who))pm.set(per.who,per.level as BrainPermission["level"])
}
p.includes={vaults:Array.from(is.vaults),backends:Array.from(is.backends),personalities:Array.from(is.personalities),runtimes:Array.from(is.runtimes),tokens:Array.from(is.tokens),memories:Array.from(is.memories),connections:Array.from(is.connections),bindScope:bs,permissions:Array.from(pm.entries()).map(([w,l])=>({who:w,level:l})),aiProvider:e.destino.includes.aiProvider??e.origenes.find(or=>or.includes.aiProvider)?.includes.aiProvider}
const sm=new Map<string,BrainServer>()
const em=new Map<string,string>()
for(const br of[e.destino,...e.origenes]){
for(const sv of br.servers){
if(!sm.has(sv.id)){
const eid=em.get(sv.endpoint?? "")
if(eid&&sm.has(eid))continue
sm.set(sv.id,sv)
if(sv.endpoint)em.set(sv.endpoint,sv.id)
}}
}
p.servers=Array.from(sm.values())
p.config={...e.destino.config}
for(const or of e.origenes){
for(const [k,v] of Object.entries(or.config)){
if(!(k in p.config))p.config[k]=v
}}
const fus=[...new Set([...(Array.isArray(p.config.fusionados)?p.config.fusionados:[]),...e.origenes.map(or=>or.id)])]
p.config.fusionados=fus
p.config.fusionadoEn=e.fecha
const pd=e.prefs[e.destino.id]??{}
const po=e.origenes.reduce((acc,or)=>({...acc,[or.id]:e.prefs[or.id]??{}}),{})
p.prefs={...pd}
for(const [oid,prefsO] of Object.entries(po)){
for(const [k,v] of Object.entries(prefsO)){
if(!(k in p.prefs))p.prefs[k]=v
else{
const dv=p.prefs[k]
if(Array.isArray(dv)&&Array.isArray(v)){
const ids=new Set<string>()
const arr:any[]=[]
for(const it of dv){
if(it&&typeof it==="object"&&"id" in it&&it.id!==undefined){
ids.add(it.id as string)
arr.push(it)
}}
for(const it of v){
if(it&&typeof it==="object"&&"id" in it&&it.id!==undefined){
if(!ids.has(it.id as string)){
ids.add(it.id as string)
arr.push(it)
}}
}else{
const j=JSON.stringify(it)
if(!ids.has(j)){
ids.add(j)
arr.push(it)
}}
}}
p.prefs[k]=arr
}else if(!Array.isArray(dv)&&!Array.isArray(v)&&typeof dv==="object"&&dv!==null&&typeof v==="object"&&v!==null){
const obj={...dv}
for(const [k2,v2] of Object.entries(v)){
if(!(k2 in obj))obj[k2]=v2
}}
p.prefs[k]=obj
}}
return p}