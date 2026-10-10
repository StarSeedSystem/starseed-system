// qr.mjs — matriz de módulos de un código QR (paquete `qrcode` del repositorio). Uso: node qr.mjs <url> [nivel=M]
// Salida JSON: { url, tam, matriz:[[0|1…]] } con 2 módulos de margen claro ya incluidos (el resto del margen lo pone la tarjeta blanca).
import QRCode from "qrcode";

const url = process.argv[2];
const nivel = process.argv[3] || "M";
if (!url) {
  console.error("uso: node qr.mjs <url> [L|M|Q|H]");
  process.exit(2);
}
const q = QRCode.create(url, { errorCorrectionLevel: nivel });
const n = q.modules.size;
const B = 2;
const matriz = [];
for (let y = -B; y < n + B; y++) {
  const fila = [];
  for (let x = -B; x < n + B; x++) fila.push(x >= 0 && y >= 0 && x < n && y < n ? q.modules.data[y * n + x] : 0);
  matriz.push(fila);
}
process.stdout.write(JSON.stringify({ url, tam: n + 2 * B, matriz }));
