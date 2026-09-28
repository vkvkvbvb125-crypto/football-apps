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
          phone: string | null;
          dominant_foot: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          kakao_id?: string | null;
          phone?: string | null;
          dominant_foot?: string | null;
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
          slogan: string | null;
          logo_url: string | null;
          /* 팀 프로필 — 매칭을 열 때 쓸 데이터를 미리 모은다 (20260822) */
          region_code: string | null;
          region_label: string | null;
          avg_headcount: number | null;
          skill_level: 'beginner' | 'intermediate' | 'advanced' | null;
          /** 매칭 공개 여부 — UI 없음 */
          open_to_match: boolean;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          name: string;
          created_by: string;
          home_place_name?: string | null;
          home_address?: string | null;
          home_latitude?: number | null;
          home_longitude?: number | null;
          slogan?: string | null;
          logo_url?: string | null;
          region_code?: string | null;
          region_label?: string | null;
          avg_headcount?: number | null;
          skill_level?: 'beginner' | 'intermediate' | 'advanced' | null;
          open_to_match?: boolean;
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
          jersey_number: number | null;
          notify_match: boolean;
          notify_announcement: boolean;
          notify_board: boolean;
          notify_settlement: boolean;
          /* 옛 컬럼 — 읽지 않는다. 지우지도 않았다(20260830_notify_prefs_v2.sql) */
          notify_new_match: boolean;
          notify_deadline: boolean;
          joined_at: string;
          /* 탈퇴 시각. null이면 현재 멤버. 조회는 team_members_active 뷰를 쓴다 */
          left_at: string | null;
          /*
            강퇴 표식 — **`left_at`만으로는 자진 탈퇴와 강퇴를 못 가른다**(둘 다 left_at만 찍는다).
            `removed_at`이 **판정 근거**고(재참여 차단이 이걸 본다), `removed_by`는 표시용이다.
            ⚠ `leave_team()`이 자진 탈퇴 때 둘을 **비운다** — 되돌아왔다가 스스로 나간 사람이
              옛 removed_at 때문에 차단되면 안 된다.
          */
          removed_at: string | null;
          /* 내보낸 총무. 그 계정이 지워지면 null이 되지만 removed_at은 남는다 */
          removed_by: string | null;
        };
        Insert: {
          team_id: string;
          user_id: string;
          role?: TeamRole;
          skill_tag?: SkillTag | null;
          position?: string | null;
          skill_level?: SkillLevel;
          jersey_number?: number | null;
          notify_match?: boolean;
          notify_announcement?: boolean;
          notify_board?: boolean;
          notify_settlement?: boolean;
          notify_new_match?: boolean;
          notify_deadline?: boolean;
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
          /** 20260806 마이그레이션 전 앱에서는 undefined일 수 있다 */
          match_type?: string | null;
          created_by: string | null;
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
          /** 납부 기한 yyyy-mm-dd (20260806 마이그레이션). 총무가 안 정하면 null */
          due_date?: string | null;
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
          due_date?: string | null;
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
        Relationships: [
          {
            foreignKeyName: 'venue_slots_venue_id_fkey';
            columns: ['venue_id'];
            isOneToOne: false;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
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
          author_id: string | null;
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
      // 20260812_announcement_reads.sql — 공지 읽음 기록 (총무의 "N명 읽음")
      announcement_reads: {
        Row: {
          announcement_id: string;
          user_id: string;
          read_at: string;
        };
        Insert: {
          announcement_id: string;
          user_id: string;
        };
        Update: Partial<Database['public']['Tables']['announcement_reads']['Insert']>;
        Relationships: [];
      };
      posts: {
        Row: {
          id: string;
          team_id: string;
          author_id: string;
          category: string;
          body: string;
          image_url: string | null;
          created_at: string;
          /** null이면 한 번도 안 고친 글 */
          updated_at: string | null;
        };
        Insert: {
          team_id: string;
          author_id: string;
          category?: string;
          body: string;
          image_url?: string | null;
          /** 글을 만들 때는 넣지 않는다. 수정할 때 Update가 이 키를 쓴다 */
          updated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['posts']['Insert']>;
        Relationships: [];
      };
      post_likes: {
        Row: { post_id: string; user_id: string; created_at: string };
        Insert: { post_id: string; user_id: string };
        Update: Partial<Database['public']['Tables']['post_likes']['Insert']>;
        Relationships: [];
      };
      post_comments: {
        Row: { id: string; post_id: string; author_id: string; body: string; created_at: string };
        Insert: { post_id: string; author_id: string; body: string };
        Update: Partial<Database['public']['Tables']['post_comments']['Insert']>;
        Relationships: [];
      };
      /** 글 고정 — posts를 건드리지 않고 여기에 줄을 넣고 뺀다 (총무만, RLS가 막는다) */
      post_pins: {
        Row: { post_id: string; pinned_by: string; created_at: string };
        Insert: { post_id: string; pinned_by: string };
        Update: Partial<Database['public']['Tables']['post_pins']['Insert']>;
        Relationships: [];
      };
      polls: {
        Row: {
          id: string;
          team_id: string;
          author_id: string | null;
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
      /**
       * 경기 스코어. 키가 (match_id, squad_label)이라 팀이 3~5개로 늘어도
       * 컬럼이 아니라 행이 늘어난다 — squad_label은 team_assignments.group_label과 같은 값.
       */
      match_scores: {
        Row: {
          match_id: string;
          squad_label: string;
          score: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          match_id: string;
          squad_label: string;
          score?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['match_scores']['Insert']>;
        Relationships: [];
      };
    };
    Views: {
      /*
        현재 멤버만. `select * from team_members where left_at is null`.

        ⚠ 행을 지우지 않는 이유는 CASCADE다 — settlement_shares·attendance_votes 등이
          team_member_id를 물고 있어 지우면 정산 몫과 참석 기록이 함께 사라진다.
        ⚠ **읽기 전용이다.** security_invoker 뷰라 UPDATE/DELETE는 테이블로 가야 하고,
          나가기는 leave_team() RPC가 한다.
      */
      team_members_active: {
        Row: {
          id: string;
          team_id: string;
          user_id: string;
          role: TeamRole;
          skill_tag: SkillTag | null;
          position: string | null;
          skill_level: SkillLevel;
          jersey_number: number | null;
          notify_match: boolean;
          notify_announcement: boolean;
          notify_board: boolean;
          notify_settlement: boolean;
          notify_new_match: boolean;
          notify_deadline: boolean;
          joined_at: string;
          /* 뷰의 조건이 `left_at is null`이라 여기서는 늘 null이다. 모양을 맞춰 둔다 */
          left_at: string | null;
        };
        Relationships: [];
      };
      /*
        내보낸 멤버만. `select … from team_members where removed_at is not null`.

        ⚠ **이 뷰는 총무만 읽게 막지 않는다.** security_invoker라 team_members_select
          (`is_team_member`)가 그대로 걸리고, 그건 「그 팀의 현재 멤버면 읽는다」다 —
          **팀원도 읽을 수 있다.** 총무 전용은 **화면이 가른다**(MemberListModal).
          뷰가 막아준다고 오해하지 마라. 노출 범위는 지금과 같다: 팀원은 이미
          team_members의 나간 사람 행을 읽을 수 있었다.
        ⚠ 읽기 전용이다. 되돌리기는 restore_member() RPC가 한다.
      */
      team_members_removed: {
        Row: {
          id: string;
          team_id: string;
          user_id: string;
          role: TeamRole;
          joined_at: string;
          left_at: string | null;
          removed_at: string;
          removed_by: string | null;
        };
        Relationships: [];
      };
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
      leave_team: {
        Args: { p_team_id: string };
        /* { ok: true, disbanded: boolean }. 막히는 경우는 예외로 온다(P0001) */
        Returns: { ok: boolean; disbanded: boolean };
      };
      join_team_by_invite: {
        Args: { p_invite_code: string };
        Returns: Database['public']['Tables']['team_members']['Row'];
      };
      /**
       * 총무의 강퇴. **행을 지우지 않고 `left_at`을 찍는다** — 지우면
       * settlement_shares·attendance_votes가 CASCADE로 함께 사라진다.
       * `role`도 `member`로 내린다(강퇴당한 총무가 초대 코드로 총무 복귀하는 것을 막는다).
       * 막히는 경우는 예외로 온다(P0001): 총무 아님 · 나 자신 · 마지막 총무 · 이미 나감.
       */
      remove_member: {
        Args: { p_team_member_id: string };
        Returns: { ok: boolean };
      };
      /**
       * 강퇴 되돌리기. **표식(`removed_at`·`removed_by`)만 지우고 팀에 되돌리지는 않는다** —
       * 본인이 초대 코드로 들어온다. 총무가 남의 계정을 팀에 밀어 넣는 모양을 안 만든다.
       * ⚠ 그래서 되돌린 뒤 **현재 초대 코드를 알려줘야 한다**(재발급했으면 옛 코드는 죽었다).
       * 막히는 경우는 P0001: 총무 아님 · 내보낸 멤버가 아님.
       */
      restore_member: {
        Args: { p_team_member_id: string };
        Returns: { ok: boolean };
      };
      /**
       * 초대 코드 재발급. **지금까지 뿌린 코드와 링크가 전부 죽는다** — 아직 안 들어온
       * 정상 초대자까지 포함이다. 차단은 `removed_at`이 하고, 이건 강퇴당한 사람이
       * **다른 계정**으로 들어오는 것을 막을 때 쓴다. UNIQUE라 충돌하면 서버가 다시 뽑는다.
       */
      rotate_invite_code: {
        Args: { p_team_id: string };
        Returns: string;
      };
      /**
       * 탈퇴해도 되는지. 인자가 없고 auth.uid()만 본다 — 대상을 받으면 남의 미납
       * 건수를 물어볼 수 있다. 인증이 없으면 can_delete: false + reason: 'no_auth'.
       * 실제 모양은 accountService.DeletionStatus.
       */
      account_deletion_status: {
        Args: Record<string, never>;
        Returns: unknown;
      };
    };
  };
}
