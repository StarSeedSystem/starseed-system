// Malla cristalina SiO₂ amorfa: motor puro
import { NeuronaReticula, SenalMedida, Tesela, Reticula, Cristal, EstadoVitreo } from "./tipos";
import { huellaReticula, fusionarTesela, crearTesela } from "./teselas";
import { cristalizar, temperaturaDe, estadoDe } from "./cristalizacion";
import { relajarLocal } from "./recocido";
import { calidadSenal } from "./coste";
import { esTitanio, temperaturaAmortiguada } from "./titanio";

export function crearMotorCristal(deps: {
  miNeurona: () => NeuronaReticula;
  medir: () => Promise<SenalMedida[]>;
  reloj: () => number;
  firmar: (t: Tesela) => Promise<string | null>;
  difundir: (t: Tesela) => void;
  ahora: () => number;
}) {
  let reticula: Reticula = { teselas: {} };
  let cristal: Cristal | null = null;
  let suscriptores: (() => void)[] = [];
  let ultimaVuelta = 0;
  const historialCalidad: Record<string, Array<{t: number; calidad: number}>> = {};

  const calcularHuella = (r: Reticula): string => huellaReticula(r);
  const fusionarTeselaEntrante = (t: Tesela) => { reticula = fusionarTesela(reticula, t); };
  const actualizarHistorial = (senales: SenalMedida[], ahora: number) => {
    const ventana = 120000;
    for (const s of senales) {
      const clave = s.de < s.a ? `${s.de}|${s.a}|${s.medio}` : `${s.a}|${s.de}|${s.medio}`;
      const cal = calidadSenal(s);
      const arr = historialCalidad[clave] ?? [];
      arr.push({ t: ahora, calidad: cal });
      historialCalidad[clave] = arr.filter(e => ahora - e.t <= ventana);
    }
  };
  const tempDelNodo = (ahora: number) => {
    const miId = deps.miNeurona().id;
    const vals: number[] = [];
    for (const clave in historialCalidad) {
      const [a, b] = clave.split('|');
      if (a === miId || b === miId) {
        for (const e of historialCalidad[clave]) vals.push(e.calidad);
      }
    }
    const base = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0.5;
    // Amortiguar según vecinos titanio presentes en la retícula
    const vecinosIds = new Set<string>();
    const vecinosTi = new Set<string>();
    for (const t of Object.values(reticula.teselas)) {
      for (const s of t.senales) {
        if ((s.de === miId || s.a === miId) && s.de !== s.a) {
          const otro = s.de === miId ? s.a : s.de;
          vecinosIds.add(otro);
          const neuronaOtro = Object.values(reticula.teselas).find(tt => tt.neurona.id === otro)?.neurona;
          if (neuronaOtro && esTitanio(neuronaOtro)) vecinosTi.add(otro);
        }
      }
    }
    return temperaturaAmortiguada(base, vecinosTi.size, vecinosIds.size);
  };
  const relocal = (cambiadas: string[]) => { cristal = relajarLocal(cristal, reticula, cambiadas); };
  const tempMap = async (ahora: number) => {
    const hist: Array<{clave: string; t: number; calidad: number}> = [];
    for (const clave in historialCalidad) {
      for (const e of historialCalidad[clave]) hist.push({ clave, t: e.t, calidad: e.calidad });
    }
    return temperaturaDe(hist, 120000, ahora);
  };
  const medirYActualizar = async () => {
    const neurona = deps.miNeurona();
    const senales = await deps.medir();
    const reloj = deps.reloj();
    const tesela = crearTesela(neurona, senales, reloj);
    const firma = await deps.firmar(tesela);
    const teselaConFirma = { ...tesela, firma: firma ?? undefined };
    fusionarTeselaEntrante(teselaConFirma);
    deps.difundir(teselaConFirma);
    actualizarHistorial(senales, deps.ahora());
    relocal([neurona.id]);
    const ttlMs = 3 * 60000;
    reticula = { teselas: Object.fromEntries(
      Object.entries(reticula.teselas).filter(([, t]) => deps.ahora() - t.reloj <= ttlMs)
    ) };
    cristal = cristalizar(reticula, { temperatura: await tempMap(deps.ahora()) });
    suscriptores.forEach(f => f());
  };
  return {
    vuelta: async () => {
      await medirYActualizar();
      ultimaVuelta = deps.ahora();
    },
    recibir: (t: Tesela) => {
      fusionarTeselaEntrante(t);
      actualizarHistorial(t.senales, deps.ahora());
      relocal([t.origen]);
      ultimaVuelta = deps.ahora();
    },
    intervaloMs: () => {
      const temp = tempDelNodo(deps.ahora());
      switch (estadoDe(temp)) {
        case 'fundido': return 5000;
        case 'subenfriado': return 15000;
        case 'vitreo': return 60000;
        default: return 15000;
      }
    },
    estado: () => {
      const hist = Object.entries(historialCalidad).flatMap(([k, a]) => a.map(e => ({ clave: k, t: e.t, calidad: e.calidad })));
      const tempMap = temperaturaDe(hist, 120000, deps.ahora());
      const cristalActual = cristalizar(reticula, { temperatura: tempMap });
      const miHuella = huellaReticula(reticula);
      const vecinos = Object.values(reticula.teselas).reduce((c, t) => 
        c + (t.origen !== deps.miNeurona().id && t.huella === miHuella ? 1 : 0), 0);
      return {
        reticula,
        cristal: cristalActual,
        huella: miHuella,
        vecinosConMismaHuella: vecinos,
        ultimaVuelta
      };
    },
    suscribir: (fn: () => void) => {
      suscriptores.push(fn);
      return () => { suscriptores = suscriptores.filter(f => f !== fn); };
    }
  };
}