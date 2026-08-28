/**
 * In-app internet catalog discovery.
 *
 * Server-side document inspection and proxying. All remote fetching is
 * restricted to safe public http(s) documents, rejects private/link-local
 * targets (SSRF guard), enforces a strict size cap and never interacts with
 * login, subscription, CAPTCHA or anti-bot protection.
 */
import { createServerFn } from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PROXY_MAX_BYTES = 30 * 1024 * 1024; // 30 MB payload cap
const INSPECT_SNIFF_BYTES = 8192;
const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 30000;

const urlInput = z.object({ url: z.string().url() });

const PRIVATE_HOST_PATTERNS = [
  /^0\.0\.0\.0$/,
  /^127\./,
  /^10\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^::$/,
  /^::1$/,
  /^fe80:/i,
  /^fc/i,
  /^fd/i,
];

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\[|\]/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host))) return true;
  return false;
}

/** Resolve a URL to a validated http(s) public target. Throws on risk. */
function assertSafeRemoteUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("The URL is not valid.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) documents can be inspected.");
  }
  if (isPrivateHostname(url.hostname)) {
    throw new Error("Private and local addresses are not allowed.");
  }
  return url;
}

async function guardedFetch(raw: string, init: RequestInit): Promise<Response> {
  let current = assertSafeRemoteUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(current.href, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const status = response.status;
    if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
      const location = response.headers.get("location");
      if (!location) return response;
      const next = new URL(location, current.href);
      assertSafeRemoteUrl(next.href);
      current = next;
      continue;
    }
    if (response.redirected) {
      assertSafeRemoteUrl(response.url);
    }
    return response;
  }
  throw new Error("The remote document redirected too many times.");
}

async function readCapped(response: Response, capBytes: number): Promise<Buffer> {
  if (!response.body) throw new Error("The remote document returned no body.");
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > capBytes) throw new Error("The remote document exceeds the maximum size.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > capBytes) {
          throw new Error(
            `The remote document exceeds the maximum size of ${capBytes / 1024 / 1024} MB.`,
          );
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

function looksLikePdf(response: Response, head: Buffer): boolean {
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes("application/pdf")) return true;
  return head.subarray(0, 5).toString("latin1") === "%PDF-";
}

const userAgent = "GCRB-Equipment-Catalog/1.0 (approved public document lookup; no auth bypass)";

export const inspectRemoteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => urlInput.parse(input))
  .handler(async ({ data }) => {
    const response = await guardedFetch(data.url, {
      method: "GET",
      headers: {
        Accept: "application/pdf, application/octet-stream;q=0.8, */*;q=0.2",
        "User-Agent": userAgent,
        Range: `bytes=0-${INSPECT_SNIFF_BYTES - 1}`,
      },
    });
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > PROXY_MAX_BYTES) {
      return {
        ok: false,
        status: response.status,
        contentType: response.headers.get("content-type") ?? null,
        contentLength: declared,
        looksPdf: false,
        error: `Declared size ${(declared / 1024 / 1024).toFixed(1)} MB exceeds the ${PROXY_MAX_BYTES / 1024 / 1024} MB limit.`,
      };
    }
    const head = await readCapped(response, INSPECT_SNIFF_BYTES);
    const looksPdf = looksLikePdf(response, head.subarray(0, INSPECT_SNIFF_BYTES));
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") ?? null,
      contentLength: declared || null,
      looksPdf,
      error: null,
    };
  });

/** Proxy the full document bytes (PDF only) back to the browser for hashing,
 * on-device text extraction and secure re-upload to the institution storage. */
export const proxyFetchRemoteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => urlInput.parse(input))
  .handler(async ({ data }) => {
    const response = await guardedFetch(data.url, {
      method: "GET",
      headers: {
        Accept: "application/pdf, application/octet-stream;q=0.8, */*;q=0.2",
        "User-Agent": userAgent,
      },
    });
    const bytes = await readCapped(response, PROXY_MAX_BYTES);
    if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return {
        ok: false,
        length: bytes.byteLength,
        contentType: response.headers.get("content-type") ?? null,
        sha256: null,
        base64: null,
        error: "The remote document is not a PDF (missing %PDF header).",
      };
    }
    return {
      ok: true,
      length: bytes.byteLength,
      contentType: response.headers.get("content-type") ?? "application/pdf",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      base64: bytes.toString("base64"),
      error: null,
    };
  });
