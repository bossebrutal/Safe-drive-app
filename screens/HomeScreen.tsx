// screens/HomeScreen.tsx
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

const API_BASE = 'https://7fa2593c8858.ngrok.app';
const GREEN = '#8DA46D';
const DARK = '#123524';
const GREY = '#777';
const DARK_BLUE = '#2f4f4f';
const WHITE_C = '#fff';
const BLACK_C = '#111';

type Reward = {
  id: number;
  title: string;
  description?: string;
  cost_points: number;
};

type User = {
  id: number;
  points: number;
};

type HomeScreenProps = {
  onLogout: () => void;
};

const showMessage = (title: string, msg: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${msg}`);
  } else {
    Alert.alert(title, msg);
  }
};

export default function HomeScreen({ onLogout }: HomeScreenProps) {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loadingRewards, setLoadingRewards] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);

  useFocusEffect(
    useCallback(() => {
      const loadData = async () => {
        // 1) Load stored user from AsyncStorage
        let storedJson: string | null = null;
        try {
          storedJson = await AsyncStorage.getItem('user');
        } catch (e) {
          console.warn('Could not read user from AsyncStorage:', e);
        }
        if (!storedJson) {
          return;
        }

        let parsed: User;
        try {
          parsed = JSON.parse(storedJson) as User;
        } catch {
          console.warn('Failed to parse stored user');
          return;
        }

        // 2) Refresh user from server
        try {
          const resUser = await fetch(`${API_BASE}/users/${parsed.id}`);
          if (!resUser.ok) throw new Error(resUser.statusText);
          const freshUser: User = await resUser.json();
          setUser(freshUser);
          await AsyncStorage.setItem('user', JSON.stringify(freshUser));
        } catch {
          // Fallback to stale data if fetch fails
          setUser(parsed);
        }

        // 3) Fetch rewards
        setLoadingRewards(true);
        try {
          const resRewards = await fetch(`${API_BASE}/rewards`);
          if (!resRewards.ok) throw new Error(resRewards.statusText);
          const rewardList: Reward[] = await resRewards.json();
          setRewards(rewardList);
        } catch {
          showMessage('Error', 'Could not load rewards');
        } finally {
          setLoadingRewards(false);
        }
      };

      loadData();
    }, [])
  );

  const handleClaim = useCallback(
    async (reward: Reward) => {
      if (!user) {
        return showMessage('Fel', 'Ingen användare inloggad');
      }
      if (user.points < reward.cost_points) {
        return showMessage('Fel', 'Inte tillräckligt med poäng');
      }

      try {
        const res = await fetch(`${API_BASE}/user_rewards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id, reward_id: reward.id }),
        });
        if (!res.ok) throw new Error(res.statusText);
        await res.json();

        showMessage('Success', 'Reward claimed!');
        const updated = { ...user, points: user.points - reward.cost_points };
        setUser(updated);
        await AsyncStorage.setItem('user', JSON.stringify(updated));
      } catch (err: any) {
        showMessage('Fel', err.message || 'Kunde inte hämta belöning');
      }
    },
    [user]
  );

  const openConfirm = (reward: Reward) => {
    setSelectedReward(reward);
    setConfirmModalVisible(true);
  };

  const confirmPurchase = () => {
    if (selectedReward) {
      handleClaim(selectedReward);
    }
    setConfirmModalVisible(false);
  };

  const handleLogout = () => {
    const doLogout = async () => {
      try {
        await AsyncStorage.removeItem('user');
      } catch (e) {
        console.warn('Could not remove user from AsyncStorage:', e);
      }
      onLogout();
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to log out?')) {
        doLogout();
      }
    } else {
      Alert.alert(
        'Logout',
        'Are you sure you want to log out?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Yes', onPress: doLogout },
        ]
      );
    }
  };

  return (
    <SafeAreaView style={styles.background}>
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
      >
        <Text style={styles.logoutButtonText}>Logout</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.header}>Available Rewards</Text>

        {loadingRewards ? (
          <Text style={styles.loadingText}>Loading…</Text>
        ) : (
          rewards.map(r => {
            const affordable = user?.points! >= r.cost_points;
            return (
              <View key={r.id} style={styles.card}>
                <Text style={styles.cardTitle}>{r.title}</Text>
                {r.description && (
                  <Text style={styles.cardDesc}>{r.description}</Text>
                )}
                <TouchableOpacity
                  style={[
                    styles.claimButton,
                    affordable
                      ? {}
                      : styles.claimButtonDisabled,
                  ]}
                  onPress={() => affordable && openConfirm(r)}
                  disabled={!affordable}
                >
                  <Text style={styles.claimButtonText}>
                    Claim ({r.cost_points} points)
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Confirmation Modal */}
      <Modal
        visible={confirmModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Are you sure you want to purchase:
            </Text>
            <Text style={styles.modalReward}>
              {selectedReward?.title}{' \n\n'}
              <Text style={{ fontWeight: 'bold' }}>
                for {selectedReward?.cost_points} points?
              </Text>
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                onPress={() => setConfirmModalVisible(false)}
              >
                <Text style={styles.actionText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.buyButton]}
                onPress={confirmPurchase}
              >
                <Text style={styles.actionText}>Buy</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: DARK },
  logoutButton: {
    position: 'absolute',
    top: 50,
    right: 10,
    backgroundColor: DARK_BLUE,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    zIndex: 10,
    borderColor: BLACK_C,
    borderWidth: 1,
  },
  logoutButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  container: {
    padding: 20,
    paddingTop: 80,
    alignItems: 'center',
  },
  header: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },

  loadingText: { color: '#fff', marginTop: 20 },

  card: {
    width: 350,
    backgroundColor: DARK_BLUE,
    borderRadius: 12,
    borderColor: BLACK_C,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: WHITE_C,
    marginBottom: 8,
  },
  cardDesc: { color: WHITE_C, marginBottom: 16 },
  claimButton: {
    backgroundColor: DARK,
    paddingVertical: 10,
    borderRadius: 6,
    borderColor: BLACK_C,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 8,
  },
  claimButtonDisabled: {
    backgroundColor: DARK,
    opacity: 0.5,
  },
  claimButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },

  /* Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: 300,
    backgroundColor: DARK_BLUE,
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 12,
    textAlign: 'center',
  },
  modalReward: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: 'bold',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  cancelButton: { backgroundColor: '#555' },
  buyButton: { backgroundColor: DARK },
  actionText: { color: '#fff', fontWeight: '600' },
});
