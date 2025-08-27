// src/app/api/reviews/hostaway/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs"; // we need fs + outbound fetch on the server

// ---------- Types ----------
type CategoryRating = { category: string; rating: number | null };
type Review = {
  id: number | string;
  type?: string;            // "guest-to-host" | "host-to-guest"
  status?: string;          // "published" | ...
  channel?: string;         // "Airbnb" | "Booking" | "Direct" | ...
  rating: number | null;    // overall (nullable)
  publicReview: string;
  reviewCategory: CategoryRating[];
  submittedAt: string;      // "YYYY-MM-DD HH:mm:ss" (Hostaway-ish)
  submittedAtIso?: string;  // ISO string if we have it
  submittedAtTs?: number;   // epoch ms if we have it
  guestName: string;
  listingName: string;
  approved?: boolean;       // optional (we keep using localStorage in the UI for demo)
};

// ---------- Env / toggles ----------
const BASE_URL = process.env.HOSTAWAY_BASE_URL || "https://api.hostaway.com";
const ACCOUNT_ID = process.env.HOSTAWAY_ACCOUNT_ID;
const API_KEY = process.env.HOSTAWAY_API_KEY;

const USE_LIVE = !!(ACCOUNT_ID && API_KEY);

// ---------- Mock loader (fallback) ----------
let MOCK_CACHE: Review[] | null = null;
function loadMock(): Review[] {
  if (MOCK_CACHE) return MOCK_CACHE;
  const file = path.join(process.cwd(), "data", "mock-reviews.json");
  const raw = fs.readFileSync(file, "utf8");
  const json = JSON.parse(raw);
  MOCK_CACHE = (json?.result ?? []) as Review[];
  return MOCK_CACHE;
}

