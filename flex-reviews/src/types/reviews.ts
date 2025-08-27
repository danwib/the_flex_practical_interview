export type ReviewCategory = {
  category: 'cleanliness' | 'communication' | 'respect_house_rules' | string;
  rating: number | null;
};

export type Review = {
  id: number;
  type: string;            // "host-to-guest" | "guest-to-host" etc.
  status: string;          // "published" | "draft" ...
  rating: number | null;   // overall (may be null)
  publicReview: string;
  reviewCategory: ReviewCategory[];
  submittedAt: string;     // "YYYY-MM-DD HH:mm:ss"
  guestName: string;
  listingName: string;
};

export type ReviewsResponse = { status: 'success' | 'error'; result: Review[] };
