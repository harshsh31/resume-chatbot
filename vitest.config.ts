import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // threads avoids intermittent "Timeout waiting for worker" from the forks pool on busy machines
  test: { pool: "threads" },
});
