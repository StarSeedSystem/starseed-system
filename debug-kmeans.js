import { paletaDeMuestra } from 'src/lib/design/paleta-fondo';

const pixeles = [
  { r: 255, g: 100, b: 50, a: 1 },
  { r: 250, g: 90, b: 60, a: 1 },
  { r: 240, g: 80, b: 70, a: 1 },
  { r: 100, g: 200, b: 150, a: 1 },
  { r: 90, g: 180, b: 140, a: 1 },
  { r: 110, g: 190, b: 160, a: 1 },
];

console.log("Pixeles de prueba:");
pixeles.forEach((p, i) => console.log(`${i}: [${p.r}, ${p.g}, ${p.b}, ${p.a}]`));

const colores = paletaDeMuestra(pixeles, 2);
console.log("\nResultados de la paleta de muestra (k=2):");
colores.forEach((c, i) => {
  console.log(`${i}: nombre=${c.nombre}, peso=${c.peso}, rgba=(${c.rgba.r},${c.rgba.g},${c.rgba.b},${c.rgba.a})`);
});

console.log("\nComparación de pesos:");
if (colores.length >= 2) {
  console.log(`Peso 0: ${colores[0].peso}`);
  console.log(`Peso 1: ${colores[1].peso}`);
  console.log(`¿Peso 0 > Peso 1? ${colores[0].peso > colores[1].peso}`);
}
