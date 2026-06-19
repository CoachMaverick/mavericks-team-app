"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { listAllFamilies, createFamilyAndLink, joinExistingFamily, skipFamilySetup } from "@/lib/actions";

interface FamilySetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void; // optional callback after create/join/skip
  title?: string;
  description?: string;
  showSkip?: boolean;
}

export function FamilySetupDialog({
  open,
  onOpenChange,
  onComplete,
  title = "Setup Your Family",
  description = "Create a new family or join an existing one. This links your profile so RSVPs and lists show your real family name.",
  showSkip = true,
}: FamilySetupDialogProps) {
  const [famName, setFamName] = useState("");
  const [allFamilies, setAllFamilies] = useState<any[]>([]);
  const [famLoading, setFamLoading] = useState(false);

  useEffect(() => {
    if (open) {
      // Load families when dialog opens
      (async () => {
        try {
          const fams = await listAllFamilies();
          setAllFamilies(fams || []);
        } catch {}
      })();
    }
  }, [open]);

  const doCreate = async () => {
    if (!famName.trim()) {
      toast.error("Enter a family name");
      return;
    }
    setFamLoading(true);
    try {
      await createFamilyAndLink(famName.trim());
      toast.success("Family created and linked!");
      onComplete?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to create family");
    } finally {
      setFamLoading(false);
    }
  };

  const doJoin = async (id: string) => {
    setFamLoading(true);
    try {
      await joinExistingFamily(id);
      toast.success("Joined family!");
      onComplete?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to join");
    } finally {
      setFamLoading(false);
    }
  };

  const doJoinByName = async () => {
    if (!famName.trim()) return;
    setFamLoading(true);
    try {
      const q = famName.trim().toLowerCase();
      const match = allFamilies.find((f: any) => (f.name || '').toLowerCase().includes(q));
      if (match) {
        await joinExistingFamily(match.id);
        toast.success("Joined family!");
        onComplete?.();
        onOpenChange(false);
      } else {
        toast.error("Family not found, try Create instead");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setFamLoading(false);
    }
  };

  const doSkip = async () => {
    setFamLoading(true);
    try {
      await skipFamilySetup();
      toast.success("Setup skipped. You can set up your family later.");
      onComplete?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Could not skip (proceeding anyway)");
      onComplete?.();
      onOpenChange(false);
    } finally {
      setFamLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Button onClick={doCreate} disabled={famLoading} className="w-full mavericks-btn-primary h-12 text-base font-semibold">
            {famLoading ? "Working..." : `Create My Family${famName ? ` (${famName})` : ""}`}
          </Button>
          <div className="text-center text-xs text-muted-foreground">or join existing</div>
          {allFamilies.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-auto">
              {allFamilies.map((f: any) => (
                <Button key={f.id} variant="outline" className="w-full" disabled={famLoading} onClick={() => doJoin(f.id)}>
                  Join {f.name}
                </Button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input value={famName} onChange={(e) => setFamName(e.target.value)} placeholder="Family name to join" />
            <Button onClick={doJoinByName} disabled={famLoading || !famName} variant="outline">
              Join
            </Button>
          </div>
          <p className="text-[10px] text-center text-muted-foreground">Tip: Use "Create My Family" for the quickest start.</p>

          {showSkip && (
            <div className="pt-2 border-t">
              <Button
                variant="ghost"
                onClick={doSkip}
                disabled={famLoading}
                className="w-full text-muted-foreground hover:text-foreground"
              >
                Skip for now — I'll set up my family later
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
