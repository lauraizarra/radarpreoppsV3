export const dynamic = "force-dynamic";
export const revalidate = 300;

import { loadData } from "../lib/googleSheets";
import DashboardClient from "./DashboardClient";

export default async function Page() {
  const data = await loadData();

  return (
    <DashboardClient
      sellers={data.sellers}
      preopps={data.preopps}
      activities={data.activities}
      source={data.source}
      updatedAt={data.updatedAt}
      view="overview"
    />
  );
}