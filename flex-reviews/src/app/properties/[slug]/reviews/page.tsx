import PublicReviewsClient from './PublicReviewsClient';

export default function Page({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug);
  return <PublicReviewsClient slug={slug} />;
}
