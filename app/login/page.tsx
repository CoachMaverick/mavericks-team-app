"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { createClient } from "@/lib/supabase/client";

function LoginContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [magicSent, setMagicSent] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      const msg = decodeURIComponent(errorParam);
      const friendly = msg === "auth" ? "Authentication failed or link expired. Please try signing up or logging in again." : msg;
      toast.error(friendly);
      // Clean the URL
      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.toString());
    }
    const success = searchParams.get("success");
    if (success) {
      toast.success("Signed up successfully! You're now logged in.");
      const url = new URL(window.location.href);
      url.searchParams.delete("success");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast.error("Please enter your email address");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      if (password) {
        // Password login
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;

        toast.success("Logged in successfully!");
        router.push("/dashboard");
        router.refresh();
      } else {
        // No password provided - seamless magic link login (no pw required)
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        setMagicSent(true);
        toast.success("Magic link sent! Check your email to log in automatically.");
      }
    } catch (err: any) {
      toast.error(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (isSignup: boolean = false) => {
    if (!email) {
      toast.error("Please enter your email address");
      return;
    }

    setLoading(true);
    setMagicSent(false);

    try {
      const supabase = createClient();

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          shouldCreateUser: isSignup,
        },
      });

      if (error) throw error;

      setMagicSent(true);
      toast.success(
        isSignup
          ? "Magic link sent! Check your email to create your account and sign in (no password needed)."
          : "Magic link sent! Check your email to log in."
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to send magic link");
    } finally {
      setLoading(false);
    }
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
            <CardTitle className="text-2xl">
              {mode === "login" ? "Log in to Mavericks 12U" : "Sign up for Mavericks 12U"}
            </CardTitle>
            <CardDescription>
              {mode === "login"
                ? "Enter your email and password, or use a magic link."
                : "Sign up easily with a magic link — no password needed!"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Mode switch for clearer signup/login */}
            <div className="flex rounded-lg border p-1 mb-6 bg-muted/50">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setMagicSent(false);
                }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  mode === "login"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setMagicSent(false);
                }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  mode === "signup"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign up
              </button>
            </div>

            <form onSubmit={mode === "login" ? handleLogin : (e) => e.preventDefault()} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </div>

              {mode === "login" && (
                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium">
                    Password <span className="text-xs text-muted-foreground">(optional - use magic link for passwordless)</span>
                  </label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="•••••••• (leave blank for magic link)"
                  />
                </div>
              )}

              {mode === "login" ? (
                <>
                  <Button
                    type="submit"
                    className="mavericks-btn-primary w-full h-11 text-base"
                    disabled={loading || !email}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Logging in...
                      </>
                    ) : (
                      password ? "Log in with password" : "Send magic link to log in"
                    )}
                  </Button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">or</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => handleMagicLink(false)}
                    disabled={loading || !email}
                  >
                    {loading ? "Sending..." : "Send magic link to log in"}
                  </Button>
                </>
              ) : (
                <>
                  {/* Signup flow: magic link emphasis for ease */}
                  <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                    <strong>No password required.</strong> Enter your email and we'll send a magic link.
                    Clicking it will create your account with a basic profile and log you in automatically.
                  </div>

                  <Button
                    type="button"
                    className="mavericks-btn-primary w-full h-11 text-base"
                    onClick={() => handleMagicLink(true)}
                    disabled={loading || !email}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending magic link...
                      </>
                    ) : (
                      "Send magic link to sign up"
                    )}
                  </Button>

                  <p className="text-center text-xs text-muted-foreground">
                    Already have an account?{" "}
                    <button
                      type="button"
                      className="underline hover:no-underline"
                      onClick={() => {
                        setMode("login");
                        setMagicSent(false);
                      }}
                    >
                      Log in instead
                    </button>
                  </p>
                </>
              )}

              {magicSent && (
                <div className="text-center text-sm text-green-600 bg-green-50 p-3 rounded-md border border-green-200">
                  {mode === "signup"
                    ? "We've sent a magic link to your email. Click it to finish signing up (your profile will be created automatically) and you'll be logged in automatically."
                    : "We've sent a magic link to your email. Click it to log in automatically and be redirected to the dashboard."}
                  <br />
                  <span className="text-xs text-muted-foreground">Didn't receive it? Check spam or try again in a minute.</span>
                </div>
              )}
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

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
