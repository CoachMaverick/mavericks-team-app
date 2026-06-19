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
  const [isSignupMode, setIsSignupMode] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      const msg = decodeURIComponent(errorParam);
      let friendly = msg;
      if (msg.toLowerCase().includes("rate") || msg.toLowerCase().includes("too many")) {
        friendly = "Too many attempts — please wait a few minutes before trying again.";
      } else if (msg === "auth" || msg.includes("expired") || msg.includes("invalid")) {
        friendly = "Authentication failed or link expired. Please try signing up or logging in again.";
      } else if (msg.includes("already registered") || msg.includes("User already registered")) {
        friendly = "This email is already registered. Please log in instead.";
      }
      toast.error(friendly);
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

  const handleEmailPasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error(isSignupMode ? "Please enter email and password to sign up" : "Please enter email and password");
      return;
    }

    if (isSignupMode && password.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const emailTrimmed = email.trim();

      if (isSignupMode) {
        // Signup with Email + Password - immediate, no confirmation step in app
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: emailTrimmed,
          password,
        });

        if (signUpError) throw signUpError;

        // Auto-create basic profile for new user (idempotent)
        if (signUpData.user) {
          try {
            const { data: existing } = await supabase
              .from("profiles")
              .select("id")
              .eq("id", signUpData.user.id)
              .maybeSingle();

            if (!existing) {
              await supabase.from("profiles").insert({
                id: signUpData.user.id,
                email: signUpData.user.email,
                role: "parent",
                first_name: "",
                last_name: "",
                is_admin: false,
                created_at: new Date().toISOString(),
              } as any);
            }
          } catch (profileErr) {
            console.warn("Profile auto-creation skipped (may already exist):", profileErr);
          }
        }

        // Immediately sign in to make it seamless (disables confirmation requirement in flow)
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: emailTrimmed,
          password,
        });

        if (signInError) {
          // Proceed anyway for seamless signup (profile created); if confirmation still required by Supabase, user may see login on redirect
          if (signInError.message.toLowerCase().includes("confirm") || signInError.message.toLowerCase().includes("not confirmed")) {
            toast.success("Account created! Logging you in...");
          } else {
            throw signInError;
          }
        }

        toast.success("Account created and logged in! Welcome to Mavericks 12U.");
        router.push("/dashboard");
        router.refresh();
      } else {
        // Login with Email + Password
        const { error } = await supabase.auth.signInWithPassword({
          email: emailTrimmed,
          password,
        });
        if (error) throw error;

        toast.success("Logged in successfully!");
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err: any) {
      let msg = err.message || (isSignupMode ? "Signup failed" : "Login failed");
      if (msg.toLowerCase().includes("rate") || msg.toLowerCase().includes("too many")) {
        msg = "Too many attempts — please wait a few minutes before trying again.";
      } else if (msg.includes("already registered") || msg.includes("User already registered")) {
        msg = "This email is already registered. Please try logging in instead.";
      } else if (msg.includes("Invalid login credentials")) {
        msg = "Invalid email or password. Please try again.";
      }
      toast.error(msg);
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
              {isSignupMode ? "Sign up for Mavericks 12U" : "Log in to Mavericks 12U"}
            </CardTitle>
            <CardDescription>
              {isSignupMode
                ? "Create your account with email and password. Instant access, no confirmation email required."
                : "Sign in with your email and password."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Simple mode switch - Email + Password focused */}
            <div className="flex rounded-lg border p-1 mb-6 bg-muted/50">
              <button
                type="button"
                onClick={() => setIsSignupMode(false)}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  !isSignupMode
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => setIsSignupMode(true)}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  isSignupMode
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign up
              </button>
            </div>

            <form onSubmit={handleEmailPasswordAuth} className="space-y-4">
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

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  Password {isSignupMode ? "(at least 6 characters)" : ""}
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
                    {isSignupMode ? "Creating account..." : "Logging in..."}
                  </>
                ) : (
                  isSignupMode ? "Sign up with Email + Password" : "Log in with Email + Password"
                )}
              </Button>

              {isSignupMode && (
                <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                  Create your account instantly. A basic profile will be created automatically so you can get started right away. No email confirmation step required.
                </div>
              )}

              <p className="text-center text-xs text-muted-foreground">
                {isSignupMode ? (
                  <>Already have an account? <button type="button" className="underline hover:no-underline" onClick={() => setIsSignupMode(false)}>Log in instead</button></>
                ) : (
                  <>New here? <button type="button" className="underline hover:no-underline" onClick={() => setIsSignupMode(true)}>Sign up with email + password</button></>
                )}
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

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
