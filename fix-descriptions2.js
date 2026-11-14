const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, 'assets', 'readme', 'capturas', 'capturas.json');
const capturas = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

// Better descriptions for each screen
const descriptions = {
  'inicio-noche': 'Panel principal Inicio: clima actual en Cuernavaca, astronomía (Sol en Escorpio, Luna en Capricornio), hora dorada, y accesos rápidos a 8 áreas temáticas',
  'inicio-nieve': 'Panel principal Inicio (tema nieve): clima, astronomía y navegación a 8 áreas con fondo claro',
  'politica-noche': 'Sección Política: gobernanza y propuestas ciudadanas, lista de iniciativas con estado y votación',
  'politica-nieve': 'Sección Política (tema nieve): propuestas y gobernanza con fondo claro',
  'educacion-noche': 'Sección Educación: Astraura 1.58, recursos educativos y módulos de aprendizaje',
  'educacion-nieve': 'Sección Educación (tema nieve): Astraura y recursos educativos con fondo claro',
  'cultura-noche': 'Sección Cultura: Biblioteca, lienzo cultural, medios y archivos creativos',
  'cultura-nieve': 'Sección Cultura (tema nieve): Biblioteca y lienzo con fondo claro'
};

capturas.forEach(c => {
  const key = `${c.name || c.pantalla.toLowerCase()}-${c.tema}`;
  // Match by archivo name
  const archivoKey = c.archivo.replace('.webp', '');
  if (descriptions[archivoKey]) {
    c.descripcion = descriptions[archivoKey];
  }
});

fs.writeFileSync(jsonPath, JSON.stringify(capturas, null, 2));
console.log('Updated capturas.json with better descriptions');
capturas.forEach(c => console.log(`  ${c.archivo}: ${c.descripcion}`));
