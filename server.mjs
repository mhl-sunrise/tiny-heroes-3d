import http from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname, resolve } from "path";
const root = resolve(process.cwd());
const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css" };
http
  .createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0].split("#")[0]);
    if (p === "/") p = "/index.html";
    const fp = join(root, p);
    if (!existsSync(fp)) {
      res.writeHead(404);
      res.end("404");
      return;
    }
    res.writeHead(200, { "Content-Type": mime[extname(fp)] || "application/octet-stream" });
    res.end(readFileSync(fp));
  })
  .listen(5177, () => console.log("serving on 5177"));
