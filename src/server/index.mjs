import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createServerContext, handleApiRequest } from "./routes.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dist = join(root, "dist");
const port = Number(process.env.STUDYBUDDY_API_PORT ?? 8787);
const context = await createServerContext();

const server = createServer(async (nodeRequest, nodeResponse) => {
  const request = await toWebRequest(nodeRequest);
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/")) {
    return send(nodeResponse, await handleApiRequest(request, context));
  }

  return send(nodeResponse, await serveStatic(url.pathname));
});

server.listen(port, () => {
  console.log(`StudyBuddy API listening at http://localhost:${port}`);
});

async function toWebRequest(nodeRequest) {
  const chunks = [];
  for await (const chunk of nodeRequest) chunks.push(chunk);
  return new Request(`http://localhost${nodeRequest.url}`, {
    method: nodeRequest.method,
    headers: nodeRequest.headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined
  });
}

async function serveStatic(pathname) {
  // Folder URLs like /teacher/ serve that folder's index.html.
  const relative = pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
  const safe = normalize(relative).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(dist, safe);
  try {
    const body = await readFile(filePath);
    return new Response(body, {
      headers: { "content-type": contentType(filePath) }
    });
  } catch {
    const body = await readFile(join(dist, "index.html"));
    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  }
}

async function send(nodeResponse, response) {
  nodeResponse.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  nodeResponse.end(Buffer.from(await response.arrayBuffer()));
}

function contentType(filePath) {
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
    ".svg": "image/svg+xml"
  }[extname(filePath)] ?? "application/octet-stream";
}
