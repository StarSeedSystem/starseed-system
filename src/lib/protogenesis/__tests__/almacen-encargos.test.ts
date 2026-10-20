import { describe, it, expect } from "vitest";
import {
  almacenNavegador,
  borrarEncargo,
  cargarEncargo,
  cargarEncargos,
  guardarEncargo,
  PREFIJO_ENCARGO,
  CLAVE_INDICE,
  type AlmacenLocal,
} from "../almacen-encargos";
import type { Encargo, Plan } from "../encargo";
import type { RegistroEncargo, EstadoPaso } from "../almacen-encargos";
function almacenMemoria():AlmacenLocal{const d=new Map<string,string>();return{getItem:k=>d.has(k)?d.get(k)!:null,setItem:(k,v)=>d.set(k,v),removeItem:k=>d.delete(k)}}
function almacenRoto():AlmacenLocal{return{getItem:()=>{throw new Error("acceso denegado");},setItem:()=>{throw new Error("acceso denegado");},removeItem:()=>{throw new Error("acceso denegado");}}}
function encargoBase():Encargo{return{id:"e1",moleculaId:"m1",ambito:"personal",intencion:"crear una molécula",criterios:[{tipo:"formato",texto:"formato de salida"}],autor:{tipo:"persona",id:"u1"},origen:"texto",creadoEn:1000}}
function planBase(encargoId:string):Plan{return{encargoId,pasos:[{id:"p1",atomo:"herramienta1",titulo:"Paso 1",entradas:[],salida:{formato:"json"},depende:[],criterios:[{tipo:"formato",texto:"json"}]}]}}
function registroBase():RegistroEncargo{return{encargo:encargoBase(),plan:planBase("e1"),estados:{p1:"pendiente"},asignaciones:[{paso:"p1",agente:"agente1"}],actualizadoEn:2000}}
describe("almacén de encargos",()=>{
  it("guarda y carga un encargo (ida y vuelta)",()=>{const a=almacenMemoria();const r=registroBase();expect(guardarEncargo(a,r)).toBe(true);expect(cargarEncargo(a,"e1")).toEqual(r);})
  it("carga null si el id no existe",()=>{expect(cargarEncargo(almacenMemoria(),"inexistente")).toBeNull();})
  it("devuelve null ante JSON corrupto y no borra nada",()=>{const a=almacenMemoria();a.setItem(PREFIJO_ENCARGO+"e1","{no es json");expect(cargarEncargo(a,"e1")).toBeNull();expect(a.getItem(PREFIJO_ENCARGO+"e1")).toBe("{no es json");})
  it("devuelve null ante registro con estructura inválida",()=>{const a=almacenMemoria();a.setItem(PREFIJO_ENCARGO+"e1",JSON.stringify({id:"e1",titulo:42}));expect(cargarEncargo(a,"e1")).toBeNull();})
  it("listarEncargos ordena de más reciente a más antigua",()=>{const a=almacenMemoria();const r1=registroBase();r1.actualizadoEn=10;const r2={...registroBase(),encargo:{...encargoBase(),id:"e2"},plan:{...planBase("e2"),encargoId:"e2"}};r2.actualizadoEn=99;const r3={...registroBase(),encargo:{...encargoBase(),id:"e3"},plan:{...planBase("e3"),encargoId:"e3"}};r3.actualizadoEn=50;guardarEncargo(a,r1);guardarEncargo(a,r2);guardarEncargo(a,r3);const res=cargarEncargos(a);expect(res.map(r=>r.id)).toEqual(["e2","e3","e1"]);expect(res[0].moleculaId).toBe("m1");})
  it("listarEncargos omite entradas corruptas",()=>{const a=almacenMemoria();const rBuena=registroBase();guardarEncargo(a,rBuena);a.setItem(PREFIJO_ENCARGO+"mala","§§§");a.setItem(CLAVE_INDICE,JSON.stringify({ids:["e1","mala"]}));const res=cargarEncargos(a);expect(res.map(r=>r.id)).toEqual(["e1"]);})
  it("listarEncargos con índice corrupto devuelve lista vacía",()=>{const a=almacenMemoria();a.setItem(CLAVE_INDICE,"no-json");expect(cargarEncargos(a)).toEqual([]);})
  it("borrarEncargo quita datos e índice",()=>{const a=almacenMemoria();const r=registroBase();guardarEncargo(a,r);expect(borrarEncargo(a,"e1")).toBe(true);expect(cargarEncargo(a,"e1")).toBeNull();expect(cargarEncargos(a)).toEqual([]);expect(borrarEncargo(a,"e1")).toBe(false);})
  it("guardar rechaza un registro inválido",()=>{const a=almacenMemoria();const rInv={...registroBase(),encargo:{...encargoBase(),id:""}};expect(guardarEncargo(a,rInv)).toBe(false);})
  it("con almacén que lanza, nada explota y todo devuelve valores seguros",()=>{const a=almacenRoto();expect(guardarEncargo(a,registroBase())).toBe(false);expect(cargarEncargo(a,"e1")).toBeNull();expect(cargarEncargos(a)).toEqual([]);expect(borrarEncargo(a,"e1")).toBe(false);})
  it("almacenNavegador devuelve null cuando localStorage no existe",()=>{expect(almacenNavegador()).toBeNull();})
  it("cargarEncargos filtra por moleculaId",()=>{const a=almacenMemoria();const r1=registroBase();r1.encargo.moleculaId="m1";const r2={...registroBase(),encargo:{...encargoBase(),id:"e2",moleculaId:"m2"},plan:{...planBase("e2"),encargoId:"e2"}};guardarEncargo(a,r1);guardarEncargo(a,r2);const resM1=cargarEncargos(a,"m1");expect(resM1.map(r=>r.id)).toEqual(["e1"]);const resM2=cargarEncargos(a,"m2");expect(resM2.map(r=>r.id)).toEqual(["e2"]);const resAll=cargarEncargos(a);expect(resAll.map(r=>r.id).sort()).toEqual(["e1","e2"].sort());expect(resAll.length).toBe(2);})
})