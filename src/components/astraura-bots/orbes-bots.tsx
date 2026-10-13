"use client";
import {useEffect,useState,useRef,useCallback}from"react";
import{MAX_ORBES_VISIBLES,disposicionOrbes,type EntradaOrbe,type PosOrbe,type VistaOrbe,type ResultadoOrbe}from"@/lib/astraura-bots/orbes";
import{leerBots,suscribirBots,Bot}from"@/lib/astraura-bots/adaptadores/almacen-bots";
import{QuantumOrbAvatar}from"@/components/aurora/quantum-orb-avatar";
export interface OrbesBotsProps{perfilId:string;cuentaId:string;extra?:Bot[]}
export function OrbesBots({perfilId,cuentaId,extra=[]}:OrbesBotsProps){
  const[bots,setBots]=useState(()=>[...leerBots(perfilId,cuentaId),...extra]);
  const[vista,setVista]=useState({ancho:0,alto:0,diametro:0});
  const[positions,setPositions]=useState({});
  const[showMore,setShowMore]=useState(false);
  const dragRef=useRef(null);
  useEffect(()=>{
    if(typeof window==="undefined")return;
    const update=()=>{const ancho=window.innerWidth;const alto=window.innerHeight;const diametro=Math.min(ancho,alto)*0.1;setVista({ancho,alto,diametro})};
    update();
    window.addEventListener("resize",update);
    return()=>window.removeEventListener("resize",update);
  },[]);
  useEffect(()=>suscribirBots(()=>setBots(prev=>[...leerBots(perfilId,cuentaId),...extra])),[perfilId,cuentaId,extra]);
  useEffect(()=>{
    if(vista.ancho===0||vista.alto===0)return;
    const idPred=`astraura:${perfilId}`;
    const entradas:EntradaOrbe[]=bots.map(bot=>({id:bot.id,principal:bot.id===idPred}));
    const resultados:ResultadoOrbe[]=disposicionOrbes(entradas,vista);
    const newPositions:Record<string,PosOrbe>={};
    resultados.forEach(r=>{newPositions[r.id]=r.pos});
    setPositions(newPositions);
  },[bots,vista]);
  const handleOrbePointerDown=useCallback((e:React.PointerEvent,botId:string)=>{if(dragRef.current)return;const pos=positions[botId];if(!pos)return;dragRef.current={id:botId,startX:e.clientX,startY:e.clientY,startPos:{...pos}};e.preventDefault()},[positions]);
  const handleOrbePointerMove=useCallback((e:React.PointerEvent)=>{if(!dragRef.current||!dragRef.current.id)return;const dx=e.clientX-dragRef.current.startX;const dy=e.clientY-dragRef.current.startY;if(!dragRef.current.dragging&&Math.hypot(dx,dy)>8)dragRef.current.dragging=true;
  if(dragRef.current.dragging&&dragRef.current.startPos){const newPos:PosOrbe={xRatio:Math.max(0,Math.min(1,e.clientX/window.innerWidth)),yRatio:Math.max(0,Math.min(1,e.clientY/window.innerHeight))};setPositions(prev=>({...prev,[dragRef.current.id]:newPos}))}},[],);
  const handleOrbePointerUp=useCallback(()=>{if(!dragRef.current||!dragRef.current.id)return;
  const botId=dragRef.current.id;dragRef.current=null;
  const pos=positions[botId];if(pos){try{const saved=window.localStorage.getItem("starseed.astraura.bots.orbes.v1");const orbesMap=saved?JSON.parse(saved):{};orbesMap[botId]=pos;window.localStorage.setItem("starseed.astraura.bots.orbes.v1",JSON.stringify(orbesMap))}catch{}}},[positions]);
  const handleOrbePointerCancel=useCallback(()=>{dragRef.current=null},[]);
  const handleOrbeClick=useCallback((botId:string)=>{if(typeof window!=="undefined"){window.dispatchEvent(new CustomEvent("starseed:astraura-bot-enfocado",{detail:{id:botId}}))}},[]);
  const visibleBots=bots.filter(bot=>{const result=disposicionOrbes([{id:bot.id,principal:bot.id===`astraura:${perfilId}`}],vista)[0];return result.visible}).slice(0,MAX_ORBES_VISIBLES);
  const hiddenCount=bots.length-visibleBots.length;
  const hasHidden=hiddenCount>0;
  return(<div className="pointer-events-none">{visibleBots.map(bot=>{const pos=positions[botId];if(!pos)return null;
  const left=`calc(${(pos.xRatio*100).toFixed(3)}vw-18px)`;
  const top=`calc(${(pos.yRatio*100).toFixed(3)}dvh-18px)`;
  return(<div key={botId} className="fixed z-50" style={{left:top,pointerEvents:"all"}}><div className="relative flex items-center justify-center" style={{width:36,height:36}} onPointerDown={e=>handleOrbePointerDown(e,bot.id)} onPointerMove={handleOrbePointerMove} onPointerUp={handleOrbePointerUp} onPointerCancel={handleOrbePointerCancel} onClick={()=>handleOrbeClick(bot.id)} aria-label={bot.nombre}><QuantumOrbAvatar personaId={bot.id} size={36}/></div></div>);})}
  {hasHidden&&(<div className="fixed z-50 pointer-events-none"><div className="fixed bottom-4 right-4"><button type="button" className="flex items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground hover:bg-muted" aria-label={`Ver ${hiddenCount} bots ocultos`} onClick={()=>setShowMore(!showMore)}><span>Más</span><span className="badge rounded-full bg-muted px-1.5 py-0.5 text-xs">{hiddenCount}</span></button>
  {showMore&&(<div className="mt-2 w-48 rounded-lg border border-border bg-background shadow-lg z-50"><div className="space-y-1 p-1"><p className="text-xs">Bots ocultos:</p>{bots
    .filter(bot=>{const result=disposicionOrbes([{id:bot.id,principal:bot.id===`astraura:${perfilId}`}],vista)[0];return !result.visible})
    .map(bot=>(<div key={botId} className="flex items-center gap-1 px-1 py-1 text-xs"><div className="h-2 w-2 rounded-full bg-muted"/><span>{bot.nombre}</span></div>))}
  </div></div>)}</div></div>)}
</div>);
}