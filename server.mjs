import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "8000", 10);
const root = fileURLToPath(new URL(".", import.meta.url));

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
]);

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${host}:${port}`);
    const pathname = decodeURIComponent(url.pathname);
    const requestedPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = normalize(join(root, requestedPath));

    if (relative(root, filePath).startsWith("..")) {
      sendText(response, 403, "Forbidden");
      return;
    }

    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      sendText(response, 404, "Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Length": fileStat.size,
      "Content-Type": contentTypes.get(extname(filePath).toLowerCase()) ?? "application/octet-stream",
    });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    if (error?.code === "ENOENT") {
      sendText(response, 404, "Not found");
      return;
    }

    console.error(error);
    sendText(response, 500, "Internal server error");
  }
});

server.listen(port, host, () => {
  console.log(`简历项目已启动：http://${host}:${port}/`);
});

