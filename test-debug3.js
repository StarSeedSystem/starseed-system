const glosario = ['Astraura', 'StarSeed', 'StarSeed OS', 'MetaGenesis', 'PoliGenesis', 'Genesis', 'ProtoGenesis', 'Aurora', 'Hermes', 'Servicio StarSeed', 'Motor StarSeed', 'Estora', 'Astora', 'Star Sed', 'Star Said'];

// Test: Astraura -> Astraura (ya correcto)
console.log('Test: "Astraura" -> "Astraura" (ya correcto)');
const exactAstraura = glosario.includes('Astraura');
console.log('  "Astraura" está exactamente en glosario?', exactAstraura);
console.log('  DEBERÍA corregir?', !exactAstraura);
console.log();

// Test: Star Sed -> StarSeed
console.log('Test: "Star Sed" -> "StarSeed"');
const exactStarSed = glosario.includes('Star Sed');
console.log('  "Star Sed" está exactamente en glosario?', exactStarSed);
console.log('  DEBERÍA corregir?', !exactStarSed);
console.log();

// Test: StarSead -> StarSeed (ya correcto)
console.log('Test: "StarSead" -> "StarSeed" (ya correcto)');
const exactStarSead = glosario.includes('StarSead');
console.log('  "StarSead" está exactamente en glosario?', exactStarSead);
console.log('  DEBERÍA corregir?', !exactStarSead);
