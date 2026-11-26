import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Architecture rule (plan §5.2): simulation, AI, level and config code must stay pure
  // (no React, Next.js, renderer or browser-only modules) so it can run headless in
  // tests, soak runs and, later, on an authoritative online server.
  {
    files: ["src/game/sim/**", "src/game/ai/**", "src/game/level/**", "src/game/config/**", "src/game/combat/**", "src/game/net/protocol.ts", "src/game/net/codec.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["react", "react-dom", "next", "next/*"], message: "Simulation code must not depend on UI frameworks." },
          { group: ["**/render/**", "**/audio/**", "**/GameController", "@/components/**"], message: "Simulation code must not import presentation code." },
        ],
      }],
      "no-restricted-globals": ["error", "window", "document", "localStorage", "requestAnimationFrame"],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "tools/mocap/.cache/**"]),
]);

export default eslintConfig;
