import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Share, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { FieldBackground } from '../../../components/FieldBackground';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { PlaceSearchModal } from '../../attendance/components/PlaceSearchModal';
import type { PlaceResult } from '../../attendance/services/placeService';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

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

  const handleOpenEdit = (a: AnnouncementRow) => {
    setSelectedAnnouncement(null);
    setEditingAnnouncement(a);
    setFormVisible(true);
  };

  const handleDeleteAnnouncement = (a: AnnouncementRow) => {
    const message = '이 공지를 삭제하시겠어요?';
    if (Platform.OS === 'web') {
      if (window.confirm(message)) {
        deleteAnnouncement(a.id);
        setSelectedAnnouncement(null);
      }
      return;
    }
    Alert.alert('공지 삭제', message, [
      { text: '아니오', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          deleteAnnouncement(a.id);
          setSelectedAnnouncement(null);
        },
      },
    ]);
  };

  useEffect(() => {
    if (activeTeam) loadAnnouncements();
  }, [activeTeam?.team.id]);

  useEffect(() => {
    if (activeTeam) loadMembers();
  }, [activeTeam?.team.id]);

  if (!activeTeam) return null;

  const isAdmin = activeTeam.role === 'admin';
  const inviteUrl = `${SUPABASE_URL}/functions/v1/invite-redirect?code=${activeTeam.team.invite_code}`;

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

  return (
    <ScreenGradient>
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.banner}>
        <FieldBackground />
        <View style={styles.bannerContent}>
          <View style={styles.bannerLeft}>
            <Text style={styles.teamName} numberOfLines={1}>
              {activeTeam.team.name}
            </Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{isAdmin ? '총무' : '일반 멤버'}</Text>
            </View>
          </View>
          <Pressable onPress={signOut} hitSlop={8}>
            <Text style={styles.signOutText}>로그아웃</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.content}>
        {isAdmin && (
          <View style={styles.inviteCard}>
            <View>
              <Text style={styles.inviteLabel}>초대 코드</Text>
              <Text style={styles.inviteCode}>{activeTeam.team.invite_code}</Text>
            </View>
            <View style={styles.inviteButtons}>
              <Pressable
                style={({ pressed }) => [styles.copyButton, pressed && styles.pressedOpacity]}
                onPress={handleCopyInviteCode}
              >
                <Text style={styles.copyButtonText}>{copied ? '복사됨' : '복사'}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.shareButton, pressed && styles.pressedOpacity]}
                onPress={handleShareInvite}
              >
                <Text style={styles.shareButtonText}>공유</Text>
              </Pressable>
            </View>
          </View>
        )}

        {isAdmin && (
          <View style={styles.homeLocationCard}>
            <Text style={styles.homeLocationLabel}>팀 대표 지역</Text>
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
            <Text style={styles.homeLocationHint}>경기 없는 날의 예상 날씨를 이 위치 기준으로 보여줘요</Text>
          </View>
        )}

        <View style={styles.memberSection}>
          <Text style={styles.memberTitle}>멤버 {members.length}명</Text>
          <Pressable onPress={() => setMemberListVisible(true)}>
            <Text style={styles.announceSeeAll}>전체보기</Text>
          </Pressable>
        </View>

        <View style={styles.announceSection}>
          <View style={styles.announceHeader}>
            <Text style={styles.announceTitle}>공지사항</Text>
            <View style={styles.announceHeaderRight}>
              {isAdmin && (
                <Pressable
                  onPress={() => {
                    setEditingAnnouncement(null);
                    setFormVisible(true);
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="add-circle-outline" size={20} color="#39D98A" />
                </Pressable>
              )}
              <Pressable onPress={() => setListVisible(true)}>
                <Text style={styles.announceSeeAll}>전체보기</Text>
              </Pressable>
            </View>
          </View>
          {announcements.length === 0 ? (
            <Text style={styles.announceEmpty}>등록된 공지가 없어요</Text>
          ) : (
            announcements.slice(0, 3).map((a) => (
              <Pressable key={a.id} style={styles.announceItem} onPress={() => setSelectedAnnouncement(a)}>
                {a.is_pinned && <Ionicons name="pin" size={12} color="#39D98A" style={styles.announcePinIcon} />}
                <View style={styles.announceItemText}>
                  <Text style={styles.announceItemTitle} numberOfLines={1}>
                    {a.title}
                  </Text>
                  <Text style={styles.announceItemBody} numberOfLines={1}>
                    {a.body}
                  </Text>
                </View>
              </Pressable>
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
        if (editingAnnouncement) {
          updateAnnouncement(editingAnnouncement.id, input);
        } else {
          createAnnouncement(input);
        }
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
      onEdit={handleOpenEdit}
      onDelete={handleDeleteAnnouncement}
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
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pressedOpacity: {
    opacity: 0.7,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  banner: {
    height: 176,
    paddingTop: 56,
    overflow: 'hidden',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  bannerContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
  },
  bannerLeft: {
    flexShrink: 1,
    marginRight: 12,
  },
  teamName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  roleBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  signOutText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '600',
  },
  content: {
    padding: 20,
  },
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#141A17',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#22302A',
  },
  inviteLabel: {
    fontSize: 12,
    color: '#8A9490',
  },
  inviteCode: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#FFFFFF',
  },
  inviteButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  copyButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#39D98A',
  },
  copyButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  shareButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1B231F',
    borderWidth: 1,
    borderColor: '#22302A',
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  homeLocationCard: {
    marginTop: 12,
    backgroundColor: '#141A17',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#22302A',
    gap: 10,
  },
  homeLocationLabel: {
    fontSize: 12,
    color: '#8A9490',
  },
  homeLocationHint: {
    fontSize: 11,
    color: '#5A625E',
  },
  memberSection: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#141A17',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#22302A',
  },
  memberTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  announceSection: {
    marginTop: 12,
    backgroundColor: '#141A17',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#22302A',
    gap: 10,
  },
  announceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  announceHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  announceSeeAll: {
    color: '#8A9490',
    fontSize: 12,
    fontWeight: '600',
  },
  announceTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  announceEmpty: {
    color: '#5A625E',
    fontSize: 12,
  },
  announceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  announcePinIcon: {
    marginTop: 2,
  },
  announceItemText: {
    flex: 1,
  },
  announceItemTitle: {
    color: '#E7ECE9',
    fontSize: 13,
    fontWeight: '700',
  },
  announceItemBody: {
    marginTop: 2,
    color: '#8A9490',
    fontSize: 12,
  },
});
