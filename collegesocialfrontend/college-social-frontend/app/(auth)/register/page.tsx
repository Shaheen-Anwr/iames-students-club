import { Suspense } from 'react';
import { RegisterForm } from '@/components/auth/RegisterForm';

export default function RegisterPage() {
  // RegisterForm reads ?ref= via useSearchParams, which needs a Suspense boundary in app router.
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
