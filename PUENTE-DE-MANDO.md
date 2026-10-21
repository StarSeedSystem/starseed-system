TIP1013B completada: Puertas a internet opcionales implementadas

Archivos creados:
1. src/lib/malla/cristal/puertas-internet.ts (120 líneas exactas)
2. src/lib/malla/cristal/__tests__/puertas-internet.test.ts (27 pruebas)

Implementación cumpliendo con arquitectura/malla-cristalina-sio2.md §8 y §8.1:
- Exportadas TIPOS_PUERTA y COMPARTIR como const
- Interfaces PuertaInternet y Solicitante definidas
- Funciones puras implementadas:
  * restanteParaOtrosMb: calcula datos disponibles para otros
  * puedeUsar: verifica permisos considerando propietario vs otros y configuración de compartir
  * costePuerta: cálculo determinista con factores de medida y uso >80%
  * elegirPuerta: selecciona puerta óptima con histéresis (20%) y desempate por ID
  - Caso especial: sin necesitaInternet → null con mensaje "va por la malla P2P: no necesita salir a internet"
  - Conserva puerta actual si su coste ≤ mejor × 1.2 (histéresis)
  - Ninguna puerta permitida → null con motivo apropiado
  * puertaParaTesela: lista blanca que excluye iccid, imsi, pin, telefono

Características técnicas:
- Código TypeScript estricto sin uso de 'any'
- Módulo puro sin dependencias de node:*, Supabase o window
- Comentarios en español con acentos adecuados
- Todas las 27 pruebas unitarias pasando (vitest)
- Límites de línea respetados (≤120 líneas por archivo)

Pruebas cubriendo:
- Funcionalidad básica de cada función
- Edge cases (límites, valores nulos, etc.)
- Lógica de histéresis en elegirPuerta
- Caso de no necesita internet
- Lista blanca en puertaParaTesela
- Todos los caminos de permiso en puedeUsar (propietario, nadie, mi-cuenta, vinculos, grupo, público)