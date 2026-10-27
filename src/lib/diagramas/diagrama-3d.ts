// Conversión pura SVG→3D. Basado en diagram-design MIT.
// architecture/diagramas.md §3-5. Módulo PURO.

export interface Nodo3D {
  id: string; tipo: "rect"|"circulo"|"texto"|"otro"; etiqueta: string;
  x: number; y: number; ancho?: number; alto?: number; radio?: number;
  grupoId?: string; capaId?: string;
}
export interface Arista3D {
  id: string; fuente: string; destino: string; tipo: "path"|"line";
  etiqueta: string; conMarcador: boolean;
}
export interface Capa3D { id: string; etiqueta: string; nodos: string[]; }
export interface EstructuraSvg { nodos: Nodo3D[]; aristas: Arista3D[]; capas: Capa3D[]; }
export interface Escena3D {
  tipo: "capas"|"despiece"|"planta-axonometrica"|"grafo";
  elementos: Array<{
    id: string; tipo: "nodo"|"arista"; posicion:[number,number,number];
    rotacion:[number,number,number]; escala:[number,number,number];
    datos: Nodo3D|Arista3D; caraACamara:boolean;
  }>;
}

function attr(s:string,k:string,q?:"d"|"s"):string|undefined{
  if(q==="s"){const r=new RegExp(k+"='([^']*)'");const m=s.match(r);if(m)return m[1];}
  const r=new RegExp(k+'="([^"]*)"');const m=s.match(r);return m?m[1]:undefined;
}
function num(v?:string){if(!v)return 0;const n=parseFloat(v);return isNaN(n)?0:n;}
function txt(v?:string){if(!v)return"";return v.replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").trim();}

export function estructuraDeSvg(svg:string):EstructuraSvg{
  const nodos:Nodo3D[]=[];const aristas:Arista3D[]=[];const capas:Capa3D[]=[];
  const mapa=new Map<string,Nodo3D>();
  // capas
  let mg:RegExpExecArray|null; const rg=/<g\s+([^>]*)>([\s\S]*?)<\/g>/gi;
  while((mg=rg.exec(svg))!==null){const a=mg[1],c=mg[2];const id=attr(a,"id","s")||attr(a,"id")||"";const cl=attr(a,"class","s")||attr(a,"class")||"";
    if(id.toLowerCase().includes("capa")||cl.toLowerCase().includes("capa")||id.toLowerCase().includes("layer")||cl.toLowerCase().includes("layer")){
      const ids:string[]=[];const rr=/<rect\s+([^>]*)/gi;let mr:RegExpExecArray|null;while((mr=rr.exec(c))!==null){ids.push(attr(mr[1],"id","s")||attr(mr[1],"id")||`n${ids.length}`);}
      const rc=/<circle\s+([^>]*)/gi;while((mr=rc.exec(c))!==null){ids.push(attr(mr[1],"id","s")||attr(mr[1],"id")||`c${ids.length}`);}
      capas.push({id,etiqueta:id||cl,nodos:ids});
    }}
  // rect
  let m:RegExpExecArray|null; const r1=/<rect\s+([^>]*)\/?>/gi;
  while((m=r1.exec(svg))!==null){const a=m[1];const id=attr(a,"id","s")||attr(a,"id")||`r${nodos.length}`;const n:Nodo3D={id,tipo:"rect",etiqueta:"",x:num(attr(a,"x","s")||attr(a,"x")),y:num(attr(a,"y","s")||attr(a,"y")),ancho:num(attr(a,"width","s")||attr(a,"width")),alto:num(attr(a,"height","s")||attr(a,"height"))};nodos.push(n);mapa.set(id,n);}
  // circle/ellipse
  const r2=/<circle\s+([^>]*)\/?>/gi;while((m=r2.exec(svg))!==null){const a=m[1];const id=attr(a,"id","s")||attr(a,"id")||`c${nodos.length}`;const n:Nodo3D={id,tipo:"circulo",etiqueta:"",x:num(attr(a,"cx","s")||attr(a,"cx")),y:num(attr(a,"cy","s")||attr(a,"cy")),radio:num(attr(a,"r","s")||attr(a,"r"))};nodos.push(n);mapa.set(id,n);}
  const r3=/<ellipse\s+([^>]*)\/?>/gi;while((m=r3.exec(svg))!==null){const a=m[1];const id=attr(a,"id","s")||attr(a,"id")||`e${nodos.length}`;const n:Nodo3D={id,tipo:"circulo",etiqueta:"",x:num(attr(a,"cx","s")||attr(a,"cx")),y:num(attr(a,"cy","s")||attr(a,"cy")),radio:num(attr(a,"rx","s")||attr(a,"rx"))};nodos.push(n);mapa.set(id,n);}
  // text agrupados
  const r4=/<text\s+([^>]*)>([\s\S]*?)<\/text>/gi;while((m=r4.exec(svg))!==null){const a=m[1],cont=txt(m[2]);if(!cont)continue;const id=attr(a,"id","s")||attr(a,"id")||`t${nodos.length}`;const n:Nodo3D={id,tipo:"texto",etiqueta:cont,x:num(attr(a,"x","s")||attr(a,"x")),y:num(attr(a,"y","s")||attr(a,"y"))};nodos.push(n);mapa.set(id,n);}
  // path/line aristas
  const r5=/<path\s+([^>]*)\/?>/gi;while((m=r5.exec(svg))!==null){const a=m[1];aristas.push({id:attr(a,"id","s")||attr(a,"id")||`p${aristas.length}`,fuente:"",destino:"",tipo:"path",etiqueta:"",conMarcador:a.includes("marker")});}
  const r6=/<line\s+([^>]*)\/?>/gi;while((m=r6.exec(svg))!==null){const a=m[1];aristas.push({id:attr(a,"id","s")||attr(a,"id")||`l${aristas.length}`,fuente:"",destino:"",tipo:"line",etiqueta:"",conMarcador:a.includes("marker")});}
  for(const c of capas){for(const nid of c.nodos){const n=mapa.get(nid);if(n){n.capaId=c.id;n.grupoId=c.id;}}}
  return {nodos,aristas,capas};
}

export function escena3d(estructura:EstructuraSvg,tipo:"capas"|"despiece"|"planta-axonometrica"|"grafo"="capas"):Escena3D{
  const elementos:Escena3D["elementos"]=[];
  if(tipo==="capas"||tipo==="despiece"||tipo==="planta-axonometrica"){
    const capas=estructura.capas.length>0?estructura.capas:[{id:"default",etiqueta:"default",nodos:estructura.nodos.map(n=>n.id)}];
    let z=0;const sep=10;
    for(let i=0;i<capas.length;i++){const c=capas[i];
      for(const n of estructura.nodos){if(c.nodos.includes(n.id)||(!n.capaId&&i===0)){const cara=n.tipo==="texto";elementos.push({id:n.id,tipo:"nodo",posicion:[n.x/10,-n.y/10,z],rotacion:[0,0,0],escala:[1,1,1],datos:n,caraACamara:cara});}}
      z+=sep*(1+i*0.618);}
    for(const a of estructura.aristas){elementos.push({id:a.id,tipo:"arista",posicion:[0,0,z/2],rotacion:[0,0,0],escala:[1,1,1],datos:a,caraACamara:false});}
  }else{
    const total=estructura.nodos.length;const radio=Math.max(20,total*2);
    estructura.nodos.forEach((n,idx)=>{const ang=(idx/Math.max(1,total))*Math.PI*2;const alt=Math.sin(idx*0.618)*10;const cara=n.tipo==="texto";elementos.push({id:n.id,tipo:"nodo",posicion:[Math.cos(ang)*radio,alt,Math.sin(ang)*radio],rotacion:[0,-ang,0],escala:[1,1,1],datos:n,caraACamara:cara});});
    for(const a of estructura.aristas){elementos.push({id:a.id,tipo:"arista",posicion:[0,0,0],rotacion:[0,0,0],escala:[1,1,1],datos:a,caraACamara:false});}
  }
  return {tipo,elementos};
}
