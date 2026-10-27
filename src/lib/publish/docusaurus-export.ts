export interface ArchivoDocs { path: string; content: string }
export interface EntradaDoc { id: string; titulo: string; cuerpo: string; grupo?: string; orden?: number; descripcion?: string }
import type { TemaGuia } from "@/lib/onboarding/guia-temas-sistema";
import type { EduNode } from "@/lib/education/curriculum";

export function escaparMd(t: string): string {
  let s = t.replace(/\{/g,"&#123;").replace(/\}/g,"&#125;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return s.split("\n").map(l=>l.startsWith("import ")?"&#105;"+l.slice(1):l.startsWith("export ")?"&#101;"+l.slice(1):l).join("\n");
}
function slugBase(t: string){ const n=t.normalize("NFD").replace(/[\u0300-\u036f]/g,""); return n.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"doc";}
export function slugDoc(t: string){ return slugBase(t); }
function fm(id:string,title:string,pos?:number,desc?:string){ const p=[`id:${JSON.stringify(id)}`,`title:${JSON.stringify(title)}`]; if(pos!==undefined)p.push(`sidebar_position:${JSON.stringify(pos)}`); if(desc)p.push(`description:${JSON.stringify(desc)}`); return "---\n"+p.join("\n")+"\n---\n"; }
const LEEME=`---\nid:"leeme-docusaurus"\ntitle:"LEEME-DOCUSAURUS"\n---\n# LEEME-DOCUSAURUS\n\nPasos manuales:\n\n1. npm create docusaurus@latest sitio classic\n2. Copiar la carpeta docs/ generada aquí dentro de sitio/docs\n3. En sitio/docusaurus.config.js poner markdown: { format: 'detect' }\n4. Ejecutar con NO_UPDATE_NOTIFIER=1 si no se quiere el aviso de versiones de la CLI\n5. Nada se despliega sin la palabra de Alex\n\nLímites: máximo 500 documentos, 200 KB por documento. Si se supera se recorta.\n`;

export function docusaurusDesdeEntradas(e:EntradaDoc[],o?:{raiz?:string}):ArchivoDocs[]{
  const raiz=(o?.raiz||"docs").replace(/\/$/,""); const used=new Map<string,number>(); const out:ArchivoDocs[]=[]; const lim=e.slice(0,500);
  lim.forEach((x,i)=>{ let b=slugDoc(x.titulo); const c=used.get(b)??0; const s=c===0?b:`${b}-${c+1}`; used.set(b,c+1); const g=x.grupo?slugDoc(x.grupo):""; const p=g?`${raiz}/${g}/${s}.md`:`${raiz}/${s}.md`; let ctn=fm(x.id,x.titulo,x.orden??i+1,x.descripcion)+escaparMd(x.cuerpo); if(ctn.length>204800)ctn=ctn.slice(0,204800); out.push({path:p,content:ctn});});
  out.push({path:`${raiz}/LEEME-DOCUSAURUS.md`,content:LEEME}); return out;
}
export function docusaurusDesdeGuia(t:readonly TemaGuia[],_ti:string):ArchivoDocs[]{
  const raiz="docs"; const used=new Map<string,number>(); const out:ArchivoDocs[]=[];
  t.forEach((x,i)=>{ let b=slugDoc(x.titulo); const c=used.get(b)??0; const s=c===0?b:`${b}-${c+1}`; used.set(b,c+1); const p=`${raiz}/${s}.md`; let ctn=fm(x.key,x.titulo,i+1)+escaparMd(x.cuerpo)+"\n\n"+x.puntos.map(p=>"- "+escaparMd(p)).join("\n")+"\n\nDónde: "+x.ruta+"\nPregunta a Astraura: "+x.preguntaAurora; if(ctn.length>204800)ctn=ctn.slice(0,204800); out.push({path:p,content:ctn});});
  out.push({path:`${raiz}/LEEME-DOCUSAURUS.md`,content:LEEME}); return out;
}
export function docusaurusDesdeEdu(n:EduNode[]):ArchivoDocs[]{
  const raiz="docs"; const child=new Map<string,EduNode[]>(); n.forEach(x=>{ if(!child.has(x.parentId??"__root"))child.set(x.parentId??"__root",[]); child.get(x.parentId??"__root")!.push(x); });
  const used=new Map<string,number>(); const out:ArchivoDocs[]=[]; let cnt=0; const MAX=500;
  function us(nm:string){ const b=slugDoc(nm); const c=used.get(b)??0; const s=c===0?b:`${b}-${c+1}`; used.set(b,c+1); return s; }
  function walk(nodes:EduNode[],base:string){ if(cnt>=MAX)return; nodes.forEach((node,idx)=>{ if(cnt>=MAX)return; const s=us(node.name); const folder=`${base}/${s}`; const fp=`${folder}/${s}.md`; let ctn=fm(node.id,node.name,idx+1)+(node.blurb?escaparMd(node.blurb):""); if(ctn.length>204800)ctn=ctn.slice(0,204800); out.push({path:fp,content:ctn}); cnt++; const ch=child.get(node.id)??[]; if(ch.length){ out.push({path:`${folder}/_category_.json`,content:JSON.stringify({label:node.name,position:idx+1,collapsed:false})}); walk(ch,folder); } }); }
  walk(child.get("__root")??[],raiz); out.push({path:`${raiz}/LEEME-DOCUSAURUS.md`,content:LEEME}); return out;
}
export function leemeDoc():ArchivoDocs{ return {path:"docs/LEEME-DOCUSAURUS.md",content:LEEME}; }