// ---------- Utilities ----------
function toEpochMs(r: Review): number {
  if (typeof r.submittedAtTs === "number" && Number.isFinite(r.submittedAtTs)) return r.submittedAtTs;
  if (r.submittedAtIso) {
    const t = Date.parse(r.submittedAtIso);
    if (!Number.isNaN(t)) return t;
  }
  const isoGuess = r.submittedAt.includes(" ") ? r.submittedAt.replace(" ", "T") + "Z" : r.submittedAt;
  const t2 = Date.parse(isoGuess);
  return Number.isNaN(t2) ? 0 : t2;
}
function parseNumber(s: string | null): number | null {
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function parseCsvLower(s: string | null): string[] | null {
  if (!s) return null;
  return s.split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
}
function icaseEq(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
}
async function safeText(res: Response) {
  try { return await res.text(); } catch { return "<no body>"; }
}

// ---------- Token cache (module-scope; survives warm invocations) ----------
let tokenCache: { token: string; exp: number } | null = null;

async function getHostawayToken(): Promise<string> {
  if (!USE_LIVE) throw new Error("LIVE_DISABLED");

  const now = Date.now();
  if (tokenCache && now < tokenCache.exp) return tokenCache.token;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: String(ACCOUNT_ID), // Account ID
    client_secret: String(API_KEY), // API key
    scope: "general",
  });

  const r = await fetch(`${BASE_URL}/v1/accessTokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body,
  });

  if (!r.ok) {
    throw new Error(`token:${r.status} ${await safeText(r)}`);
  }

  const j = await r.json(); // { access_token, token_type, expires_in }
  const exp = now + Math.max(0, (Number(j.expires_in ?? 3600) - 60) * 1000); // refresh 1 min early
  tokenCache = { token: j.access_token, exp };
  return j.access_token;
}

// ---------- Fetch live reviews and normalize ----------
async function fetchLiveReviews(): Promise<Review[]> {
  const token = await getHostawayToken();

  // If pagination exists, you can loop pages. For the assessment, a single page is fine.
  const url = new URL(`${BASE_URL}/v1/reviews`);
  // Example: url.searchParams.set('limit', '200');

  const r = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Cache-Control": "no-cache",
    },
  });

  if (!r.ok) {
    throw new Error(`reviews:${r.status} ${await safeText(r)}`);
  }

  const data = await r.json();
  const arr = Array.isArray(data?.result) ? data.result : (Array.isArray(data) ? data : []);

  // ---- NORMALIZE to our Review shape ----
  const rows: Review[] = arr.map((x: any): Review => {
    // IDs
    const id = x.id ?? x.reviewId ?? x._id ?? x.uuid ?? cryptoRandomId();

    // People / property
    const listingName =
      x.listingName ?? x.propertyName ?? x.listing?.name ?? x.property?.name ?? "Unknown Property";
    const guestName =
      x.guestName ?? x.reviewerName ?? x.guest?.name ?? x.authorName ?? "Guest";

    // Text and status
    const publicReview = x.publicReview ?? x.review ?? x.comment ?? x.text ?? "";
    const status = x.status ?? "published";

    // Channel & type
    const channel =
      x.channel ?? x.source ?? x.platform ?? (x.channelId ? `channel:${x.channelId}` : undefined);
    const type = x.type ?? x.direction ?? undefined;

    // Overall rating (nullable)
    const rating =
      x.rating ?? x.overallRating ?? (Number.isFinite(x.score) ? Number(x.score) : null) ?? null;

    // Categories (array or object)
    let reviewCategory: CategoryRating[] = [];
    if (Array.isArray(x.reviewCategory)) {
      reviewCategory = x.reviewCategory.map((c: any) => ({
        category: String(c.category),
        rating: c.rating == null ? null : Number(c.rating),
      }));
    } else if (x.categories && typeof x.categories === "object") {
      reviewCategory = Object.entries(x.categories).map(([category, val]) => ({
        category,
        rating: val == null ? null : Number(val),
      }));
    }

    // Dates
    const iso =
      x.submittedAtIso ?? x.createdAt ?? x.date ?? x.created ?? x.updatedAt ?? null;
    const submittedAt =
      x.submittedAt ??
      (iso ? new Date(iso).toISOString().slice(0, 19).replace("T", " ") : "1970-01-01 00:00:00");

    // Approved flag (if any upstream hint)
    const approved =
      x.approved ??
      x.isApproved ??
      (x.visibility === "public" ? true : undefined);

    return {
      id,
      type,
      status,
      channel,
      rating,
      publicReview,
      reviewCategory,
      submittedAt,
      submittedAtIso: iso ?? undefined,
      submittedAtTs: iso ? Date.parse(iso) : undefined,
      guestName,
      listingName,
      approved,
    };
  });

  return rows;
}

// Fallback ID if upstream lacks it
function cryptoRandomId() {
  // Not crypto-secure in all environments, but sufficient as a fallback ID for demo
  return Math.random().toString(36).slice(2);
}

// ---------- Main handler ----------
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const listing = searchParams.get("listing");
  const q = searchParams.get("q");

  const category = searchParams.get("category");
  const min = parseNumber(searchParams.get("min"));

  const types = parseCsvLower(searchParams.get("type"));
  const channels = parseCsvLower(searchParams.get("channel"));
  const approvedOnly = searchParams.get("approvedOnly") === "true";

  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  const fromMs = fromStr ? Date.parse(fromStr) : null;
  const toMs = toStr ? Date.parse(toStr) : null;

  const sort = (searchParams.get("sort") || "").toLowerCase();       // "date" | "rating"
  const order = (searchParams.get("order") || "desc").toLowerCase(); // "asc" | "desc"

  let rows: Review[] = [];
  let source = "mock";

  try {
    if (USE_LIVE) {
      const live = await fetchLiveReviews();
      if (Array.isArray(live) && live.length > 0) {
        rows = live.slice();
        source = "live";
      } else {
        rows = loadMock().slice();
        source = "live-empty-fallback";
      }
    } else {
      rows = loadMock().slice();
      source = "mock";
    }
  } catch (e) {
    console.warn("Hostaway error → mock fallback:", e);
    rows = loadMock().slice();
    source = "live-error-fallback";
  }

  // listing filter (exact, case-insensitive)
  if (listing) {
    rows = rows.filter((r) => icaseEq(r.listingName, listing));
  }

  // free text filter
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) => {
      const hay = `${r.guestName} ${r.listingName} ${r.publicReview}`.toLowerCase();
      return hay.includes(needle);
    });
  }

  // type filter
  if (types && types.length > 0) {
    rows = rows.filter((r) => (r.type ? types.includes(r.type.toLowerCase()) : false));
  }

  // channel filter
  if (channels && channels.length > 0) {
    rows = rows.filter((r) => (r.channel ? channels.includes(r.channel.toLowerCase()) : false));
  }

  // category + min filter
  if (category) {
    rows = rows.filter((r) => {
      const hit = r.reviewCategory?.find((c) => c.category === category);
      if (!hit) return false;
      if (min === null) return hit.rating !== null; // if no min, just require a value
      return typeof hit.rating === "number" && hit.rating >= min;
    });
  }

  // approvedOnly
  if (approvedOnly) {
    rows = rows.filter((r) => r.approved === true);
  }

  // date range (inclusive)
  rows = rows.filter((r) => {
    const t = toEpochMs(r);
    if (fromMs !== null && !Number.isNaN(fromMs) && t < fromMs) return false;
    if (toMs !== null && !Number.isNaN(toMs) && t > toMs) return false;
    return true;
  });

  // sorting
  if (sort === "date") {
    rows.sort((a, b) => toEpochMs(a) - toEpochMs(b));
  } else if (sort === "rating") {
    rows.sort((a, b) => {
      const A = a.rating;
      const B = b.rating;
      if (A == null && B == null) return 0;
      if (A == null) return 1;
      if (B == null) return -1;
      return A - B;
    });
  }
  if (order === "desc") rows.reverse();

  return NextResponse.json(
    { status: "success", result: rows },
    {
      headers: {
        "Cache-Control": "s-maxage=120, stale-while-revalidate=60",
        "x-source": source,
      },
    }
  );
}
