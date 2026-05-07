import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

// Proxy settings for external services (read from env vars, managed via Supabase settings in UI)
function getProxyConfig(mode) {
  const env = loadEnv(mode, process.cwd(), "");
  const e = (key) => env[key] || process.env[key] || "";
  return {
    embyUrl: e("EMBY_URL"),
    seerUrl: e("JELLYSEERR_URL"),
    seerKey: e("JELLYSEERR_API_KEY"),
    sonarrUrl: e("SONARR_URL"),
    sonarrKey: e("SONARR_API_KEY"),
    radarrUrl: e("RADARR_URL"),
    radarrKey: e("RADARR_API_KEY"),
  };
}

const log = (file, line) => {
  try {
    fs.appendFileSync(path.resolve(process.cwd(), file), `${new Date().toISOString()} ${line}\n`);
  } catch { /* ignore */ }
};

export default defineConfig(({ mode }) => ({
  base: "/",
  plugins: [
    react(),
    {
      name: "api-proxy",
      configureServer(server) {
        // ── Emby URL path rewrite ──────────────────────────
        server.middlewares.use((req, _res, next) => {
          if (req.url && req.url.startsWith("/emby/api/")) {
            req.url = req.url.replace(/^\/emby/, "");
          }
          next();
        });

        // ── Emby proxy ─────────────────────────────────────
        server.middlewares.use("/api/emby", async (req, res) => {
          const { embyUrl } = getProxyConfig(mode);
          if (!embyUrl) {
            res.statusCode = 503;
            res.end(JSON.stringify({ error: "Emby not configured" }));
            return;
          }
          const base = embyUrl.replace(/\/+$/, "");
          const targetUrl = `${base}${req.url || "/"}`;
          const method = req.method || "GET";

          const headers = {};
          if (req.headers["content-type"]) headers["content-type"] = req.headers["content-type"];
          if (req.headers["x-emby-authorization"]) headers["x-emby-authorization"] = req.headers["x-emby-authorization"];

          let body;
          if (method !== "GET" && method !== "HEAD") {
            body = await new Promise((resolve) => {
              const chunks = [];
              req.on("data", (c) => chunks.push(c));
              req.on("end", () => resolve(Buffer.concat(chunks)));
              req.on("error", () => resolve(null));
            });
          }

          try {
            const upstream = await fetch(targetUrl, { method, headers, body });
            res.statusCode = upstream.status;
            upstream.headers.forEach((v, k) => {
              const l = k.toLowerCase();
              if (l === "set-cookie" || l === "content-encoding" || l === "content-length") return;
              res.setHeader(k, v);
            });
            log("emby-proxy.log", `${method} ${req.url} -> ${upstream.status}`);
            res.end(Buffer.from(await upstream.arrayBuffer()));
          } catch (err) {
            res.statusCode = 502;
            res.end(JSON.stringify({ error: `Emby proxy failed: ${err.message}` }));
            log("emby-proxy.log", `${method} ${req.url} -> 502 proxy_error`);
          }
        });

        // ── Jellyseerr proxy ───────────────────────────────
        server.middlewares.use("/api/jellyseerr", async (req, res) => {
          server.middlewares.use("/api/seer", async (req, res) => {
            // Handled below
          });
        });

        server.middlewares.use("/api/seer", async (req, res) => {
          const { seerUrl, seerKey } = getProxyConfig();
          const isUserAuth = req.headers["x-seer-auth"] === "user";

          if (!seerUrl) {
            res.statusCode = 503;
            res.end(JSON.stringify({ error: "Jellyseerr not configured" }));
            return;
          }

          const base = seerUrl.replace(/\/+$/, "");
          const targetUrl = `${base}${req.url || "/"}`;
          const method = req.method || "GET";

          const headers = {};
          if (!isUserAuth && seerKey) headers["x-api-key"] = seerKey;
          if (req.headers["content-type"]) headers["content-type"] = req.headers["content-type"];
          if (req.headers.cookie) headers.cookie = req.headers.cookie;
          if (req.headers.authorization) headers.authorization = req.headers.authorization;

          let body;
          if (method !== "GET" && method !== "HEAD") {
            body = await new Promise((resolve) => {
              const chunks = [];
              req.on("data", (c) => chunks.push(c));
              req.on("end", () => resolve(Buffer.concat(chunks)));
              req.on("error", () => resolve(null));
            });
          }

          const rewriteCookie = (v) => {
            if (!v) return v;
            return v.replace(/;\s*Domain=[^;]+/gi, "").replace(/;\s*Secure/gi, "").replace(/SameSite=None/gi, "SameSite=Lax");
          };

          try {
            const upstream = await fetch(targetUrl, { method, headers, body });
            res.statusCode = upstream.status;

            const setCookieList = typeof upstream.headers.getSetCookie === "function"
              ? upstream.headers.getSetCookie() : null;
            if (setCookieList?.length) {
              res.setHeader("set-cookie", setCookieList.map(rewriteCookie));
            }

            upstream.headers.forEach((v, k) => {
              if (k.toLowerCase() === "set-cookie") return;
              res.setHeader(k, v);
            });

            log("seer-proxy.log", `${method} ${req.url} -> ${upstream.status}`);
            res.end(Buffer.from(await upstream.arrayBuffer()));
          } catch (err) {
            res.statusCode = 502;
            res.end(JSON.stringify({ error: `Seer proxy failed: ${err.message}` }));
            log("seer-proxy.log", `${method} ${req.url} -> 502 proxy_error`);
          }
        });

        // ── Sonarr / Radarr proxy helper ───────────────────
        const proxyArr = (name, urlKey, keyKey) => {
          server.middlewares.use(`/api/${name}`, async (req, res) => {
            const cfg = getProxyConfig();
            let baseUrl = cfg[urlKey];
            const apiKey = cfg[keyKey];

            if (!baseUrl || !apiKey) {
              res.statusCode = 503;
              res.end(JSON.stringify({ error: `${name} not configured` }));
              return;
            }

            if (!String(baseUrl).includes("://")) baseUrl = `http://${baseUrl}`;
            const base = baseUrl.replace(/\/+$/, "");
            const targetUrl = `${base}${req.url || "/"}`;
            const method = req.method || "GET";

            const headers = { "X-Api-Key": apiKey, "accept-encoding": "identity" };
            if (req.headers["content-type"]) headers["content-type"] = req.headers["content-type"];

            let body;
            if (method !== "GET" && method !== "HEAD") {
              body = await new Promise((resolve) => {
                const chunks = [];
                req.on("data", (c) => chunks.push(c));
                req.on("end", () => resolve(Buffer.concat(chunks)));
                req.on("error", () => resolve(null));
              });
            }

            try {
              log("service-proxy.log", `${name} ${method} ${req.url} -> ${targetUrl}`);
              let upstream = await fetch(targetUrl, { method, headers, body });

              if (!upstream.ok && targetUrl.startsWith("https://")) {
                const fallback = targetUrl.replace("https://", "http://");
                log("service-proxy.log", `${name} retry -> ${fallback}`);
                upstream = await fetch(fallback, { method, headers, body });
              }

              res.statusCode = upstream.status;
              upstream.headers.forEach((v, k) => {
                if (k.toLowerCase() === "set-cookie") return;
                res.setHeader(k, v);
              });
              log("service-proxy.log", `${name} ${method} ${req.url} <- ${upstream.status}`);
              res.end(Buffer.from(await upstream.arrayBuffer()));
            } catch (err) {
              res.statusCode = 502;
              res.end(JSON.stringify({ error: `${name} proxy failed: ${err.message}` }));
              log("service-proxy.log", `${name} ${method} ${req.url} !! ${err.message}`);
            }
          });
        };

        proxyArr("sonarr", "sonarrUrl", "sonarrKey");
        proxyArr("radarr", "radarrUrl", "radarrKey");

        // ── Emby password change ─────────────────────────
        server.middlewares.use("/api/emby-password", async (req, res) => {
          if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
          const { embyUrl } = getProxyConfig(mode);
          if (!embyUrl) { res.statusCode = 503; res.end(JSON.stringify({ error: "Emby not configured" })); return; }
          const body = await new Promise((resolve) => {
            const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
          });
          try {
            const { userId, token, currentPassword, newPassword } = JSON.parse(body);
            const base = embyUrl.replace(/\/+$/, "");
            const resp = await fetch(`${base}/Users/${userId}/Password`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Emby-Token": token },
              body: JSON.stringify({ Id: userId, CurrentPw: currentPassword, NewPw: newPassword, ResetPassword: false }),
            });
            res.statusCode = resp.ok ? 200 : resp.status;
            res.setHeader("Content-Type", "application/json");
            if (resp.ok) res.end(JSON.stringify({ ok: true }));
            else { const t = await resp.text(); res.end(JSON.stringify({ error: t })); }
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        });

        // ── Emby guide image upload ──────────────────────
        server.middlewares.use("/api/emby-guide-images", async (req, res) => {
          if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
          const slot = req.url?.match(/\/(\d+)/)?.[1];
          if (!slot) { res.statusCode = 400; res.end(JSON.stringify({ error: "Missing slot" })); return; }
          try {
            const body = await new Promise((resolve) => {
              const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
            });
            const { dataUrl } = JSON.parse(body);
            const base64 = dataUrl?.replace(/^data:image\/\w+;base64,/, "");
            if (!base64) { res.statusCode = 400; res.end(JSON.stringify({ error: "No image" })); return; }
            const buf = Buffer.from(base64, "base64");
            const ext = (dataUrl.match(/data:image\/(\w+)/)?.[1]) || "png";
            const dirs = ["emby-guide", "public/emby-guide", "dist/emby-guide"];
            for (const d of dirs) {
              const dir = path.resolve(process.cwd(), d);
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(path.join(dir, `slot${slot}.${ext}`), buf);
            }
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ url: `/emby-guide/slot${slot}.${ext}` }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
        });

        // ── Client error logging ──────────────────────────
        server.middlewares.use("/api/client-errors", (req, res, next) => {
          if (req.method !== "POST") return next();
          let body = "";
          req.on("data", (c) => { body += c; if (body.length > 500000) req.destroy(); });
          req.on("end", () => {
            let payload = {};
            try { payload = body ? JSON.parse(body) : {}; } catch { payload = { raw: body }; }
            log("client-errors.log", JSON.stringify({ timestamp: new Date().toISOString(), ...payload }));
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
          });
        });

        // ── Emby SPA fallback ─────────────────────────────
        server.middlewares.use((req, _res, next) => {
          const shouldServeSpa = (reqUrl) => {
            if (!reqUrl || !reqUrl.startsWith("/emby")) return false;
            if (reqUrl.startsWith("/emby/api")) return false;
            if (reqUrl.startsWith("/emby/@") || reqUrl.startsWith("/emby/assets")) return false;
            return !reqUrl.includes(".");
          };
          if (req.method === "GET" && shouldServeSpa(req.url || "")) {
            req.url = "/emby/";
          }
          next();
        });
      },
    },
  ],
  server: {
    port: 5173,
    strictPort: true,
    host: "0.0.0.0",
  },
}));
