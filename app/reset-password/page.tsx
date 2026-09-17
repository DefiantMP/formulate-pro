import { Suspense } from 'react';
import ResetPasswordPage from '@/components/ResetPasswordPage';

export default function ResetPassword() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <ResetPasswordPage />
    </Suspense>
  );
}
