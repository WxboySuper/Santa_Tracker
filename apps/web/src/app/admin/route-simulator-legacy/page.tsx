import { notFound } from "next/navigation";

// Retired per audit disposition: explicitly deprecated simulator
export default function LegacySimulator() {
  notFound();
}
