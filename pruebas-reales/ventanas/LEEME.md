# Auditoría de ventanas (VEN1111D)

Monta primitivas reales del OS (Dialog, AlertDialog, Sheet, Popover, DropdownMenu, Select, Tabs y el
asistente de permisos) con contenido largo y mide, en Chromium, que nada quede fuera de la pantalla,
que cada acción sea alcanzable y que no haya texto recortado, a 320×568, 360×640, 390×844, 640×360 y 768×1024.

Uso (en un contenedor con Node y Playwright, NO en el Mac de producción):
1. Extraer `src/components/ui`, `src/components/nativa`, `src/lib/{nativa,ui,utils.ts}`, `src/app/globals.css`,
   `src/styles` y `tailwind.config.ts` en `$VEN_BASE/despues/` (y la versión anterior en `$VEN_BASE/antes/`).
2. `npm i react@19 react-dom@19 esbuild tailwindcss@3 tailwindcss-animate @radix-ui/react-{dialog,alert-dialog,popover,dropdown-menu,tabs,select,menubar,icons} lucide-react class-variance-authority clsx tailwind-merge`
3. `node build.mjs despues && node build.mjs antes && python3 medir.py` (usa `VEN_BASE`).

Ventanas hechas a mano (no montables fuera de la app): se arreglan con las clases `ss-capa-modal` +
`ss-ventana-limite` (globals.css); el test `ventanas-sin-recorte.test.ts` impide crear otras sin límites.
