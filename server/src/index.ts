import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { ZodError } from "zod";
import { RoadmapRequest, generateRoadmap } from "./roadmap.js";

const PORT = Number(process.env.PORT ?? 8787);
const APP_TOKEN = process.env.APP_TOKEN ?? "";
if (APP_TOKEN.length < 24) {
  console.error("Set APP_TOKEN to a random string of at least 24 characters.");
  process.exit(1);
}

function authorized(header: string | undefined): boolean {
  const given = Buffer.from(header?.replace(/^Bearer /, "") ?? "");
  const expected = Buffer.from(APP_TOKEN);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const MAX_BODY = 2_000_000; // 2 MB

createServer(async (req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (req.method === "GET" && req.url === "/health") return send(200, { ok: true });
  if (req.method !== "POST" || req.url !== "/roadmap") return send(404, { error: "not found" });
  if (!authorized(req.headers.authorization)) return send(401, { error: "unauthorized" });

  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) return send(413, { error: "too large" });
  }

  try {
    const input = RoadmapRequest.parse(JSON.parse(raw));
    const roadmap = await generateRoadmap(input);
    send(200, roadmap);
  } catch (err) {
    if (err instanceof SyntaxError || err instanceof ZodError) {
      return send(400, { error: "bad request", detail: String(err) });
    }
    if (err instanceof Anthropic.RateLimitError) return send(429, { error: "busy, try again shortly" });
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error", err.status, err.message);
      return send(502, { error: "planner unavailable" });
    }
    console.error(err);
    send(500, { error: err instanceof Error ? err.message : "error" });
  }
}).listen(PORT, () => console.log(`roadmap server on :${PORT}`));
