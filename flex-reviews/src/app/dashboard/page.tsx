'use client';

import { useEffect, useMemo, useState } from 'react';

type Review = {
  id: number;
  publicReview: string;
  guestName: string;
  listingName: string;
  submittedAt: string;
  submittedAtIso?: string;                // optional, if present in data
  reviewCategory: { category: string; rating: number | null }[];
  channel?: string;                       // optional
  type?: string;                          // optional
  rating?: number | null;                 // optional
  approved?: boolean;                     // optional server-approved flag
};

function useApprovals() {
  const KEY = 'approvals';
  const [map, setMap] = useState<Record<number, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
  });
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(map)); }, [map]);
  const toggle = (id: number) => setMap(m => ({ ...m, [id]: !m[id] }));
  const set = (id: number, v: boolean) => setMap(m => ({ ...m, [id]: v }));
  return { map, toggle, set };
}

export default function DashboardPage() {
  const [reviews, setReviews] = useState<Review[]>([]);

  // existing filters
  const [q, setQ] = useState('');
  const [listing, setListing] = useState('');
  const [category, setCategory] = useState('');
  const [min, setMin] = useState<number | ''>('');

  // NEW filters
  const [channel, setChannel] = useState('');         // single value → API supports CSV but single is fine
  const [type, setType] = useState('');               // "
  const [sortKey, setSortKey] = useState<'date' | 'rating'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const { map, set: setApproval } = useApprovals();

  // Fetch data based on filters
  useEffect(() => {
    const url = new URL('/api/reviews/hostaway', window.location.origin);
    if (q) url.searchParams.set('q', q);
    if (listing) url.searchParams.set('listing', listing);
    if (category) url.searchParams.set('category', category);
    if (min !== '') url.searchParams.set('min', String(min));
    if (channel) url.searchParams.set('channel', channel);
    if (type) url.searchParams.set('type', type);
    if (sortKey) url.searchParams.set('sort', sortKey);
    if (sortOrder) url.searchParams.set('order', sortOrder);

    fetch(url)
      .then(r => r.json())
      .then(d => setReviews(Array.isArray(d?.result) ? d.result : []));
  }, [q, listing, category, min, channel, type, sortKey, sortOrder]);

  // Options (derived from results)
  const listings = useMemo(
    () => Array.from(new Set(reviews.map(r => r.listingName))).sort(),
    [reviews]
  );

  const cats = useMemo(() => {
    const s = new Set<string>();
    reviews.forEach(r => r.reviewCategory?.forEach(c => s.add(c.category)));
    return Array.from(s).sort();
  }, [reviews]);

  const channelOptions = useMemo(
    () => Array.from(new Set(reviews.map(r => r.channel).filter(Boolean))).sort() as string[],
    [reviews]
  );

  const typeOptions = useMemo(
    () => Array.from(new Set(reviews.map(r => r.type).filter(Boolean))).sort() as string[],
    [reviews]
  );

  // Helpers
  const formatDate = (r: Review) => {
    // prefer ISO if present, else convert "YYYY-MM-DD HH:mm:ss" to ISO (append Z to avoid TZ ambiguity)
    const iso = r.submittedAtIso ?? (r.submittedAt.replace(' ', 'T') + 'Z');
    const d = new Date(iso);
    return isNaN(d.getTime()) ? r.submittedAt : d.toLocaleDateString();
  };

  const isApproved = (r: Review) => (r.approved === true) || !!map[r.id];

  // Quick stats for header chips
  const total = reviews.length;
  const approvedCount = reviews.reduce((acc, r) => acc + (isApproved(r) ? 1 : 0), 0);
  const avgRating = useMemo(() => {
    const vals = reviews.map(r => r.rating).filter((n): n is number => n != null);
    if (!vals.length) return null;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.round(mean * 10) / 10;
  }, [reviews]);

  // Input styling (uses brand tokens)
  const inputCls =
    'w-full bg-surface border border-line rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/30';

  // --- Public view quick-nav ---
  const [publicListing, setPublicListing] = useState<string>('');
  const openPublic = (variant: 'property' | 'reviews') => {
    if (!publicListing) return;
    const base = `/properties/${encodeURIComponent(publicListing)}`;
    const href = variant === 'property' ? base : `${base}/reviews`;
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="p-6 space-y-4">
      {/* Title row with stats and NEW public view dropdown */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-2xl font-semibold text-ink">Manager Reviews Dashboard</h1>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-3">
          {/* Quick counters */}
          <div className="flex gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-subtle">
              Total: <b className="text-ink">{total}</b>
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-subtle">
              Approved: <b className="text-ink">{approvedCount}</b>
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-subtle">
              Avg rating: <b className="text-ink">{avgRating ?? '–'}</b>
            </span>
          </div>

          {/* Public view quick-nav */}
          <div className="flex items-center gap-2">
            <select
              className={inputCls}
              value={publicListing}
              onChange={(e) => setPublicListing(e.target.value)}
              aria-label="Choose listing to view public page"
            >
              <option value="">Public view: choose listing…</option>
              {listings.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <button
              onClick={() => openPublic('property')}
              disabled={!publicListing}
              className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-brand hover:text-ink disabled:opacity-50"
              aria-label="Open property details page"
              title={publicListing ? `Open property page for ${publicListing}` : 'Select a listing'}
            >
              Open property
            </button>
            <button
              onClick={() => openPublic('reviews')}
              disabled={!publicListing}
              className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-subtle hover:text-ink disabled:opacity-50"
              aria-label="Open all reviews page"
              title={publicListing ? `Open reviews page for ${publicListing}` : 'Select a listing'}
            >
              All reviews
            </button>
          </div>
        </div>
      </div>

      {/* Sticky filter toolbar */}
      <div className="sticky top-0 z-10 -mx-6 border-b border-line bg-surface/90 px-6 py-3 backdrop-blur">
        <div className="grid gap-2 sm:grid-cols-4">
          <input
            className={inputCls}
            placeholder="Search text / guest / listing"
            value={q}
            onChange={e => setQ(e.target.value)}
            aria-label="Search"
          />

          <select
            className={inputCls}
            value={listing}
            onChange={e => setListing(e.target.value)}
            aria-label="Listing"
          >
            <option value="">All listings</option>
            {listings.map(l => <option key={l} value={l}>{l}</option>)}
          </select>

          <select
            className={inputCls}
            value={category}
            onChange={e => setCategory(e.target.value)}
            aria-label="Category"
          >
            <option value="">Any category</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <input
            className={inputCls}
            type="number" min={0} max={10}
            placeholder="Min cat rating"
            value={min}
            onChange={e => setMin(e.target.value === '' ? '' : Number(e.target.value))}
            aria-label="Minimum category rating"
          />
        </div>

        {/* second row */}
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <select
            className={inputCls}
            value={channel}
            onChange={e => setChannel(e.target.value)}
            aria-label="Channel"
          >
            <option value="">All channels</option>
            {channelOptions.map(ch => <option key={ch} value={ch}>{ch}</option>)}
          </select>

          <select
            className={inputCls}
            value={type}
            onChange={e => setType(e.target.value)}
            aria-label="Type"
          >
            <option value="">All types</option>
            {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <select
            className={inputCls}
            value={sortKey}
            onChange={e => setSortKey(e.target.value as 'date' | 'rating')}
            aria-label="Sort key"
          >
            <option value="date">Sort by date</option>
            <option value="rating">Sort by overall rating</option>
          </select>

          <div className="flex gap-2">
            <select
              className={inputCls}
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value as 'asc' | 'desc')}
              aria-label="Sort order"
            >
              <option value="desc">Order: Desc</option>
              <option value="asc">Order: Asc</option>
            </select>
            <button
              className="whitespace-nowrap rounded-xl border border-line bg-surface px-3 text-sm text-subtle hover:text-ink"
              onClick={() => { setQ(''); setListing(''); setCategory(''); setMin(''); setChannel(''); setType(''); setSortKey('date'); setSortOrder('desc'); }}
              aria-label="Clear filters"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-line bg-surface max-h-[calc(100vh-200px)] overflow-auto">
        <table className="w-full text-sm">
          <thead className="text-left border-b border-line bg-surface sticky top-0 z-10">
            <tr className="text-xs uppercase tracking-wide text-subtle">
              <th className="py-3 px-3">Approve</th>
              <th className="px-3">Listing</th>
              <th className="px-3">Guest</th>
              <th className="px-3">Submitted</th>
              <th className="px-3">Text</th>
              <th className="px-3">Categories</th>
              <th className="px-3">Channel</th>
              <th className="px-3">Type</th>
              <th className="px-3">Overall</th>
            </tr>
          </thead>
          <tbody>
            {reviews.map(r => (
              <tr
                key={r.id}
                className="border-b border-line align-top odd:bg-[rgba(0,0,0,0.015)] hover:bg-[rgba(0,0,0,0.03)]"
              >
                <td className="py-3 px-3">
                  <input
                    type="checkbox"
                    className="accent-brand"
                    checked={isApproved(r)}
                    onChange={() => setApproval(r.id, !isApproved(r))}
                    aria-label={`Approve review ${r.id}`}
                  />
                </td>
                <td className="px-3 text-ink">{r.listingName}</td>
                <td className="px-3">{r.guestName}</td>
                <td className="px-3 text-subtle">{formatDate(r)}</td>
                <td className="px-3 max-w-[52ch]">
                  <span className="text-ink">{r.publicReview}</span>
                </td>
                <td className="px-3">
                  {r.reviewCategory?.map(c => (
                    <span
                      key={c.category}
                      className="mr-2 inline-flex items-center rounded-full border border-line px-2 py-0.5 text-xs text-subtle"
                    >
                      {c.category}: <b className="ml-1 text-ink">{c.rating ?? '-'}</b>
                    </span>
                  ))}
                </td>
                <td className="px-3 text-subtle">{r.channel ?? '-'}</td>
                <td className="px-3 text-subtle">{r.type ?? '-'}</td>
                <td className="px-3 text-ink">{r.rating ?? '-'}</td>
              </tr>
            ))}
            {reviews.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-subtle">
                  No reviews match the filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-subtle">
        Note: Approval states use a union of server-approved and your local selections for the demo.
        In production, this would live in a DB (Vercel KV/Postgres) keyed by review ID, and the
        public page would query <code>approvedOnly=true</code>.
      </p>
    </div>
  );
}
