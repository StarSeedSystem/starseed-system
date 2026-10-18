
import { validarArgs, type AccionOrden } from './src/lib/metagenesis/remoto-nodos';

console.log('Test 1: { activo: false, trabajadores: 1 }');
console.log(validarArgs('contenedor' as AccionOrden, { activo: false, trabajadores: 1 }));

console.log('Test 2: { activo: false, trabajadores: 0 }');
console.log(validarArgs('contenedor' as AccionOrden, { activo: false, trabajadores: 0 }));

