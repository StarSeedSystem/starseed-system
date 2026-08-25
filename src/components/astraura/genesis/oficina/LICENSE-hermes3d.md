# Licencia de Hermes3D (MIT)

Esta carpeta (`src/components/astraura/genesis/oficina/`) porta la **arquitectura y el
concepto** de la oficina 3D de [Hermes3D](https://github.com/iamlukethedev/Hermes3D)
— salas navegables con ocupantes que trabajan y muestran actividad, sobre un backend
"gateway-first" que posee el estado real — adaptados al contrato, la biblioteca de
avatares (`AvatarSer`, derivado del ADN de cada ser) y el lenguaje visual propios de
StarSeed. No se ha copiado código de Hermes3D línea a línea: los ficheros de esta
carpeta son escritura nueva. Aun así, la atribución de la licencia MIT original es
obligatoria porque el diseño y varias decisiones concretas (ver comentarios de
cabecera de cada fichero marcados "Portado de Hermes3D") están inspirados
directamente en su código fuente.

- Proyecto original: **Hermes3D**, https://github.com/iamlukethedev/Hermes3D
- Autor: **Luke The Dev** (https://x.com/iamlukethedev)
- Copyright: © 2026 Luke The Dev
- Licencia: MIT (texto íntegro y sin modificar más abajo)

Ficheros de esta carpeta que citan explícitamente una idea o patrón de Hermes3D en su
comentario de cabecera: `oficina-escena-3d.tsx` (cámara/navegación entre salas),
`oficina-salas.ts` y `oficina-ocupantes.ts` (modelo sala/ocupante/actividad),
`oficina-honestidad.ts` (la distinción "hay backend real vs. modo demo simulado" que
Hermes3D resuelve con su `demo-gateway-adapter.js`, y que aquí se invierte
deliberadamente: por defecto la oficina StarSeed NO simula actividad).

---

## Texto íntegro de la licencia MIT (Hermes3D)

```
MIT License

Copyright (c) 2026 Luke The Dev

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
