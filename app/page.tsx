import type { Metadata } from "next";
import { FamilyLogin } from "./FamilyLogin";

export const metadata: Metadata = {
  title: "Family Login | Beau School Dashboard",
  description: "Private family access to Beau's school dashboard.",
};

export default function Home() {
  return <FamilyLogin />;
}
