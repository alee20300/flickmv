import { build, context } from "esbuild";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const assets = path.join(dist, "assets");
const watch = process.argv.includes("--watch");

const buildOptions = {
  entryPoints: [path.join(root, "src/main.jsx")],
  bundle: true,
  format: "esm",
  target: ["es2019"],
  platform: "browser",
  jsx: "automatic",
  jsxImportSource: "react",
  outdir: assets,
  entryNames: "app",
  assetNames: "[name]",
  loader: {
    ".png": "file",
    ".jpg": "file",
    ".jpeg": "file",
    ".gif": "file",
    ".svg": "file",
    ".webp": "file",
    ".woff": "file",
    ".woff2": "file",
    ".ttf": "file",
    ".eot": "file",
  },
  define: {
    "process.env.NODE_ENV": "\"production\"",
  },
  logLevel: "info",
};

async function prepareDist() {
  await mkdir(dist, { recursive: true });
  await rm(assets, { recursive: true, force: true });
  await mkdir(assets, { recursive: true });
  await cp(path.join(root, "public"), dist, { recursive: true, force: true });
}

async function writeIndex() {
  const version = Date.now();
  const html = [
    "<!doctype html>",
    "<html lang=\"en\">",
    "  <head>",
    "    <meta charset=\"UTF-8\" />",
    "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />",
    "    <link rel=\"icon\" type=\"image/svg+xml\" href=\"/movieflix.svg\" />",
    "    <title>movieflix-dashboard</title>",
    `    <link rel=\"stylesheet\" href=\"/assets/app.css?v=${version}\" />`,
    "  </head>",
    "  <body>",
    "    <div id=\"root\"></div>",
    `    <script type=\"module\" src=\"/assets/app.js?v=${version}\"></script>`,
    "  </body>",
    "</html>",
    "",
  ].join("\n");
  await writeFile(path.join(dist, "index.html"), html, "utf8");
}

async function runBuild() {
  await prepareDist();
  if (watch) {
    const ctx = await context(buildOptions);
    await ctx.watch();
    console.log("Watching with esbuild...");
    return;
  }
  await build(buildOptions);
  await writeIndex();
}

runBuild().catch((err) => {
  console.error(err);
  process.exit(1);
});
