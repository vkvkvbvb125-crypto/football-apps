// src/features/team/screens/TeamHomeScreen.tsx — 리디자인 적용판
// 모달(공지/멤버/투표/장소 검색)과 store 호출은 기존과 100% 동일. UI만 교체했습니다.
// 추가: 앱 로고 대신 "팀 엠블럼" 슬롯 (업로드 연결 전이라 안내 Alert)
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Share, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useAuthStore } from '../../auth/stores/authStore';
import { useTeamStore } from '../stores/teamStore';
import { useAnnouncementsStore } from '../../announcements/stores/announcementsStore';
import { AnnouncementFormModal } from '../../announcements/components/AnnouncementFormModal';
import { AnnouncementListModal } from '../../announcements/components/AnnouncementListModal';
import { AnnouncementDetailModal } from '../../announcements/components/AnnouncementDetailModal';
import type { AnnouncementRow } from '../../announcements/services/announcementsService';
import { MemberListModal } from '../components/MemberListModal';
import { usePollsStore } from '../../polls/stores/pollsStore';
import { PollFormModal } from '../../polls/components/PollFormModal';
import { PollCard } from '../../polls/components/PollCard';
import { FieldBackground } from '../../../components/FieldBackground';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { PlaceSearchModal } from '../../attendance/components/PlaceSearchModal';
import type { PlaceResult } from '../../attendance/services/placeService';
import { colors, radius } from '../../../theme';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

function initialOf(name: string) {
  return name.length > 2 ? name.slice(1) : name;
}

