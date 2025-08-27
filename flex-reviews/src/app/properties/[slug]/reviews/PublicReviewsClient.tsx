'use client';

import { useEffect, useMemo, useState } from 'react';

type CategoryRating = { category: string; rating: number | null };

type Review = {
  id: number | string;
  publicReview: string;
  listingName: string;
  guestName: string;
  submittedAt: string;            // "YYYY-MM-DD HH:mm:ss"
  submittedAtIso?: string;        // optional ISO
  reviewCategory: CategoryRating[];
  approved?: boolean;             // optional server-approved flag
  channel?: string;               // optional (if present in data)
  rating?: number | null;         // optional overall rating (often /10 in our mock)
};

// Simple star renderer (supports halves by rounding your mean to nearest .5 if desired)
function StarRating({ value, outOf = 5, size = 'h-4 w-4' }: { value: number; outOf?: number; size?: string }) {
  // clamp 0..outOf
  const v = Math.max(0, Math.min(outOf, value));
  const stars = Array.from({ length: outOf }, (_, i) => {
    const filled = i + 1 <= Math.floor(v);
    const half = !filled && i + 0.5 <= v;
    return (
      <svg key={i} viewBox="0 0 24 24" className={`${size} inline-block`}>
        {/* outline */}
        <path d="M22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24z"
              fill="none" stroke="currentColor" className="text-ink/30" />
        {/* fill (full or half) */}
        {filled && (
          <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21z"
                fill="currentColor" className="text-amber-500" />
        )}
        {half && (
          <defs>
            <linearGradient id={`half-${i}`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="50%" stopColor="currentColor" />
              <stop offset="50%" stopColor="transparent" />
            </linearGradient>
          </defs>
        )}
        {half && (
          <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21z"
                fill="url(#half-0)" className="text-amber-500" />
        )}
      </svg>
    );
  });
  return <span>{stars}</span>;
}

export default function PublicReviewsClient({ slug }: { slug: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [approvals, setApprovals] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const url = new URL('/api/reviews/hostaway', window.location.origin);
    url.searchParams.set('listing', slug);
    url.searchParams.set('sort', 'date');  // newest first
    url.searchParams.set('order', 'desc');
    // Fetch all rows; we'll union server-approved + local-approved
    fetch(url)
      .then((r) => r.json())
      .then((d) => setReviews(Array.isArray(d?.result) ? d.result : []));

    try {
      setApprovals(JSON.parse(localStorage.getItem('approvals') || '{}'));
    } catch { /* noop */ }
  }, [slug]);

  // Union of server-approved OR locally-approved
  const approved = useMemo(() => {
    return reviews.filter((r) => r.approved === true || approvals[Number(r.id)] === true);
  }, [reviews, approvals]);

  // Average rating (convert /10 → /5 if needed)
  const avg5 = useMemo(() => {
    const vals = approved
      .map((r) => (r.rating == null ? null : r.rating))
      .filter((v): v is number => v != null);
    if (!vals.length) return null;
    const mean10 = vals.reduce((a, b) => a + b, 0) / vals.length;
    const as5 = mean10 > 5 ? mean10 / 2 : mean10; // if data already /5, this keeps it
    // round to nearest 0.5 for nicer stars
    return Math.round(as5 * 2) / 2;
  }, [approved]);

  const formatWhen = (r: Review) => {
    // Prefer ISO; otherwise convert "YYYY-MM-DD HH:mm:ss" → ISO-ish for Date()
    const isoish = r.submittedAtIso ?? (r.submittedAt ? r.submittedAt.replace(' ', 'T') : '');
    const dt = isoish ? new Date(isoish) : null;
    return dt && !isNaN(dt.getTime())
      ? dt.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
      : r.submittedAt;
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header summary */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">{slug} — Guest Reviews</h1>
        <div className="mt-2 flex items-center gap-2 text-sm text-subtle">
          <span className="text-ink text-base font-medium">{avg5 ?? '–'}</span>
          {typeof avg5 === 'number' && <StarRating value={avg5} />}
          <span>({approved.length} review{approved.length === 1 ? '' : 's'})</span>
        </div>
      </div>

      {approved.length === 0 && <p className="text-subtle">No approved reviews yet.</p>}

      <ul className="space-y-4">
        {approved.map((r) => (
          <ReviewItem key={r.id} r={r} formatWhen={formatWhen} />
        ))}
      </ul>
    </div>
  );
}

function ReviewItem({ r, formatWhen }: { r: Review; formatWhen: (r: Review) => string }) {
  const [open, setOpen] = useState(false);
  const body = r.publicReview || '';
  const MAX = 300;
  const needsFold = body.length > MAX;
  const shown = open || !needsFold ? body : body.slice(0, MAX) + '…';

  return (
    <li className="border border-line rounded-2xl p-4 bg-surface">
      <p className="text-sm text-subtle">
        <span className="font-medium text-ink">{r.guestName}</span> • {formatWhen(r)}
        {r.channel && (
          <span className="ml-2 rounded-full border px-2 py-0.5 text-xs text-subtle border-line">
            {r.channel}
          </span>
        )}
      </p>

      <p className="mt-2 leading-relaxed">{shown}</p>

      {needsFold && (
        <button
          className="mt-2 text-sm text-brand hover:underline"
          onClick={() => setOpen(!open)}
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      )}

      {!!r.reviewCategory?.length && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-subtle">
          {r.reviewCategory.map((c) => (
            <span key={c.category} className="rounded-full border px-2 py-0.5 border-line">
              {c.category}: <b>{c.rating ?? '-'}</b>
            </span>
          ))}
        </div>
      )}
    </li>
  );
}
