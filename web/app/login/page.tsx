"use client";

import { Suspense } from "react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoginModal } from "@/components/login-modal";
import { enterGuestSession } from "@/lib/profile-storage";

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [leaving, setLeaving] = useState(false);

  if (leaving) return null;

  return (
    <section className="login-page">
      <LoginModal
        blocking
        onClose={() => undefined}
        onDone={() => {
          setLeaving(true);
          window.dispatchEvent(new Event("auth-changed"));
          router.replace(next);
          router.refresh();
        }}
        onGuest={() => {
          setLeaving(true);
          enterGuestSession();
          window.dispatchEvent(new Event("auth-changed"));
          router.replace(next);
          router.refresh();
        }}
      />
    </section>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="skeleton" />}>
      <LoginContent />
    </Suspense>
  );
}