export function TeamHomeScreen() {
  const activeTeam = useTeamStore((s) => s.activeTeam);
  const signOut = useAuthStore((s) => s.signOut);
  const updateHomeLocation = useTeamStore((s) => s.updateHomeLocation);
  const members = useTeamStore((s) => s.members);
  const loadMembers = useTeamStore((s) => s.loadMembers);
  const updateMemberSkillTag = useTeamStore((s) => s.updateMemberSkillTag);
  const promoteToAdmin = useTeamStore((s) => s.promoteToAdmin);
  const removeMember = useTeamStore((s) => s.removeMember);

  const [memberListVisible, setMemberListVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const announcements = useAnnouncementsStore((s) => s.announcements);
  const loadAnnouncements = useAnnouncementsStore((s) => s.loadAnnouncements);
  const createAnnouncement = useAnnouncementsStore((s) => s.createAnnouncement);
  const updateAnnouncement = useAnnouncementsStore((s) => s.updateAnnouncement);
  const deleteAnnouncement = useAnnouncementsStore((s) => s.deleteAnnouncement);
  const [formVisible, setFormVisible] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<AnnouncementRow | null>(null);
  const [listVisible, setListVisible] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementRow | null>(null);

  const polls = usePollsStore((s) => s.polls);
  const loadPolls = usePollsStore((s) => s.loadPolls);
  const createPoll = usePollsStore((s) => s.createPoll);
  const deletePoll = usePollsStore((s) => s.deletePoll);
  const votePoll = usePollsStore((s) => s.vote);
  const [pollFormVisible, setPollFormVisible] = useState(false);

  useEffect(() => {
    if (!activeTeam) return;
    loadAnnouncements();
    loadMembers();
    loadPolls();
  }, [activeTeam?.team.id]);

  const confirm = (title: string, message: string, onYes: () => void) => {
    if (Platform.OS === 'web') {
      if (window.confirm(message)) onYes();
      return;
    }
    Alert.alert(title, message, [
      { text: '아니오', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: onYes },
    ]);
  };

  if (!activeTeam) return null;

  const isAdmin = activeTeam.role === 'admin';
  const inviteUrl = `${SUPABASE_URL}/functions/v1/invite-redirect?code=${activeTeam.team.invite_code}`;
  const createdAt = new Date(activeTeam.team.created_at ?? Date.now());

  const handleCopyInviteCode = async () => {
    await Clipboard.setStringAsync(activeTeam.team.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleShareInvite = () => {
    Share.share({
      message: `${activeTeam.team.name}에 초대할게요! 아래 링크를 눌러 참여해주세요.\n${inviteUrl}`,
    });
  };

  const handlePickEmblem = () =>
    Alert.alert('팀 엠블럼', '이미지 업로드는 아직 준비 중이에요.\n곧 우리 팀 엠블럼을 지정할 수 있어요.');

  const emblemInitials = activeTeam.team.name.replace(/\s/g, '').slice(0, 2).toUpperCase();

  return (
    <ScreenGradient>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* 팀 배너 */}
        <View style={styles.banner}>
          <FieldBackground variant="night" />
          <View style={styles.bannerRow}>
            <View>
              <Pressable
                onPress={isAdmin ? handlePickEmblem : undefined}
                style={({ pressed }) => [styles.emblem, pressed && isAdmin && styles.pressed]}
              >
                <Text style={styles.emblemInitials}>{emblemInitials}</Text>
                <Text style={styles.emblemHint}>EMBLEM</Text>
              </Pressable>
              {isAdmin && (
                <Pressable onPress={handlePickEmblem} style={styles.emblemEdit} hitSlop={8}>
                  <Ionicons name="pencil" size={11} color={colors.bgRoot} />
                </Pressable>
              )}
            </View>

            <View style={styles.bannerBody}>
              <Text style={styles.teamName} numberOfLines={1}>
                {activeTeam.team.name}
              </Text>
              <View style={styles.bannerMetaRow}>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>{isAdmin ? '총무' : '일반 멤버'}</Text>
                </View>
                <Text style={styles.bannerMeta}>
                  멤버 {members.length}명 · {createdAt.getFullYear()}.
                  {String(createdAt.getMonth() + 1).padStart(2, '0')} 개설
                </Text>
              </View>
            </View>

            <Pressable onPress={signOut} hitSlop={8}>
              <Ionicons name="log-out-outline" size={20} color="rgba(255,255,255,0.75)" />
            </Pressable>
          </View>
        </View>

        <View style={styles.content}>
          {/* 엠블럼 설정 (총무) */}
          {isAdmin && (
            <View style={styles.card}>
              <View style={styles.rowCard}>
                <View style={styles.rowIcon}>
                  <Ionicons name="shield-outline" size={18} color={colors.green} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.rowTitle}>팀 엠블럼 설정</Text>
                  <Text style={styles.rowSub}>앱 로고 대신 우리 팀 엠블럼이 표시돼요</Text>
                </View>
                <Pressable onPress={handlePickEmblem} style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}>
                  <Text style={styles.smallBtnText}>지정</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* 초대 코드 (총무) */}
          {isAdmin && (
            <View style={styles.card}>
              <View style={styles.inviteRow}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.label}>초대 코드</Text>
                  <Text style={styles.inviteCode}>{activeTeam.team.invite_code}</Text>
                </View>
                <View style={styles.inviteButtons}>
                  <Pressable
                    onPress={handleCopyInviteCode}
                    style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.smallBtnText}>{copied ? '복사됨' : '복사'}</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleShareInvite}
                    style={({ pressed }) => [styles.smallBtnGhost, pressed && styles.pressed]}
                  >
                    <Text style={styles.smallBtnGhostText}>공유</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          {/* 팀 대표 지역 (총무) */}
          {isAdmin && (
            <View style={[styles.card, { gap: 10 }]}>
              <Text style={styles.label}>팀 대표 지역</Text>
              <PlaceSearchModal
                value={activeTeam.team.home_place_name ? { name: activeTeam.team.home_place_name } : null}
                onSelect={(place: PlaceResult) =>
                  updateHomeLocation({
                    placeName: place.name,
                    address: place.address,
                    latitude: place.latitude,
                    longitude: place.longitude,
                  })
                }
              />
              <Text style={styles.hint}>경기 없는 날의 예상 날씨를 이 위치 기준으로 보여줘요</Text>
            </View>
          )}

          {/* 멤버 */}
          <View style={[styles.card, { gap: 12 }]}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>멤버 {members.length}명</Text>
              <Pressable onPress={() => setMemberListVisible(true)} hitSlop={8}>
                <Text style={styles.sectionLink}>전체보기 ›</Text>
              </Pressable>
            </View>
            <View>
              {members.slice(0, 5).map((m) => {
                const isMe = m.id === activeTeam.membershipId;
                const isTeamAdmin = m.role === 'admin';
                return (
                  <View key={m.id} style={styles.memberRow}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{initialOf(m.displayName)}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text style={styles.memberName} numberOfLines={1}>
                        {m.displayName}
                        {isMe ? ' (나)' : ''}
                      </Text>
                      <Text style={styles.memberMeta}>{m.skillTag ? `실력 ${m.skillTag}` : '실력 미지정'}</Text>
                    </View>
                    {isTeamAdmin ? (
                      <View style={styles.adminBadge}>
                        <Text style={styles.adminBadgeText}>총무</Text>
                      </View>
                    ) : (
                      <Text style={styles.memberRole}>멤버</Text>
                    )}
                  </View>
                );
              })}
              {members.length === 0 && <Text style={styles.empty}>아직 멤버가 없어요</Text>}
            </View>
          </View>

          {/* 공지사항 */}
          <View style={[styles.card, { gap: 12 }]}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>공지사항</Text>
              <View style={styles.sectionHeadRight}>
                {isAdmin && (
                  <Pressable
                    hitSlop={8}
                    onPress={() => {
                      setEditingAnnouncement(null);
                      setFormVisible(true);
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={20} color={colors.green} />
                  </Pressable>
                )}
                <Pressable onPress={() => setListVisible(true)} hitSlop={8}>
                  <Text style={styles.sectionLink}>전체보기 ›</Text>
                </Pressable>
              </View>
            </View>

            {announcements.length === 0 ? (
              <Text style={styles.empty}>등록된 공지가 없어요</Text>
            ) : (
              <View>
                {announcements.slice(0, 3).map((a) => (
                  <Pressable
                    key={a.id}
                    onPress={() => setSelectedAnnouncement(a)}
                    style={({ pressed }) => [styles.noticeRow, pressed && styles.pressed]}
                  >
                    {a.is_pinned && (
                      <View style={styles.pinBadge}>
                        <Text style={styles.pinBadgeText}>고정</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.noticeTitle} numberOfLines={1}>
                        {a.title}
                      </Text>
                      <Text style={styles.noticeBody} numberOfLines={1}>
                        {a.body}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* 투표 */}
          <View style={[styles.card, { gap: 12 }]}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>투표</Text>
              {isAdmin && (
                <Pressable onPress={() => setPollFormVisible(true)} hitSlop={8}>
                  <Ionicons name="add-circle-outline" size={20} color={colors.green} />
                </Pressable>
              )}
            </View>
            {polls.length === 0 ? (
              <Text style={styles.empty}>등록된 투표가 없어요</Text>
            ) : (
              polls.map((poll) => (
                <PollCard
                  key={poll.id}
                  poll={poll}
                  selfMemberId={activeTeam.membershipId}
                  isAdmin={isAdmin}
                  onVote={(optionIndex) => votePoll(poll.id, optionIndex)}
                  onDelete={() => confirm('투표 삭제', '이 투표를 삭제하시겠어요?', () => deletePoll(poll.id))}
                />
              ))
            )}
          </View>
        </View>
      </ScrollView>

      <AnnouncementFormModal
        visible={formVisible}
        editing={editingAnnouncement}
        onClose={() => setFormVisible(false)}
        onSubmit={(input) => {
          if (editingAnnouncement) updateAnnouncement(editingAnnouncement.id, input);
          else createAnnouncement(input);
          setFormVisible(false);
        }}
      />
      <AnnouncementListModal
        visible={listVisible}
        announcements={announcements}
        isAdmin={isAdmin}
        onClose={() => setListVisible(false)}
        onSelect={(a) => {
          setListVisible(false);
          setSelectedAnnouncement(a);
        }}
        onCreate={() => {
          setListVisible(false);
          setEditingAnnouncement(null);
          setFormVisible(true);
        }}
      />
      <AnnouncementDetailModal
        announcement={selectedAnnouncement}
        isAdmin={isAdmin}
        onClose={() => setSelectedAnnouncement(null)}
        onEdit={(a) => {
          setSelectedAnnouncement(null);
          setEditingAnnouncement(a);
          setFormVisible(true);
        }}
        onDelete={(a) =>
          confirm('공지 삭제', '이 공지를 삭제하시겠어요?', () => {
            deleteAnnouncement(a.id);
            setSelectedAnnouncement(null);
          })
        }
      />
      <MemberListModal
        visible={memberListVisible}
        members={members}
        selfMemberId={activeTeam.membershipId}
        isAdmin={isAdmin}
        onClose={() => setMemberListVisible(false)}
        onChangeSkillTag={updateMemberSkillTag}
        onPromote={promoteToAdmin}
        onRemove={removeMember}
      />
      <PollFormModal
        visible={pollFormVisible}
        onClose={() => setPollFormVisible(false)}
        onSubmit={(input) => {
          createPoll(input);
          setPollFormVisible(false);
        }}
      />
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 110 },
  pressed: { opacity: 0.85 },

  banner: {
    marginHorizontal: 20,
    marginTop: 60,
    borderRadius: radius.hero,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#24352B',
  },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20 },
  emblem: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(7,16,13,0.55)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.28)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emblemInitials: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: -0.5 },
  emblemHint: { color: 'rgba(255,255,255,0.5)', fontSize: 8, fontWeight: '800' },
  emblemEdit: {
    position: 'absolute',
    right: -5,
    bottom: -5,
    width: 23,
    height: 23,
    borderRadius: 12,
    backgroundColor: colors.green,
    borderWidth: 2,
    borderColor: '#12211A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerBody: { flex: 1, gap: 6 },
  teamName: { color: '#FFFFFF', fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
  bannerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  roleBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  roleBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  bannerMeta: { color: 'rgba(255,255,255,0.7)', fontSize: 11.5, fontWeight: '600' },

  content: { padding: 20, gap: 14 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },

  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.greenTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { color: colors.text, fontSize: 13.5, fontWeight: '800' },
  rowSub: { color: colors.textMuted, fontSize: 11.5, fontWeight: '500' },

  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  inviteCode: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: 3,
    fontVariant: ['tabular-nums'],
  },
  inviteButtons: { flexDirection: 'row', gap: 8 },
  smallBtn: {
    height: 38,
    paddingHorizontal: 15,
    borderRadius: 12,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnText: { color: colors.bgRoot, fontSize: 12.5, fontWeight: '800' },
  smallBtnGhost: {
    height: 38,
    paddingHorizontal: 15,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: '#26332D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnGhostText: { color: colors.textStrong, fontSize: 12.5, fontWeight: '800' },
  hint: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sectionTitle: { color: colors.text, fontSize: 14.5, fontWeight: '800' },
  sectionLink: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  empty: { color: colors.textFaint, fontSize: 12, fontWeight: '600' },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#8FA69C', fontSize: 11, fontWeight: '800' },
  memberName: { color: colors.textStrong, fontSize: 13, fontWeight: '700' },
  memberMeta: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  memberRole: { color: colors.textFaint, fontSize: 10.5, fontWeight: '800' },
  adminBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#6B5426',
  },
  adminBadgeText: { color: colors.gold, fontSize: 10.5, fontWeight: '800' },

  noticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  pinBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: 'rgba(74,222,128,0.14)',
    marginTop: 1,
  },
  pinBadgeText: { color: colors.green, fontSize: 9.5, fontWeight: '800' },
  noticeTitle: { color: colors.textStrong, fontSize: 13, fontWeight: '700' },
  noticeBody: { color: colors.textDim, fontSize: 11.5, fontWeight: '500' },
});
