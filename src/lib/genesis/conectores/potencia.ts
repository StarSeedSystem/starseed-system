export type Medida = {
   tokensPorSeg: number | null;
   aciertos: number | null;
   intentos: number;
   latenciaMs: number | null;
   capa: string | null;
 };

 export type ResultadoPotencia = {
   puntuacion: number;
   motivo: string;
   confianza: number;
 };

 export function puntuarPotencia(
   medidas: Medida[],
   papel: string
 ): ResultadoPotencia {
   if (medidas.length === 0) {
     return { puntuacion: 0, motivo: 'Sin medidas', confianza: 0 };
   }

   let suma = 0;
   let count = 0;
   for (const m of medidas) {
     const tokens = m.tokensPorSeg ?? 0;
     const aciertos = m.aciertos ?? 0;
     const latencia = m.latenciaMs ?? 0;
     // Base potency: tokens per second + aciertos*10 - latency penalty
     let potency = tokens + aciertos * 10 - latencia / 10;
     // Adjust for papel: for escritor, low tokens/s reduces potency
     if (papel === 'escritor' && tokens < 50) {
       potency *= 0.5;
     }
     // For other papeles, could adjust but we keep simple
     suma += potency;
     count++;
   }
   const puntuacion = count > 0 ? suma / count : 0;
   // Confianza: proportion of measures with all fields non-null
   const conTodos = medidas.filter(m => m.tokensPorSeg !== null && m.aciertos !== null && m.latenciaMs !== null).length;
   const confianza = conTodos / medidas.length;
   const motivo = confianza > 0 ? 'Potencia calculada' : 'Algunos datos no verificados';
   return { puntuacion, motivo, confianza };
 }

 export function ordenarPorPotencia(
   medidas: Medida[],
   papel: string
 ): Medida[] {
   // Sort descending by potency score for the given papel
   return [...medidas].sort((a, b) => {
     const potencyA = calcularPotencia(a, papel);
     const potencyB = calcularPotencia(b, papel);
     return potencyB - potencyA;
   });
 }

 function calcularPotencia(m: Medida, papel: string): number {
   const tokens = m.tokensPorSeg ?? 0;
   const aciertos = m.aciertos ?? 0;
   const latencia = m.latenciaMs ?? 0;
   let potency = tokens + aciertos * 10 - latencia / 10;
   if (papel === 'escritor' && tokens < 50) {
     potency *= 0.5;
   }
   return potency;
 }