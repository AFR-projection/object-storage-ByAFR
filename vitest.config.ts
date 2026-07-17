import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "tests/**/*.test.ts"],
    // Unit tests target pure logic — exclude anything needing a DB/Redis/network.
    globals: false,
  },
  resolve: {
    // Mirror the tsconfig "@/*" -> "./*" path alias so imports resolve in tests.
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
});
