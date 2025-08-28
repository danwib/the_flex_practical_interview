// src/app/api/reviews/hostaway/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const revalidate = 0;

// ---------- Types ----------
type CategoryRating = { category: string; rating: number | null };
type Review = {
  id: number | string;
  type?: string;
  status?: string;
  channel?: string;
  rating: number | null;
  publicReview: string;
  reviewCategory: CategoryRating[];
  submittedAt: string;
  submittedAtIso?: string;
  submittedAtTs?: number;
  guestName: string;
  listingName: string;
  approved?: boolean;
};

type HostawayReviewLike = {
  id?: number | string;
  reviewId?: number | string;
  _id?: string;
  uuid?: string;
  listingName?: string;
  propertyName?: string;
  listing?: { name?: string } | null;
  property?: { name?: string } | null;
  guestName?: string;
  reviewerName?: string;
  guest?: { name?: string } | null;
  authorName?: string;
  publicReview?: string;
  review?: string;
  comment?: string;
  text?: string;
  status?: string;
  channel?: string;
  source?: string;
  platform?: string;
  channelId?: string | number;
  type?: string;
  direction?: string;
  rating?: number;
  overallRating?: number;
  score?: number;
  reviewCategory?: Array<{ category?: unknown; rating?: unknown }>;
  categories?: Record<string, unknown>;
  submittedAtIso?: string;
  createdAt?: string;
  date?: string;
  created?: string;
  updatedAt?: string;
  submittedAt?: string;
  approved?: boolean;
  isApproved?: boolean;
  visibility?: string;
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
type HasTextMethod = { text: () => Promise<string> };
async function safeText(res: HasTextMethod): Promise<string> {
  try { return await res.text(); } catch { return "<no body>"; }
}
function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}
function getResultArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (isRecord(v) && Array.isArray((v as { result?: unknown[] }).result)) {
    return (v as { result: unknown[] }).result;
  }
  return [];
}

// ---------- Token cache ----------
let tokenCache: { token: string; exp: number } | null = null;

async function getHostawayToken(): Promise<string> {
  if (!USE_LIVE) throw new Error("LIVE_DISABLED");
  const now = Date.now();
  if (tokenCache && now < tokenCache.exp) return tokenCache.token;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: String(ACCOUNT_ID),
    client_secret: String(API_KEY),
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
    throw new Error(`token:${r.status} ${await safeText(r as HasTextMethod)}`);
  }

  const j = (await r.json()) as { access_token: string; expires_in?: number };
  const exp = now + Math.max(0, (Number(j.expires_in ?? 3600) - 60) * 1000);
  tokenCache = { token: j.access_token, exp };
  return j.access_token;
}

// ---------- Live fetch + normalize ----------
function normalizeHostaway(raw: HostawayReviewLike): Review {
  const id =
    raw.id ?? raw.reviewId ?? raw._id ?? raw.uuid ?? Math.random().toString(36).slice(2);

  const listingName =
    raw.listingName ??
    raw.propertyName ??
    raw.listing?.name ??
    raw.property?.name ??
    "Unknown Property";

  const guestName =
    raw.guestName ??
    raw.reviewerName ??
    raw.guest?.name ??
    raw.authorName ??
    "Guest";

  const publicReview = raw.publicReview ?? raw.review ?? raw.comment ?? raw.text ?? "";
  const status = raw.status ?? "published";

  const channel =
    raw.channel ?? raw.source ?? raw.platform ?? (raw.channelId ? `channel:${raw.channelId}` : undefined);
  const type = raw.type ?? raw.direction ?? undefined;

  const rating =
    raw.rating ??
    raw.overallRating ??
    (Number.isFinite(raw.score as number) ? Number(raw.score) : null) ??
    null;

  let reviewCategory: CategoryRating[] = [];
  if (Array.isArray(raw.reviewCategory)) {
    reviewCategory = (raw.reviewCategory as Array<{ category?: unknown; rating?: unknown }>).map((c) => ({
      category: String(c.category ?? ""),
      rating: c.rating == null ? null : Number(c.rating),
    })).filter(cr => cr.category.length > 0);
  } else if (raw.categories && isRecord(raw.categories)) {
    reviewCategory = Object.entries(raw.categories).map(([category, val]) => ({
      category,
      rating: val == null ? null : Number(val),
    }));
  }

  const iso =
    raw.submittedAtIso ?? raw.createdAt ?? raw.date ?? raw.created ?? raw.updatedAt ?? undefined;
  const submittedAt =
    raw.submittedAt ??
    (iso ? new Date(iso).toISOString().slice(0, 19).replace("T", " ") : "1970-01-01 00:00:00");

  const approved =
    raw.approved ??
    raw.isApproved ??
    (raw.visibility === "public" ? true : undefined);

  return {
    id,
    type,
    status,
    channel,
    rating,
    publicReview,
    reviewCategory,
    submittedAt,
    submittedAtIso: iso,
    submittedAtTs: iso ? Date.parse(iso) : undefined,
    guestName,
    listingName,
    approved,
  };
}

async function fetchLiveReviews(): Promise<Review[]> {
  const token = await getHostawayToken();
  const r = await fetch(`${BASE_URL}/v1/reviews`, {
    headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" },
  });
  if (!r.ok) {
    throw new Error(`reviews:${r.status} ${await safeText(r as HasTextMethod)}`);
  }
  const data = await r.json() as unknown;
  const arrUnknown = getResultArray(data);
  return arrUnknown.map((u) => normalizeHostaway(u as HostawayReviewLike));
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
      if (live.length > 0) { rows = live.slice(); source = "live"; }
      else { rows = loadMock().slice(); source = "live-empty-fallback"; }
    } else {
      rows = loadMock().slice();
      source = "mock";
    }
  } catch (e) {
    console.warn("Hostaway error → mock fallback:", e);
    rows = loadMock().slice();
    source = "live-error-fallback";
  }

  // ---- DEFAULTS EARLY (before filtering!) ----
  rows = rows.map(r => ({
    ...r,
    channel: r.channel ?? 'Hostaway',
    type: r.type ?? 'guest-to-host',
    rating: r.rating ?? null,
    submittedAtIso:
      r.submittedAtIso ??
      (r.submittedAt ? r.submittedAt.replace(' ', 'T') + 'Z' : undefined),
  }));

  // ---- Filters ----
  if (listing) {
    rows = rows.filter((r) => icaseEq(r.listingName, listing));
  }

  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) => {
      const hay = `${r.guestName} ${r.listingName} ${r.publicReview}`.toLowerCase();
      return hay.includes(needle);
    });
  }

  if (types && types.length > 0) {
    rows = rows.filter((r) => types.includes((r.type ?? '').toLowerCase()));
  }

  if (channels && channels.length > 0) {
    const allow = new Set(channels.map(c => c.toLowerCase()));
    rows = rows.filter((r) => allow.has((r.channel ?? 'Hostaway').toLowerCase()));
  }

  if (category) {
    rows = rows.filter((r) => {
      const hit = r.reviewCategory?.find((c) => c.category === category);
      if (!hit) return false;
      if (min === null) return hit.rating !== null;
      return typeof hit.rating === "number" && hit.rating >= min;
    });
  }

  if (approvedOnly) {
    rows = rows.filter((r) => r.approved === true);
  }

  rows = rows.filter((r) => {
    const t = toEpochMs(r);
    if (fromMs !== null && !Number.isNaN(fromMs) && t < fromMs) return false;
    if (toMs !== null && !Number.isNaN(toMs) && t > toMs) return false;
    return true;
  });

  // ---- Sorting ----
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

  // (No need for another defaults pass here)

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
