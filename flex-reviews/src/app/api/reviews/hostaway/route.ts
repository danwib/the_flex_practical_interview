// src/app/api/reviews/hostaway/route.ts
import { NextRequest, NextResponse } from 'next/server';
import raw from '@/../data/mock-reviews.json';
import type { Review, ReviewsResponse } from '@/types/reviews';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// ---------- helpers ----------
const toIsoLike = (s: string) => s.replace(' ', 'T'); // "YYYY-MM-DD HH:mm:ss" → "YYYY-MM-DDTHH:mm:ss"
const safeDate = (s?: string | null) => (s ? new Date(s) : undefined);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const trim = (s: string) => s.trim().replace(/\s+/g, ' ');
const parseCsvLower = (s: string | null) =>
  s ? s.split(',').map(x => x.trim().toLowerCase()).filter(Boolean) : null;

// ---------- Zod schemas (lenient, with defaults) ----------
const CatZ = z.object({
  category: z.string().min(1),
  rating: z.number().int().min(0).max(10).nullable().optional(),
});

const ReviewZ = z.object({
  id: z.number().int(),
  type: z.string().default('guest-to-host'),
  status: z.string().default('published'),
  channel: z.string().optional().default('Direct'),          // NEW
  approved: z.boolean().optional().default(false),            // NEW
  rating: z.number().int().min(0).max(10).nullable().optional(),
  publicReview: z.string().default(''),
  reviewCategory: z.array(CatZ).default([]),
  submittedAt: z.string().min(10), // will be parsed later
  guestName: z.string().default('Guest'),
  listingName: z.string().default('Unknown listing'),
});

type ZReview = z.infer<typeof ReviewZ>;

// Validate an unknown array into typed reviews; drop invalid records
function validate(rawArr: unknown): ZReview[] {
  const arr = Array.isArray(rawArr) ? rawArr : [];
  const ok: ZReview[] = [];
  for (const r of arr) {
    const parsed = ReviewZ.safeParse(r);
    if (parsed.success) ok.push(parsed.data);
  }
  return ok;
}

// Local API shape: extend base Review with optional fields we're adding
type ApiReview = Review & {
  channel?: string;
  approved?: boolean;
  type?: string;
  status?: string;
};

// Normalise values for resilience (trim strings, clamp ratings, safe ISO dates)
function normalize(r: ZReview): ApiReview {
  const normCats = (r.reviewCategory ?? []).map((c) => ({
    category: trim(c.category),
    rating: c.rating == null ? null : clamp(c.rating, 0, 10),
  }));

  const parsed = new Date(toIsoLike(r.submittedAt));
  const iso =
    Number.isNaN(parsed.getTime())
      ? new Date(0).toISOString() // sentinel date
      : parsed.toISOString();

  return {
    id: r.id,
    type: r.type || 'guest-to-host',
    status: r.status || 'published',
    channel: r.channel ? trim(r.channel) : 'Direct',   // NEW
    approved: Boolean(r.approved),                     // NEW
    rating: r.rating == null ? null : clamp(r.rating, 0, 10),
    publicReview: r.publicReview || '',
    reviewCategory: normCats,
    submittedAt: iso, // store ISO for consistent comparisons
    guestName: trim(r.guestName || 'Guest'),
    listingName: trim(r.listingName || 'Unknown listing'),
  };
}

// Remove duplicate IDs (keep first occurrence)
function dedupeById(rows: ApiReview[]): ApiReview[] {
  const seen = new Set<number>();
  const out: ApiReview[] = [];
  for (const r of rows) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      out.push(r);
    }
  }
  return out;
}

// Optional live fetch (defaults to mock)
const HOSTAWAY_ACCOUNT_ID = process.env.HOSTAWAY_ACCOUNT_ID;
const HOSTAWAY_API_KEY = process.env.HOSTAWAY_API_KEY;

async function fetchReviews(): Promise<ApiReview[]> {
  // Live path (optional)
  if (HOSTAWAY_ACCOUNT_ID && HOSTAWAY_API_KEY) {
    const url = `https://api.hostaway.com/v1/reviews?accountId=${encodeURIComponent(
      HOSTAWAY_ACCOUNT_ID,
    )}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${HOSTAWAY_API_KEY}` },
      // revalidate disabled: we read on-demand
      cache: 'no-store',
    });

    if (!res.ok) {
      // In production you might log this
      throw new Error(`Hostaway API error: ${res.status}`);
    }
    const json = (await res.json()) as ReviewsResponse;
    return dedupeById(validate(json?.result).map(normalize));
  }

  // Mock path (default)
  const parsed = raw as unknown as ReviewsResponse;
  return dedupeById(validate(parsed?.result).map(normalize));
}

