import { handle } from "@/server/http";
import { storeStatus } from "@/server/db/store";
import { integrationStatus } from "@/server/integrations";

export async function GET() {
  return handle(() => ({
    status: "ok",
    store: storeStatus().persistence,
    integrations: integrationStatus().map((i) => ({ name: i.name, state: i.state })),
  }));
}
