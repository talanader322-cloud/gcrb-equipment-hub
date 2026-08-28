/**
 * On-device PDF text analysis.
 *
 * pdfjs-dist is intentionally NOT added to package.json (the repo pins deps
 * via bun.lock and builds on Lovable with a frozen lockfile). Instead a pinned
 * build is loaded dynamically from a CDN at runtime. If the CDN is unreachable
 * the extractor degrades gracefully so archiving still completes.
 */

const PDFJS_VERSION = "4.4.168";
const PDFJS_CDN = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`;
const PDFJS_WORKER_CDN = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

const MAX_EXTRACT_PAGES = 300;
const MAX_PAGE_CHARS = 60000;
const NO_TEXT_PAGE_CHARS = 40;

type PdfjsPage = {
  getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
};

type PdfjsDocument = {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfjsPage>;
  destroy(): void;
};

type PdfjsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(input: { data: Uint8Array<ArrayBuffer> }): { promise: Promise<PdfjsDocument> };
};

export type ExtractedPage = {
  pageNumber: number;
  content: string;
  charCount: number;
  candidatePartNumbers: string[];
  source: "text" | "none";
};

export type PdfAnalysisOutcome = {
  ok: boolean;
  pageCount: number;
  pages: ExtractedPage[];
  textPages: number;
  note?: string;
};

let pdfjsPromise: Promise<PdfjsModule> | null = null;

async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const mod = (await import(/* @vite-ignore */ PDFJS_CDN)) as PdfjsModule;
      mod.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
      return mod;
    })();
  }
  return pdfjsPromise;
}

/** Reasonable, permissive part-number token pattern used for candidate stats. */
const PART_TOKEN =
  /(?<![A-Z0-9])([A-Z]{1,4}[- ]?\d{2,3}[- ]?\d{2,4}[- ]?\d{1,4})(?![A-Z0-9])(?:\b|$)/g;

function detectCandidatePartNumbers(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(PART_TOKEN)) {
    const candidate = match[1]?.replace(/\s+/g, " ").trim();
    if (candidate && candidate.replace(/[- ][0-9]+$/, "").length >= 4) found.add(candidate);
  }
  return [...found].slice(0, 60);
}

function normalizePdfText(raw: string): string {
  return raw
    .replace(/\u00ad/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/[\r\n]{3,}/g, "\n\n")
    .trim();
}

/**
 * Extract per-page text from raw PDF bytes in the browser.
 *
 * @returns pages sorted ascending; text-bearing pages plus a note when the
 *          document is a scanned/image-only PDF (no embedded text layer).
 */
export async function analyzePdfBytes(bytes: Uint8Array<ArrayBuffer>): Promise<PdfAnalysisOutcome> {
  if (bytes.length < 8 || new TextDecoder("latin1").decode(bytes.subarray(0, 5)) !== "%PDF-") {
    return { ok: false, pageCount: 0, pages: [], textPages: 0, note: "Not a PDF document." };
  }
  let pdfjs: PdfjsModule;
  try {
    pdfjs = await loadPdfjs();
  } catch {
    return {
      ok: false,
      pageCount: 0,
      pages: [],
      textPages: 0,
      note: "PDF engine could not be loaded from the CDN.",
    };
  }

  let doc: PdfjsDocument;
  try {
    const task = pdfjs.getDocument({ data: bytes });
    doc = await task.promise;
  } catch {
    return { ok: false, pageCount: 0, pages: [], textPages: 0, note: "PDF could not be parsed." };
  }

  const totalPages = Math.min(doc.numPages, MAX_EXTRACT_PAGES);
  const pages: ExtractedPage[] = [];
  for (let index = 1; index <= totalPages; index++) {
    try {
      const page = await doc.getPage(index);
      const textContent = await page.getTextContent();
      const content = normalizePdfText(
        (textContent.items ?? []).map((item) => item.str ?? "").join("\n"),
      );
      const textSource = content.length > NO_TEXT_PAGE_CHARS;
      pages.push({
        pageNumber: index,
        content: textSource ? content.slice(0, MAX_PAGE_CHARS) : "",
        charCount: content.length,
        candidatePartNumbers: textSource ? detectCandidatePartNumbers(content) : [],
        source: textSource ? "text" : "none",
      });
    } catch {
      pages.push({
        pageNumber: index,
        content: "",
        charCount: 0,
        candidatePartNumbers: [],
        source: "none",
      });
    }
  }
  doc.destroy?.();

  const textPages = pages.filter((page) => page.source === "text").length;
  return {
    ok: true,
    pageCount: totalPages,
    pages,
    textPages,
    ...(totalPages < doc.numPages
      ? { note: `Analysis limited to the first ${totalPages} pages.` }
      : textPages === 0
        ? { note: "No embedded text was found — this PDF appears to be scanned images only." }
        : {}),
  };
}

export const pdfAnalysisService = { analyze: analyzePdfBytes };
