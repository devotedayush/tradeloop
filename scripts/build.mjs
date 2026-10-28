import { build } from "esbuild";
import { mkdir, cp, writeFile } from "node:fs/promises";
await mkdir("build", { recursive: true });
await build({
  entryPoints: {
    http: "src/handlers/http.ts",
    messaging: "src/handlers/messaging.ts",
  },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outdir: "build",
  minify: true,
  sourcemap: true,
});
await cp("dist", "build/dist", { recursive: true });
await writeFile("build/package.json", JSON.stringify({ type: "commonjs" }));
console.log("AWS Lambda bundle prepared in build/");
