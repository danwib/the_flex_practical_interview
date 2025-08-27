// src/app/properties/[slug]/reviews/page.tsx
import PublicReviewsClient from './PublicReviewsClient';

type Props = { params: { slug: string } };

export default function Page({ params }: Props) {
  const slug = decodeURIComponent(params.slug);
  return <PublicReviewsClient slug={slug} />;
}
