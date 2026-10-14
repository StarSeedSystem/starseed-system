import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MotorLlamada } from "@/lib/llamadas/motor";

type Conn = {
  publicar: (m:any)=>void;
  enviar:(s:any)=>void;
  onPresencia:(cb:(p:any[])=>void)=>()=>void;
  onSenal:(cb:(s:any)=>void)=>()=>void;
  onSuscrito:(cb:(ok:boolean)=>void)=>()=>void;
  onEstado?:(cb:(e:string)=>void)=>()=>void;
  estado?:()=>string;
  retirar:()=>void;
  soltar:()=>void;
  tema?:string;
  clave?:()=>string;
};
function crearConexionFalsa(tema="llamada:test-sesion-directo"):Conn{
  let presencia:any[]=[];const oyP=new Set<(p:any[])=>void>(),oyS=new Set<(s:any)=>void>(),oyE=new Set<(e:string)=>void>();
  let suscrito=false;
  return{
    publicar:(m:any)=>{presencia=[m];oyP.forEach(c=>c(presencia));},
    enviar:(_s:any)=>{},
    onPresencia:(cb)=>{oyP.add(cb);return()=>oyP.delete(cb);},
    onSenal:(cb)=>{oyS.add(cb);return()=>oyS.delete(cb);},
    onSuscrito:(cb)=>{oyE.add(cb);return()=>oyE.delete(cb);},
    onEstado:(cb)=>{oyE.add(cb);return()=>oyE.delete(cb);},
    estado:()=>suscrito?"dentro":"connecting",
    retirar:()=>{},soltar:()=>{},tema,clave:()=>"fake-key"
  };
}
function yo(b:string){return{base:b,uid:b,nombre:b.toUpperCase(),avatar:null,invitado:false};}
async function esperar(v=30){for(let i=0;i<v;i++)await new Promise(r=>setTimeout(r,0));}
const OPCIONES_BASE={sesionId:"s-directo",yo:yo("person-1"),intervaloNivelMs:60_000,intervaloStatsMs:60_000};
describe("MotorLlamada - canales directos",()=>{afterEach(()=>vi.restoreAllMocks());
it("devuelve true cuando entrar() usa canales directos",async()=>{const c=crearConexionFalsa();const o={...OPCIONES_BASE,canalesDirectos:()=>[c]};const m=new MotorLlamada(o);expect(m.entrar()).toBe(true);await esperar();expect(m.estado().fase).toBe("esperando");// @ts-ignore
expect(m.canales.length).toBe(1);/// @ts-ignore
expect(m.canales[0].directo).toBe(true);});
it("cuando un canal directo publica presencia, el motor crea su par",async()=>{const c=crearConexionFalsa();const o={...OPCIONES_BASE,canalesDirectos:()=>[c]};const m=new MotorLlamada(o);m.entrar();await esperar();c.publicar({id:"person-2",uid:"person-2-uid",nombre:"Person 2",avatar:null,invitado:false,micro:true,camara:false,pantalla:false,unido:123});await esperar();const p=m.estado().participantes;expect(p.some((pp)=>pp.id==="person-2")).toBe(true);/// @ts-ignore
expect(m.pares.has("person-2")).toBe(true);});
it("revisarCanal nunca suelta el canal directo",async()=>{const o={...OPCIONES_BASE,canalesDirectos:()=>[crearConexionFalsa("llamada:test-sesion-directo")]};const m=new MotorLlamada(o);m.entrar();await esperar();/// @ts-ignore
const a=m.canales.length;/// @ts-ignore
expect(m.canales.some((c:any)=>c.directo)).toBe(true);await m.revisarCanal(false);await esperar();/// @ts-ignore
const d=m.canales.length;expect(d).toBe(a);/// @ts-ignore
expect(m.canales.some((c:any)=>c.directo)).toBe(true);});});