const perfilMedio = require('./src/lib/astraura/capas/perfil-medio');

const entorno = {
  getWebGLRenderingContext: () => {},
  navigator: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    connection: { effectiveType: '4g', saveData: false },
    storage: { estimate: () => ({ quota: 10 * 1024 * 1024, usage: 2 * 1024 * 1024 }) },
    getBattery: () => ({ level: 1.0 }),
    visibilityState: 'visible',
    crossOriginIsolated: true,
    standalone: false,
    __TAURI__: true,
  },
};

console.log('=== medirPerfil ===');
const perfil = perfilMedio.medirPerfil(entorno);
console.log('plataforma:', perfil.plataforma);
console.log('storage.cuota:', perfil.storage.cuota);
console.log('storage.persist:', perfil.storage.persist);
console.log('visibilidad:', perfil.visibilidad);
console.log('saveData:', perfil.saveData);
console.log('conexion:', perfil.conexion);
console.log('bateria:', perfil.bateria);
