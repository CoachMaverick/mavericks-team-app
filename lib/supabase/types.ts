// Auto-generated style types for Mavericks 12U app.
// After running the schema in Supabase, you can replace this with:
//   npx supabase gen types typescript --project-id <your-id> > lib/supabase/types.ts
// For now, this is manually kept in sync with supabase/schema.sql for excellent DX.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'coach' | 'parent' | 'player' | 'admin';
export type EventType = 'practice' | 'game' | 'tournament' | 'meeting' | 'other';
export type RsvpStatus = 'yes' | 'no' | 'maybe';
export type InvoiceStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';
export type ChannelType = 'team' | 'direct';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          first_name: string | null;
          last_name: string | null;
          phone: string | null;
          email: string | null;
          avatar_url: string | null;
          family_id: string | null;
          last_active_at: string | null;
          created_at: string;
          updated_at: string | null;
          is_admin: boolean;
        };
        Insert: {
          id: string;
          role?: UserRole;
          first_name?: string | null;
          last_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          family_id?: string | null;
          last_active_at?: string | null;
          created_at?: string;
          updated_at?: string | null;
          is_admin?: boolean;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      families: {
        Row: {
          id: string;
          name: string;
          primary_parent_id: string | null;
          email: string | null;
          phone: string | null;
          parent_names: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          primary_parent_id?: string | null;
          email?: string | null;
          phone?: string | null;
          parent_names?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['families']['Insert']>;
      };
      players: {
        Row: {
          id: string;
          family_id: string;
          first_name: string;
          last_name: string;
          jersey_number: number | null;
          position: string | null;
          date_of_birth: string | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          family_id: string;
          first_name: string;
          last_name: string;
          jersey_number?: number | null;
          position?: string | null;
          date_of_birth?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['players']['Insert']>;
      };
      events: {
        Row: {
          id: number;
          title: string;
          type: EventType;
          start_time: string;
          end_time: string | null;
          location: string | null;
          opponent: string | null;
          description: string | null;
          created_by: string | null;
          is_cancelled: boolean;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: number;
          title: string;
          type: EventType;
          start_time: string;
          end_time?: string | null;
          location?: string | null;
          opponent?: string | null;
          description?: string | null;
          created_by?: string | null;
          is_cancelled?: boolean;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['events']['Insert']>;
      };
      rsvps: {
        Row: {
          id: string;
          event_id: string;
          player_id: string;
          status: RsvpStatus;
          responded_by: string | null;
          note: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          event_id: string;
          player_id: string;
          status: RsvpStatus;
          responded_by?: string | null;
          note?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['rsvps']['Insert']>;
      };
      messages: {
        Row: {
          id: string;
          created_at: string;
          sender_id: string;
          channel_type: ChannelType;
          recipient_id: string | null;
          content: string;
          read_by: string[] | null;
          media_url: string | null;
          media_type: string | null;
          reactions: Json; // { "👍": ["user-id", ...], ... }
          is_pinned: boolean;
          is_deleted: boolean;
        };
        Insert: {
          id?: string;
          created_at?: string;
          sender_id: string;
          channel_type?: ChannelType;
          recipient_id?: string | null;
          content: string;
          read_by?: string[] | null;
          media_url?: string | null;
          media_type?: string | null;
          reactions?: Json;
          is_pinned?: boolean;
          is_deleted?: boolean;
        };
        Update: Partial<Database['public']['Tables']['messages']['Insert']>;
      };
      message_reactions: {
        Row: {
          id: string;
          message_id: string;
          user_id: string;
          emoji: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          user_id: string;
          emoji: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['message_reactions']['Insert']>;
      };
      announcements: {
        Row: {
          id: number;
          title: string;
          body: string;
          is_pinned: boolean;
          created_by: string | null;
          expires_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          title: string;
          body: string;
          is_pinned?: boolean;
          created_by?: string | null;
          expires_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['announcements']['Insert']>;
      };
      invoices: {
        Row: {
          id: string;
          family_id: string;
          amount_cents: number;
          due_date: string;
          status: InvoiceStatus;
          description: string | null;
          stripe_session_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string | null;
          due_type: string;
          notes: string | null;
          player_id: string | null;
        };
        Insert: {
          id?: string;
          family_id: string;
          amount_cents: number;
          due_date: string;
          status?: InvoiceStatus;
          description?: string | null;
          stripe_session_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string | null;
          due_type?: string;
          notes?: string | null;
          player_id?: string | null;
        };
        Update: Partial<Database['public']['Tables']['invoices']['Insert']>;
      };
      payments: {
        Row: {
          id: string;
          invoice_id: string;
          amount_cents: number;
          paid_at: string;
          stripe_payment_intent_id: string | null;
          status: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          amount_cents: number;
          paid_at?: string;
          stripe_payment_intent_id?: string | null;
          status?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['payments']['Insert']>;
      };
      team_settings: {
        Row: {
          id: number;
          team_name: string;
          logo_url: string | null;
          season_name: string;
          dues_monthly_cents: number;
          dues_season_cents: number;
          updated_at: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: number;
          team_name?: string;
          logo_url?: string | null;
          season_name?: string;
          dues_monthly_cents?: number;
          dues_season_cents?: number;
          updated_at?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['team_settings']['Insert']>;
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: 'event_new' | 'event_updated' | 'event_canceled' | 'announcement_new' | 'payment_due' | 'rsvp_reminder' | 'mention' | 'team_message';
          title: string;
          body: string | null;
          link: string | null;
          related_id: string | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: 'event_new' | 'event_updated' | 'event_canceled' | 'announcement_new' | 'payment_due' | 'rsvp_reminder' | 'mention' | 'team_message';
          title: string;
          body?: string | null;
          link?: string | null;
          related_id?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
      };
      notification_preferences: {
        Row: {
          user_id: string;
          event_new: boolean;
          event_updated: boolean;
          event_canceled: boolean;
          announcement_new: boolean;
          payment_due: boolean;
          team_message: boolean;
          updated_at: string | null;
        };
        Insert: {
          user_id: string;
          event_new?: boolean;
          event_updated?: boolean;
          event_canceled?: boolean;
          announcement_new?: boolean;
          payment_due?: boolean;
          team_message?: boolean;
          updated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['notification_preferences']['Insert']>;
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}

// Helper derived types for the app
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Family = Database['public']['Tables']['families']['Row'];
export type Player = Database['public']['Tables']['players']['Row'];
export type Event = Database['public']['Tables']['events']['Row'] & { id: number };
export type Rsvp = Database['public']['Tables']['rsvps']['Row'];
export type Message = Database['public']['Tables']['messages']['Row'];
export type MessageReaction = Database['public']['Tables']['message_reactions']['Row'];
export type Announcement = Database['public']['Tables']['announcements']['Row'];
export type Invoice = Database['public']['Tables']['invoices']['Row'];
export type Payment = Database['public']['Tables']['payments']['Row'];
export type TeamSettings = Database['public']['Tables']['team_settings']['Row'];
export type Notification = Database['public']['Tables']['notifications']['Row'];
export type NotificationPreference = Database['public']['Tables']['notification_preferences']['Row'];

// Joined / enriched types we will use in components
export type EventWithRsvps = Event & {
  rsvps?: (Rsvp & { player?: Player })[];
  yes_count?: number;
  no_count?: number;
  maybe_count?: number;
};

export type InvoiceWithPayments = Invoice & {
  payments?: Payment[];
  balance_cents?: number;
};

export type PlayerWithFamily = Player & {
  family?: (Family & { primary_parent?: Profile | null }) | null;
};
