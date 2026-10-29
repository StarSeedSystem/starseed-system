import type { Parametro, EstadoValores } from "./tipos";
import type { ParametrosSesion } from "@/lib/estaciones/transmision-parametrica";

export function parametrosDeSesion(p: ParametrosSesion): { parametros: Parametro[]; valores: EstadoValores } {
  if (p.tipo === "omnifrecuencias") {
    const pars: Parametro[] = [];
    const vals: EstadoValores = {};
    p.entonacion.osciladores.forEach((o, i) => {
      const pref = `o${i}`;
      [["f","numero"],["vol","numero"],["x","numero"],["y","numero"],["z","numero"]].forEach(([k,t]) => {
        const id = `${pref}.${k}`;
        pars.push({ id, nombre: `${o.nombre ?? "Osc"} ${k}`, tipo: t as any, min: 0, max: 1, unidad: "" });
        vals[id] = (o as any)[k];
      });
    });
    return { parametros: pars, valores: vals };
  }
  const pars: Parametro[] = [];
  const vals: EstadoValores = {};
  Object.entries(p.visual).forEach(([k,v]) => {
    const tipo = typeof v === "number" ? "numero" : typeof v === "boolean" ? "booleano" : "opcion";
    pars.push({ id: k, nombre: k, tipo: tipo as any });
    vals[k] = v;
  });
  return { parametros: pars, valores: vals };
}

export function sesionDeParametros(parametros: Parametro[], valores: EstadoValores): ParametrosSesion | null {
  const tienePunto = parametros.some(p => p.id.includes("."));
  if (tienePunto) {
    const osciladores: any[] = [];
    const prefijos = new Set(parametros.map(p => p.id.split(".")[0]));
    prefijos.forEach(pref => {
      const o: any = { f: 440, onda: "sine", vol: 0.5, x: 0, y: 0, z: 0 };
      ["f","vol","x","y","z"].forEach(k => {
        const id = `${pref}.${k}`;
        if (id in valores) o[k] = valores[id];
      });
      osciladores.push(o);
    });
    if (osciladores.length) {
      return { tipo: "omnifrecuencias", entonacion: { osciladores, volumen: 0.7 } };
    }
  }
  const visual: Record<string, unknown> = {};
  parametros.forEach(p => { if (p.id in valores) visual[p.id] = valores[p.id]; });
  return { tipo: "audiomorphic", visual };
}
