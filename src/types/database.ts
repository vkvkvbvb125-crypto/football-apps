export type TeamRole = 'admin' | 'member';
export type SkillTag = '상' | '중' | '하';
export type MatchStatus = 'open' | 'locked' | 'completed';
export type AttendanceStatus = 'attend' | 'absent' | 'undecided';

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
          created_by: string;
          created_at: string;
        };
        Insert: {
          name: string;
          created_by: string;
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
          joined_at: string;
        };
        Insert: {
          team_id: string;
          user_id: string;
          role?: TeamRole;
          skill_tag?: SkillTag | null;
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
          total_amount: number;
          per_person_amount: number | null;
          bank_name: string;
          account_number: string;
          account_holder: string;
          created_at: string;
        };
        Insert: {
          match_id: string;
          total_amount: number;
          per_person_amount?: number | null;
          bank_name: string;
          account_number: string;
          account_holder: string;
        };
        Update: Partial<Database['public']['Tables']['settlements']['Insert']>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          settlement_id: string;
          team_member_id: string;
          is_paid: boolean;
          checked_by: string | null;
          checked_at: string | null;
        };
        Insert: {
          settlement_id: string;
          team_member_id: string;
          is_paid?: boolean;
          checked_by?: string | null;
          checked_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['payments']['Insert']>;
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
    };
    Views: Record<string, never>;
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
