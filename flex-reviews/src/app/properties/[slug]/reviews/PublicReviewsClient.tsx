'use client';

import { useEffect, useMemo, useState } from 'react';

type CategoryRating = { category: string; rating: number | null };

type Review = {
  id: number | string;
  publicReview: string;
  listingName: string;
  guestName: string;
  submittedAt: string;            // "YYYY-MM-DD HH:mm:ss"
  submittedAtIso?: string;        // optional ISO (if generator provides it)
  reviewCategory: CategoryRating[];
  approved?: boolean;             // optional (server-side flag, if present)
  channel?: string;               // optional (for future display/filters)
  type?: string;                  // optional
  rating?: number | null;         // optional overall rating
};

export default function PublicReviewsClient({ slug }: { slug: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [approvals, setApprovals] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const url = new URL('/api/reviews/hostaway', window.location.origin);
    url.searchParams.set('listing', slug);
    url.searchParams.set('approvedOnly', 'true'); // NEW: use server-approved reviews
    url.searchParams.set('sort', 'date');         // NEW: newest first
    url.searchParams.set('order', 'desc');

    fetch(url)
      .then((r) => r.json())
      .then((d) => setReviews(Array.isArray(d?.result) ? d.result : []));

    try {
      setApprovals(JSON.parse(localStorage.getItem('approvals') || '{}'));
    } catch {
      // noop
    }
  }, [slug]);

  // Keep previous functionality:
  // If there are any local approvals saved, use them to filter; otherwise use server result as-is.
  const approved = useMemo(() => {
    const hasLocalApprovals = approvals && Object.keys(approvals).length > 0;
    if (!hasLocalApprovals) return reviews;
    return reviews.filter((r) => approvals[Number(r.id)] === true);
  }, [reviews, approvals]);

  const formatWhen = (r: Review) => {
    // Prefer ISO if present; otherwise convert "YYYY-MM-DD HH:mm:ss" → "YYYY-MM-DDTHH:mm:ss"
    const isoish = r.submittedAtIso ?? (r.submittedAt ? r.submittedAt.replace(' ', 'T') : '');
    const dt = isoish ? new Date(isoish) : null;
    return dt && !isNaN(dt.getTime()) ? dt.toLocaleDateString() : r.submittedAt;
  };

  return (
    <div className="p-6 space-y-2">
      <h1 className="text-2xl font-semibold">{slug} — Guest Reviews</h1>
      {approved.length === 0 && <p>No approved reviews yet.</p>}
      <ul className="space-y-4">
        {approved.map((r) => (
          <li key={r.id} className="border rounded p-4">
            <p className="text-sm text-neutral-600">
              {r.guestName} • {formatWhen(r)}
            </p>
            <p className="mt-2">{r.publicReview}</p>
            <div className="text-xs text-neutral-500 mt-2">
              {r.reviewCategory?.map((c) => (
                <span key={c.category} className="mr-3">
                  {c.category}: <b>{c.rating ?? '-'}</b>
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
