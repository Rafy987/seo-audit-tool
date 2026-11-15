import { connection } from "next/server";
import { getPreparedBy } from "@/lib/preparedBy";

// The PDF's optional "Prepared by" details, read fresh from .env.local each time,
// so they also show on audits loaded from the browser cache.
// (Not secret: they're printed on the PDF.)
export async function GET() {
  // This app uses Cache Components, which would otherwise build this GET route
  // once at build time. connection() makes it run on every request instead.
  await connection();
  return Response.json({ preparedBy: getPreparedBy() });
}
