import { z } from 'zod';

export const ReviewSchema = z.object({
  id: z.number(),
  type: z.string(),
  status: z.string(),
  rating: z.number().nullable(),
  publicReview: z.string(),
  reviewCategory: z.array(z.object({
    category: z.string(),
    rating: z.number().nullable()
  })),
  submittedAt: z.string(),
  guestName: z.string(),
  listingName: z.string()
});
export const ReviewsResponseSchema = z.object({
  status: z.enum(['success','error']),
  result: z.array(ReviewSchema)
});
export type Review = z.infer<typeof ReviewSchema>;
