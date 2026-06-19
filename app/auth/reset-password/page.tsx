"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, KeyRound } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { createClient } from "@/lib/supabase/client";

function ResetPasswordContent() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const initFromUrl = async () => {
      const supabase = createClient();

      // Read from query string
      let access_token = searchParams.get("access_token");
      let refresh_token = searchParams.get("refresh_token");
      let type = searchParams.get("type");

      // Also support tokens in the URL hash fragment (very common for Supabase recovery emails)
      // e.g. /auth/reset-password#access_token=xxx&type=recovery
      if ((!access_token || !type) && typeof window !== "undefined") {
        const hash = window.location.hash.replace(/^#/, "");
        if (hash) {
          const hashParams = new URLSearchParams(hash);
          access_token = access_token || hashParams.get("access_token");
          refresh_token = refresh_token || hashParams.get("refresh_token");
          type = type || hashParams.get("type");
        }
      }

      try {
        if (access_token && type === "recovery") {
          // Activate the recovery session using the token from the email link
          const { error: setErr } = await supabase.auth.setSession({
            access_token,
            refresh_token: refresh_token || "",
          });
          if (setErr) throw setErr;

          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            setUserEmail(user.email || null);
            setReady(true);
            setError(null);

            // Clean tokens from the browser URL
            if (typeof window !== "undefined") {
              router.replace("/auth/reset-password");
            }
            return;
          }
        }

        // Fallback: server routes (/auth/confirm or /auth/callback) may have already
        // verified the recovery token and set cookies. Check for an active session.
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserEmail(user.email || null);
          setReady(true);
          setError(null);
          return;
        }

        setReady(false);
        setError("This password reset link is invalid or has expired.");
      } catch (e: any) {
        console.error("Failed to initialize recovery session", e);
        setReady(false);
        setError("This password reset link is invalid or has expired.");
      }
    };

    initFromUrl();
  }, [searchParams, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || newPassword.length < 6) {
      toast.error("Password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast.success("Password has been reset successfully!");

      // User is now authenticated with the new password
      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      const msg = err?.message || "Failed to reset password.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <TeamLogo size="lg" className="drop-shadow-md" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Mavericks 12U</h1>
          <p className="text-muted-foreground mt-1 text-sm">Travel Baseball • Team Hub</p>
        </div>

        <Card className="mavericks-card">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-2">
                <KeyRound className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl">Set New Password</CardTitle>
                <CardDescription>
                  {ready
                    ? "Enter your new password below."
                    : "Invalid or expired reset link."}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {ready ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                {userEmail && (
                  <div className="text-sm text-muted-foreground">
                    Resetting for <span className="font-medium text-foreground">{userEmail}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <label htmlFor="new-password" className="text-sm font-medium">
                    New password
                  </label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    disabled={loading}
                    autoComplete="new-password"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="confirm-password" className="text-sm font-medium">
                    Confirm new password
                  </label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    disabled={loading}
                    autoComplete="new-password"
                  />
                </div>

                <Button
                  type="submit"
                  className="mavericks-btn-primary w-full h-11 text-base"
                  disabled={loading || !newPassword || !confirmPassword}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving new password...
                    </>
                  ) : (
                    "Set New Password"
                  )}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  After resetting, you will be signed in and taken to the dashboard.
                </p>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 text-sm">
                  {error || "No valid reset token was found in the link."}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => router.push("/login")}
                >
                  Return to Login
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  Request a new link using "Forgot Password?" on the login page.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Mavericks 12U Team App
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3">
            <TeamLogo size="lg" />
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
