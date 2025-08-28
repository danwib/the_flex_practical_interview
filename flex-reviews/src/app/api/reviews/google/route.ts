// flex-reviews/src/app/api/reviews/google/route.ts
import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const revalidate = 0;

/** ---- Types for the (New) Google Places API fields we actually use ---- */
interface PlaceAuthorAttribution {
  displayName?: string;
  uri?: string;
  photoUri?: string;
}
interface PlaceReview {
  name?: string; // e.g. "places/PLACE_ID/reviews/REVIEW_ID"
  text?: { text?: string };
  rating?: number; // /5
  publishTime?: string; // ISO
  relativePublishTimeDescription?: string;
  googleMapsUri?: string;
  authorAttribution?: PlaceAuthorAttribution;
}
interface PlaceDetailsResponse {
  displayName?: { text?: string };
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  reviews?: PlaceReview[];
}

/** ---- App's normalized shape ---- */
type Normalized = {
  id: number; // numeric for UI/local approvals
  type: 'guest-to-host';
  status: 'published';
  rating: number | null; // /10 (Google is /5 → *2 and round)
  publicReview: string;
  reviewCategory: { category: string; rating: number | null }[];
  submittedAt: string; // ISO string
  guestName: string;
  listingName: string;
  channel: 'Google';
  sourceUrl?: string;
};

function hashToInt(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = (h ^ s.charCodeAt(i)) * 16777619;
  return (h >>> 0) % 2147483647;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const listing = url.searchParams.get('listing') || '';
  const explicitPlaceId = url.searchParams.get('placeId') || '';

  // Resolve placeId from mapping file if not explicitly provided
  let placeId = explicitPlaceId;
  if (!placeId && listing) {
    try {
      const raw = await fs.readFile(path.join(process.cwd(), 'data', 'google-places.json'), 'utf8');
      const map = JSON.parse(raw) as Record<string, string>;
      placeId = map[listing] || '';
    } catch {
      // mapping file optional
    }
  }

  // Fail-soft: if no key or no placeId, return empty result (keeps UI happy)
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || !placeId) {
    return NextResponse.json({ status: 'success', result: [] });
  }

  // Request a minimal field mask (Place Details - New Places API)
  const fields = [
    'displayName',
    'googleMapsUri',
    'reviews.text',
    'reviews.rating',
    'reviews.publishTime',
    'reviews.googleMapsUri',
    'reviews.authorAttribution.displayName',
  ].join(',');

  const endpoint =
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?` +
    `fields=${encodeURIComponent(fields)}&languageCode=en`;

  const res = await fetch(endpoint, {
    headers: { 'X-Goog-Api-Key': apiKey },
    cache: 'no-store',
  });

  if (!res.ok) {
    // Fail-soft (don’t break the dashboard)
    return NextResponse.json({ status: 'success', result: [] });
  }

  const data = (await res.json()) as PlaceDetailsResponse;
  const placeName = data.displayName?.text || listing;
  const placeUri = data.googleMapsUri;

  // Map & normalize, keep it to max 5
  const reviews = (data.reviews ?? []).slice(0, 5);

  const result: Normalized[] = reviews.map((rev: PlaceReview) => {
    const stableKey =
      rev.name ||
      `${rev.publishTime ?? ''}|${rev.authorAttribution?.displayName ?? ''}|${rev.text?.text ?? ''}`;
    return {
      id: 900000 + (hashToInt(stableKey) % 100000), // numeric, stable-ish
      type: 'guest-to-host',
      status: 'published',
      rating: typeof rev.rating === 'number' ? Math.round(rev.rating * 2) : null, // /5 → /10
      publicReview: rev.text?.text ?? '',
      reviewCategory: [],
      submittedAt: rev.publishTime ?? '',
      guestName: rev.authorAttribution?.displayName || 'Google user',
      listingName: placeName,
      channel: 'Google',
      sourceUrl: rev.googleMapsUri || placeUri,
    };
  });

  return NextResponse.json({ status: 'success', result });
}
