// Simple test to debug k-means

const pixeles = [
  { r: 255, g: 100, b: 50, a: 1 },
  { r: 250, g: 90, b: 60, a: 1 },
  { r: 240, g: 80, b: 70, a: 1 },
  { r: 100, g: 255, b: 150, a: 1 },
  { r: 90, g: 245, b: 140, a: 1 },
  { r: 110, g: 260, b: 160, a: 1 },
];

console.log("Analizando pixeles (0-5: rojo-naranja, 3-5: verde):");
for (let i = 0; i < pixeles.length; i++) {
  const p = pixeles[i];
  console.log(`${i}: (${p.r}, ${p.g}, ${p.b}, ${p.a})`);
}

console.log("\nDistancias Euclideanas:");
console.log("0-3:", Math.sqrt(Math.pow(255-100, 2) + Math.pow(100-255, 2) + Math.pow(50-150, 2)));
console.log("0-4:", Math.sqrt(Math.pow(255-90, 2) + Math.pow(100-245, 2) + Math.pow(50-140, 2)));
console.log("0-5:", Math.sqrt(Math.pow(255-110, 2) + Math.pow(100-260, 2) + Math.pow(50-160, 2)));
console.log("1-3:", Math.sqrt(Math.pow(250-100, 2) + Math.pow(90-255, 2) + Math.pow(60-150, 2)));
console.log("1-4:", Math.sqrt(Math.pow(250-90, 2) + Math.pow(90-245, 2) + Math.pow(60-140, 2)));
console.log("1-5:", Math.sqrt(Math.pow(250-110, 2) + Math.pow(90-260, 2) + Math.pow(60-160, 2)));

const coloresClaros = pixeles.slice(0, 3);
const coloresOscuros = pixeles.slice(3, 6);

console.log("\nColores claros (grupo 0-2):", coloresClaros);
console.log("Colores oscuros (grupo 3-5):", coloresOscuros);

const promedioClaro = {
  r: Math.round(coloresClaros.reduce((s, p) => s + p.r, 0) / coloresClaros.length),
  g: Math.round(coloresClaros.reduce((s, p) => s + p.g, 0) / coloresClaros.length),
  b: Math.round(coloresClaros.reduce((s, p) => s + p.b, 0) / coloresClaros.length),
  a: Math.round(coloresClaros.reduce((s, p) => s + p.a, 0) / coloresClaros.length),
};

const promedioOscuro = {
  r: Math.round(coloresOscuros.reduce((s, p) => s + p.r, 0) / coloresOscuros.length),
  g: Math.round(coloresOscuros.reduce((s, p) => s + p.g, 0) / coloresOscuros.length),
  b: Math.round(coloresOscuros.reduce((s, p) => s + p.b, 0) / coloresOscuros.length),
  a: Math.round(coloresOscuros.reduce((s, p) => s + p.a, 0) / coloresOscuros.length),
};

console.log("\nCentroide claro (promedio):", promedioClaro);
console.log("Centroide oscuro (promedio):", promedioOscuro);
