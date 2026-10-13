import { FragmentoMemoria } from "@/lib/nucleo/alcance-memoria";
import type { Medio } from "./tipos";

/** Cuota de memoria por medio en bytes. Editable con un factor. */
export const CUOTA_POR_MEDIO: Record<Medio, number> = {web:5*1024*1024,pwa:50*1024*1024,nativo:500*1024*1024,servidor:2*1024*1024*1024,xr:20*1024*1024};

/**
 * Recuerdo de un bot, implementa el fragmento de memoria base con metadatos de uso.
 */
export class RecuerdoBot implements FragmentoMemoria {
  constructor(public id:string,public alcance:FragmentoMemoria["alcance"],public texto:string,public origen:string,public at:number,public etiquetas:string[]|undefined,public readonly botId:string,public bytes:number,public usos:number,public fijado?:boolean){}

  /**
   * Calcula la relevancia de un recuerdo basado en usos y recencia.
   * @param r Recuerdo a puntuar
   * @param ahora Timestamp actual en ms
   * @return Puntuación de relevancia (mayor = más relevante)
   */
  public static puntuar(r:RecuerdoBot,ahora:number):number{
    const MEDIA_VIDA_DIAS=30;
    const MEDIA_VIDA_MS=MEDIA_VIDA_DIAS*24*60*60*1000;
    const LAMBDA=Math.LN2/MEDIA_VIDA_MS;
    const edadMs=ahora-r.at;
    const recencia=Math.exp(-LAMBDA*edadMs);
    return r.usos*recencia;
  }

  /**
   * Regular la memoria de un bot según su cuota.
   * @param recuerdos Lista de recuerdos a regular
   * @param cuotaBytes Cuota máxima en bytes para este medio
   * @param ahora Timestamp actual en ms
   * @return Objeto con recuerdos a conservar y a olvidar
   */
  public static regular(recuerdos:RecuerdoBot[],cuotaBytes:number,ahora:number):{conservar:RecuerdoBot[],olvidar:RecuerdoBot[]}{
    const recuerdosConPuntuacion=recuerdos.map(r=>({recuerdo:r,puntuacion:this.puntuar(r,ahora)}));
    recuerdosConPuntuacion.sort((a,b)=>a.puntuacion-b.puntuacion);
    const conservar:RecuerdoBot[]=[...recuerdos];
    const olvidar:RecuerdoBot[]=[];
    let bytesActuales=recuerdos.reduce((sum,r)=>sum+r.bytes,0);
    for(const {recuerdo} of recuerdosConPuntuacion){
      if(recuerdo.fijado)continue;
      if(bytesActuales<=cuotaBytes)break;
      const indice=conservar.indexOf(recuerdo);
      if(indice>=0){
        conservar.splice(indice,1);
        olvidar.push(recuerdo);
        bytesActuales-=recuerdo.bytes;
      }
    }
    return {conservar,olvidar};
  }

  /**
   * Planifica la transferencia de recuerdos entre neuronas/cuentas.
   * @param recuerdos Recuerdos disponibles para transferir
   * @param origen Neurona y cuenta de origen
   * @param destinos Lista de destinos posibles
   * @return Plan de transferencia con destino y IDs de recuerdos a transferir
   */
  public static planTransferencia(recuerdos:RecuerdoBot[],origen:{neurona:string;cuentaId:string},destinos:{neurona:string;cuentaId:string;tipo:"propia"|"grupo"|"servidor-grupo";grupoId?:string}[]):{destino:typeof destinos[0];ids:string[]}[]{
    const plan:{destino:typeof destinos[0];ids:string[]}[]=destinos.map(destino=>({destino,ids:[]}));
    for(const recuerdo of recuerdos){
      let asignado=false;
      for(let i=0;i<plan.length&&!asignado;i++){
        const {destino}=plan[i];
        if(this.puedeTransferirARecuerdo(recuerdo,origen,destino)){
          if(!plan[i].ids.includes(recuerdo.id)){
            plan[i].ids.push(recuerdo.id);
            asignado=true;
          }
        }
      }
    }
    return plan.filter(entry=>entry.ids.length>0);
  }

  /**
   * Determina si un recuerdo puede transferirse a un destino dado.
   * @param recuerdo Recuerdo a transferir
   * @param origen Origen de la transferencia
   * @param destino Destino potencial
   * @return true si el recuerdo puede transferirse al destino
   */
  private static puedeTransferirARecuerdo(recuerdo:RecuerdoBot,origen:{neurona:string;cuentaId:string},destino:{neurona:string;cuentaId:string;tipo:"propia"|"grupo"|"servidor-grupo";grupoId?:string}):boolean{
    switch(recuerdo.alcance){
      case "personal":
      case "perfil":
        return destino.tipo==="propia"&&destino.cuentaId===origen.cuentaId;
      case "grupo":
        return (destino.tipo==="grupo"||destino.tipo==="servidor-grupo")&&destino.cuentaId===origen.cuentaId;
      case "publica":
        return true;
      default:
        return false;
    }
  }
}