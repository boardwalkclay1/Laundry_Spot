<!-- location-helper.js (example pattern, not required) -->
<script type="module">
  import { supabase } from "./supabase.js";

  export function startWasherLocationStream(session, setStatusText) {
    if (!navigator.geolocation) {
      setStatusText?.("Location not supported.");
      return null;
    }

    const watchId = navigator.geolocation.watchPosition(
      async pos => {
        const { error } = await supabase
          .from("locations")
          .upsert({
            user_id: session.user.id,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          });

        if (error) {
          console.error("Location update error:", error);
          setStatusText?.("Error sending location.");
        } else {
          setStatusText?.("Location sharing is ON.");
        }
      },
      err => {
        console.error("Geolocation error:", err);
        setStatusText?.("Unable to get your location.");
      },
      {
        enableHighAccuracy:true,
        maximumAge:5000,
        timeout:10000
      }
    );

    return watchId;
  }
</script>
