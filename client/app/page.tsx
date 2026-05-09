"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function Home() {
  const router = useRouter();
  const { doctor, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    router.replace(doctor ? "/patients" : "/login");
  }, [doctor, isLoading, router]);

  return null;
}
