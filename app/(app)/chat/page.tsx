"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, usePathname } from 'next/navigation';
import {
  getChatMembers,
  getMessages,
  sendMessage,
  markMessagesAsRead,
  getPinnedAnnouncements,
  createAnnouncement,
  toggleMessageReaction,
  pinMessage,
  editMessage,
  deleteMessage,
  unpinAnnouncement,
} from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { MessageCircle, Users, Pin, Send, ImagePlus, X, Play, Video, Smile, Pencil, Trash2 } from 'lucide-react';

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
}

interface MessageWithSender {
  id: string;
  created_at: string;
  sender_id: string;
  channel_type: 'team' | 'direct';
  recipient_id: string | null;
  content: string;
  read_by: string[] | null;
  // Media / attachment support (uploaded via Supabase Storage or local blob for demo)
  media_url?: string | null;
  media_type?: string | null;
  // Reactions: emoji -> array of user ids who reacted (populated by getMessages + realtime patches)
  reactions?: Record<string, string[]>;
  is_pinned?: boolean;
  updated_at?: string | null;
  is_deleted?: boolean;
  sender?: { id: string; first_name: string; last_name: string; role: string };
}

interface Announcement {
  id: number;
  title: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
  creator?: { first_name: string; last_name: string } | null;
}

export default function ChatPage() {
  const [activeView, setActiveView] = useState<'team' | 'direct'>('team');
  const [selectedContact, setSelectedContact] = useState<Member | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [pinned, setPinned] = useState<Announcement[]>([]);
  // pinnedMessagesList is ONLY ever populated by dedicated fresh getMessages(..., {pinnedOnly: true}) calls.
  // Removed all client-side caching, optimistic, RT-mutation, and local overrides for pinned messages.
  const [pinnedMessagesList, setPinnedMessagesList] = useState<MessageWithSender[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [isCoach, setIsCoach] = useState(false);
  const isTempUser = currentUserId === 'temp-coach-id' || (currentUserId && currentUserId.includes('temp'));

  const [showAnnounceForm, setShowAnnounceForm] = useState(false);
  const [announceTitle, setAnnounceTitle] = useState('');
  const [announceBody, setAnnounceBody] = useState('');
  const [loading, setLoading] = useState(true);

  // Message search
  const [searchTerm, setSearchTerm] = useState('');

  // Edit state (per-message inline editor)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  // Media upload state (supports images + short videos; drag & drop or button)
  const [pendingMedia, setPendingMedia] = useState<null | {
    file: File;
    previewUrl: string;
    type: string;
    name: string;
  }>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const supabase = useMemo(() => createClient(), []);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<any>(null);
  const activeViewRef = useRef(activeView);
  const selectedContactRef = useRef(selectedContact);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const router = useRouter();
  const pathname = usePathname();

  // Cleanup blob URLs on unmount if pending
  useEffect(() => {
    return () => {
      if (pendingMedia) {
        URL.revokeObjectURL(pendingMedia.previewUrl);
      }
    };
  }, [pendingMedia]);

  // Emoji picker + reactions state (simple native picker, no external lib)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactionTargetId, setReactionTargetId] = useState<string | null>(null);

  const COMMON_EMOJIS = ['❤️', '👍', '😂', '🔥', '👏', '🎉', '🙌', '😮', '⚽', '🏆'];

  // Get current user and role (support temp coach)
  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const isTemp = typeof document !== 'undefined' && document.cookie.includes('temp-coach=1');
        const uid = user?.id || (isTemp ? 'temp-coach-id' : '');
        setCurrentUserId(uid);

        // Simple role check for demo
        setIsCoach(isTemp || user?.email?.includes('coach') || false); // extend as needed

        // Aggressive freshness: router.refresh + fresh DB query for is_pinned=true on EVERY mount.
        router.refresh();
        if (uid) {
          await loadInitialData(uid);
        }
      } catch (e) {
        console.warn('Chat user load error:', e);
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, []); // empty deps: force on every mount/remount of Chat page (nav away+back, hard refresh)

  const loadPinnedAnnouncements = async () => {
    try {
      const pins = await getPinnedAnnouncements();
      setPinned(pins as Announcement[]);
    } catch (e: any) {
      console.warn('getPinnedAnnouncements error (using demo):', e?.message);
      setPinned([
        { id: 1, title: 'Season Kickoff!', body: 'First practice this Saturday. Bring water!', is_pinned: true, created_at: new Date().toISOString(), creator: { first_name: 'Coach', last_name: 'Maverick' } },
      ]);
    }
  };

  const loadInitialData = async (uid: string) => {
    try {
      const [mems, teamMsgs, pinnedMsgs] = await Promise.all([
        getChatMembers(),
        getMessages('team'),
        getMessages('team', null, 1000, { pinnedOnly: true }),
      ]);
      setMembers(mems.filter((m: Member) => m.id !== uid));

      // ALWAYS query the database *fresh* (via pinnedOnly) for is_pinned=true messages on load/mount.
      // No client-side cache, merge, or local is_pinned state for the Pinned section.
      setPinnedMessagesList(pinnedMsgs as MessageWithSender[]);
      setMessages(teamMsgs as MessageWithSender[]);

      // Always fetch fresh pinned announcements from DB on mount (for persistence after nav away/back)
      await loadPinnedAnnouncements();

      // Compute initial unread for DMs (simplified: fetch recent DMs)
      const dmMsgs = await getMessages('direct').catch(() => []);
      const unread: Record<string, number> = {};
      (dmMsgs as MessageWithSender[]).forEach((msg) => {
        if (!msg.read_by?.includes(uid)) {
          const other = msg.sender_id === uid ? msg.recipient_id : msg.sender_id;
          if (other) unread[other] = (unread[other] || 0) + 1;
        }
      });
      setUnreadMap(unread);
    } catch (e) {
      console.warn('Chat initial load error (demo may be used):', e);
      // fallback
      setPinned([
        { id: 1, title: 'Season Kickoff!', body: 'First practice this Saturday. Bring water!', is_pinned: true, created_at: new Date().toISOString(), creator: { first_name: 'Coach', last_name: 'Maverick' } },
      ]);
      setPinnedMessagesList([]); // pinned list only from DB query in success path
    }
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Pinned messages list is populated ONLY by fresh dedicated getMessages(..., {pinnedOnly: true}) on mount/load.
  // No client caching/local state/overrides. Pinned section always reflects true DB state.
  const pinnedMessages = activeView === 'team' ? pinnedMessagesList : [];

  const displayMessages = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    // When searching, search across ALL messages (pinned + regular) so important msgs can be found.
    // Exclude using the fresh DB-fetched pinnedMessagesList (no client is_pinned on messages used for section).
    let source = activeView === 'team' ? messages.filter(m => !pinnedMessagesList.some(p => p.id === m.id)) : messages;
    if (!q) {
      return source;
    }
    const filtered = source.filter(m =>
      (m.content || '').toLowerCase().includes(q) ||
      (m.sender?.first_name || '').toLowerCase().includes(q) ||
      (m.sender?.last_name || '').toLowerCase().includes(q)
    );
    // If currently editing a message, ensure it stays visible in results even if new text no longer matches query
    if (editingId) {
      const editingMsg = messages.find(m => m.id === editingId && (activeView !== 'team' || !pinnedMessagesList.some(p => p.id === m.id)));
      if (editingMsg && !filtered.some(m => m.id === editingId)) {
        return [...filtered, editingMsg];
      }
    }
    return filtered;
  }, [messages, searchTerm, activeView, editingId, pinnedMessagesList]);

  // Keep refs in sync for realtime listener (avoids stale closures)
  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  useEffect(() => {
    selectedContactRef.current = selectedContact;
  }, [selectedContact]);

  // Realtime subscription - fixed for no duplicate subscribe errors, proper cleanup, and graceful degradation.
  // Subscribe once per user session (stable channel name), use refs for current view state to avoid stale closures and re-subs.
  // If setup fails, chat still works via initial loads + send (which uses server action) + manual refresh on send.
  useEffect(() => {
    if (!currentUserId) return;

    const setupRealtime = () => {
      try {
        // Always cleanup any previous channel first
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current).catch(() => {});
          channelRef.current = null;
        }

        // Unique but stable-per-user channel name to prevent name collisions in StrictMode/HMR/remounts
        const channelName = `chat-realtime-${currentUserId}`;
        const channel = supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages' },
            (payload) => {
              let newMsg = payload.new as MessageWithSender;
              // Normalize for temp coach: DB may store null for sender_id/read_by (to avoid uuid cast).
              // Ensure we always have the TEXT 'temp-coach-id' in client objects for UI (isMine etc).
              if (isTempUser && !newMsg.sender_id) {
                newMsg = { ...newMsg, sender_id: 'temp-coach-id', read_by: newMsg.read_by || ['temp-coach-id'] } as MessageWithSender;
              }
              const currView = activeViewRef.current;
              const currContact = selectedContactRef.current;
              const isForTeam = currView === 'team' && newMsg.channel_type === 'team';
              const isForCurrentDM = currView === 'direct' && currContact &&
                newMsg.channel_type === 'direct' &&
                ((newMsg.sender_id === currentUserId && newMsg.recipient_id === currContact.id) ||
                 (newMsg.sender_id === currContact.id && newMsg.recipient_id === currentUserId));

              if (isForTeam || isForCurrentDM) {
                setMessages((prev) => {
                  // avoid dups by id
                  if (prev.some(m => m.id === newMsg.id)) return prev;
                  const withReactions = {
                    ...newMsg,
                    reactions: (newMsg as any).reactions || {},
                    is_pinned: !!(newMsg as any).is_pinned,
                  } as MessageWithSender;
                  return [...prev, withReactions];
                });
                // Pinned section is populated exclusively from fresh {pinnedOnly:true} DB queries on load/mount.
                // Do not mutate pinnedMessagesList from realtime to avoid any client-side state for pins.
              } else if (newMsg.channel_type === 'direct' && newMsg.sender_id !== currentUserId) {
                // Increment unread for other DMs
                const other = newMsg.sender_id;
                setUnreadMap((prev) => ({ ...prev, [other]: (prev[other] || 0) + 1 }));
              }
            }
          )
          // Real-time updates for reactions (now stored as JSONB on the message row itself).
          // When a real user toggles, we get an UPDATE on the messages table with the new `reactions` object.
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'messages' },
            (payload) => {
              let updated = payload.new as any;
              if (!updated?.id) return;

              // Normalize for temp coach (same as INSERT): ensure TEXT sender_id even if DB had null.
              if (isTempUser && !updated.sender_id) {
                updated = { ...updated, sender_id: 'temp-coach-id' };
              }

              // If this update is a soft-delete, remove the message from all lists so it disappears for everyone (realtime)
              if (updated.is_deleted) {
                setMessages((prev) => prev.filter((m) => m.id !== updated.id));
                setPinnedMessagesList((prev) => prev.filter((m) => m.id !== updated.id));
                return;
              }

              const currView = activeViewRef.current;
              const currContact = selectedContactRef.current;

              const isForTeam = currView === 'team' && updated.channel_type === 'team';
              const isForCurrentDM = currView === 'direct' && currContact &&
                updated.channel_type === 'direct' &&
                ((updated.sender_id === currentUserId && updated.recipient_id === currContact.id) ||
                 (updated.sender_id === currContact.id && updated.recipient_id === currentUserId));

              if (isForTeam || isForCurrentDM) {
                setMessages((prev) => {
                  const idx = prev.findIndex((m) => m.id === updated.id);
                  if (idx === -1) return prev;

                  const existing = prev[idx];
                  // Merge: take server values but preserve joined sender (RT payload is raw row, no relation) + any local fields
                  const merged = {
                    ...existing,
                    ...updated,
                    reactions: updated.reactions || existing.reactions || {},
                    is_pinned: !!(updated as any).is_pinned,
                    // take is_pinned from server for the messages list (pinned *section* uses separate fresh pinnedOnly query result)
                  } as MessageWithSender;

                  const next = [...prev];
                  next[idx] = merged;
                  return next;
                });
              }
            }
          );

        channelRef.current = channel;

        channel.subscribe((status, err) => {
          if (err) {
            console.warn('Chat realtime subscription error (chat will still function):', err);
            return;
          }
          if (status === 'SUBSCRIBED') {
            console.log('Chat realtime subscribed successfully');
          }
        });

      } catch (err) {
        console.warn('Failed to setup chat realtime (stability first - chat loads via actions):', err);
        // Do not throw or block UI. Initial messages load + send + refetch on send will work.
      }
    };

    setupRealtime();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current).catch(() => {});
        channelRef.current = null;
      }
    };
  }, [currentUserId]);  // Only re-sub on user change; view changes handled via refs inside listener.

  // --- Media helpers (client-side for temp/demo using object URLs; real users upload to Supabase Storage) ---
  const validateAndPrepareFile = (file: File): { valid: boolean; error?: string } => {
    const isImage = /^image\/(jpeg|png|gif)$/.test(file.type);
    const isVideo = /^video\/(mp4|webm|quicktime|mov)$/.test(file.type);
    if (!isImage && !isVideo) {
      return { valid: false, error: 'Only JPG, PNG, GIF images and MP4/WEBM/MOV short videos are supported.' };
    }
    const max = isImage ? 5 * 1024 * 1024 : 25 * 1024 * 1024; // 5MB images, 25MB short clips
    if (file.size > max) {
      return { valid: false, error: `File too large (max ${isImage ? '5' : '25'}MB for ${isImage ? 'images' : 'videos'}).` };
    }
    return { valid: true };
  };

  const handleFile = (file: File) => {
    const validation = validateAndPrepareFile(file);
    if (!validation.valid) {
      toast.error(validation.error!);
      return;
    }
    // Revoke previous if any
    if (pendingMedia) {
      URL.revokeObjectURL(pendingMedia.previewUrl);
    }
    const previewUrl = URL.createObjectURL(file);
    setPendingMedia({ file, previewUrl, type: file.type, name: file.name });
  };

  const removePendingMedia = () => {
    if (pendingMedia) {
      URL.revokeObjectURL(pendingMedia.previewUrl);
    }
    setPendingMedia(null);
  };

  // Upload to Supabase Storage (chat-media bucket) - only called for real (non-temp) users
  const uploadChatMedia = async (file: File, userId: string): Promise<{ url: string; type: string }> => {
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const safeName = file.name.replace(/[^a-z0-9.-]/gi, '_').slice(0, 60);
    const filePath = `chat/${(userId || 'user').replace(/[^a-z0-9]/gi, '_')}/${Date.now()}-${safeName}`;

    const { data, error } = await supabase.storage
      .from('chat-media')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) throw new Error(error.message || 'Storage upload failed');

    const { data: publicUrlData } = supabase.storage.from('chat-media').getPublicUrl(filePath);
    return { url: publicUrlData.publicUrl, type: file.type };
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const openFilePicker = () => fileInputRef.current?.click();

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // reset for re-select same file
    e.target.value = '';
  };

  // Simple linkifier + YouTube rich preview detector (client-side, no extra deps)
  // Also @Mentions highlighting for @team, @coaches, @name
  const renderMessageContent = (msg: MessageWithSender) => {
    const text = msg.content || '';
    // Combined regex for urls and mentions
    const tokenRegex = /((?:https?:\/\/[^\s]+)|(@(?:team|coaches|[\w]+)))/gi;
    const parts = text.split(tokenRegex);

    const elements = parts.map((part, idx) => {
      if (!part) return null;
      if (/^https?:\/\//.test(part)) {
        const isYt = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/i.exec(part);
        if (isYt) {
          const ytId = isYt[1];
          const thumb = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
          return (
            <a
              key={idx}
              href={`https://www.youtube.com/watch?v=${ytId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-2 max-w-[220px] rounded-lg overflow-hidden border border-border bg-card/50 hover:border-primary/60 transition"
            >
              <div className="relative">
                <img src={thumb} alt="YouTube thumbnail" className="w-full h-auto block" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                  <div className="rounded-full bg-primary/90 p-1.5">
                    <Play className="h-4 w-4 text-white" />
                  </div>
                </div>
              </div>
              <div className="px-2 py-0.5 text-[10px] text-muted-foreground">YouTube • Tap to watch</div>
            </a>
          );
        }
        // Image link preview
        const isImageLink = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(part);
        if (isImageLink) {
          return (
            <a key={idx} href={part} target="_blank" rel="noopener noreferrer" className="block mt-1.5">
              <img src={part} alt="linked image" className="max-w-[180px] max-h-[120px] rounded border object-contain" onError={(e)=>{(e.target as HTMLImageElement).style.display='none';}} />
            </a>
          );
        }
        // Generic link - show domain for better context (no external fetch)
        const short = part.length > 55 ? part.slice(0, 52) + '...' : part;
        let host = '';
        try { host = new URL(part).hostname.replace(/^www\./, ''); } catch {}
        return (
          <a
            key={idx}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-primary hover:text-primary/80 break-all inline-flex items-center gap-1"
          >
            {short}
            {host && <span className="text-[10px] opacity-60">({host})</span>}
          </a>
        );
      } else if (/^@/.test(part)) {
        const mention = part.toLowerCase();
        const isTeam = mention === '@team';
        const isCoaches = mention === '@coaches';
        const namePart = mention.slice(1);
        const isValidMention = isTeam || isCoaches || members.some((m) => {
          const f = (m.first_name || '').toLowerCase();
          const l = (m.last_name || '').toLowerCase();
          const full = `${f} ${l}`.trim();
          return (
            f === namePart || l === namePart || full === namePart ||
            f.includes(namePart) || l.includes(namePart) || full.includes(namePart) ||
            mention === `@${f}` || mention === `@${l}`
          );
        });
        return (
          <span 
            key={idx} 
            className={`font-semibold px-1 rounded ${isValidMention ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}
          >
            {part}
          </span>
        );
      }
      return <span key={idx}>{part}</span>;
    });

    return <div className="whitespace-pre-wrap break-words text-sm leading-snug">{elements}</div>;
  };

  const renderMedia = (mediaUrl: string, mediaType?: string | null, isMine?: boolean) => {
    if (!mediaUrl) return null;
    const isImage = mediaType?.startsWith('image/');
    const isVideo = mediaType?.startsWith('video/');

    if (isImage) {
      return (
        <img
          src={mediaUrl}
          alt="chat media"
          className="mt-2 max-w-[210px] max-h-[160px] rounded-lg object-contain border border-border/60 shadow-sm cursor-zoom-in hover:opacity-95"
          onClick={() => window.open(mediaUrl, '_blank')}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      );
    }
    if (isVideo) {
      return (
        <video
          src={mediaUrl}
          controls
          className="mt-2 max-w-[210px] max-h-[160px] rounded-lg bg-black border border-border/60 shadow-sm"
          style={{ maxHeight: 160 }}
        />
      );
    }
    // Fallback for unknown media
    return (
      <a href={mediaUrl} target="_blank" className="mt-1.5 inline-flex text-xs underline text-primary">
        View attachment
      </a>
    );
  };

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    if (!currentUserId) return;

    const prev = messages;

    // Optimistic toggle (instant UI feedback for both real users and temp/demo)
    setMessages((curr) => {
      const idx = curr.findIndex((m) => m.id === messageId);
      if (idx === -1) return curr;
      const m = curr[idx];
      const reacts: Record<string, string[]> = { ...(m.reactions || {}) };
      const users = reacts[emoji] ? [...reacts[emoji]] : [];
      const has = users.includes(currentUserId);
      if (has) {
        const filtered = users.filter((u) => u !== currentUserId);
        if (filtered.length === 0) delete reacts[emoji];
        else reacts[emoji] = filtered;
      } else {
        reacts[emoji] = [...users, currentUserId];
      }
      const updated = { ...m, reactions: reacts };
      const next = [...curr];
      next[idx] = updated;
      return next;
    });

    try {
      await toggleMessageReaction(messageId, emoji);
      // Realtime listeners (below) will sync other clients. Optimistic already applied.
    } catch (e: any) {
      toast.error(e.message || 'Failed to update reaction');
      setMessages(prev); // revert on error
    }
  };

  const handleEmojiPick = (emoji: string) => {
    if (reactionTargetId) {
      handleToggleReaction(reactionTargetId, emoji);
      setReactionTargetId(null);
      setShowEmojiPicker(false);
    } else {
      // Insert emoji into the text being composed
      setNewMessage((prev) => prev + emoji);
      // Leave picker open for convenience or close:
      // setShowEmojiPicker(false);
    }
  };

  const loadMessagesForView = async () => {
    if (!currentUserId) return;
    try {
      if (activeView === 'team') {
        // Parallel queries for reliability: full list + dedicated pinnedOnly (ensures pinned stay after nav/refresh/pin)
        const [data, pinnedData] = await Promise.all([
          getMessages('team'),
          getMessages('team', null, 1000, { pinnedOnly: true }),
        ]);
        setPinnedMessagesList(pinnedData as MessageWithSender[]);
        setMessages(data as MessageWithSender[]);
        // Mark team messages as read (simple: all recent)
        const ids = (data as any[]).filter(m => !m.read_by?.includes(currentUserId)).map(m => m.id);
        if (ids.length) await markMessagesAsRead(ids);
      } else if (selectedContact) {
        const data = await getMessages('direct', selectedContact.id);
        setMessages(data as MessageWithSender[]);
        // Mark these as read
        const ids = (data as any[]).filter(m => !m.read_by?.includes(currentUserId)).map(m => m.id);
        if (ids.length) await markMessagesAsRead(ids);
        // Clear unread for this contact
        setUnreadMap((prev) => {
          const copy = { ...prev };
          delete copy[selectedContact.id];
          return copy;
        });
      }
    } catch (e) {
      toast.error('Failed to load messages');
      if (activeView === 'team') setPinnedMessagesList([]); // will be reset by next successful fresh pinnedOnly query
    }
  };

  // Load (incl. fresh pinnedOnly query) when view/contact/user changes.
  // Mount/remount handled by loadUser useEffect([]) which does router.refresh() + loadInitialData.
  useEffect(() => {
    loadMessagesForView();
  }, [activeView, selectedContact?.id, currentUserId]);

  // Ensure pinned announcements always fresh from DB on mount / after nav back (when currentUserId settles)
  useEffect(() => {
    if (currentUserId) {
      loadPinnedAnnouncements();
    }
  }, [currentUserId]);

  // Aggressive: on returning to /chat via client nav (or any pathname change to chat), re-query fresh from DB.
  // Combined with loadUser([]) + router.refresh() on mount, this makes pinned list always from latest {pinnedOnly} after navigation.
  useEffect(() => {
    if (currentUserId && pathname && pathname.includes('/chat')) {
      // Re-load to pull authoritative pinned messages (and regular) without relying on stale client list state.
      loadMessagesForView();
    }
  }, [pathname, currentUserId]);

  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text && !pendingMedia) return;
    if (!currentUserId) return;

    let mediaPayload: { url: string; type: string } | undefined;

    if (pendingMedia) {
      setUploadingMedia(true);
      try {
        if (isTempUser) {
          // Temp/demo: use the local blob URL for this-session optimistic preview only.
          // (Consistent with text-only temp behavior: no real DB row or storage.)
          mediaPayload = { url: pendingMedia.previewUrl, type: pendingMedia.type };
        } else {
          // Real authenticated user: upload to Supabase Storage first (secure bucket policy)
          mediaPayload = await uploadChatMedia(pendingMedia.file, currentUserId);
        }
      } catch (e: any) {
        toast.error(e.message || 'Media upload failed');
        setUploadingMedia(false);
        return;
      }
      setUploadingMedia(false);
    }

    const content = text;
    const pendingToRestore = pendingMedia ? { ...pendingMedia } : null;

    setNewMessage('');

    // Optimistic add (works for text + media, team + DMs)
    const optimistic: MessageWithSender = {
      id: 'opt-' + Date.now(),
      created_at: new Date().toISOString(),
      sender_id: currentUserId,
      channel_type: activeView === 'team' ? 'team' : 'direct',
      recipient_id: activeView === 'direct' && selectedContact ? selectedContact.id : null,
      content,
      read_by: [currentUserId],
      media_url: mediaPayload?.url || null,
      media_type: mediaPayload?.type || null,
      reactions: {},
      sender: { id: currentUserId, first_name: 'You', last_name: '', role: isCoach ? 'coach' : 'parent' },
    };
    setMessages((prev) => [...prev, optimistic]);

    // Clear the pending preview strip (media is now part of the optimistic message)
    if (pendingMedia) {
      setPendingMedia(null);
    }

    try {
      const recip = activeView === 'direct' && selectedContact ? selectedContact.id : null;
      const res = await sendMessage(content, activeView === 'team' ? 'team' : 'direct', recip, mediaPayload?.url || null, mediaPayload?.type || null);

      if (res && res.message) {
        // Replace optimistic with persisted row from DB (real id, is_pinned:false on create etc)
        setMessages((prev) => prev.map((m) =>
          m.id === optimistic.id ? { ...res.message, sender: optimistic.sender } as MessageWithSender : m
        ));
      }

      // Always do a post-send load (for real + temp). This ensures the message (and pinned state)
      // is pulled fresh from DB via queries. For temp it uses service client so inserted rows surface reliably.
      // The full list replace + id-based RT dedup prevents dups.
      setTimeout(() => loadMessagesForView(), 250);
    } catch (e: any) {
      toast.error(e.message || 'Failed to send');
      // remove optimistic on error
      setMessages((prev) => prev.filter(m => m.id !== optimistic.id));
      setNewMessage(content);
      // Restore pending media for easy retry (esp. important for temp/demo blob previews)
      if (pendingToRestore && isTempUser) {
        setPendingMedia(pendingToRestore);
      }
      // For real users after successful upload + failed send: don't auto-restore (file already consumed);
      // user can re-attach file if desired. Media in storage is orphan but harmless for small clips.
    }
  };

  const selectContact = (member: Member) => {
    setSelectedContact(member);
    setActiveView('direct');
    setSearchTerm('');
  };

  const handleCreateAnnouncement = async () => {
    const title = announceTitle.trim();
    const body = announceBody.trim();
    if (!title || !body || !isCoach) return;
    try {
      const res = await createAnnouncement(title, body);
      toast.success('Announcement pinned!');

      if (res && res.announcement) {
        // Use the real item returned from create (with proper serial id from DB) for immediate display
        setPinned((curr) => {
          const filtered = curr.filter(a => a.id !== res.announcement!.id && a.title !== res.announcement!.title);
          return [res.announcement!, ...filtered];
        });
      }

      setShowAnnounceForm(false);
      setAnnounceTitle('');
      setAnnounceBody('');

      // Sync fresh from DB for current list
      await loadPinnedAnnouncements();
    } catch (e: any) {
      toast.error(e.message || 'Failed to pin announcement');
    }
  };

  const handleUnpinAnnouncement = async (id: number | string) => {
    if (!isCoach) return;
    const prevPinned = pinned;
    // Optimistic remove
    setPinned((curr) => curr.filter((a) => a.id !== id));
    try {
      await unpinAnnouncement(id);
      toast.success('Announcement unpinned');
      // Sync fresh from DB
      await loadPinnedAnnouncements();
    } catch (e: any) {
      toast.error(e.message || 'Failed to unpin announcement');
      setPinned(prevPinned);
    }
  };

  const handlePinMessage = async (msgId: string, pin: boolean) => {
    if (!isCoach) return;

    // No optimistic/client is_pinned update. Always query DB fresh for pinned list (via load).
    // This guarantees Pinned section reflects true DB state after nav/refresh.
    try {
      await pinMessage(msgId, pin);
      toast.success(pin ? 'Message pinned to top' : 'Message unpinned');
      // revalidateTag('messages') is called inside pinMessage.
      // Force fresh load (dedicated pinnedOnly query) + router.refresh for navigation/ remount correctness.
      await loadMessagesForView();
      router.refresh();
    } catch (e: any) {
      toast.error(e.message || 'Failed to pin/unpin');
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!confirm('Delete this message? (soft delete - hidden from view but recoverable in DB)')) return;

    const prevMessages = messages;
    const prevPinned = pinnedMessagesList;

    // Optimistic remove so it disappears immediately for the user
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    setPinnedMessagesList((prev) => prev.filter((m) => m.id !== msgId));

    try {
      await deleteMessage(msgId);
      toast.success('Message deleted');
      // Re-fetch to ensure consistency (e.g. pinned state) across all lists; realtime will handle for others
      await loadMessagesForView();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete message');
      setMessages(prevMessages);
      setPinnedMessagesList(prevPinned);
    }
  };

  const canEditMessage = (msg: MessageWithSender) => {
    if (!currentUserId) return false;
    // Owner can always edit their own; coaches/admins can edit (esp. useful for team channel)
    const isOwner = msg.sender_id === currentUserId || (isTempUser && (!msg.sender_id || msg.sender_id === 'temp-coach-id'));
    return isOwner || isCoach;
  };

  const canDeleteMessage = (msg: MessageWithSender) => {
    if (!currentUserId) return false;
    // Owner or coaches/admins can delete (same as edit permission)
    const isOwner = msg.sender_id === currentUserId || (isTempUser && (!msg.sender_id || msg.sender_id === 'temp-coach-id'));
    return isOwner || isCoach;
  };

  const startEdit = (msg: MessageWithSender) => {
    if (!canEditMessage(msg)) return;
    setEditingId(msg.id);
    setEditContent(msg.content || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const trimmed = editContent.trim();
    if (!trimmed) {
      toast.error('Message cannot be empty');
      return;
    }

    const prevMessages = messages;

    // Optimistic update (content + updated_at)
    setMessages((curr) =>
      curr.map((m) =>
        m.id === editingId
          ? { ...m, content: trimmed, updated_at: new Date().toISOString() }
          : m
      )
    );

    const wasEditingId = editingId;
    setEditingId(null);
    setEditContent('');

    try {
      await editMessage(wasEditingId, trimmed);
      // Quick refetch after edit ensures latest content + is_pinned etc from DB (now persists for temp too).
      // Prevents revert when e.g. pinning right after editing.
      setTimeout(() => loadMessagesForView(), 150);
    } catch (e: any) {
      toast.error(e.message || 'Failed to save edit');
      setMessages(prevMessages); // revert
      // Re-open editor with previous content
      setEditingId(wasEditingId);
      const original = prevMessages.find((m) => m.id === wasEditingId);
      setEditContent(original?.content || '');
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground">Loading chat...</div>;
  }

  if (!currentUserId) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground mb-4">Please log in to access the team chat.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-2">
          <MessageCircle className="h-7 w-7" /> Team Chat
        </h1>
        <p className="text-muted-foreground">Main team channel + direct messages. Realtime powered by Supabase.</p>
      </div>

      {/* View Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={activeView === 'team' ? 'default' : 'outline'}
          onClick={() => { setActiveView('team'); setSelectedContact(null); setSearchTerm(''); }}
          className="mavericks-btn-primary"
        >
          Team Channel
        </Button>
        <Button
          variant={activeView === 'direct' ? 'default' : 'outline'}
          onClick={() => { setActiveView('direct'); setSearchTerm(''); }}
        >
          Direct Messages
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar: Contacts or Pinned */}
        <div className="lg:col-span-1 space-y-4">
          {activeView === 'direct' && (
            <Card className="mavericks-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Contacts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 max-h-[400px] overflow-auto">
                {members.length === 0 && <p className="text-xs text-muted-foreground">No other members loaded (demo).</p>}
                {members.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => selectContact(m)}
                    className={`w-full text-left px-3 py-2 rounded-md hover:bg-muted flex justify-between items-center text-sm ${selectedContact?.id === m.id ? 'bg-muted' : ''}`}
                  >
                    <span>{m.first_name} {m.last_name} <span className="text-[10px] text-muted-foreground">({m.role})</span></span>
                    {unreadMap[m.id] ? (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{unreadMap[m.id]}</Badge>
                    ) : null}
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Pinned Announcements (visible in both, coach can add) */}
          <Card className="mavericks-card">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2"><Pin className="h-4 w-4" /> Pinned Announcements</CardTitle>
              {isCoach && (
                <Button size="sm" variant="outline" onClick={() => setShowAnnounceForm(!showAnnounceForm)}>
                  {showAnnounceForm ? 'Cancel' : '+ Pin'}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {showAnnounceForm && isCoach && (
                <div className="space-y-2 border p-3 rounded bg-background">
                  <Input placeholder="Title" value={announceTitle} onChange={(e) => setAnnounceTitle(e.target.value)} />
                  <textarea
                    className="w-full border rounded p-2 text-sm bg-background"
                    rows={3}
                    placeholder="Important announcement body..."
                    value={announceBody}
                    onChange={(e) => setAnnounceBody(e.target.value)}
                  />
                  <Button size="sm" onClick={handleCreateAnnouncement} className="w-full mavericks-btn-primary">Pin Announcement</Button>
                </div>
              )}

              {pinned.length === 0 && <p className="text-xs text-muted-foreground">No pinned announcements yet.</p>}
              {pinned.map((a) => (
                <div key={a.id} className="border-l-4 border-red-600 pl-3 bg-red-50/50 dark:bg-red-950/20 p-2 rounded text-xs">
                  <div className="font-semibold flex items-start justify-between gap-2">
                    <span>{a.title}</span>
                    {isCoach && (
                      <button
                        onClick={() => handleUnpinAnnouncement(a.id)}
                        className="text-red-600 hover:text-red-700 flex-shrink-0"
                        title="Unpin announcement"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <div className="text-muted-foreground mt-0.5">{a.body}</div>
                  <div className="text-[10px] mt-1 text-muted-foreground">
                    by {a.creator?.first_name || a.creator?.last_name ? `${a.creator?.first_name || ''} ${a.creator?.last_name || ''}`.trim() : 'Coach'} • {new Date(a.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Main Chat Area */}
        <div className="lg:col-span-3 flex flex-col">
          <Card className="mavericks-card flex-1 flex flex-col">
            <CardHeader className="border-b pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-lg shrink-0">
                  {activeView === 'team' ? 'Team Channel' : selectedContact ? `DM with ${selectedContact.first_name} ${selectedContact.last_name}` : 'Select a contact'}
                </CardTitle>
                {/* Compact search in header for team or active DM */}
                {(activeView === 'team' || selectedContact) && (
                  <div className="flex-1 max-w-[220px] relative">
                    <Input
                      placeholder="Search messages..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Escape') setSearchTerm(''); }}
                      className="text-sm h-8 pr-7"
                    />
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        title="Clear search"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-auto p-4 space-y-4 bg-muted/30" style={{ minHeight: '400px' }}>
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground py-10 text-sm">No messages yet. Start the conversation!</div>
              )}

              {/* Pinned messages at top for team channel (only when not searching) - cleaner, more obvious */}
              {!searchTerm.trim() && pinnedMessages.length > 0 && activeView === 'team' && (
                <div className="mb-4 rounded-lg border border-primary/40 bg-primary/5 overflow-hidden">
                  <div className="flex items-center justify-between bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
                    <span className="flex items-center gap-1.5"><Pin className="h-3.5 w-3.5" /> PINNED MESSAGES</span>
                    <span className="font-normal text-[10px] opacity-70">Important • visible to whole team</span>
                  </div>
                  <div className="p-2 space-y-2 bg-background/50">
                    {pinnedMessages.map((msg) => {
                      const isMine = !!(msg.sender_id === currentUserId || (isTempUser && (!msg.sender_id || msg.sender_id === 'temp-coach-id')));
                      const isEditing = editingId === msg.id;
                      const canEdit = canEditMessage(msg);
                      return (
                        <div key={msg.id} className={`group flex ${isMine ? 'justify-end' : ''}`}>
                          <div className={`max-w-[90%] rounded-lg px-3 py-1.5 text-sm ${isMine ? 'bg-primary text-primary-foreground' : 'bg-card border border-border'}`}>
                            {!isMine && msg.sender && (
                              <div className="text-[10px] font-semibold mb-0.5 opacity-80">
                                {msg.sender.first_name} {msg.sender.last_name} • {msg.sender.role}
                              </div>
                            )}

                            {isEditing ? (
                              <div className="space-y-2">
                                <textarea
                                  className="w-full rounded-md border bg-background p-2 text-sm resize-y min-h-[60px] text-foreground"
                                  value={editContent}
                                  onChange={(e) => setEditContent(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit(); }
                                    else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                                  }}
                                  autoFocus
                                />
                                <div className="flex gap-2 justify-end">
                                  <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
                                  <Button size="sm" onClick={saveEdit} className="mavericks-btn-primary">Save</Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {msg.content && renderMessageContent(msg)}
                                {msg.media_url && (
                                  <div className={msg.content ? 'mt-1.5' : ''}>
                                    {renderMedia(msg.media_url, msg.media_type, isMine)}
                                    {!msg.content && (
                                      <div className="text-[10px] opacity-60 mt-0.5">Media attachment</div>
                                    )}
                                  </div>
                                )}
                              </>
                            )}

                            {!isEditing && (
                              <div className="mt-1 flex items-center justify-between text-[10px]">
                                <div className={`flex items-center gap-1 ${isMine ? 'text-right' : 'text-left'}`}>
                                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  {msg.updated_at && new Date(msg.updated_at).getTime() > new Date(msg.created_at).getTime() + 500 && (
                                    <span className="opacity-60" title="Edited">(edited)</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  {canEdit && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); startEdit(msg); }}
                                      className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-primary"
                                      title="Edit message"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  )}
                                  {canDeleteMessage(msg) && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleDeleteMessage(msg.id); }}
                                      className="inline-flex items-center gap-0.5 text-red-600 hover:text-red-700"
                                      title="Delete message"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  )}
                                  {isCoach && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handlePinMessage(msg.id, false); }}
                                      className="inline-flex items-center gap-0.5 text-red-600 hover:text-red-700 font-medium"
                                      title="Unpin this message"
                                    >
                                      <Pin className="h-3 w-3 fill-current" /> Unpin
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Search results feedback */}
              {searchTerm.trim() && displayMessages.length === 0 && messages.length > 0 && (
                <div className="text-center text-xs text-muted-foreground py-3">
                  No messages match “{searchTerm}”
                </div>
              )}

              {displayMessages.map((msg) => {
                const isMine = !!(msg.sender_id === currentUserId || (isTempUser && (!msg.sender_id || msg.sender_id === 'temp-coach-id')));
                const isEditing = editingId === msg.id;
                const canEdit = canEditMessage(msg);

                return (
                  <div key={msg.id} className={`group flex ${isMine ? 'justify-end' : ''}`}>
                    <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${isMine ? 'chat-bubble-mine bg-primary text-primary-foreground' : 'chat-bubble-team bg-card border'}`}>
                      {!isMine && msg.sender && (
                        <div className="text-[10px] font-semibold mb-0.5 opacity-80">
                          {msg.sender.first_name} {msg.sender.last_name} • {msg.sender.role}
                        </div>
                      )}

                      {/* Pinned msgs are rendered only in the dedicated top section via pinnedMessagesList from fresh DB query.
                          No client badge or is_pinned override here; displayMessages already excludes pinned items. */}

                      {/* Edit mode */}
                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            className="w-full rounded-md border bg-background p-2 text-sm resize-y min-h-[60px] text-foreground"
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault();
                                saveEdit();
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelEdit();
                              }
                            }}
                            autoFocus
                          />
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
                            <Button size="sm" onClick={saveEdit} className="mavericks-btn-primary">Save</Button>
                          </div>
                          <div className="text-[9px] opacity-60">Cmd/Ctrl+Enter to save • Esc to cancel</div>
                        </div>
                      ) : (
                        <>
                          {/* Text content (with auto-linked URLs + rich YouTube previews) */}
                          {msg.content && renderMessageContent(msg)}

                          {/* Uploaded media (images show as clickable thumbs, videos with native controls) */}
                          {msg.media_url && (
                            <div className={msg.content ? 'mt-1.5' : ''}>
                              {renderMedia(msg.media_url, msg.media_type, isMine)}
                              {!msg.content && (
                                <div className="text-[10px] opacity-60 mt-0.5">Media attachment</div>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {/* Reactions row + actions (subtle until hover for clean look) */}
                      {!isEditing && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                          {Object.entries(msg.reactions || {}).map(([emoji, users]) => {
                            const count = users.length;
                            if (count === 0) return null;
                            const hasReacted = users.includes(currentUserId);
                            return (
                              <button
                                key={emoji}
                                onClick={() => handleToggleReaction(msg.id, emoji)}
                                className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-px text-[11px] transition active:scale-[0.95] ${
                                  hasReacted
                                    ? 'border-primary/40 bg-primary/10 text-primary'
                                    : 'border-border bg-muted/50 hover:bg-muted text-foreground'
                                }`}
                                title={hasReacted ? `Remove your ${emoji} reaction` : `React with ${emoji}`}
                              >
                                <span>{emoji}</span>
                                <span className="font-mono text-[10px] tabular-nums opacity-75">{count}</span>
                              </button>
                            );
                          })}

                          {/* Per-message reaction button (opens the emoji picker targeting this msg) */}
                          <button
                            onClick={() => {
                              setReactionTargetId(msg.id);
                              setShowEmojiPicker(true);
                            }}
                            className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-1 py-px text-muted-foreground hover:bg-muted hover:text-foreground transition"
                            title="Add reaction"
                          >
                            <Smile className="h-3 w-3" />
                          </button>

                          {/* Edit for owner / coaches */}
                          {canEdit && (
                            <button
                              onClick={(e) => { e.stopPropagation(); startEdit(msg); }}
                              className="ml-0.5 inline-flex items-center gap-0.5 text-muted-foreground hover:text-primary text-[10px]"
                              title="Edit message"
                            >
                              <Pencil className="h-3 w-3" /> Edit
                            </button>
                          )}

                          {/* Delete (trash) for sender or coaches/admins */}
                          {canDeleteMessage(msg) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteMessage(msg.id); }}
                              className="ml-0.5 inline-flex items-center gap-0.5 text-red-600 hover:text-red-700 text-[10px]"
                              title="Delete message"
                            >
                              <Trash2 className="h-3 w-3" /> Delete
                            </button>
                          )}

                          {/* Pin button for coaches on (non-pinned) team messages.
                              Pinned state + unpin UI lives exclusively in the top Pinned section (driven by fresh DB pinnedOnly query).
                              No reliance on per-message is_pinned flag or client cache for the Pinned section. */}
                          {isCoach && activeView === 'team' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handlePinMessage(msg.id, true); }}
                              className="ml-1 inline-flex items-center gap-0.5 rounded px-1 py-px text-[10px] transition text-muted-foreground hover:bg-primary/10 hover:text-primary"
                              title="Pin this message to top of channel"
                            >
                              <Pin className="h-3 w-3" />
                              <span className="font-medium">Pin</span>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Timestamp + edited indicator */}
                      {!isEditing && (
                        <div className={`text-[10px] mt-1 opacity-70 ${isMine ? 'text-right' : 'text-left'}`}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {msg.updated_at && new Date(msg.updated_at).getTime() > new Date(msg.created_at).getTime() + 500 && (
                            <span className="ml-1 opacity-60" title={`Edited ${new Date(msg.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}>(edited)</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </CardContent>

            {/* Input / Composer with media support (drag & drop + button) - works for both Team and DMs */}
            {(activeView === 'team' || selectedContact) && (
              <div className="p-3 border-t bg-card">
                {/* Pending media preview strip (before send) */}
                {pendingMedia && (
                  <div className="mb-2 flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-2">
                    {pendingMedia.type.startsWith('image/') ? (
                      <img
                        src={pendingMedia.previewUrl}
                        alt="preview"
                        className="h-11 w-11 rounded-md object-cover border border-border/70"
                      />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-md bg-black/80 text-white/80">
                        <Video className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="truncate font-medium">{pendingMedia.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {(pendingMedia.file.size / 1024 / 1024).toFixed(1)} MB • ready to send
                        {isTempUser ? ' (demo preview)' : ''}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={removePendingMedia}
                      disabled={uploadingMedia}
                      className="h-7 w-7 p-0"
                      title="Remove media"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}

                {/* Simple native emoji picker (for inserting into text or reacting to a targeted message) */}
                {showEmojiPicker && (
                  <div className="mb-2 rounded-xl border border-border bg-card p-2 shadow-sm">
                    <div className="flex flex-wrap gap-1">
                      {COMMON_EMOJIS.map((emo) => (
                        <button
                          key={emo}
                          onClick={() => handleEmojiPick(emo)}
                          className="rounded-md p-1.5 text-xl transition hover:bg-muted active:scale-90"
                          title={emo}
                        >
                          {emo}
                        </button>
                      ))}
                    </div>
                    <div className="mt-1 flex justify-end">
                      <button
                        onClick={() => {
                          setShowEmojiPicker(false);
                          setReactionTargetId(null);
                        }}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}

                <div
                  className={`flex items-center gap-2 rounded-lg transition-all ${isDragOver ? 'ring-2 ring-primary/60 ring-offset-2 ring-offset-background' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  title="Drag & drop an image or short video here, or use the upload button"
                >
                  <Input
                    placeholder={activeView === 'team' ? 'Message the team... (or drop media)' : 'Type a direct message... (or drop media)'}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (newMessage.trim() || pendingMedia) handleSend(); } }}
                    className="flex-1"
                    disabled={uploadingMedia}
                  />

                  {/* Hidden file input for images + short videos */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,video/mp4,video/webm,video/quicktime,video/mov"
                    className="hidden"
                    onChange={onFileInputChange}
                  />

                  {/* Upload button (image/video) */}
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={openFilePicker}
                    disabled={uploadingMedia || !!pendingMedia}
                    className="mavericks-btn-outline shrink-0"
                    title="Upload image (jpg/png/gif) or short video clip"
                  >
                    <ImagePlus className="h-4 w-4" />
                  </Button>

                  {/* Emoji picker button (next to input) */}
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setReactionTargetId(null); // ensure we are in "compose text" mode
                      setShowEmojiPicker(!showEmojiPicker);
                    }}
                    className="mavericks-btn-outline shrink-0"
                    title="Insert emoji into message"
                  >
                    <Smile className="h-4 w-4" />
                  </Button>

                  {/* Send */}
                  <Button
                    onClick={handleSend}
                    disabled={(!newMessage.trim() && !pendingMedia) || uploadingMedia}
                    className="mavericks-btn-primary shrink-0"
                  >
                    {uploadingMedia ? (
                      <span className="text-xs">Uploading…</span>
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                  Images up to 5MB • Short videos up to 25MB • Drag &amp; drop supported • YouTube links get rich previews
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>

      <p className="text-xs text-center text-muted-foreground">
        Messages are realtime. Unread counts update on view. Coach can pin announcements above.
      </p>
    </div>
  );
}
