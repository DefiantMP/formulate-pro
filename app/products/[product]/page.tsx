import ProductDetailPage from '@/components/ProductDetailPage';

export default function Product({ params }: { params: { product: string } }) {
  return <ProductDetailPage product={decodeURIComponent(params.product)} />;
}
