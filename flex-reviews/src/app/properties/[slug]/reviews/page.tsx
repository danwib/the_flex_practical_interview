import type { PageProps } from 'next';
import PublicReviewsClient from './PublicReviewsClient';

export default async function Page({ params }: PageProps<{ slug: string }>) {
  const { slug } = await params; // Next 15: params is a Promise
  return <PublicReviewsClient slug={decodeURIComponent(slug)} />;
}
