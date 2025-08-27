'use client';

import { useEffect, useMemo, useState } from 'react';

type Review = {
  id: number;
  publicReview: string;
  listingName: string;
  guestName: string;
  submittedAt: string;
  reviewCategory: { category: string; rating: number | null }[];
};

export default function PublicReviewsClient({ slug }: { slug: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [approvals, setApprovals] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const url = new URL('/api/reviews/hostaway', window.location.origin);
    url.searchParams.set('listing', slug);
    fetch(url)
      .then(r => r.json())
      .then(d => setReviews(d.result ?? []));
    try {
      setApprovals(JSON.parse(localStorage.getItem('approvals') || '{}'));
    } catch { /* noop */ }
  }, [slug]);

  const approved = useMemo(
    () => reviews.filter(r => approvals[r.id]),
    [reviews, approvals]
  );

  return (
    <div className="p-6 space-y-2">
      <h1 className="text-2xl font-semibold">{slug} — Guest Reviews</h1>
      {approved.length === 0 && <p>No approved reviews yet.</p>}
      <ul className="space-y-4">
        {approved.map(r => (
          <li key={r.id} className="border rounded p-4">
            <p className="text-sm text-neutral-600">
              {r.guestName} • {new Date(r.submittedAt).toLocaleDateString()}
            </p>
            <p className="mt-2">{r.publicReview}</p>
            <div className="text-xs text-neutral-500 mt-2">
              {r.reviewCategory?.map(c => (
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
