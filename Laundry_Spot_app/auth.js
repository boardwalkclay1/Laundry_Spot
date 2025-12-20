<script type="module">
    import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

    const SUPABASE_URL = "https://iorpijdiswctyawndzna.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvcnBpamRpc3djdHlhd25kem5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyMDU0NTUsImV4cCI6MjA4MTc4MTQ1NX0.Wv0P82zsthA7vr5yw2thWwmHE8aG-lX5qku9iriA5rM";

    export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // LOGIN FUNCTION
    export async function login(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            alert(error.message);
            return false;
        }

        window.location.href = "client.html";
        return true;
    }

    // SIGNUP FUNCTION
    export async function signup(email, password) {
        const { data, error } = await supabase.auth.signUp({
            email,
            password
        });

        if (error) {
            alert(error.message);
            return false;
        }

        alert("Account created! Please log in.");
        window.location.href = "login.html";
        return true;
    }
</script>
