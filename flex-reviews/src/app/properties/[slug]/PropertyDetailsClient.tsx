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

function Bullet() {
  return <span aria-hidden className="mx-2 text-subtle">•</span>;
}

function Star({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  );
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="py-8 border-t border-line">
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function PropertyDetailsClient({ slug }: { slug: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [approvals, setApprovals] = useState<Record<number, boolean>>({});
  const [aboutOpen, setAboutOpen] = useState(false);
  const [showAllAmenities, setShowAllAmenities] = useState(false);

  // Fetch all reviews for this listing; show approved-only (server OR local demo)
  useEffect(() => {
    const url = new URL('/api/reviews/hostaway', window.location.origin);
    url.searchParams.set('listing', slug);
    url.searchParams.set('sort', 'date');
    url.searchParams.set('order', 'desc');
    fetch(url).then(r => r.json()).then(d => setReviews(Array.isArray(d?.result) ? d.result : []));
    try { setApprovals(JSON.parse(localStorage.getItem('approvals') || '{}')); } catch {}
  }, [slug]);

  const approved = useMemo(
    () => reviews.filter(r => r.approved === true || approvals[Number(r.id)] === true),
    [reviews, approvals]
  );

  // /10 → /5 if needed
  const avg5 = useMemo(() => {
    const vals = approved.map(r => r.rating).filter((n): n is number => n != null);
    if (!vals.length) return null;
    const mean10 = vals.reduce((a,b)=>a+b,0)/vals.length;
    return Math.round(((mean10 > 5 ? mean10/2 : mean10) + Number.EPSILON)*100)/100;
  }, [approved]);

  const formatWhen = (r: Review) => {
    const isoish = r.submittedAtIso ?? (r.submittedAt ? r.submittedAt.replace(' ', 'T') : '');
    const dt = isoish ? new Date(isoish) : null;
    return dt && !isNaN(dt.getTime())
      ? dt.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
      : r.submittedAt;
  };

  // ---- Page layout ----
  // Breadcrumb + title/meta + rating block, then gallery
  return (
    <div className="bg-background text-ink">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Breadcrumb */}
        <nav className="text-sm">
          <a href="/dashboard" className="text-subtle hover:text-ink">All listings</a>
        </nav>

        {/* Title / Meta / Rating */}
        <header className="mt-2">
          <h1 className="text-ink text-3xl md:text-4xl font-semibold leading-tight">
            {slug}
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 text-subtle">
            <span>Apartment</span>
            <Bullet />
            <span>5 guests</span>
            <Bullet />
            <span>2 bedrooms</span>
            <Bullet />
            <span>2 bathrooms</span>
            <Bullet />
            <span className="inline-flex items-center gap-1.5" aria-label="Average rating">
              <span className="text-ink">{avg5 ?? '–'}</span>
              <Star className="h-4 w-4 text-ink" />
              <span>({approved.length} review{approved.length === 1 ? '' : 's'})</span>
            </span>
          </div>
        </header>


        {/* Gallery (placeholder) */}
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="sm:col-span-2 rounded-2xl border border-line bg-surface h-64" />
          <div className="grid gap-2">
            <div className="rounded-2xl border border-line bg-surface h-31" />
            <div className="rounded-2xl border border-line bg-surface h-31" />
          </div>
        </div>

        {/* About — matches “Show more” behavior */}
        <Section title="About this place">
          <p className="leading-relaxed">
            Stylish serviced apartment with fast Wi-Fi and self check-in. Moments from transport and local amenities.
            Ideal for work trips and weekend stays. The location is ideal—close to great cafes, shops, and bars, with
            easy access to transport. Everything is ready for you to enjoy your stay.
          </p>
          <div className="mt-2">
            <button
              className="text-brand hover:text-ink text-sm"
              onClick={() => setAboutOpen(s => !s)}
            >
              {aboutOpen ? 'Show less' : 'Show more'}
            </button>
            {aboutOpen && (
              <p className="mt-2 leading-relaxed text-ink/90">
                Additional details: quiet building, keypad entry, weekly cleaning options on request, and flexible stays.
              </p>
            )}
          </div>
        </Section>

        {/* Amenities — show first 12 then “Show all” */}
        <Section title="Amenities">
          {(() => {
            const all = [
              "Free Wi-Fi","Internet","Private living room","Essentials","Towels","Kitchen","Heating","Washer",
              "Dryer","Air conditioning","Self check-in","Workspace","Smart TV","Microwave","Dishwasher","Coffee maker",
              "Hair dryer","Iron","Elevator","Garden view","City view","Crib","High chair","Long stays allowed"
            ];
            const shown = showAllAmenities ? all : all.slice(0, 12);
            return (
              <>
                <ul className="grid grid-cols-2 gap-2 text-ink sm:grid-cols-3">
                  {shown.map(a => <li key={a}>{a}</li>)}
                </ul>
                <button
                  className="mt-3 text-brand hover:text-ink text-sm"
                  onClick={() => setShowAllAmenities(s => !s)}
                >
                  {showAllAmenities ? `Show fewer amenities` : `Show all ${all.length} amenities`}
                </button>
              </>
            );
          })()}
        </Section>

        {/* Available days — placeholder block to mirror layout */}
        <Section title="Available days">
          <div className="rounded-2xl border border-line bg-surface p-8 text-subtle">
            Calendar integration placeholder
          </div>
        </Section>

        {/* Reviews — Selected (approved) only */}
        <Section id="reviews" title="Reviews">
          {approved.length === 0 ? (
            <p className="text-subtle">No approved reviews yet.</p>
          ) : (
            <>
              <ul className="space-y-4">
                {approved.map((r) => (
                  <li key={r.id} className="rounded-2xl border border-line bg-surface p-4">
                    <p className="text-sm text-subtle">
                      <span className="font-medium text-ink">{r.guestName}</span>
                      <Bullet />
                      <span>{formatWhen(r)}</span>
                      {r.channel && (
                        <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs">
                          {r.channel}
                        </span>
                      )}
                    </p>
                    <p className="mt-2 leading-relaxed">{r.publicReview}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                <a
                  href={`/properties/${encodeURIComponent(slug)}/reviews`}
                  className="inline-flex items-center rounded-xl border border-line bg-surface px-3 py-2 text-sm text-brand hover:text-ink"
                >
                  See all reviews
                </a>
              </div>
            </>
          )}
        </Section>

        {/* Good to know — mirror house rules & policy */}
        <Section title="Good to know">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-surface p-3">
              <div className="text-xs uppercase text-subtle">House Rules</div>
              <div className="mt-1 text-ink">
                Check-in: 3 pm<br/>Check-out: 10 am<br/>No pets · No smoking inside
              </div>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <div className="text-xs uppercase text-subtle">Cancellation Policy</div>
              <div className="mt-1 text-ink">
                100% refund up to 14 days before arrival
              </div>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <div className="text-xs uppercase text-subtle">Contact</div>
              <div className="mt-1 text-ink">info@theflexliving.com</div>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
