const glosario = ['Astraura', 'StarSeed', 'StarSeed OS', 'MetaGenesis', 'PoliGenesis', 'Genesis', 'ProtoGenesis', 'Aurora', 'Hermes', 'Servicio StarSeed', 'Motor StarSeed', 'Estora', 'Astora', 'Star Sed', 'Star Said'];

// Test cases from the test file
testCases = [
  { input: 'Estora', expectedToCorrect: true },
  { input: 'Astora', expectedToCorrect: true },
  { input: 'Star Sed', expectedToCorrect: true },
  { input: 'Star Said', expectedToCorrect: true },
  { input: 'StarSead', expectedToCorrect: false },
  { input: 'Astraura', expectedToCorrect: false },
  { input: 'el Astraura', expectedToCorrect: false },
  { input: 'the Astraura', expectedToCorrect: false },
  { input: 'Estoy usando Star Sed y Astora', expectedChanges: 2 },
  { input: 'Estora, Astora!', expectedChanges: 2 },
  { input: 'estora', expectedCorrectedTo: 'Astraura', esExacto: false }
];

console.log('=== Análisis de test cases ===');
for (const test of testCases) {
  console.log(`\nTest: "${test.input}" -> expected corrections: ${test.expectedToCorrect}`);
  const exact = glosario.includes(test.input);
  console.log(`  Está exactamente en glosario? ${exact}`);
  console.log(`  DEBERÍA corregir? ${!exact}`);
}
