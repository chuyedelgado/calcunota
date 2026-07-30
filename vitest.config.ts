import { defineConfig } from "vitest/config";

// El motor (lib/calculos.ts) y el parser (lib/importarHistorial.ts) son lógica
// pura; corren en el entorno Node por defecto, sin jsdom.
export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
  },
});
