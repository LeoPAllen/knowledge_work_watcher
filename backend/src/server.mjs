import { buildApp } from "./app.mjs";
import { loadConfig } from "./config.mjs";

const config = loadConfig();
const app = buildApp({ config });

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  console.error(`Backend failed to start: ${error.code ?? "startup_error"}`);
  process.exitCode = 1;
}
