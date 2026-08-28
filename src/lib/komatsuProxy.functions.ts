import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Server-side fetch proxy for the public Komatsu parts-book data.
 *
 * The kbp_json GCS bucket (and the a2109 diagram CDN) do not send CORS
 * headers, so the browser cannot fetch them directly. These functions fetch
 * server-side instead. Both are strictly limited to the known public hosts
 * so they cannot be abused as an open proxy.
 */

const PAGE_PREFIX = "https://storage.googleapis.com/kbp_json/";
const IMAGE_HOSTS = ["c1.a2109.com", "storage.googleapis.com"];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const urlSchema = z.object({ url: z.string().url().max(2000) });

export const fetchKomatsuBookPage = createServerFn({ method: "GET" })
  .inputValidator((input: { url: string }) => urlSchema.parse(input))
  .handler(async ({ data }) => {
    if (!data.url.startsWith(PAGE_PREFIX)) {
      throw new Error("URL outside the allowed Komatsu book store.");
    }
    const res = await fetch(data.url);
    if (!res.ok) throw new Error(`Page fetch failed: HTTP ${res.status}`);
    return (await res.json()) as unknown;
  });

export const fetchKomatsuDiagram = createServerFn({ method: "GET" })
  .inputValidator((input: { url: string }) => urlSchema.parse(input))
  .handler(async ({ data }) => {
    const host = new URL(data.url).hostname;
    if (!IMAGE_HOSTS.includes(host)) {
      throw new Error("URL outside the allowed diagram hosts.");
    }
    const res = await fetch(data.url);
    if (!res.ok) throw new Error(`Diagram fetch failed: HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error("Diagram too large.");
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return {
      base64: btoa(binary),
      contentType: res.headers.get("content-type") ?? "image/png",
    };
  });
