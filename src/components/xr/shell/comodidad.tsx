'use client';
import { opacidadVineta, siguienteGiro, type PreferenciasConfort } from '../../../lib/xr/confort';
export function puedeMostrarSubtitulos(c: PreferenciasConfort){ return c.subtitulos; }
export function posturaActual(c: PreferenciasConfort){ return c.postura; }
export function opacidadParaMovimiento(c: PreferenciasConfort, lineal:number, angular:number){ return opacidadVineta(c,{lineal,angularGradosS:angular}); }
export function yawTrasSaltos(yaw:number, pasos:number, dir:-1|1, c: PreferenciasConfort){ let y=yaw; for(let i=0;i<pasos;i++) y=siguienteGiro(y,dir,c); return y; }
export function Comodidad(){ return null; }
