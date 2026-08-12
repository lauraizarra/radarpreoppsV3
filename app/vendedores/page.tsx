export const revalidate = 60;

import { loadData } from "../../lib/googleSheets";
import DashboardClient from "../DashboardClient";

export default async function Page() {
  const data = await loadData();

  return (
    <DashboardClient
      sellers={data.sellers}
      preopps={data.preopps}
      activities={data.activities}
      source={data.source}
      updatedAt={data.updatedAt}
      view="vendedores"
    />
  );
}
