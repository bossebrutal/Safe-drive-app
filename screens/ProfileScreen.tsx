// ProfileScreen.tsx

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Ionicons } from "@expo/vector-icons";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  Platform,
  FlatList,
  Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = 'https://7fa2593c8858.ngrok.app';
const GREEN = '#8DA46D';
const DARK = '#123524';
const GREY = '#777';
const DARK_BLUE = '#2f4f4f';
const WHITE_C = '#fff';
const BLACK_C = '#111';

type User = {
  id: number;
  firstname: string;
  lastname: string;
  avatarUrl: string;
  email: string;
  points: number;
  current_car_id?: number;
};

type Car = {
  id: number;
  name: string;
};

type UserReward = {
  id: number;
  claimed_at: string;
  reward: {
    id: number;
    title: string;
    description?: string;
    cost_points: number;
  };
};

type PhotoUpload = {
  id: number;
  user_id: number;
  file_path: string;
  created_at: string;
};

// Enkel egen dropdown
function MiniPicker({
  items,
  selected,
  onSelect,
}: {
  items: { label: string; value: number }[];
  selected: number | '';
  onSelect: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = items.find(i => i.value === selected)?.label || 'Select a car…';

  return (
    <View style={{ width: '100%' }}>
      <TouchableOpacity
        style={styles.miniPickerButton}
        onPress={() => setOpen(o => !o)}
      >
        <Text style={styles.miniPickerText}>{label}</Text>
      </TouchableOpacity>
      {open && (
        <View style={styles.miniPickerList}>
          {items.map(item => (
            <TouchableOpacity
              key={item.value}
              style={styles.miniPickerItem}
              onPress={() => {
                onSelect(item.value);
                setOpen(false);
              }}
            >
              <Text style={styles.miniPickerText}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

export default function ProfileScreen({ navigation }: { navigation: any }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [cars, setCars] = useState<Car[]>([]);
  const [rewards, setRewards] = useState<UserReward[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);
  const [form, setForm] = useState({
    firstname: '',
    lastname: '',
    email: '',
    current_car_id: '' as number | '',
  });

  // ===== Avatar states =====
  const [tempAvatarUri, setTempAvatarUri] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showLibraryView, setShowLibraryView] = useState(false);
  const [avatarLibrary, setAvatarLibrary] = useState<PhotoUpload[]>([]);
  const [isLoadingAvatarLibrary, setIsLoadingAvatarLibrary] = useState(false);

  // ─═══ Steg 1: Läs in profildata ┐ ════════════════════════════
  const loadProfile = useCallback(async () => {
    setLoading(true);
    let storedUserJson: string | null = null;
    try {
      storedUserJson = await AsyncStorage.getItem('user');
    } catch (e) {
      console.warn('Could not read AsyncStorage user:', e);
      setLoading(false);
      return;
    }
    if (!storedUserJson) {
      setLoading(false);
      return;
    }
    let me: User;
    try {
      me = JSON.parse(storedUserJson) as User;
    } catch {
      console.warn('Could not parse stored user JSON');
      setLoading(false);
      return;
    }

    try {
      // Hämta full user‐post (inkl. avatar_url) från backend
      const uRes = await fetch(`${API_BASE}/users/${me.id}`);
      if (!uRes.ok) throw new Error('Failed to fetch user');
      const fullRaw = (await uRes.json()) as any;

      // Om avatar_url finns, prependa API_BASE
      const fullUser: User = {
        id: fullRaw.id,
        firstname: fullRaw.firstname,
        lastname: fullRaw.lastname,
        email: fullRaw.email,
        points: fullRaw.points,
        current_car_id: fullRaw.current_car_id,
        avatarUrl: fullRaw.avatar_url ? `${API_BASE}${fullRaw.avatar_url}` : '',
      };
      setUser(fullUser);
      setForm({
        firstname: fullUser.firstname,
        lastname: fullUser.lastname,
        email: fullUser.email,
        current_car_id: fullUser.current_car_id ?? '',
      });

      // Hämta användarens bilar
      const cRes = await fetch(`${API_BASE}/users/${me.id}/cars`);
      if (!cRes.ok) throw new Error('Failed to fetch cars');
      const carList = (await cRes.json()) as Car[];
      setCars(carList);

      // Hämta användarens belöningar
      const rRes = await fetch(`${API_BASE}/users/${me.id}/rewards`);
      if (!rRes.ok) throw new Error('Failed to fetch user rewards');
      const purchased = (await rRes.json()) as UserReward[];
      purchased.sort((a, b) =>
        new Date(b.claimed_at).getTime() - new Date(a.claimed_at).getTime()
      );
      setRewards(purchased);

      // Uppdatera AsyncStorage om poängen ändrats
      await AsyncStorage.setItem('user', JSON.stringify(fullUser));
    } catch (err) {
      console.error('Error in loadProfile:', err);
      Alert.alert('Error', 'Could not load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  // ─═══ Steg 2: Spara grundläggande profiländringar ┐ ════════════════
  const handleSave = async () => {
    if (!form.firstname.trim() || !form.lastname.trim() || !form.email.trim()) {
      Alert.alert('Validation', 'Firstname, lastname & email are required.');
      return;
    }
    if (!user) {
      Alert.alert('Error', 'No user loaded.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstname: form.firstname.trim(),
          lastname: form.lastname.trim(),
          email: form.email.trim(),
          current_car_id: form.current_car_id === '' ? null : form.current_car_id,
        }),
      });
      if (!res.ok) throw new Error(res.statusText);
      const updatedRaw = (await res.json()) as any;

      const updatedUser: User = {
        id: updatedRaw.id,
        firstname: updatedRaw.firstname,
        lastname: updatedRaw.lastname,
        email: updatedRaw.email,
        points: updatedRaw.points,
        current_car_id: updatedRaw.current_car_id,
        avatarUrl: user.avatarUrl, // behåll den befintliga avatar‐URL:en
      };
      setUser(updatedUser);
      await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
      Alert.alert('Success', 'Profile updated!');
      setModalVisible(false);
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Could not update profile.');
    }
  };

  // ─═══ Hjälpfunktion för att omvandla backend‐file_path till publik URL ┐ ═════
  function urlFromFilePath(file_path: string) {
    const parts = file_path.split('/uploads/');
    const relPath = parts.length > 1 ? parts[1] : '';
    return `${API_BASE}/uploads/${relPath}`;
  }

  // ─═══ Avatar: Hämta library från server ───────
  const fetchAvatarLibrary = async () => {
    if (!user) return;
    setIsLoadingAvatarLibrary(true);
    try {
      let url = `${API_BASE}/photo_uploads/?user_id=${user.id}`;
      if (Platform.OS === 'android' && url.includes('localhost')) {
        url = url.replace('localhost', '10.0.2.2');
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const list = (await res.json()) as PhotoUpload[];
      setAvatarLibrary(list);
    } catch (e) {
      console.error('Error fetching avatar library:', e);
      Alert.alert('Error', 'Could not load avatar images');
    } finally {
      setIsLoadingAvatarLibrary(false);
    }
  };

  // När användaren trycker "My Photos"
  const onPressMyPhotos = () => {
    setShowLibraryView(true);
    fetchAvatarLibrary();
  };

  // När användaren väljer en bild i biblioteket
  const onSelectLibraryPhoto = (chosen: PhotoUpload) => {
    const imageUrl = urlFromFilePath(chosen.file_path);
    setTempAvatarUri(imageUrl);
    setShowLibraryView(false);
  };

  // När användaren vill importera från telefonens galleri
  const onPressImportFromPhone = async () => {
    // Först: begär tillstånd om det behövs
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Tillstånd nekades', 'Du måste ge tillåtelse för att välja bilder.');
      return;
    }

    // Starta Expo‐biblioteket
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
    });

    if (result.canceled) {
      return;
    }
    // I Expo 49+ ligger valet i `result.assets[0].uri`
    const uri = (result as any).assets?.[0]?.uri ?? null; 
    if (!uri) return;

    // Bygg upp formuläret för uppladdning
    const uriParts = uri.split('.');
    const fileType = uriParts[uriParts.length - 1];
    const formData = new FormData();
    formData.append('file', {
      uri,
      name: `photo.${fileType}`,
      type: `image/${fileType}`,
    } as any);

    try {
      const uploadRes = await fetch(`${API_BASE}/photo_upload/?user_id=${user!.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data' },
        body: formData,
      });
      if (!uploadRes.ok) throw new Error(uploadRes.statusText);

      // Hämta om biblioteket och välj sista bilden
      await fetchAvatarLibrary();
      const listAfter = (await fetch(`${API_BASE}/photo_uploads/?user_id=${user!.id}`)).json() as Promise<PhotoUpload[]>;
      const newest = (await listAfter).sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];
      onSelectLibraryPhoto(newest);
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Kunde inte importera foto från telefonen');
    }
  };

  // Bekräfta avatar: POST /users/{id}/avatar
  const confirmAvatar = async () => {
    if (!user || !tempAvatarUri) {
      setAvatarModalVisible(false);
      return;
    }

    try {
      let formData = new FormData();

      if (Platform.OS === 'web') {
        const file = fileInputRef.current!.files?.[0];
        if (!file) {
          Alert.alert('No file', 'Vänligen välj en fil först.');
          return;
        }
        formData.append('avatar', file);
      } else {
        const uri = tempAvatarUri;
        const ext = uri.split('.').pop() || 'jpg';
        formData.append('avatar', {
          uri,
          name: `avatar.${ext}`,
          type: `image/${ext}`,
        } as any);
      }

      const res = await fetch(`${API_BASE}/users/${user.id}/avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data' },
        body: formData,
      });
      if (!res.ok) throw new Error(res.statusText);

      const updatedRaw = (await res.json()) as any;
      const cleanPath = updatedRaw.avatar_url; // ex. "/static/avatars/16.png"
      const fullAvatarUrl = `${API_BASE.replace(/\/$/, '')}${cleanPath}?t=${Date.now()}`;

      const updatedUser: User = {
        ...user,
        avatarUrl: fullAvatarUrl,
      };
      setUser(updatedUser);
      await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
      Alert.alert('Success', 'Avatar updated!');
    } catch (err) {
      console.error('Error updating avatar:', err);
      Alert.alert('Error', 'Could not update avatar.');
    } finally {
      setAvatarModalVisible(false);
      setTempAvatarUri(null);
      setShowLibraryView(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.background}>
        <ActivityIndicator size="large" color={WHITE_C} />
      </View>
    );
  }
  if (!user) {
    return (
      <View style={styles.background}>
        <Text style={styles.loading}>Ingen användare inloggad.</Text>
      </View>
    );
  }

  const fullName = `${user.firstname} ${user.lastname}`;
  const items = cars.map(c => ({ label: c.name, value: c.id }));

  return (
    <SafeAreaView style={styles.background}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {Platform.OS === 'web' && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              const uri = URL.createObjectURL(file);
              setTempAvatarUri(uri);
            }}
          />
        )}
        <Image source={{ uri: user.avatarUrl }} style={styles.avatar} key={user.avatarUrl} />

        {/* Endast Edit Avatar-knapp */}
        <TouchableOpacity
          style={styles.smallButton}
          onPress={() => {
            // Om användaren redan har en avatar, visa den i förhandsvisningen direkt
            setTempAvatarUri(user.avatarUrl || null);
            setShowLibraryView(false);
            setAvatarModalVisible(true);
          }}
        >
          <Text style={styles.smallButtonText}>Edit Avatar</Text>
        </TouchableOpacity>

        <Text style={styles.name}>{fullName}</Text>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email:</Text>
            <Text style={styles.infoValue}>{user.email}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Name:</Text>
            <Text style={styles.infoValue}>{fullName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Points:</Text>
            <Text style={styles.infoValue}>{user.points}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Using car:</Text>
            <Text style={styles.infoValue}>
              {cars.find(c => c.id === user.current_car_id)?.name || '—'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.editButton}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.editButtonText}>Edit Profile</Text>
        </TouchableOpacity>

        {/* ========== Purchased Rewards ========== */}
        {rewards.length > 0 && (
          <>
            <Text style={styles.sectionHeader}>Your Rewards</Text>
            {rewards.map((r: UserReward) => (
              <View key={r.id} style={styles.rewardCard}>
                <Text style={styles.rewardTitle}>{r.reward.title}</Text>
                {r.reward.description && (
                  <Text style={styles.rewardDesc}>{r.reward.description}</Text>
                )}
                <Text style={styles.rewardMeta}>
                  Claimed: {new Date(r.claimed_at).toLocaleDateString()}
                </Text>
                <Text style={styles.rewardCost}>
                  (-{r.reward.cost_points} pts)
                </Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Profile</Text>

            {(['firstname', 'lastname', 'email'] as const).map(field => (
              <TextInput
                key={field}
                placeholder={field}
                value={(form as any)[field]}
                onChangeText={val =>
                  setForm(f => ({ ...f, [field]: val }))
                }
                style={styles.modalInput}
                placeholderTextColor="#666"
              />
            ))}

            <Text style={styles.modalLabel}>Using car:</Text>
            <MiniPicker
              items={items}
              selected={form.current_car_id}
              onSelect={val =>
                setForm(f => ({ ...f, current_car_id: val }))
              }
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonSave}
                onPress={handleSave}
              >
                <Text style={styles.modalButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Avatar Modal */}
      <Modal
        visible={avatarModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setAvatarModalVisible(false);
          setShowLibraryView(false);
          setTempAvatarUri(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Avatar</Text>

            {showLibraryView ? (
              <>
                <Text style={[styles.modalLabel, { marginBottom: 8 }]}>
                  Select from My Photos
                </Text>
                {isLoadingAvatarLibrary ? (
                  <ActivityIndicator size="large" color={BLACK_C} style={{ marginTop: 20 }} />
                ) : (
                  <View style={styles.libraryContainer}>
                    <FlatList
                      data={avatarLibrary}
                      keyExtractor={item => item.id.toString()}
                      numColumns={3}
                      contentContainerStyle={styles.flatListContainer}
                      renderItem={({ item }) => {
                        const imageUrl = urlFromFilePath(item.file_path);
                        return (
                          <TouchableOpacity
                            style={styles.thumbnailContainer}
                            onPress={() => onSelectLibraryPhoto(item)}
                          >
                            <Image
                              source={{ uri: imageUrl }}
                              style={styles.thumbnailImage}
                              resizeMode="cover"
                            />
                          </TouchableOpacity>
                        );
                      }}
                    />
                  </View>
                )}
                <TouchableOpacity
                  style={styles.avatarCancelButton}
                  onPress={() => setShowLibraryView(false)}
                >
                  <Text style={styles.modalButtonText}>Back</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {tempAvatarUri ? (
                  <Image
                    source={{ uri: tempAvatarUri }}
                    style={[styles.avatar, { marginBottom: 20 }]}
                  />
                ) : (
                  <View
                    style={[
                      styles.avatar,
                      {
                        marginBottom: 20,
                        justifyContent: 'center',
                        alignItems: 'center',
                      },
                    ]}
                  >
                    <Text style={{ color: '#888' }}>No image</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.avatarActionButton}
                  onPress={onPressMyPhotos}
                >
                  <Text style={styles.modalButtonText}>My Photos</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.avatarActionButton}
                  onPress={onPressImportFromPhone}
                >
                  <Text style={styles.modalButtonText}>Import from Phone</Text>
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', marginTop: 8 }}>
                  <TouchableOpacity
                    style={[styles.modalButtonCancel, { flex: 1, marginRight: 8 }]}
                    onPress={() => {
                      setAvatarModalVisible(false);
                      setTempAvatarUri(null);
                      setShowLibraryView(false);
                    }}
                  >
                    <Text style={styles.modalButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButtonSave, { flex: 1 }]}
                    onPress={confirmAvatar}
                  >
                    <Text style={styles.modalButtonText}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: DARK },
  scrollContent: {
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  loading: { color: WHITE_C, marginTop: 100, textAlign: 'center' },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: WHITE_C,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  name: {
    fontSize: 22,
    fontWeight: '600',
    color: WHITE_C,
    marginBottom: 20,
  },
  infoCard: {
    width: '100%',
    maxWidth: 300,
    backgroundColor: DARK_BLUE,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderColor: BLACK_C,
    borderWidth: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoLabel: { fontSize: 16, fontWeight: '600', color: BLACK_C },
  infoValue: { fontSize: 16, color: WHITE_C },

  smallButton: {
    marginTop: 8,
    marginBottom: 24,
    backgroundColor: DARK_BLUE,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    borderColor: BLACK_C,
    borderWidth: 1,
  },
  smallButtonText: { color: WHITE_C, fontSize: 14, fontWeight: '500' },

  editButton: {
    backgroundColor: DARK_BLUE,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    marginBottom: 24,
    borderColor: BLACK_C,
    borderWidth: 1,
  },
  editButtonText: {
    color: WHITE_C,
    fontSize: 14,
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
    width: '85%',
    maxHeight: SCREEN_HEIGHT * 0.8,
    backgroundColor: DARK_BLUE,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderColor: BLACK_C,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
    color: WHITE_C,
  },
  modalInput: {
    width: '100%',
    borderWidth: 2,
    borderColor: DARK,
    borderRadius: 6,
    padding: 8,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  modalLabel: {
    color: WHITE_C,
    marginBottom: 4,
    fontWeight: '500',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  modalButtonCancel: {
    backgroundColor: GREY,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    borderColor: BLACK_C,
    borderWidth: 1,
    flex: 1,
  },
  modalButtonSave: {
    backgroundColor: DARK,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    borderColor: BLACK_C,
    borderWidth: 1,
    flex: 1,
  },
  modalButtonText: {
    color: WHITE_C,
    fontSize: 16,
    fontWeight: '500',
  },
  sectionHeader: {
    fontSize: 20,
    fontWeight: '600',
    color: WHITE_C,
    marginBottom: 12,
  },
  rewardCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: DARK_BLUE,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderColor: BLACK_C,
    borderWidth: 1,
  },
  rewardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: WHITE_C,
    marginBottom: 4,
  },
  rewardDesc: {
    fontSize: 14,
    color: '#ddd',
    marginBottom: 6,
  },
  rewardMeta: {
    fontSize: 12,
    color: '#bbb',
  },
  rewardCost: {
    fontSize: 12,
    color: '#f88',
    position: 'absolute',
    top: 12,
    right: 12,
  },

  /* Library-vyn */
  libraryContainer: {
    maxHeight: SCREEN_HEIGHT * 0.5,
    width: '100%',
  },
  flatListContainer: {
    paddingBottom: 20,
    paddingHorizontal: 8,
  },
  thumbnailContainer: {
    flex: 1 / 3,
    aspectRatio: 1,
    margin: 4,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#ddd',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },

  /* Avatar buttons */
  avatarActionButton: {
    backgroundColor: DARK,
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: 'center',
    width: '80%',
    marginBottom: 12,
    borderColor: BLACK_C,
    borderWidth: 1,
  },
  avatarCancelButton: {
    backgroundColor: GREY,
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: 'center',
    width: '80%',
    marginTop: 12,
    borderColor: BLACK_C,
    borderWidth: 1,
  },

  miniPickerButton: {
    backgroundColor: '#fff',
    borderColor: '#123524',
    borderWidth: 2,
    padding: 12,
    borderRadius: 6,
    marginBottom: 4,
  },
  miniPickerText: {
    color: '#333',
  },
  miniPickerList: {
    backgroundColor: '#fff',
    borderColor: '#123524',
    borderWidth: 2,
    borderRadius: 6,
    maxHeight: 200,
    marginBottom: 16,
  },
  miniPickerItem: {
    padding: 12,
    borderBottomColor: '#ccc',
    borderBottomWidth: 1,
  },
});
