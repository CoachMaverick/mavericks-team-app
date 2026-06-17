"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { 
  getNotifications, 
  markNotificationRead, 
  markAllNotificationsRead 
} from '@/lib/actions';

interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  is_read: boolean;
  created_at: string;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getNotifications(30);
      setNotifications(data as Notification[]);
    } catch (e) {
      console.warn('Failed to load notifications', e);
      setNotifications([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (e: any) {
      toast.error(e.message || 'Failed to mark as read');
    }
  };

  const handleMarkAll = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      toast.success('All notifications marked read');
    } catch (e: any) {
      toast.error(e.message || 'Failed');
    }
  };

  const unread = notifications.filter(n => !n.is_read).length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="h-7 w-7 text-primary" /> Notifications
          </h1>
          {unread > 0 && <Badge variant="destructive">{unread} unread</Badge>}
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAll}>
            <CheckCheck className="h-4 w-4 mr-2" /> Mark all read
          </Button>
        )}
      </div>

      <Card className="mavericks-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Notifications</CardTitle>
        </CardHeader>
        <CardContent className="p-0 divide-y">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No notifications yet. Core notifications (events, announcements, payments, chat messages) will appear here.
            </div>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className={`p-4 flex gap-3 ${!n.is_read ? 'bg-primary/5' : ''}`}>
                <div className="mt-1">
                  <Bell className={`h-4 w-4 ${!n.is_read ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{n.title}</div>
                  {n.body && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</div>}
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {new Date(n.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                  {n.link && (
                    <Link href={n.link} className="text-xs text-primary hover:underline mt-1 inline-block">View details →</Link>
                  )}
                </div>
                {!n.is_read && (
                  <Button variant="ghost" size="sm" className="text-xs self-start" onClick={() => handleMarkRead(n.id)}>
                    Mark read
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-center text-muted-foreground">
        In-app notifications for core events. Email support + full settings + realtime coming soon. (Mavericks styling)
      </p>
    </div>
  );
}
