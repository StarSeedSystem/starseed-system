import { paletaDeMuestra } from 'src/lib/design/paleta-fondo';

const pixeles = [
  { r: 255, g: 100, b: 50, a: 1 },
  { r: 250, g: 90, b: 60, a: 1 },
  { r: 240, g: 80, b: 70, a: 1 },
  { r: 100, g: 200, b: 150, a: 1 },
  { r: 90, g: 180, b: 140, a: 1 },
  { r: 110, g: 190, b: 160, a: 1 },
];

console.log("Resultados de prueba del algoritmo k-means determinista:");
const colores = paletaDeMuestra(pixeles, 2);

console.log("Número de colores:", colores.length);
for (let i = 0; i < colores.length; i++) {
  const c = colores[i];
  console.log(`${i}: nombre=${c.nombre}, peso=${c.peso}, rgba=(${c.rgba.r},${c.rgba.g},${c.rgba.b},${c.rgba.a})`);
}

console.log("\n¿Peso 0 > Peso 1?", colores[0].peso > colores[1].peso);
