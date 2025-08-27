import PublicReviewsClient from './PublicReviewsClient';

// Conform to Next typed-routes contract: `params` is a Promise for dynamic segments
export default async function Page(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  return <PublicReviewsClient slug={decodeURIComponent(slug)} />;
}
