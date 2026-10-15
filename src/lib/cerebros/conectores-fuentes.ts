"use client";
import { listConnectors } from "@/lib/connectors/store";
import { INTEGRATIONS, loadIntegrationConfig } from "@/lib/integrations";
import { loadAbilities, abilitiesFor } from "@/lib/abilities/abilities";
export interface ConectorCerebro {
  id: string; nombre: string; tipo: "conector"|"integracion"|"mcp"|"cuenta-externa"|"canal";
  estado: "conectado"|"falta-clave"|"disponible"|"error"; enCerebro: boolean; enlace: string;
}
export async function leerFuentesConectores(brainId: string): Promise<{fuentes: ConectorCerebro[]; avisos: string[]}> {
  if (!brainId) return {fuentes:[], avisos:[]};
  try {
    const [c, i, h, v, ch] = await Promise.all([
      (()=>{try{return listConnectors().map(({connector,config,status})=>({id:connector.id,nombre:connector.name,tipo:"conector" as const,estado:status==="connected"?"conectado":status==="needs-auth"?"falta-clave":"disponible",enCerebro:config?.enabled??false,enlace:"/conexiones"}))}catch{return[]}})(),
      (()=>{try{return INTEGRATIONS.flatMap(integracion=>{try{const config=loadIntegrationConfig(integracion.id,brainId);const tieneConfig=!!(config.apiKey?.trim()||config.endpoint?.trim()||config.oauthConnected);return[{id:integracion.id,nombre:integracion.label,tipo:"integracion" as const,estado:tieneConfig?"conectado":integracion.needsKey?"falta-clave":"disponible",enCerebro:config?.enabled??false,enlace:`/conexiones/${integracion.id}`}]}catch{return[]}})()}catch{return[]}})(),
      (()=>{try{return Promise.all([loadAbilities(),abilitiesFor("cerebro",brainId)]).then(([abilities,links])=>{const linkedRefs=new Set(links.map(l=>l.ref));return abilities.map(a=>{let tipo:ConectorCerebro["tipo"]="mcp";switch(a.kind){case"skill":case"tool":case"connection":case"server":case"api":case"plugin":tipo="conector";break;}return{id:`${a.kind}:${a.ref}`,nombre:a.name,tipo,estado:linkedRefs.has(a.ref)?"conectado":"disponible",enCerebro:linkedRefs.has(a.ref),enlace:`/conexiones/${a.kind}/${a.ref}`};});})}catch{return[]}})(),
      (()=>{try{return fetch(`/api/externos/vinculos?brainId=${brainId}`).then(async res=>{if(!res.ok)return[];const vinculos=await res.json();if(!Array.isArray(vinculos))return[];return vinculos.map(v=>({id:v.id||Math.random().toString(36).substring(2,9),nombre:v.provider||v.name||"Cuenta externa",tipo:"cuenta-externa" as const,estado:!!(v.accessToken||v.apiKey||v.oauthToken)?"conectado":"falta-clave",enCerebro:true,enlace:`/conexiones/vinculos/${v.id||'nuevo'}`}))})}catch{return[]}})(),
      (()=>{try{return typeof window==="undefined"?[]:(()=>{const canalesJson=localStorage.getItem(`starseed.brain.${brainId}.channels`);if(!canalesJson)return[];const canales=JSON.parse(canalesJson);if(!Array.isArray(canales))return[];return canales.map(c=>({id:c.id||Math.random().toString(36).substring(2,9),nombre:c.name||`Canal ${canales.indexOf(c)+1}`,tipo:"canal" as const,estado:c.activo?"conectado":"disponible",enCerebro:true,enlace:`/conexiones/canales/${c.id||'nuevo'}`}))})()}catch{return[]}})()
    ]);
    const fuentes=[...c,...i,...h,...v,...ch];
    return {fuentes,avisos:fuentes.length===0?["No se cargaron fuentes de conectores"]:[]};
  }catch(error){return {fuentes:[],avisos:[`Error: ${error instanceof Error?error.message:String(error)}`]};}
}