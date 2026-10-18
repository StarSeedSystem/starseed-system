function normalizarParaDistancia(texto) {
  return texto.toLowerCase().replace(/\s+/g, '');
}

function distanciaEdicionNormalizada(str1, str2) {
  const s1 = normalizarParaDistancia(str1);
  const s2 = normalizarParaDistancia(str2);
  
  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length / Math.max(1, s2.length);
  if (s2.length === 0) return s1.length / Math.max(1, s1.length);
  
  const matriz = Array(s1.length + 1).fill(null).map(() => Array(s2.length + 1).fill(0));
  
  for (let i = 0; i <= s1.length; i++) matriz[i][0] = i;
  for (let j = 0; j <= s2.length; j++) matriz[0][j] = j;
  
  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const costo = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matriz[i][j] = Math.min(
        matriz[i - 1][j] + 1,
        matriz[i][j - 1] + 1,
        matriz[i - 1][j - 1] + costo
      );
    }
  }
  
  return matriz[s1.length][s2.length] / Math.max(s1.length, s2.length);
}

// Probar el contenido real del glosario
const glosario = ['Astraura', 'StarSeed', 'StarSeed OS', 'MetaGenesis', 'PoliGenesis', 'Genesis', 'ProtoGenesis', 'Aurora', 'Hermes', 'Servicio StarSeed', 'Motor StarSeed', 'Estora', 'Astora', 'Star Sed', 'Star Said'];

// Probar palabras de las pruebas
const testWords = ['Estora', 'Star Sed', 'Star Said', 'StarSead', 'Astraura', 'Estoy', 'Astora'];

console.log('=== Pruebas de distancias ===');
for (const palabra of testWords) {
  console.log(`\nEntrada: "${palabra}" -> normalizada: "${normalizarParaDistancia(palabra)}"`);
  for (const glosarioItem of glosario) {
    const distancia = distanciaEdicionNormalizada(palabra, glosarioItem);
    if (distancia <= 0.34) {
      console.log(`  vs "${glosarioItem}": distancia = ${distancia.toFixed(3)} (≤ 0.34) - DEBERÍA CORREGIR`);
    }
  }
}
