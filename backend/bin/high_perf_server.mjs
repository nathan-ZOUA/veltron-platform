import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 8000);
const WORKER_COUNT = Number(process.env.PHP_WORKERS || 8);
const BASE_WORKER_PORT = 8001;

const PUBLIC_DIR = path.resolve(__dirname, "../public");
const ROUTER_SCRIPT = path.resolve(__dirname, "../public/index.php");
const PHP_BIN =
  process.env.PHP_BIN ||
  "C:\\Users\\zoua\\AppData\\Local\\Microsoft\\WinGet\\Packages\\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe\\php.exe";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".webmanifest": "application/manifest+json",
};

// Spawn pool of parallel PHP 8.3 workers
const workers = [];
let rrIndex = 0;

function spawnWorker(index) {
  const port = BASE_WORKER_PORT + index;
  const proc = spawn(
    PHP_BIN,
    ["-d", "max_execution_time=60", "-d", "memory_limit=512M", "-S", `127.0.0.1:${port}`, ROUTER_SCRIPT],
    {
      cwd: path.resolve(__dirname, ".."),
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    }
  );
  proc.on("exit", (code) => {
    console.error(`[veltron-cluster] Worker :${port} exited (${code}), restarting in 500ms...`);
    setTimeout(() => spawnWorker(index), 500);
  });
  workers[index] = { port, proc };
}

for (let i = 0; i < WORKER_COUNT; i++) {
  spawnWorker(i);
}

const keepAliveAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 512,
  maxFreeSockets: 64,
  timeout: 30000,
});

function serveStaticFile(req, res, filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (ext === ".mp4" || ext === ".webm" || ext === ".jpg" || ext === ".png" || ext === ".js" || ext === ".css") {
    res.setHeader("Cache-Control", "public, max-age=3600");
  }

  const range = req.headers.range;
  if (range && stat.size > 0) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    if (start >= stat.size || end >= stat.size || isNaN(start) || isNaN(end) || start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      return res.end();
    }
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Content-Type": contentType,
    });
    if (req.method === "HEAD") return res.end();
    const stream = fs.createReadStream(filePath, { start, end });
    stream.on("error", () => res.destroy());
    return stream.pipe(res);
  }

  res.writeHead(200, {
    "Content-Length": stat.size,
    "Content-Type": contentType,
  });
  if (req.method === "HEAD") return res.end();
  const stream = fs.createReadStream(filePath);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

function proxyToPhpWorker(req, res) {
  const worker = workers[rrIndex % workers.length];
  rrIndex = (rrIndex + 1) % 1000000;

  const options = {
    hostname: "127.0.0.1",
    port: worker.port,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: req.headers.host || `127.0.0.1:${PORT}`,
      "x-forwarded-for": req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1",
    },
    agent: keepAliveAgent,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    console.error(`[veltron-cluster] Proxy error on :${worker.port}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: { code: "bad_gateway", message: "Worker busy, please retry" } }));
    }
  });

  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  const rawUrl = req.url || "/";
  const pathname = decodeURIComponent(rawUrl.split("?")[0]);

  // Route API & dynamic PHP endpoints across our multi-worker PHP pool
  if (pathname.startsWith("/api/") || pathname === "/api") {
    return proxyToPhpWorker(req, res);
  }

  // Check if static file exists in PUBLIC_DIR
  const safePath = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
  const fullPath = path.join(PUBLIC_DIR, safePath);

  if (fullPath.startsWith(PUBLIC_DIR)) {
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        return serveStaticFile(req, res, fullPath, stat);
      }
    } catch {
      // Fallback to SPA index.html
    }
  }

  // SPA fallback: serve index.html directly from memory/disk
  const indexHtml = path.join(PUBLIC_DIR, "index.html");
  try {
    const stat = fs.statSync(indexHtml);
    return serveStaticFile(req, res, indexHtml, stat);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("VELTRON index.html not found");
  }
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `[veltron-cluster] High-Performance Gateway listening on http://127.0.0.1:${PORT} with ${WORKER_COUNT} parallel PHP workers (:8001..:${
      BASE_WORKER_PORT + WORKER_COUNT - 1
    })`
  );
});

