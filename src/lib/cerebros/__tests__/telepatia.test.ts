import { describe, it, expect } from "vitest";
import {
  type DestinoTelepatia,
  type VinculoTelepatico,
  CONFIGURACIONES_TELEPATIA,
  validarVinculo,
  normalizarVinculos,
  conVinculo,
  sinVinculo,
  estaCaducado,
  planSincronizacion
} from "../telepatia";
describe("Telepatía - Lógica pura",()=>{
  const v:VinculoTelepatico={id:"test-id",destino:{tipo:"cerebro",id:"target-id"},alcance:{completo:true,memorias:["mem1.md"],carpetas:["carpeta1"],configuraciones:["servers"]},direccion:"enviar",acceso:"leer",auto:true,creadoEn:"2026-01-01T00:00:00.000Z",estado:"activo"};
  describe("Tipos",()=>{it("CONFIGURACIONES_TELEPATIA correct",()=>{expect(CONFIGURACIONES_TELEPATIA).toEqual([
    'servers','runtimes','skills','storage','apps','moa','channels','conectores','includes.personalities'
  ] as const);});});
  describe("validarVinculo",()=>{it("validates correctly",()=>{expect(validarVinculo(null).ok).toBe(false);expect(validarVinculo(v).ok).toBe(true);});});
  describe("normalizarVinculos",()=>{it("normalizes correctly",()=>{expect(normalizarVinculos(null)).toEqual([]);const input={telepatia:[null,v,{},{}] as unknown[]};const result=normalizarVinculos(input);expect(result.length).toBe(1);expect(result[0]).toEqual(v);});});
  describe("conVinculo",()=>{it("adds/replaces vinculo",()=>{// Add
    let c={};
    let r=conVinculo(c,v);
    expect(r.telepatia.length).toBe(1);
    expect(r.telepatia[0]).toEqual(v);
    // Replace
    c={telepatia:[v]};
    const vNew={...v,destino:{...v.destino,id:"new-target"}};
    r=conVinculo(c,vNew);
    expect(r.telepatia.length).toBe(1);
    expect(r.telepatia[0]).toEqual(vNew);
  });it("does not mutate config",()=>{const c={telepatia:[]};const o=JSON.parse(JSON.stringify(c));conVinculo(c,v);expect(c).toEqual(o);});});
  describe("sinVinculo",()=>{it("removes vinculo",()=>{// Remove existing
    let c={telepatia:[v]};
    let r=sinVinculo(c,v.id);
    expect(r.telepatia.length).toBe(0);
    // Remove non-existing
    c={telepatia:[v]};
    r=sinVinculo(c,"non-existent-id");
    expect(r.telepatia.length).toBe(1);
    expect(r.telepatia[0]).toEqual(v);
  });it("does not mutate config",()=>{const c={telepatia:[v]};const o=JSON.parse(JSON.stringify(c));sinVinculo(c,v.id);expect(c).toEqual(o);});});
  describe("estaCaducado",()=>{it("checks expiration",()=>{expect(estaCaducado(v,Date.now())).toBe(false);
    const vFuture={...v,expiraEn:new Date(Date.now()+86400000).toISOString()};
    expect(estaCaducado(vFuture,Date.now())).toBe(false);
    const vPast={...v,expiraEn:new Date(Date.now()-86400000).toISOString()};
    expect(estaCaducado(vPast,Date.now())).toBe(true);
    const vNull={...v,expiraEn:null};
    expect(estaCaducado(vNull,Date.now())).toBe(false);
  });});
  describe("planSincronizacion",()=>{it("returns empty for invalid states",()=>{const vPaused={...v,estado:"pausado"};
    expect(planSincronizacion(vPaused,{archivos:[],prefs:{}},{archivos:[],prefs:{}})).toEqual([]);
    const vPending={...v,estado:"pendiente"};
    expect(planSincronizacion(vPending,{archivos:[],prefs:{}},{archivos:[],prefs:{}})).toEqual([]);
    const vExpired={...v,expiraEn:new Date(Date.now()-86400000).toISOString()};
    expect(planSincronizacion(vExpired,{archivos:[],prefs:{}},{archivos:[],prefs:{}})).toEqual([]);
  });it("returns array",()=>{const result=planSincronizacion(v,{archivos:[],prefs:{}},{archivos:[],prefs:{}});expect(Array.isArray(result)).toBe(true);});});
});