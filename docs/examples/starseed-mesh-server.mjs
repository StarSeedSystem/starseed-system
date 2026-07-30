// La implementación de referencia del servidor propio se MOVIÓ a un paquete:
//
//     docs/examples/starseed-mesh-server/          (index.mjs + package.json + README.md)
//
// El paquete añade persistencia Postgres (además de SQLite/memoria), autenticación
// de grupo (tokens → identidades cuenta/grupo) y federación entre servidores propios.
//
//   cd docs/examples/starseed-mesh-server && node index.mjs
//
// Contrato: architecture/servidor-propio-protocolo.md
