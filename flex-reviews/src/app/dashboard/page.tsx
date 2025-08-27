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
  channel?: string;                       // NEW optional fields
  type?: string;                          // "
  rating?: number | null;                 // "
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

  const { map, toggle } = useApprovals();

  useEffect(() => {
    const url = new URL('/api/reviews/hostaway', window.location.origin);
    if (q) url.searchParams.set('q', q);
    if (listing) url.searchParams.set('listing', listing);
    if (category) url.searchParams.set('category', category);
    if (min !== '') url.searchParams.set('min', String(min));

    // NEW params
    if (channel) url.searchParams.set('channel', channel);
    if (type) url.searchParams.set('type', type);
    if (sortKey) url.searchParams.set('sort', sortKey);
    if (sortOrder) url.searchParams.set('order', sortOrder);

    fetch(url).then(r => r.json()).then(d => setReviews(d.result));
  }, [q, listing, category, min, channel, type, sortKey, sortOrder]);

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

  const formatDate = (r: Review) => {
    // prefer ISO if present, else convert "YYYY-MM-DD HH:mm:ss" to ISO (append Z to avoid TZ ambiguity)
    const iso = r.submittedAtIso ?? (r.submittedAt.replace(' ', 'T') + 'Z');
    const d = new Date(iso);
    return isNaN(d.getTime()) ? r.submittedAt : d.toLocaleDateString();
    // If you prefer full datetime: d.toLocaleString()
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Manager Reviews Dashboard</h1>

      <div className="grid gap-2 sm:grid-cols-4">
        <input
          className="border rounded p-2"
          placeholder="Search text/guest/listing"
          value={q}
          onChange={e => setQ(e.target.value)}
        />

        <select
          className="border rounded p-2"
          value={listing}
          onChange={e => setListing(e.target.value)}
        >
          <option value="">All listings</option>
          {listings.map(l => <option key={l} value={l}>{l}</option>)}
        </select>

        <select
          className="border rounded p-2"
          value={category}
          onChange={e => setCategory(e.target.value)}
        >
          <option value="">Any category</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <input
          className="border rounded p-2"
          type="number" min={0} max={10}
          placeholder="Min cat rating"
          value={min}
          onChange={e => setMin(e.target.value === '' ? '' : Number(e.target.value))}
        />
      </div>

      {/* NEW: second row of controls */}
      <div className="grid gap-2 sm:grid-cols-4">
        <select
          className="border rounded p-2"
          value={channel}
          onChange={e => setChannel(e.target.value)}
        >
          <option value="">All channels</option>
          {channelOptions.map(ch => <option key={ch} value={ch}>{ch}</option>)}
        </select>

        <select
          className="border rounded p-2"
          value={type}
          onChange={e => setType(e.target.value)}
        >
          <option value="">All types</option>
          {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select
          className="border rounded p-2"
          value={sortKey}
          onChange={e => setSortKey(e.target.value as 'date' | 'rating')}
        >
          <option value="date">Sort by date</option>
          <option value="rating">Sort by overall rating</option>
        </select>

        <select
          className="border rounded p-2"
          value={sortOrder}
          onChange={e => setSortOrder(e.target.value as 'asc' | 'desc')}
        >
          <option value="desc">Order: Desc</option>
          <option value="asc">Order: Asc</option>
        </select>
      </div>

      <table className="w-full text-sm">
        <thead className="text-left border-b">
          <tr>
            <th className="py-2">Approve</th>
            <th>Listing</th>
            <th>Guest</th>
            <th>Submitted</th>
            <th>Text</th>
            <th>Categories</th>
            <th>Channel</th>   {/* NEW column (non-breaking if missing) */}
            <th>Type</th>      {/* NEW column */}
            <th>Overall</th>   {/* NEW column */}
          </tr>
        </thead>
        <tbody>
          {reviews.map(r => (
            <tr key={r.id} className="border-b align-top">
              <td className="py-2">
                <input type="checkbox" checked={!!map[r.id]} onChange={() => toggle(r.id)} />
              </td>
              <td>{r.listingName}</td>
              <td>{r.guestName}</td>
              <td>{formatDate(r)}</td>
              <td className="max-w-[30ch]">{r.publicReview}</td>
              <td>
                {r.reviewCategory?.map(c => (
                  <span key={c.category} className="inline-block mr-2">
                    {c.category}: <b>{c.rating ?? '-'}</b>
                  </span>
                ))}
              </td>
              <td>{r.channel ?? '-'}</td>
              <td>{r.type ?? '-'}</td>
              <td>{r.rating ?? '-'}</td>
            </tr>
          ))}
          {reviews.length === 0 && (
            <tr>
              <td colSpan={9} className="py-8 text-center text-neutral-500">
                No reviews match the filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="text-xs text-neutral-500">
        Note: Approval states are stored locally in your browser for the demo. In production,
        this would live in a DB (Vercel KV/Postgres) keyed by review ID.
      </p>
    </div>
  );
}
