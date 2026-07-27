export type TeamRole = 'admin' | 'member';
export type SkillTag = '상' | '중' | '하';
export type MatchStatus = 'open' | 'locked' | 'completed';
export type AttendanceStatus = 'attend' | 'absent' | 'undecided';
/** 총무 설정. 팀 분배 균형 계산에 사용 (3 상 / 2 중 / 1 하) */
export type SkillLevel = 1 | 2 | 3;
export type SettlementStatus = 'open' | 'done' | 'skipped';
export type FeeMode = 'per_match' | 'monthly';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          kakao_id: string | null;
          display_name: string;
          avatar_url: string | null;
          push_token: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          kakao_id?: string | null;
          display_name: string;
          avatar_url?: string | null;
          push_token?: string | null;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      teams: {
        Row: {
          id: string;
          name: string;
          invite_code: string;
          home_place_name: string | null;
          home_address: string | null;
          home_latitude: number | null;
          home_longitude: number | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          name: string;
          created_by: string;
          home_place_name?: string | null;
          home_address?: string | null;
          home_latitude?: number | null;
          home_longitude?: number | null;
        };
        Update: Partial<Database['public']['Tables']['teams']['Insert']>;
        Relationships: [];
      };
      team_members: {
        Row: {
          id: string;
          team_id: string;
          user_id: string;
          role: TeamRole;
          skill_tag: SkillTag | null;
          position: string | null;
          skill_level: SkillLevel;
          joined_at: string;
        };
        Insert: {
          team_id: string;
          user_id: string;
          role?: TeamRole;
          skill_tag?: SkillTag | null;
          position?: string | null;
          skill_level?: SkillLevel;
        };
        Update: Partial<Database['public']['Tables']['team_members']['Insert']>;
        Relationships: [];
      };
      matches: {
        Row: {
          id: string;
          team_id: string;
          match_date: string;
          location: string | null;
          address: string | null;
          latitude: number | null;
          longitude: number | null;
          place_category: string | null;
          vote_deadline: string | null;
          status: MatchStatus;
          quarter_minutes: number;
          team_count: number;
          capacity: number;
          venue_id: string | null;
          location_pending: boolean;
          created_by: string;
          created_at: string;
        };
        Insert: {
          team_id: string;
          match_date: string;
          location?: string | null;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          place_category?: string | null;
          vote_deadline?: string | null;
          status?: MatchStatus;
          quarter_minutes?: number;
          team_count?: number;
          capacity?: number;
          venue_id?: string | null;
          location_pending?: boolean;
          created_by: string;
        };
        Update: Partial<Database['public']['Tables']['matches']['Insert']>;
        Relationships: [];
      };
      attendance_votes: {
        Row: {
          id: string;
          match_id: string;
          team_member_id: string;
          status: AttendanceStatus;
          updated_at: string;
        };
        Insert: {
          match_id: string;
          team_member_id: string;
          status?: AttendanceStatus;
        };
        Update: Partial<Database['public']['Tables']['attendance_votes']['Insert']>;
        Relationships: [];
      };
      settlements: {
        Row: {
          id: string;
          match_id: string;
          team_id: string;
          total_amount: number;
          per_person: number;
          surplus: number;
          memo: string | null;
          bank_name: string | null;
          account_no: string | null;
          account_holder: string | null;
          status: SettlementStatus;
          created_by: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          match_id: string;
          team_id: string;
          total_amount: number;
          per_person: number;
          surplus?: number;
          memo?: string | null;
          bank_name?: string | null;
          account_no?: string | null;
          account_holder?: string | null;
          status?: SettlementStatus;
          created_by?: string | null;
          completed_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['settlements']['Insert']>;
        Relationships: [];
      };
      settlement_shares: {
        Row: {
          id: string;
          settlement_id: string;
          team_member_id: string | null;
          guest_name: string | null;
          amount: number;
          exempt: boolean;
          marked_paid_at: string | null;
          confirmed_at: string | null;
        };
        Insert: {
          settlement_id: string;
          team_member_id?: string | null;
          guest_name?: string | null;
          amount: number;
          exempt?: boolean;
          marked_paid_at?: string | null;
          confirmed_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['settlement_shares']['Insert']>;
        Relationships: [];
      };
      venues: {
        Row: {
          id: string;
          name: string;
          address: string | null;
          latitude: number | null;
          longitude: number | null;
          is_indoor: boolean;
          is_partner: boolean;
          hourly_price: number | null;
          max_players: number | null;
          amenities: string[];
          used_by_teams: number;
          created_at: string;
        };
        Insert: {
          name: string;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          is_indoor?: boolean;
          is_partner?: boolean;
          hourly_price?: number | null;
          max_players?: number | null;
          amenities?: string[];
          used_by_teams?: number;
        };
        Update: Partial<Database['public']['Tables']['venues']['Insert']>;
        Relationships: [];
      };
      venue_slots: {
        Row: {
          id: string;
          venue_id: string;
          slot_date: string;
          start_time: string;
          end_time: string;
          is_available: boolean;
          created_at: string;
        };
        Insert: {
          venue_id: string;
          slot_date: string;
          start_time: string;
          end_time: string;
          is_available?: boolean;
        };
        Update: Partial<Database['public']['Tables']['venue_slots']['Insert']>;
        Relationships: [];
      };
      waitlist: {
        Row: {
          id: string;
          match_id: string;
          team_member_id: string;
          position: number;
          created_at: string;
        };
        Insert: {
          match_id: string;
          team_member_id: string;
          position: number;
        };
        Update: Partial<Database['public']['Tables']['waitlist']['Insert']>;
        Relationships: [];
      };
      team_settings: {
        Row: {
          team_id: string;
          default_weekdays: number[];
          default_time: string | null;
          default_venue_id: string | null;
          default_capacity: number;
          fee_mode: FeeMode;
          default_fee: number | null;
          bank_name: string | null;
          account_no: string | null;
          account_holder: string | null;
          guest_allowed: boolean;
          guest_fee: number | null;
          join_approval_required: boolean;
          updated_at: string;
        };
        Insert: {
          team_id: string;
          default_weekdays?: number[];
          default_time?: string | null;
          default_venue_id?: string | null;
          default_capacity?: number;
          fee_mode?: FeeMode;
          default_fee?: number | null;
          bank_name?: string | null;
          account_no?: string | null;
          account_holder?: string | null;
          guest_allowed?: boolean;
          guest_fee?: number | null;
          join_approval_required?: boolean;
        };
        Update: Partial<Database['public']['Tables']['team_settings']['Insert']>;
        Relationships: [];
      };
      team_assignments: {
        Row: {
          id: string;
          match_id: string;
          team_member_id: string;
          group_label: string;
          updated_at: string;
        };
        Insert: {
          match_id: string;
          team_member_id: string;
          group_label: string;
        };
        Update: Partial<Database['public']['Tables']['team_assignments']['Insert']>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          team_id: string;
          user_id: string;
          title: string;
          body: string;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          team_id: string;
          user_id: string;
          title: string;
          body: string;
          is_read?: boolean;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
        Relationships: [];
      };
      announcements: {
        Row: {
          id: string;
          team_id: string;
          author_id: string;
          title: string;
          body: string;
          is_pinned: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          team_id: string;
          author_id: string;
          title: string;
          body: string;
          is_pinned?: boolean;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['announcements']['Insert']>;
        Relationships: [];
      };
      polls: {
        Row: {
          id: string;
          team_id: string;
          author_id: string;
          question: string;
          options: string[];
          deadline: string | null;
          created_at: string;
        };
        Insert: {
          team_id: string;
          author_id: string;
          question: string;
          options: string[];
          deadline?: string | null;
        };
        Update: Partial<Database['public']['Tables']['polls']['Insert']>;
        Relationships: [];
      };
      poll_responses: {
        Row: {
          id: string;
          poll_id: string;
          team_member_id: string;
          option_index: number;
          updated_at: string;
        };
        Insert: {
          poll_id: string;
          team_member_id: string;
          option_index: number;
        };
        Update: Partial<Database['public']['Tables']['poll_responses']['Insert']>;
        Relationships: [];
      };
    };
    Views: {
      team_member_stats: {
        Row: {
          team_member_id: string;
          team_id: string;
          attend_count: number;
          vote_count: number;
          attendance_rate: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      create_team: {
        Args: { p_name: string };
        Returns: Database['public']['Tables']['teams']['Row'];
      };
      join_team_by_invite: {
        Args: { p_invite_code: string };
        Returns: Database['public']['Tables']['team_members']['Row'];
      };
    };
  };
}
