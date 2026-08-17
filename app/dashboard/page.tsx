import type { Metadata } from "next";
import { DashboardHome } from "./DashboardHome";

export const metadata: Metadata = {
  title: "Today | Beau School Dashboard",
  description: "Beau's private school command center for Canvas.",
};

export default function DashboardPage() {
  return <DashboardHome />;
}
