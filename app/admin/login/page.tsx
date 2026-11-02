import type { Metadata } from "next";

import { LoginForm } from "@/components/admin/login-form";

export const metadata: Metadata = {
  title: "Studio sign in — Luma Studio",
};

export default function AdminLoginPage() {
  return <LoginForm />;
}
