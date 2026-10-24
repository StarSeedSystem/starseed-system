import fs from "fs";
import path from "path";

const filePath = path.join(process.cwd(), "src/lib/design/paleta-fondo.ts");
const content = fs.readFileSync(filePath, "utf-8");

// Simple test
const pixeles = [
  { r: 255, g: 100, b: 50, a: 1 },
  { r: 250, g: 90, b: 60, a: 1 },
  { r: 240, g: 80, b: 70, a: 1 },
  { r: 100, g: 255, b: 150, a: 1 },
  { r: 90, g: 245, b: 140, a: 1 },
  { r: 110, g: 260, b: 160, a: 1 },
];

console.log("Pixeles de prueba:");
console.log(pixeles);

console.log("\nPara entender por qué todos los pixeles se asignan al mismo centroide, considere que el algoritmo podría estar encontrando que todos los centros son iguales al inicio, o la asignación podría estar funcionando pero el algoritmo de convergencia no está cambiando nada.");

const fs = require("fs");
const filepath = "test-data.txt";
fs.writeFileSync(filepath, "Pixeles: " + JSON.stringify(pixeles));
