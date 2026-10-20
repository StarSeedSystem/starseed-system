// ProtoGenesis · Almacén de encargos por cuenta (PG1013G)
import { validarEncargo } from "./encargo";
import type { Encargo, Plan } from "./encargo";
import type { Ambito } from "@/lib/protomolecula/tipos";
import type { Computo } from "@/lib/protomolecula/tipos";
export interface RegistroEncargo { encargo: Encargo; plan: Plan | null; estados: Record<string, EstadoPaso>; asignaciones: Array<{paso:string;agente:string}>; actualizadoEn:number; }
export type EstadoPaso = "pendiente"|"verde"|"rojo"|"necesita una mano";
export interface AlmacenLocal { getItem(k:string):string|null; setItem(k:string,v:string):void; removeItem(k:string):void; }
export const PREFIJO_ENCARGO = "starseed.protogenesis.encargo.v1:";
export const CLAVE_INDICE = "starseed.protogenesis.encargos.indice.v1";
const TAMANO_MAXIMO_BYTES = 256 * 1024;
export interface ResumenEncargo { id:string; moleculaId:string; actualizadoEn:number; }
function esTexto(x:unknown):x is string{return typeof x==="string"&&x.length>0;}
function esNumero(x:unknown):x is number{return typeof x==="number"&&Number.isFinite(x);}
function esEstadoPaso(x:unknown):x is EstadoPaso{return["pendiente","verde","rojo","necesita una mano"].includes(x as EstadoPaso);}
function esObjetoPlano(x:unknown):x is Record<string,unknown>{return typeof x==="object"&&x!==null&&!Array.isArray(x);}
function esRegistroEncargoValido(x:unknown):x is RegistroEncargo{
  if(!esObjetoPlano(x))return false;
  const r=x as Partial<RegistroEncargo>;
  const encargoValido=validarEncargo(r.encargo);
  if(!encargoValido.ok)return false;
  if(r.plan!==null){
    if(!esObjetoPlano(r.plan))return false;
    const plan=r.plan as Partial<Plan>;
    if(typeof plan.encargoId!=="string")return false;
    if(!Array.isArray(plan.pasos))return false;
    for(const paso of plan.pasos){
      if(!esObjetoPlano(paso))return false;
      const p=paso as Partial<{id:string;atomo:string;titulo:string;entradas:string[];salida:{formato:string};depende:string[];criterios:any[];computo?:Computo}>;
      if(typeof p.id!=="string"||typeof p.atomo!=="string"||typeof p.titulo!=="string"
        ||!Array.isArray(p.entradas)||!p.entradas.every(esTexto)
        ||!esObjetoPlano(p.salida)||typeof p.salida.formato!=="string"
        ||!Array.isArray(p.depende)||!p.depende.every(esTexto)
        ||!Array.isArray(p.criterios))return false;
    }
  }
  if(!esObjetoPlano(r.estados))return false;
  for(const clave in r.estados){
    if(!esTexto(clave)||!esEstadoPaso(r.estados[clave]))return false;
  }
  if(!Array.isArray(r.asignaciones))return false;
  for(const asig of r.asignaciones){
    if(!esObjetoPlano(asig))return false;
    const a=asig as Partial<{paso:string;agente:string}>;
    if(!esTexto(a.paso)||!esTexto(a.agente))return false;
  }
  if(!esNumero(r.actualizadoEn))return false;
  if(r.plan!==null&&r.plan.encargoId!==r.encargo.id)return false;
  try{if(JSON.stringify(x).length>TAMANO_MAXIMO_BYTES)return false;}catch{return false;}
  return true;
}
export function almacenNavegador():AlmacenLocal|null{try{return typeof localStorage==="undefined"?null:localStorage;}catch{return null;}}
interface Indice{ids:string[];}
function leerIndice(a:AlmacenLocal):Indice{
  try{
    const crudo=a.getItem(CLAVE_INDICE);
    if(crudo===null)return{ids:[]};
    const parsed:unknown=JSON.parse(crudo);
    if(!esObjetoPlano(parsed)||!Array.isArray(parsed.ids))return{ids:[]};
    return{ids:parsed.ids.filter((id):id is string=>esTexto(id))};
  }catch{return{ids:[]};}
}
function escribirIndice(a:AlmacenLocal,indice:Indice):void{a.setItem(CLAVE_INDICE,JSON.stringify(indice));}
export function guardarEncargo(a:AlmacenLocal,r:RegistroEncargo):boolean{
  if(!esRegistroEncargoValido(r))return false;
  try{
    a.setItem(PREFIJO_ENCARGO+r.encargo.id,JSON.stringify(r));
    const indice=leerIndice(a);
    if(!indice.ids.includes(r.encargo.id))indice.ids.push(r.encargo.id);
    escribirIndice(a,indice);
    return true;
  }catch{return false;}
}
export function cargarEncargo(a:AlmacenLocal,id:string):RegistroEncargo|null{
  try{
    const crudo=a.getItem(PREFIJO_ENCARGO+id);
    if(crudo===null)return null;
    const parsed:unknown=JSON.parse(crudo);
    return esRegistroEncargoValido(parsed)?parsed:null;
  }catch{return null;}
}
export function cargarEncargos(a:AlmacenLocal,moleculaId?:string):ResumenEncargo[]{
  try{
    const resumenes:ResumenEncargo[]=[];
    for(const id of leerIndice(a).ids){
      const r=cargarEncargo(a,id);
      if(r!==null&&(!moleculaId||r.encargo.moleculaId===moleculaId)){
        resumenes.push({id:r.encargo.id,moleculaId:r.encargo.moleculaId,actualizadoEn:r.actualizadoEn});
      }
    }
    resumenes.sort((x,y)=>y.actualizadoEn-x.actualizadoEn);
    return resumenes.slice(0,50);
  }catch{return [];}
}
export function borrarEncargo(a:AlmacenLocal,id:string):boolean{
  try{
    const indice=leerIndice(a);
    if(!indice.ids.includes(id))return false;
    a.removeItem(PREFIJO_ENCARGO+id);
    escribirIndice(a,{ids:indice.ids.filter((x)=>x!==id)});
    return true;
  }catch{return false;}
}