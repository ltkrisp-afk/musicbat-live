import { RadioRuntime } from '../radio/runtime.ts';
import { createRadioServer } from '../radio/server.ts';
const databasePath = process.env.MUSICBAT_RADIO_DATABASE;
const assetRoot = process.env.MUSICBAT_RADIO_ASSETS;
const gatewayToken = process.env.MUSICBAT_RADIO_GATEWAY_TOKEN;
if (!databasePath || !assetRoot || !gatewayToken) throw new Error('Set MUSICBAT_RADIO_DATABASE, MUSICBAT_RADIO_ASSETS and MUSICBAT_RADIO_GATEWAY_TOKEN.');
const port = Number(process.env.MUSICBAT_RADIO_PORT ?? 5180);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid private runtime port.');
const runtime = new RadioRuntime({ databasePath, assetRoot, gatewayToken });
runtime.start();
const server = createRadioServer(runtime);
server.listen(port, '127.0.0.1', () => console.log(`Private MusicBat radio listening on loopback port ${port}.`));
let closing = false;
function close() {
  if (closing) return; closing = true;
  server.close(() => { runtime.close(); process.exit(0); });
  server.closeIdleConnections();
  setTimeout(() => { server.closeAllConnections(); runtime.close(); process.exit(1); }, 5000).unref();
}
process.on('SIGTERM', close); process.on('SIGINT', close);
