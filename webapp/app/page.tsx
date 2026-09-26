import Dashboard from "@/components/Dashboard";
import { getDataset } from "@/lib/dataset";

export default function Page() {
  return <Dashboard data={getDataset()} />;
}
