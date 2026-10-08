// Usage: npm run refund -- <user_id> <telegram_payment_charge_id>
// Refunds the payment, stops the user's subscription from renewing and puts them back on the free plan.
import { neon } from "@neondatabase/serverless";
import { Api } from "grammy";
import { UserRepository } from "../src/billing/UserRepository.js";
import { requireEnv } from "../src/utils/requireEnv.js";

const [userArg, chargeId] = process.argv.slice(2);
if (!userArg || !chargeId) throw new Error("Pass the user ID and the payment's charge ID (see the payments table)");

const userId = Number(userArg);
const api = new Api(requireEnv("TELEGRAM_BOT_TOKEN"));
const users = new UserRepository(neon(requireEnv("DATABASE_URL")));
await api.refundStarPayment(userId, chargeId);
const subscription = (await users.find(userId))?.subscriptionChargeId;
if (subscription) await api.editUserStarSubscription(userId, subscription, true);
await users.markRefunded(userId, chargeId);
console.log(`Refunded ${chargeId}; user ${userId} is back on the free plan`);
