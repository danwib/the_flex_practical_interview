// src/app/properties/[slug]/PropertyDetailsClient.tsx
'use client';

import { useEffect, useMemo, useState } from "react";

type CategoryRating = { category: string; rating: number | null };
type Review = {
  id: number | string;
  publicReview: string;
  listingName: string;
  guestName: string;
  submittedAt: string;
  submittedAtIso?: string;
  reviewCategory: CategoryRating[];
  approved?: boolean;
  channel?: string;
  rating?: number | null; // may be /10 in your data
};

function StarRating({ value, outOf = 5, size = 'h-4 w-4' }: { value: number; outOf?: number; size?: string }) {
  const stars = Array.from({ length: outOf }, (_, i) => {
    const diff = value - i;
    const type = diff >= 1 ? 'full' : diff >= 0.5 ? 'half' : 'empty';
    return (
      <svg key={i} viewBox="0 0 24 24" aria-hidden className={`${size} inline-block`}>
        {type !== 'empty' ? (
          <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21z" fill="currentColor" />
        ) : (
          <path d="M22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24z" fill="none" stroke="currentColor" />
        )}
      </svg>
    );
  });
  return <span className="text-amber-500">{stars}</span>;
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="py-6 border-t border-line">
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function PropertyDetailsClient({ slug }: { slug: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [approvals, setApprovals] = useState<Record<number, boolean>>({});

  // Fetch all reviews for this listing (we'll show approved union only)
  useEffect(() => {
    const url = new URL('/api/reviews/hostaway', window.location.origin);
    url.searchParams.set('listing', slug);
    url.searchParams.set('sort', 'date');
    url.searchParams.set('order', 'desc');

    fetch(url)
      .then((r) => r.json())
      .then((d) => setReviews(Array.isArray(d?.result) ? d.result : []));

    try {
      setApprovals(JSON.parse(localStorage.getItem('approvals') || '{}'));
    } catch { /* noop */ }
  }, [slug]);

  // Only approved: server-approved OR locally-approved (demo union)
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
    const asFive = mean10 > 5 ? mean10 / 2 : mean10; // support either scale
    return Math.round(asFive * 10) / 10;
  }, [approved]);

  const formatWhen = (r: Review) => {
    const isoish = r.submittedAtIso ?? (r.submittedAt ? r.submittedAt.replace(' ', 'T') : '');
    const dt = isoish ? new Date(isoish) : null;
    return dt && !isNaN(dt.getTime())
      ? dt.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
      : r.submittedAt;
  };

  // Show top N approved on the property page; link to full list
  const TOP = 3;
  const topApproved = approved.slice(0, TOP);

  return (
    <div className="bg-surface">
      {/* HERO */}
      <div className="relative h-56 w-full overflow-hidden rounded-none bg-gradient-to-br from-brand/5 to-brand/0">
        {/* Placeholder hero (replace with real gallery later) */}
        <div className="absolute inset-0 grid place-items-center">
          <div className="rounded-2xl border border-line bg-surface/80 px-4 py-2 shadow-sm backdrop-blur">
            <h1 className="text-2xl font-semibold text-ink">{slug}</h1>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="mx-auto max-w-5xl px-4 py-6">
        {/* Quick facts row (stub—align to Flex’s details later) */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-surface p-3">
            <div className="text-xs uppercase text-subtle">Location</div>
            <div className="text-ink">Central London</div>
          </div>
          <div className="rounded-xl border border-line bg-surface p-3">
            <div className="text-xs uppercase text-subtle">Sleeps</div>
            <div className="text-ink">2–4 guests</div>
          </div>
          <div className="rounded-xl border border-line bg-surface p-3">
            <div className="text-xs uppercase text-subtle">Average Rating</div>
            <div className="flex items-center gap-2 text-ink">
              <span>{avg5 ?? '–'}</span>
              {typeof avg5 === 'number' && <StarRating value={avg5} />}
              <span className="text-subtle text-sm">({approved.length} review{approved.length === 1 ? '' : 's'})</span>
            </div>
          </div>
        </div>

        {/* About section (stub copy for now) */}
        <Section title="About this place">
          <p className="leading-relaxed text-ink">
            Stylish serviced apartment with fast Wi-Fi and self check-in. Moments from transport and local amenities.
            Ideal for work trips and weekend stays.
          </p>
        </Section>

        {/* Selected Guest Reviews */}
        <Section id="reviews" title="Selected Guest Reviews">
          {approved.length === 0 ? (
            <p className="text-subtle">No approved reviews yet.</p>
          ) : (
            <>
              <ul className="space-y-3">
                {topApproved.map((r) => (
                  <li key={r.id} className="rounded-2xl border border-line bg-surface p-4">
                    <p className="text-sm text-subtle">
                      <span className="font-medium text-ink">{r.guestName}</span> • {formatWhen(r)}
                      {r.channel && (
                        <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs text-subtle">
                          {r.channel}
                        </span>
                      )}
                    </p>
                    <p className="mt-2 leading-relaxed text-ink">{r.publicReview}</p>
                    {!!r.reviewCategory?.length && (
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-subtle">
                        {r.reviewCategory.map((c) => (
                          <span key={c.category} className="rounded-full border border-line px-2 py-0.5">
                            {c.category}: <b className="text-ink">{c.rating ?? '-'}</b>
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {/* Link to full reviews page */}
              {approved.length > TOP && (
                <div className="mt-4">
                  <a
                    href={`/properties/${encodeURIComponent(slug)}/reviews`}
                    className="inline-flex items-center rounded-xl border border-line bg-surface px-3 py-2 text-sm text-brand hover:text-ink"
                  >
                    See all {approved.length} reviews
                  </a>
                </div>
              )}
            </>
          )}
        </Section>

        {/* Amenities section (stub) */}
        <Section title="Amenities">
          <ul className="grid grid-cols-2 gap-2 text-ink sm:grid-cols-3">
            <li>Self check-in</li><li>Fast Wi-Fi</li><li>Kitchenette</li>
            <li>Workspace</li><li>Air conditioning</li><li>Washer/Dryer</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
