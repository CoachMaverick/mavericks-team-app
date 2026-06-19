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
  const [verifying, setVerifying] = useState(true);
  const [ready, setReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();

  // Read token from URL (token_hash + type or code for PKCE).
  // Verify to establish a temporary recovery session, then allow updateUser.
  useEffect(() => {
    const processToken = async () => {
      setVerifying(true);
      try {
        const supabase = createClient();

        const code = searchParams.get("code");
        const token_hash = searchParams.get("token_hash");
        const type = searchParams.get("type");

        // Consume the recovery token if present in the URL.
        // This is required so that updateUser is allowed.
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (token_hash && type === "recovery") {
          const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type: "recovery",
          });
          if (error) throw error;
        }

        // Check if we now have a session (either from the token above,
        // or because a server route like /auth/confirm already verified and set cookies).
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (user && !userError) {
          setUserEmail(user.email ?? null);
          setReady(true);

          // Remove sensitive token from the address bar
          if (code || token_hash) {
            router.replace("/auth/reset-password");
          }
        } else {
          setReady(false);
        }
      } catch (err: any) {
        console.error("Password reset token error:", err);
        setReady(false);
        // Don't spam toast here — we'll show a clear error UI below
      } finally {
        setVerifying(false);
      }
    };

    processToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleSetNewPassword = async (e: React.FormEvent) => {
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

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      toast.success("Your password has been reset successfully!");

      // Session is now active with the new password
      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      const message = err?.message || "Failed to reset password.";
      toast.error(message.includes("session") ? "Reset link expired. Please request a new one." : message);
    } finally {
      setLoading(false);
    }
  };

  // Loading while we verify the token from the URL
  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <TeamLogo size="lg" className="drop-shadow-md" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Mavericks 12U</h1>
          </div>
          <Card className="mavericks-card">
            <CardContent className="py-10 flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Verifying reset link...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Header */}
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
                    ? "Choose a new password for your account."
                    : "This password reset link is invalid or has expired."}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {ready ? (
              // Clean "Set New Password" form
              <form onSubmit={handleSetNewPassword} className="space-y-4">
                {userEmail && (
                  <div className="text-sm text-muted-foreground">
                    Resetting password for <span className="font-medium text-foreground">{userEmail}</span>
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
                  <p className="text-xs text-muted-foreground">Must be at least 6 characters.</p>
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
                      Saving...
                    </>
                  ) : (
                    "Set New Password"
                  )}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  After setting your new password you will be signed in automatically.
                </p>
              </form>
            ) : (
              // Clear error state when token is missing or invalid
              <div className="space-y-4">
                <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive-foreground">
                  The password reset link is invalid or has expired.
                  <br />
                  Please request a new password reset link.
                </div>

                <Button
                  type="button"
                  className="w-full"
                  variant="outline"
                  onClick={() => router.push("/login")}
                >
                  Go to Login
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  On the login page, click "Forgot Password?" to receive a new link.
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
