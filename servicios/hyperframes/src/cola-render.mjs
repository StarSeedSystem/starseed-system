// Cola de render HyperFrames · módulo puro. Contrato: architecture/video-hyperframes.md.
// Telemetría apagada: HYPERFRAMES_NO_TELEMETRY=1 en cada proceso.
const FLAGS = new Set(["-o","-f","-q","-w","--format","--variables","--composition"]);
function okFlag(a){ return typeof a==="string" && (FLAGS.has(a) || (a[0]==="-" && a.length===2 && /[a-z]/i.test(a[1])) || (a[0]==="-" && a[1]==="-" && /^[a-zA-Z0-9_-]+$/.test(a.slice(2)))); }
function validarArgs(args){ if(!Array.isArray(args)) return {ok:false,razon:"args debe ser una lista"}; for(const a of args){ if(typeof a!=="string") return {ok:false,razon:"cada arg debe ser cadena"}; if(/\s/.test(a)||a.includes('"')||a.includes("'")) return {ok:false,razon:"arg con espacios o comillas"}; if(!okFlag(a) && a[0]!=="-" && !/^[A-Za-z0-9_.:-]+$/.test(a)) return {ok:false,razon:`arg no permitido: ${a}`}; } return {ok:true}; }
function extraerProgreso(s){ const p={}; if(typeof s!=="string") return p; for(const l of s.split("\n")){ const t=l.trim(); if(t.startsWith("@hf-progress")){ try{ const j=t.replace("@hf-progress","").trim(); const o=JSON.parse(j); if(o&&typeof o==="object") Object.assign(p,o); }catch{} } } return p; }
export function crearCola({ejecutar,reloj,maxSimultaneos=1,maxSegundos=900}){
  const trabajos=new Map(),enCurso=new Set(),orden=[];
  const ahora=()=>reloj&&typeof reloj.ahora==="function"?reloj.ahora():reloj?reloj():Date.now();
  const desde=(i)=>(ahora()-i)/1000;
  async function lanzar(t){ enCurso.add(t.id); t.inicio=ahora(); t.estado="renderizando"; const env={...process?.env,HYPERFRAMES_NO_TELEMETRY:"1"}; try{ const r=await ejecutar(t.args,{env}); t.progreso=extraerProgreso(r?.stdout||r); t.estado=(r&&r.exitCode===0)?"hecho":"fallo"; t.error=(r&&r.exitCode!==0)?(r.stderr||`exit ${r.exitCode}`):(r&&(r.stderr||r.error)||null); }catch(e){ t.estado="fallo"; t.error=e&&e.message?e.message:String(e); } enCurso.delete(t.id); procesar(); }
  function procesar(){ if(enCurso.size>=maxSimultaneos) return; for(const id of orden){ if(enCurso.size>=maxSimultaneos) break; const w=trabajos.get(id); if(w&&w.estado==="en-cola"&&!enCurso.has(id)) lanzar(w); } }
  function encolar({id,proyecto,args}){ const v=validarArgs(args); if(!v.ok) throw new Error(v.razon); if(trabajos.has(id)) throw new Error("trabajo duplicado: "+id); const t={id,proyecto:proyecto||"desconocido",args:[...args],estado:"en-cola",inicio:null,progreso:{},error:null}; trabajos.set(id,t); orden.push(id); procesar(); return id; }
  function estado(id){ const t=trabajos.get(id); if(!t) return null; const c={id:t.id,proyecto:t.proyecto,estado:t.estado,progreso:{...t.progreso}}; if(t.inicio) c.inicio=t.inicio; if(t.error) c.error=t.error; return c; }
  function cancelar(id){ const t=trabajos.get(id); if(!t) return false; if(t.estado==="en-cola"||t.estado==="renderizando"){ t.estado="cancelado"; return true; } return false; }
  function revisarTiempo(){ for(const [id,t] of trabajos){ if(t.estado==="renderizando"&&t.inicio&&desde(t.inicio)>maxSegundos){ t.estado="fallo"; t.error="tiempo excedido (max "+maxSegundos+" s)"; enCurso.delete(id); } } procesar(); }
  return {encolar,estado,cancelar,revisarTiempo};
}
