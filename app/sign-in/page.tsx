import { Suspense } from 'react';
import AuthPage from '@/components/AuthPage';

export default function SignIn() {
  // useSearchParams (the ?invite= link) needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <AuthPage />
    </Suspense>
  );
}
