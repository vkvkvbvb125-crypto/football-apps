import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PollWithResponses } from '../services/pollsService';

interface PollCardProps {
  poll: PollWithResponses;
  selfMemberId: string;
  isAdmin: boolean;
  onVote: (optionIndex: number) => void;
  onDelete: () => void;
}

export function PollCard({ poll, selfMemberId, isAdmin, onVote, onDelete }: PollCardProps) {
  const myResponse = poll.responses.find((r) => r.team_member_id === selfMemberId);
  const totalVotes = poll.responses.length;
  const deadlinePassed = poll.deadline ? new Date(poll.deadline) < new Date() : false;

  const deadlineLabel = poll.deadline
    ? new Date(poll.deadline).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.question}>{poll.question}</Text>
        {isAdmin && (
          <Pressable onPress={onDelete} hitSlop={8}>
            <Ionicons name="trash-outline" size={16} color="#8A9490" />
          </Pressable>
        )}
      </View>

      <View style={styles.options}>
        {poll.options.map((option, index) => {
          const count = poll.responses.filter((r) => r.option_index === index).length;
          const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const isMine = myResponse?.option_index === index;

          return (
            <Pressable
              key={index}
              disabled={deadlinePassed}
              style={({ pressed }) => [styles.option, isMine && styles.optionSelected, pressed && styles.pressedOpacity]}
              onPress={() => onVote(index)}
            >
              <View style={[styles.optionFill, { width: `${percent}%` }]} />
              <Text style={[styles.optionText, isMine && styles.optionTextSelected]} numberOfLines={1}>
                {option}
              </Text>
              <Text style={[styles.optionCount, isMine && styles.optionTextSelected]}>
                {count}표 ({percent}%)
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.footer}>
        {totalVotes}명 참여{deadlineLabel ? ` · 마감 ${deadlineLabel}${deadlinePassed ? ' (종료)' : ''}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#141A17',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#22302A',
    gap: 10,
  },
  pressedOpacity: {
    opacity: 0.7,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  question: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  options: {
    gap: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#22302A',
    backgroundColor: '#0F1512',
    paddingHorizontal: 12,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  optionSelected: {
    borderColor: '#2D5F3E',
  },
  optionFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: 'rgba(45,95,62,0.25)',
  },
  optionText: {
    flex: 1,
    color: '#E7ECE9',
    fontSize: 13,
    fontWeight: '600',
  },
  optionTextSelected: {
    color: '#2D5F3E',
  },
  optionCount: {
    color: '#8A9490',
    fontSize: 12,
  },
  footer: {
    color: '#5A625E',
    fontSize: 11,
  },
});
