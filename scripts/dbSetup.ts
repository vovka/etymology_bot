// Usage: npm run db:setup. Creates the tables and seeds the owner's row; safe to run again.
import { neon } from "@neondatabase/serverless";
import { applySchema } from "../src/billing/applySchema.js";
import { requireEnv } from "../src/utils/requireEnv.js";

await applySchema(neon(requireEnv("DATABASE_URL")));
console.log("Database schema applied");
