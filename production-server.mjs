// Lite proxy server for production — handles Emby/Seer/Sonarr/Radarr passthrough
// Deploy on Coolify alongside the static SPA
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, "dist");
const PORT = process.env.PORT || 3000;

const config = {
  emby: process.env.EMBY_URL || "",
  seer: process.env.JELLYSEERR_URL || "",
  seerKey: process.env.JELLYSEERR_API_KEY || "",
  sonarr: process.env.SONARR_URL || "",
  sonarrKey: process.env.SONARR_API_KEY || "",
  radarr: process.env.RADARR_URL || "",
  radarrKey: process.env.RADARR_API_KEY || "",
};

const mime = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".json": "application/json", ".ico": "image/x-icon",
};

function getMime(file) {
  const ext = path.extname(file).toLowerCase();
  return mime[ext] || "application/octet-stream";
}

async function proxy(req, res, baseUrl, apiKey, label) {
  if (!baseUrl) { res.statusCode = 503; res.end(JSON.stringify({ error: `${label} not configured` })); return; }
  const base = baseUrl.replace(/\/+$/, "");
  const reqPath = req.url.replace(new RegExp(`^/api/${label.toLowerCase()}`), "");
  const target = `${base}${reqPath}`;

  try {
    const headers = {};
    if (apiKey) headers["X-Api-Key"] = apiKey;
    if (req.headers["content-type"]) headers["content-type"] = req.headers["content-type"];
    if (req.headers["x-emby-authorization"]) headers["x-emby-authorization"] = req.headers["x-emby-authorization"];
    if (req.headers["x-seer-auth"]) headers["x-seer-auth"] = req.headers["x-seer-auth"];

    let body;
    if (req.method !== "GET" && req.method !== "HEAD") {
      body = await new Promise((resolve) => {
        const chunks = []; req.on("data", c => chunks.push(c)); req.on("end", () => resolve(Buffer.concat(chunks)));
      });
    }

    const upstream = await fetch(target, { method: req.method, headers, body });
    res.statusCode = upstream.status;
    upstream.headers.forEach((v, k) => {
      const l = k.toLowerCase();
      if (["set-cookie", "content-encoding", "content-length"].includes(l)) return;
      res.setHeader(k, v);
    });
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: `${label} proxy error: ${e.message}` }));
  }
}

function serveStatic(req, res) {
  let filePath = path.join(DIST, req.url === "/" ? "index.html" : req.url);
  if (!filePath.startsWith(DIST)) { res.statusCode = 403; res.end(); return; }

  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.setHeader("Content-Type", getMime(filePath));
      res.end(fs.readFileSync(filePath));
    } else {
      // SPA fallback
      res.setHeader("Content-Type", "text/html");
      res.end(fs.readFileSync(path.join(DIST, "index.html")));
    }
  } catch {
    res.statusCode = 404;
    res.end("Not Found");
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, apikey");

  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }

  const url = req.url || "/";

  if (url.startsWith("/api/emby")) return proxy(req, res, config.emby, "", "Emby");
  if (url.startsWith("/api/seer") || url.startsWith("/api/jellyseerr")) return proxy(req, res, config.seer, config.seerKey, "Jellyseerr");
  if (url.startsWith("/api/sonarr")) return proxy(req, res, config.sonarr, config.sonarrKey, "Sonarr");
  if (url.startsWith("/api/radarr")) return proxy(req, res, config.radarr, config.radarrKey, "Radarr");

  serveStatic(req, res);
});

server.listen(PORT, () => console.log(`Production server on :${PORT}`));
