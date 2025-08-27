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
};

export default function PublicReviewsClient({ slug }: { slug: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [approvals, setApprovals] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const url = new URL('/api/reviews/hostaway', window.location.origin);
    url.searchParams.set('listing', slug);
    url.searchParams.set('sort', 'date');  // newest first for nicer UX
    url.searchParams.set('order', 'desc');
    // IMPORTANT: do NOT set approvedOnly=true here, we need all rows to union with local approvals

    fetch(url)
      .then((r) => r.json())
      .then((d) => setReviews(Array.isArray(d?.result) ? d.result : []));

    try {
      setApprovals(JSON.parse(localStorage.getItem('approvals') || '{}'));
    } catch {
      /* noop */
    }
  }, [slug]);

  // Union of server-approved OR locally-approved
  const approved = useMemo(() => {
    return reviews.filter((r) => {
      const idNum = Number(r.id);
      return r.approved === true || approvals[idNum] === true;
    });
  }, [reviews, approvals]);

  const formatWhen = (r: Review) => {
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
