/**
 * ORDEN DE LOS AUMENTOS DE `three` (XR1010D, 2026-10-23). Va el PRIMERO del programa (`files` de `tsconfig.json`).
 *
 * Fallo real que destapó el primer import de `@react-three/xr`: tsc daba 33 errores en 10 archivos que no tocan XR
 * («Argument of type 'AmbientLight' is not assignable to parameter of type 'Object3D'», `THREE.Object3D` de
 * `@types/three/build/three.module` distinto del de `src/core/Object3D`). Causa, medida con programas mínimos:
 * TypeScript 5.9 funde los aumentos de módulo en el orden de los archivos, y `Object3D` se aumenta por DOS caminos:
 * `@types/three/src/renderers/common/Backend.d.ts` (llega con `three/webgpu`, p. ej. vía `GLTFLoader` → `KTX2Loader`)
 * aumenta `../../core/Object3D.js` directamente, y `@pmndrs/pointer-events` / `@pmndrs/xr` / `@pmndrs/uikit` aumentan
 * `'three'`, que re-exporta con `export *`. Si algún aumento de `'three'` (el de `three-mesh-bvh`, que trae drei, o los
 * de pmndrs) se funde ANTES que `Backend.d.ts`, la tabla de exportaciones de `'three'` queda guardada con el `Object3D`
 * sin fundir y salen dos clases distintas (depende del orden: medido). Cargar `three/webgpu` el primero lo evita en
 * cualquier orden posterior. Solo tipos (`import type`): no llega al paquete del navegador.
 */
import type {} from "three/webgpu";
