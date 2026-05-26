import cron from "node-cron"
import { supabase } from "../config/supabase"

export function startPartyRoomCleanupJob() {
  cron.schedule("*/5 * * * *", async () => {
    console.log("Checking expired party rooms...")

    const now = new Date().toISOString()

    const { error } = await supabase
      .from("party_rooms")
      .update({
        status: "closed",
      })
      .lte("expires_at", now)
      .neq("status", "closed")

    if (error) {
      console.error("Cleanup room error:", error.message)
    }
  })
}