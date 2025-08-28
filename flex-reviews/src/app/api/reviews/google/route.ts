import { NextResponse } from "next/server";

// flex-reviews/src/app/api/reviews/google/route.ts
export const runtime = 'nodejs';   // <— add this
export const revalidate = 0;       // always fresh (ok for basic integration)


type Normalized = {
  id: number;
  type: "guest-to-host";
  status: "published";
  rating: number | null;            // /10 (Google is /5 → we *2)
  publicReview: string;
  reviewCategory: { category: string; rating: number | null }[];
  submittedAt: string;              // ISO string
  guestName: string;
  listingName: string;
  channel: "Google";
  sourceUrl?: string;
};

function hashToInt(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = (h ^ s.charCodeAt(i)) * 16777619;
  return (h >>> 0) % 2147483647;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const listing = url.searchParams.get("listing") || "";
  const explicitPlaceId = url.searchParams.get("placeId") || "";

  // read mapping file (listing -> placeId)
  let placeId = explicitPlaceId;
  try {
    const file = await import("node:fs/promises");
    const path = await import("node:path");
    const raw = await file.readFile(path.join(process.cwd(), "data", "google-places.json"), "utf8");
    const map = JSON.parse(raw) as Record<string, string>;
    if (!placeId && listing) placeId = map[listing] || "";
  } catch {
    /* no mapping file */
  }

  if (!placeId || !process.env.GOOGLE_MAPS_API_KEY) {
    return NextResponse.json({ status: "success", result: [] });
  }

  // Places API (New) Place Details - request only review-related fields
  const fields = [
    "displayName",
    "googleMapsUri",
    "reviews.text",
    "reviews.rating",
    "reviews.publishTime",
    "reviews.googleMapsUri",
    "reviews.authorAttribution.displayName"
  ].join(",");

  const endpoint =
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?` +
    `fields=${encodeURIComponent(fields)}&languageCode=en`;

  const res = await fetch(endpoint, {
    headers: { "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY! },
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ status: "success", result: [] }); // fail-soft
  }

  const data = await res.json();
  const placeName = data?.displayName?.text || listing;

  const result: Normalized[] = (data?.reviews ?? []).slice(0, 5).map((rev: any) => {
    const stableKey = rev.name || `${rev.publishTime}|${rev.authorAttribution?.displayName || ""}|${rev?.text?.text || ""}`;
    return {
      id: 900000 + (hashToInt(stableKey) % 100000),      // numeric for UI/local approvals
      type: "guest-to-host",
      status: "published",
      rating: typeof rev.rating === "number" ? Math.round(rev.rating * 2) : null, // /5 -> /10
      publicReview: rev?.text?.text ?? "",
      reviewCategory: [],
      submittedAt: rev?.publishTime ?? "",
      guestName: rev?.authorAttribution?.displayName || "Google user",
      listingName: placeName,
      channel: "Google",
      sourceUrl: rev?.googleMapsUri || data?.googleMapsUri
    };
  });

  return NextResponse.json({ status: "success", result });
}
