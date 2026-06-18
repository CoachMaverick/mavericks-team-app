"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("coach@comavericksbaseball.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // If using demo mode, go straight to dashboard
  useEffect(() => {
    if (document.cookie.includes("temp-coach=1")) {
      router.replace("/dashboard");
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }

    setLoading(true);

    const expectedEmail = "coach@comavericksbaseball.com";
    const isDemoEmail = email.trim().toLowerCase() === expectedEmail;

    let navigated = false;

    try {
      const supabase = createClient();

      // Prioritize real Supabase auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        if (!isDemoEmail) {
          throw error;
        }
        // For demo email, fall back to demo mode below
      } else if (data.user) {
        // Real login succeeded. Fetch profile to prioritize is_admin = true
        document.cookie = "temp-coach=; path=/; max-age=0";

        let isAdmin = false;
        try {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("is_admin, role")
            .eq("id", data.user.id)
            .single<any>();
          isAdmin = profileData?.is_admin === true || profileData?.role === 'admin';
        } catch (e) {
          // profile may not exist yet; treat login as success (layout will set)
        }

        toast.success(isAdmin ? "✅ Logged in as Admin" : "Logged in");
        router.push("/dashboard");
        router.refresh(); // Ensure server components (e.g. layout auth check) see the new session cookies
        navigated = true;
        return;
      }
    } catch (err: any) {
      if (!isDemoEmail) {
        toast.error(err.message || "Login failed");
        return;
      }
      // fallthrough to demo for expected email
    } finally {
      if (!navigated) {
        setLoading(false);
      }
    }

    // Fallback for demo email (demo accounts only)
    if (isDemoEmail) {
      document.cookie = "temp-coach=1; path=/; max-age=86400"; // 1 day
      await new Promise((r) => setTimeout(r, 300));
      toast.success("Logged in (demo mode)");
      router.push("/dashboard");
      router.refresh();
      return;
    }

    toast.error("Login failed");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Team branding header with logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <TeamLogo size="lg" className="drop-shadow-md" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Mavericks 12U</h1>
          <p className="text-muted-foreground mt-1 text-sm">Travel Baseball • Team Hub</p>
        </div>

        <Card className="mavericks-card">
          <CardHeader>
            <CardTitle className="text-2xl">Mavericks 12U Login</CardTitle>
            <CardDescription>
              Sign in with real Supabase admin credentials, or use the demo email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    placeholder="coach@comavericksbaseball.com"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  Password (any)
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              <Button
                type="submit"
                className="mavericks-btn-primary w-full h-11 text-base"
                disabled={loading || !email || !password}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  "Log in"
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                Real admins use Supabase auth. Demo email available.
              </p>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Mavericks 12U Team App
        </p>
      </div>
    </div>
  );
}
