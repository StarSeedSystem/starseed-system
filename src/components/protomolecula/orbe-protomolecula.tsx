"use client";
import {useEffect,useRef,useState}from"react";
import {usePathname}from"next/navigation";
import {
  TAMANO_ORBE,
  leerPosicion,
  guardarPosicion,
  leerActivada,
  PROTO_ORB_ABRIR_EVENT,
  PROTO_ORB_FAB_EVENT,
}from"@/lib/protomolecula/orbe-bus";
export function OrbeProtomolecula(){
  const[pos,setPos]=useState({x:0,y:0});
  const[activada,setActivada]=useState(false);
  const[panelAbierto,setPanelAbierto]=useState(false);
  const[dragging,setDragging]=useState(false);
  const[dragStart,setDragStart]=useState<{x: number, y: number} | null>(null);
  const ref=useRef<HTMLDivElement>(null);
  const pathname=usePathname();
  useEffect(()=>{
    if(typeof window!=="undefined"){
      const viewport={ancho:window.innerWidth,alto:window.innerHeight};
      setPos(leerPosicion(window.localStorage,viewport));
      setActivada(leerActivada(window.localStorage));
    }
  },[]);
  useEffect(()=>{
    const storageHandler=(e: StorageEvent)=>{
      if(e.key==="starseed.protomolecula.orbe.enabled.v1")setActivada(e.newValue!=="false");
      if(e.key==="starseed.protomolecula.orbe.pos.v1"&&e.newValue){
        const pos=JSON.parse(e.newValue);
        setPos({x:pos.x,y:pos.y});
      }
    };
    const focusHandler=()=>{if(typeof window!=="undefined")setActivada(leerActivada(window.localStorage))};
    window.addEventListener("storage",storageHandler);
    window.addEventListener("focus",focusHandler);
    return()=>{window.removeEventListener("storage",storageHandler);window.removeEventListener("focus",focusHandler)};
  },[]);
  useEffect(()=>{
    const openHandler=()=>activada&&setPanelAbierto(true);
    const fabHandler=()=>typeof window!=="undefined"&&setActivada(leerActivada(window.localStorage));
    window.addEventListener(PROTO_ORB_ABRIR_EVENT,openHandler);
    window.addEventListener(PROTO_ORB_FAB_EVENT,fabHandler);
    return()=>{window.removeEventListener(PROTO_ORB_ABRIR_EVENT,openHandler);window.removeEventListener(PROTO_ORB_FAB_EVENT,fabHandler)};
  },[activada]);
  useEffect(()=>{
    const escHandler=(e: KeyboardEvent)=>e.key==="Escape"&&panelAbierto&&setPanelAbierto(false);
    const clickOutsideHandler=(e: MouseEvent)=>{
      if(panelAbierto&&ref.current&&!ref.current.contains(e.target as Node)){
        setPanelAbierto(false);
      }
    };
    window.addEventListener("keydown",escHandler);
    window.addEventListener("mousedown",clickOutsideHandler);
    return()=>{window.removeEventListener("keydown",escHandler);window.removeEventListener("mousedown",clickOutsideHandler);};
  },[panelAbierto,ref]);
  const pointerDown=(e: React.PointerEvent)=>{if(!activada)return;setDragStart({x:e.clientX,y:e.clientY});};
  const pointerMove=(e: React.PointerEvent)=>{if(!dragStart)return;const dx=e.clientX-dragStart.x,dy=e.clientY-dragStart.y;if(Math.hypot(dx,dy)>5){setDragging(true);moveTo(e.clientX,e.clientY);}};
  const pointerUp=(e: React.PointerEvent)=>{if(!dragStart)return;if(Math.hypot(e.clientX-dragStart.x,e.clientY-dragStart.y)<=5&&activada)setPanelAbierto(!panelAbierto);setDragStart(null);setDragging(false);};
  function moveTo(clientX: number, clientY: number){
    if(!ref.current)return;
    const viewport={ancho:window.innerWidth,alto:window.innerHeight};
    const newPos={x:pos.x+(clientX-dragStart!.x),y:pos.y+(clientY-dragStart!.y)};
    const limitedPos=limitPos(newPos,viewport);
    setPos(limitedPos);
    guardarPosicion(window.localStorage,limitedPos);
  }
  function limitPos(pos: {x: number, y: number}, viewport: {ancho: number, alto: number}){
    return{
      x:Math.min(Math.max(0,pos.x),viewport.ancho-TAMANO_ORBE),
      y:Math.min(Math.max(0,pos.y),viewport.alto-TAMANO_ORBE)
    };
  }
  if(!activada)return null;
  return(
    <>
      <div
        ref={ref}
        role="button"
        aria-label="Protomolécula"
        aria-expanded={panelAbierto}
        tabIndex={0}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" ")e.preventDefault(),setPanelAbierto(!panelAbierto);}}
        style={{
          position:"fixed",
          left:pos.x,
          top:pos.y,
          width:TAMANO_ORBE,
          height:TAMANO_ORBE,
          backgroundColor:"#8B5CF6",
          borderRadius:"50%",
          display:"flex",
          alignItems:"center",
          justifyContent:"center",
          cursor:"pointer",
          zIndex:1000,
          boxShadow:"0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -1px rgba(0,0,0,0.06)",
          userSelect:"none",
          touchAction:"none"
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="9" opacity="0.2" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5.636 5.636l1.414 1.414M16.95 16.95l1.414 1.414M5.636 18.364l1.414-1.414M16.95 7.05l1.414-1.414" />
        </svg>
      </div>
      {panelAbierto&&(<div style={{position:"fixed",left:pos.x,top:pos.y-100,zIndex:1001,backgroundColor:"#8B5CF6",color:"white",padding:"16px",borderRadius:"8px"}}>Panel Protomolécula (placeholder)</div>)}
    </>
  );
}
export default OrbeProtomolecula;