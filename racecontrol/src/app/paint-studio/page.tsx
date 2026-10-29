import { notFound } from "next/navigation";
import { paintAccess } from "@/lib/paint-access";
import PaintStudio from "@/components/paint-studio";
export const metadata = {
  title: "Private Paint Studio",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function PaintStudioPage() {
  if (!(await paintAccess())) notFound();
  return <PaintStudio />;
}
