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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [magicSent, setMagicSent] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      toast.success("Logged in successfully!");
      router.push("/dashboard");
      router.refresh();
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
          ? "Magic link sent! Check your email to sign up and log in."
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
                    Password
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
              )}

              {mode === "login" ? (
                <>
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
                      "Log in with password"
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
                    <strong>Super easy signup:</strong> We'll email you a secure magic link.
                    Click it to create your account and sign in instantly — no password to create or remember.
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
                <div className="text-center text-sm text-green-600 bg-green-50 p-3 rounded-md">
                  Check your email inbox (and spam folder) for the link!
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
