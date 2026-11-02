import type { Metadata } from "next";

import { AdminApp } from "@/components/admin/admin-app";

export const metadata: Metadata = {
  title: "Studio dashboard — Luma Studio",
};

export default function AdminPage() {
  return <AdminApp />;
}
