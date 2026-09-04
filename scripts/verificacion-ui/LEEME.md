# Verificación de la interfaz con navegador real

Scripts de Playwright que abren Chrome contra `localhost:9002`, inician sesión y recogen los
errores de consola de cada pantalla. Los escribió Hermes el 2026-09-04; estaban sueltos en la
raíz del repositorio y se recogen aquí para que no ensucien el árbol y se puedan reutilizar.

Sirven para lo único que ni `tsc` ni `vitest` ni la revisión cruzada detectan: que la página
**funcione de verdad** al abrirla. Así se encontró el error de claves duplicadas del Puente de
Mando, con el commit ya integrado y las tres puertas en verde.

- `verify_ui_final.js` — el más completo: login y recorrido con recogida de errores.
- `verify_ui_playwright*.js` — versiones previas del mismo recorrido.
- `check-login.js`, `debug_login*.js` — sondas del inicio de sesión.

Requiere `playwright` y Chrome instalado. Se ejecutan con `node scripts/verificacion-ui/<archivo>`.
