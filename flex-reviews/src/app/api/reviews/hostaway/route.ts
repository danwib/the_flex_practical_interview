import { NextRequest, NextResponse } from 'next/server';
import raw from '@/../data/mock-reviews.json';
import type { Review, ReviewsResponse } from '@/types/reviews';

export const dynamic = 'force-dynamic';

function loadReviews(): Review[] {
  // If you’re using zod, you could parse/validate here.
  const parsed = raw as unknown as ReviewsResponse;
  return parsed.result as Review[];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const listing = searchParams.get('listing');           // exact listingName
  const q = searchParams.get('q');                      // text search
  const cat = searchParams.get('category');             // category name
  const minStr = searchParams.get('min');               // min category rating
  const from = searchParams.get('from');                // YYYY-MM-DD
  const to = searchParams.get('to');                    // YYYY-MM-DD

  const min = minStr !== null ? Number(minStr) : null;

  const all: Review[] = loadReviews();
  let rows: Review[] = all.slice();

  if (listing) rows = rows.filter(r => r.listingName === listing);

  if (q) {
    const s = q.toLowerCase();
    rows = rows.filter(r =>
      r.publicReview?.toLowerCase().includes(s) ||
      r.guestName?.toLowerCase().includes(s) ||
      r.listingName?.toLowerCase().includes(s)
    );
  }

  if (cat) {
    rows = rows.filter(r => r.reviewCategory?.some(c => c.category === cat));
    if (min !== null && !Number.isNaN(min)) {
      rows = rows.filter(r =>
        r.reviewCategory?.some(c => c.category === cat && (c.rating ?? -Infinity) >= min)
      );
    }
  }

  // Simple string compare is OK because submittedAt is ISO-ish; if unsure, normalise.
  if (from) rows = rows.filter(r => r.submittedAt >= `${from} 00:00:00`);
  if (to)   rows = rows.filter(r => r.submittedAt <= `${to} 23:59:59`);

  return NextResponse.json({ status: 'success', result: rows } as ReviewsResponse);
}
