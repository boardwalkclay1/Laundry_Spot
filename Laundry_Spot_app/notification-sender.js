<script type="module">
  import { supabase } from "./supabase.js";

  export async function sendNotification(userId, title, message) {
    await supabase.from("notifications").insert({
      user_id: userId,
      title,
      message
    });
  }
</script>