// ---------- API ----------
type ReviewsApiSuccess = {
  status: 'success';
  result: ApiReview[]; // CHANGED to include extended fields in API
  total: number;
  page: number;
  limit: number;
};
type ReviewsApiError = { status: 'error'; message: string };

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // Existing query params
    const listing = searchParams.get('listing'); // exact match on listingName
    const q = searchParams.get('q'); // text search in publicReview/guestName/listing
    const cat = searchParams.get('category'); // category name
    const minStr = searchParams.get('min'); // min category rating
    const from = searchParams.get('from'); // YYYY-MM-DD
    const to = searchParams.get('to'); // YYYY-MM-DD
    const sortByRaw = searchParams.get('sortBy') || '-submittedAt'; // existing contract

    // Pagination (existing)
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const limit = clamp(Number(searchParams.get('limit') || 25), 1, 100);

    const min = minStr !== null ? Number(minStr) : null;

    // NEW query params (non-breaking additions)
    const typesCsv = parseCsvLower(searchParams.get('type'));        // e.g. "guest-to-host,host-to-guest"
    const channelsCsv = parseCsvLower(searchParams.get('channel'));  // e.g. "Airbnb,Direct"
    const approvedOnly = searchParams.get('approvedOnly') === 'true';

    // Optional alt sort controls (map to existing sortBy)
    // sort=date|rating, order=asc|desc
    const sortAlt = (searchParams.get('sort') || '').toLowerCase();
    const orderAlt = (searchParams.get('order') || '').toLowerCase();
    let sortBy = sortByRaw; // keep original default/behavior
    if (sortAlt === 'date') {
      sortBy = orderAlt === 'asc' ? 'submittedAt' : '-submittedAt';
    } else if (sortAlt === 'rating') {
      sortBy = orderAlt === 'asc' ? 'rating' : '-rating';
    }

    // Load + normalise
    const all = await fetchReviews();

    // Default: published only (change if you need drafts)
    let rows = all.filter((r) => (r.status ?? 'published') === 'published');

    // Filters (existing)
    if (listing) rows = rows.filter((r) => r.listingName === listing);

    if (q) {
      const s = q.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.publicReview.toLowerCase().includes(s) ||
          r.guestName.toLowerCase().includes(s) ||
          r.listingName.toLowerCase().includes(s),
      );
    }

    if (cat) {
      // accept unknown categories too; if you want to enforce allowed set, also check ALLOWED_CATEGORIES.has(cat)
      rows = rows.filter((r) => r.reviewCategory?.some((c) => c.category === cat));
      if (min !== null && !Number.isNaN(min)) {
        rows = rows.filter((r) =>
          r.reviewCategory?.some(
            (c) => c.category === cat && (c.rating ?? -Infinity) >= min,
          ),
        );
      }
    }

    // NEW: type filter
    if (typesCsv && typesCsv.length > 0) {
      rows = rows.filter((r) => r.type && typesCsv.includes(String(r.type).toLowerCase()));
    }

    // NEW: channel filter
    if (channelsCsv && channelsCsv.length > 0) {
      rows = rows.filter((r) => r.channel && channelsCsv.includes(String(r.channel).toLowerCase()));
    }

    // NEW: approvedOnly filter
    if (approvedOnly) {
      rows = rows.filter((r) => r.approved === true);
    }

    // Hardened date filtering (ISO stored in submittedAt)
    if (from) {
      const f = safeDate(`${from}T00:00:00`);
      if (f && !Number.isNaN(f.getTime())) {
        rows = rows.filter((r) => {
          const d = new Date(r.submittedAt);
          return !Number.isNaN(d.getTime()) && d >= f;
        });
      }
    }
    if (to) {
      const t = safeDate(`${to}T23:59:59`);
      if (t && !Number.isNaN(t.getTime())) {
        rows = rows.filter((r) => {
          const d = new Date(r.submittedAt);
          return !Number.isNaN(d.getTime()) && d <= t;
        });
      }
    }

    // Sorting (existing, with mapped sortBy)
    const key = sortBy.startsWith('-') ? sortBy.slice(1) : sortBy;
    const dir = sortBy.startsWith('-') ? -1 : 1;
    rows.sort((a, b) => {
      const av =
        key === 'submittedAt'
          ? new Date(a.submittedAt).getTime()
          : (a.rating ?? -1);
      const bv =
        key === 'submittedAt'
          ? new Date(b.submittedAt).getTime()
          : (b.rating ?? -1);
      return (av - bv) * dir;
    });

    // Pagination (existing)
    const total = rows.length;
    const start = (page - 1) * limit;
    rows = rows.slice(start, start + limit);

    const payload: ReviewsApiSuccess = {
      status: 'success',
      result: rows,
      total,
      page,
      limit,
    };
    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    const payload: ReviewsApiError = {
      status: 'error',
      message: err instanceof Error ? err.message : 'Unknown error',
    };
    return NextResponse.json(payload, { status: 500 });
  }
}
