// NavScreen.tsx

import React, { useState, useRef, useEffect } from 'react';
import { Ionicons } from "@expo/vector-icons";
import {
  View,
  Text,
  TouchableOpacity,
  Button,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Image,
  Modal,
  FlatList,
  SafeAreaView,
  Alert,
} from 'react-native';
import {
  CameraView,
  CameraType,
  useCameraPermissions,
} from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as mime from 'mime';
import { useVideoPlayer, VideoView } from 'expo-video';

const API_BASE = 'https://7fa2593c8858.ngrok.app';

interface PhotoUpload {
  id: number;
  user_id: number;
  file_path: string;
  created_at: string;
}

export default function NavScreen() {
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recordIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [loggedInUserId, setLoggedInUserId] = useState<number | null>(null);
  const [lastLocalUri, setLastLocalUri] = useState<string | null>(null);
  const [lastServerUrl, setLastServerUrl] = useState<string | null>(null);

  const [libraryVisible, setLibraryVisible] = useState(false);
  const [userPhotos, setUserPhotos] = useState<PhotoUpload[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);

  // Ny state för att hålla reda på vilken bild som är vald för helskärmsvy
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoUpload | null>(null);

  const cameraRef = useRef<CameraView>(null);
  
  const player = useVideoPlayer(
    { uri: lastLocalUri || '' },
    (playerInstance) => {
      if (lastLocalUri) {
        playerInstance.loop = true;
        playerInstance.play();
      }
    }
  );

  // Starta/Nollställ timern när isRecording ändras
  useEffect(() => {
    if (isRecording) {
      setRecordSeconds(0);
      recordIntervalRef.current = setInterval(() => {
        setRecordSeconds(sec => sec + 1);
      }, 1000);
    } else {
      if (recordIntervalRef.current) {
        clearInterval(recordIntervalRef.current);
        recordIntervalRef.current = null;
      }
      setRecordSeconds(0);
    }
    return () => {
      if (recordIntervalRef.current) {
        clearInterval(recordIntervalRef.current);
        recordIntervalRef.current = null;
      }
    };
  }, [isRecording]);

  // Formatera sekunder till mm:ss
  function formatTimer(sec: number) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  useEffect(() => {
    if (lastLocalUri) {
      console.log('📝 lastLocalUri uppdaterad:', lastLocalUri);
    }
  }, [lastLocalUri]);

  // ─═══ Hämta userId ur AsyncStorage vid mount ═════════════════════
  useEffect(() => {
    (async () => {
      try {
        const jsonString = await AsyncStorage.getItem('user');
        if (jsonString) {
          const userObj = JSON.parse(jsonString) as { id: number };
          setLoggedInUserId(userObj.id);
          console.log('✅ Inloggad userId:', userObj.id);
        } else {
          console.warn('Ingen “user” hittad i AsyncStorage');
        }
      } catch (e) {
        console.error('Kunde inte läsa AsyncStorage["user"]:', e);
      }
    })();
  }, []);

  // ─═══ När vi får userId, hämta senast tagna bilden från backend ─════
  useEffect(() => {
    if (loggedInUserId !== null) {
      loadLatestPhotoFromServer();
    }
  }, [loggedInUserId]);

  // ─═══ Hämta alla bilder och sätt senaste i preview ─═══════════════════
  async function loadLatestPhotoFromServer() {
    if (loggedInUserId === null) return;
    try {
      setIsLoadingLibrary(true);
      let listUrl = `${API_BASE}/photo_uploads/?user_id=${loggedInUserId}`;
      if (Platform.OS === 'android' && listUrl.includes('localhost')) {
        listUrl = listUrl.replace('localhost', '10.0.2.2');
      }
      console.log("🚀 Hämtar library från:", listUrl);

      const response = await fetch(listUrl, { method: 'GET', headers: { Accept: 'application/json' } });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Server returned ${response.status}: ${err}`);
      }
      const photos: PhotoUpload[] = await response.json();
      setUserPhotos(photos);

      if (photos.length > 0) {
        const newest = photos.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];
        const imageUrl = urlFromFilePath(newest.file_path);
        setLastServerUrl(imageUrl);
      } else {
        setLastServerUrl(null);
      }
    } catch (e) {
      console.error("❌ Error fetching latest photo:", e);
    } finally {
      setIsLoadingLibrary(false);
    }
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#666" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>
          Vi behöver din tillåtelse för att använda kameran
        </Text>
        <Button onPress={requestPermission} title="Ge tillåtelse" />
      </View>
    );
  }

  const toggleCameraFacing = () => {
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
  };

  // ─═══ Upload‐funktion mot /photo_upload/ ════════════════════════════
  async function uploadFileToServer(localUri: string, userId: number) {
    try {
      const info = await FileSystem.getInfoAsync(localUri);
      if (!info.exists) {
        throw new Error('Fil finns inte: ' + localUri);
      }

      const fileExt = localUri.split('.').pop() || '';
      const mimeType = mime.getType(fileExt) || 'application/octet-stream';

      const formData = new FormData();
      formData.append('file', {
        uri: localUri,
        name: `upload.${fileExt}`,
        type: mimeType,
      } as any);

      let uploadUrl = `${API_BASE}/photo_upload/?user_id=${userId}`;
      if (Platform.OS === 'android' && uploadUrl.includes('localhost')) {
        uploadUrl = uploadUrl.replace('localhost', '10.0.2.2');
      }

      console.log('🚀 Laddar upp mot URL:', uploadUrl);

      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData,
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Server returned ${response.status}: ${err}`);
      }

      const json: PhotoUpload = await response.json();
      console.log('✅ Upload success:', json);

      const parts = json.file_path.split("/uploads/");
      const relPath = parts.length > 1 ? parts[1] : "";
      const imageUrl = `${API_BASE}/uploads/${relPath}`;
      console.log("🌐 Bild‐URL:", imageUrl);

      return imageUrl;
    } catch (e) {
      console.error('❌ Upload failed:', e);
      throw e;
    }
  }

  // ─═══ Ta bild, spara lokalt och ladda upp ════════════════════════════
  async function takePicture() {
    if (cameraRef.current && mode === 'photo') {
      if (loggedInUserId === null) {
        console.warn('Ingen användar‐ID laddad, avbryter upload.');
        return;
      }
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.7,
          skipProcessing: true,
        });
        console.log('📷 Photo URI (cache):', photo.uri);

        const photosDir = FileSystem.documentDirectory + 'photos';
        const dirInfo = await FileSystem.getInfoAsync(photosDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(photosDir, { intermediates: true });
        }

        const timestamp = Date.now();
        const newFilename = `${photosDir}/${timestamp}.jpg`;
        await FileSystem.moveAsync({ from: photo.uri, to: newFilename });
        console.log('✅ Photo saved locally to:', newFilename);
        setLastLocalUri(newFilename);

        const serverImageUrl = await uploadFileToServer(newFilename, loggedInUserId);
        setLastServerUrl(serverImageUrl);
      } catch (e) {
        console.error('Error taking, saving eller uploading picture:', e);
      }
    }
  }

  // ─═══ Videodel ════════════════════════════════════════
  async function startRecording() {
    if (cameraRef.current && mode === 'video' && !isRecording) {
      try {
        setIsRecording(true);
        console.log('🎥 Started recording...');
        const video = await cameraRef.current.recordAsync({
          maxDuration: 60,
          maxFileSize: 20_000_000,
        });
        console.log('🎥 Stopped recording – URI:', video.uri);
        setLastLocalUri(video.uri);
      } catch (e) {
        console.error('Error starting recording:', e);
        setIsRecording(false);
      }
    }
  }

  async function stopRecording() {
    if (cameraRef.current && mode === 'video' && isRecording) {
      try {
        cameraRef.current.stopRecording();
        console.log('🛑 Stopped recording');
      } catch (e) {
        console.error('Error stopping recording:', e);
      } finally {
        setIsRecording(false);
      }
    }
  }

  const handleMainAction = () => {
    if (mode === 'photo') {
      takePicture();
    } else {
      isRecording ? stopRecording() : startRecording();
    }
  };

  // ─═══ Hämta alla bilder för användaren (när man öppnar biblioteket) ═════
  async function fetchUserLibrary() {
    if (loggedInUserId === null) {
      console.warn("Ingen userId – kan inte hämta bibliotek.");
      return;
    }
    try {
      setIsLoadingLibrary(true);
      let listUrl = `${API_BASE}/photo_uploads/?user_id=${loggedInUserId}`;
      if (Platform.OS === 'android' && listUrl.includes('localhost')) {
        listUrl = listUrl.replace('localhost', '10.0.2.2');
      }
      console.log("🚀 Hämtar library från:", listUrl);

      const response = await fetch(listUrl, { method: 'GET', headers: { Accept: 'application/json' } });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Server returned ${response.status}: ${err}`);
      }
      const json: PhotoUpload[] = await response.json();
      console.log("✅ Library fetched:", json);

      setUserPhotos(json);
    } catch (e) {
      console.error("❌ Error fetching library:", e);
    } finally {
      setIsLoadingLibrary(false);
    }
  }

  // ─═══ Öppna/visa bibliotek i en Modal ════════════════════════════
  function openLibrary() {
    setLibraryVisible(true);
    fetchUserLibrary();
  }
  function closeLibrary() {
    setLibraryVisible(false);
    setUserPhotos([]); // rensa array om du vill
  }

  // ─═══ Bygg HTTP-URL för bild utifrån file_path ══════════════════════
  function urlFromFilePath(file_path: string) {
    const parts = file_path.split("/uploads/");
    const relPath = parts.length > 1 ? parts[1] : "";
    return `${API_BASE}/uploads/${relPath}`;
  }

  // ─═══ Radera bild: DELETE‐anrop och uppdatera preview ═══════════════
  async function deletePhoto(photo: PhotoUpload) {
    Alert.alert(
      "Ta bort bild",
      "Är du säker på att du vill ta bort den här bilden?",
      [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Ta bort",
          style: "destructive",
          onPress: async () => {
            try {
              const deleteUrl = `${API_BASE}/photo_upload/${photo.id}`;
              console.log("🚀 DELETE URL:", deleteUrl);
              const response = await fetch(deleteUrl, { method: "DELETE" });
              if (response.status === 204) {
                // Ta bort från listan
                setUserPhotos(prev => prev.filter(p => p.id !== photo.id));
                // Om bilden vi previewade var den här, ladda om senaste
                if (urlFromFilePath(photo.file_path) === lastServerUrl) {
                  await loadLatestPhotoFromServer();
                }
                // Stäng fullskärmsvyn om den var öppen
                if (selectedPhoto && selectedPhoto.id === photo.id) {
                  setSelectedPhoto(null);
                }
              } else {
                const errText = await response.text();
                throw new Error(`Server returned ${response.status}: ${errText}`);
              }
            } catch (e) {
              console.error("❌ Error deleting photo:", e);
              Alert.alert("Fel", "Kunde inte ta bort bilden.");
            }
          },
        },
      ],
      { cancelable: true }
    );
  }

  return (
    <View style={styles.container}>
      {/* 1) Synlig CameraView för “live preview” */}
      <CameraView
        style={styles.camera}
        ref={cameraRef}
        facing={facing}
        mode={mode === 'video' ? 'video' : 'picture'}
        videoQuality="720p"
      />

      {/* 2) Enkla knappar för att byta mellan Photo/Video och flippa kameran */}
      <View style={styles.topButtons}>
        <TouchableOpacity onPress={() => setFacing(f => (f === 'back' ? 'front' : 'back'))}>
          <Text style={styles.buttonText}>Flip</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMode('photo')}>
          <Text style={[styles.buttonText, mode === 'photo' && styles.active]}>Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMode('video')}>
          <Text style={[styles.buttonText, mode === 'video' && styles.active]}>Video</Text>
        </TouchableOpacity>
      </View>

      {/* 3) Inspelnings‐timer (visas bara när isRecording = true) */}
      {isRecording && (
        <View style={styles.recordTimerContainer}>
          <Ionicons name="ellipse" size={14} color="red" style={{ marginRight: 4 }} />
          <Text style={styles.recordTimerText}>{formatTimer(recordSeconds)}</Text>
        </View>
      )}

      {/* ─── 4) Nederst: Ta bild / Spela in video ──────────────── */}
      <View style={styles.bottomControls}>
        <TouchableOpacity
          style={[
            styles.mainActionButton,
            mode === 'video' && isRecording && styles.mainActionButtonRecording,
          ]}
          onPress={handleMainAction}
        >
          {mode === "photo" ? (
            <Ionicons name="camera" size={44} color="#fff" />
          ) : isRecording ? (
            <Ionicons name="stop-circle" size={44} color="#fff" />
          ) : (
            <Ionicons name="videocam" size={44} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {/* ─── 5) Förhandsvisning av senaste server‐bild ──────────── */}
      {lastServerUrl ? (
        <TouchableOpacity style={styles.previewContainer} onPress={openLibrary}>
          <Image source={{ uri: lastServerUrl }} style={styles.previewImage} resizeMode="cover" />
        </TouchableOpacity>
      ) : (
        <View style={styles.previewContainer}>
          <View style={[styles.previewImage, { justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ color: '#888' }}>Inga bilder</Text>
          </View>
        </View>
      )}

      {/* ─── 6) Förhandsvisning av senaste inspelade video + radera‐knapp ─────────── */}
      {lastLocalUri && mode === 'video' && (
        <View style={styles.videoPreviewContainer}>
          <Text style={styles.videoPreviewLabel}>Senaste video</Text>
          <VideoView player={player} style={styles.videoPreview} />
          <TouchableOpacity
            style={styles.videoDeleteButton}
            onPress={async () => {
              // Frivilligt: radera filen från filsystemet
              // await FileSystem.deleteAsync(lastLocalUri);

              setLastLocalUri(null);
            }}
          >
            <Ionicons name="trash" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* ─── 7) Modal: Visa listan av bilder ────────────────────── */}
      <Modal visible={libraryVisible} animationType="slide" onRequestClose={closeLibrary} transparent={false}>
        <SafeAreaView style={styles.modalContainer}>
          <Text style={styles.modalTitle}>Your Photo Library</Text>
          {isLoadingLibrary ? (
            <ActivityIndicator size="large" color="#000" style={{ marginTop: 20 }} />
          ) : (
            <FlatList
              data={userPhotos}
              keyExtractor={(item) => item.id.toString()}
              numColumns={3}
              showsVerticalScrollIndicator={true}
              contentContainerStyle={styles.flatListContainer}
              renderItem={({ item }) => {
                const imageUrl = urlFromFilePath(item.file_path);
                return (
                  <TouchableOpacity
                    style={styles.thumbnailContainer}
                    onPress={() => {
                      setSelectedPhoto(item);
                      closeLibrary();
                    }}
                  >
                    <Image source={{ uri: imageUrl }} style={styles.thumbnailImage} resizeMode="cover" />
                  </TouchableOpacity>
                );
              }}
            />
          )}
          <TouchableOpacity style={styles.closeButton} onPress={closeLibrary}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>

      {/* ─── 8) Modal: Fullskärmsvy för vald bild ─────────────────── */}
      {selectedPhoto && (
        <Modal visible animationType="fade" onRequestClose={() => setSelectedPhoto(null)} transparent>
          <View style={styles.fullscreenOverlay}>
            <Image
              source={{ uri: urlFromFilePath(selectedPhoto.file_path) }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
            <TouchableOpacity style={styles.fullCloseButton} onPress={() => setSelectedPhoto(null)}>
              <Ionicons name="close-circle" size={40} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteButton} onPress={() => deletePhoto(selectedPhoto)}>
              <Ionicons name="trash" size={36} color="#ff4444" />
            </TouchableOpacity>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: '#000' },
  message: {
    textAlign: 'center',
    paddingBottom: 10,
    color: '#333',
  },
  camera: { ...StyleSheet.absoluteFillObject },

  // ─── Top Buttons (Flip, Photo, Video) ─────────────
  topButtons: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center',
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 6,
    padding: 8,
  },
  buttonText: { color: '#fff', marginHorizontal: 8, fontSize: 16 },
  active: { fontWeight: 'bold', textDecorationLine: 'underline' },

  // ─── Inspelnings‐Timer (visas endast när isRecording) ─────────────
  recordTimerContainer: {
    position: 'absolute',
    top: 95,       // under topButtons
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  recordTimerText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },

  // ─── Bottom Controls (Ta foto / Spela in video) ─────────────
  bottomControls: {
    position: 'absolute',
    bottom: 30,
    width: '100%',
    alignItems: 'center',
  },
  mainActionButton: {
    backgroundColor: 'transparent',
    padding: 12,
    borderRadius: 50,
  },
  mainActionButtonRecording: {
    backgroundColor: '#e33',
  },

  // ─── Thumbnail för senaste server‐bild ─────────────
  previewContainer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    padding: 4,
    backgroundColor: 'transparent',
  },
  previewImage: {
    width: 80,
    height: 120,
    borderRadius: 4,
  },

  // ─── Modal och FlatList‐stilar ───────────────────────────────
  modalContainer: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  flatListContainer: {
    paddingBottom: 100,
  },
  thumbnailContainer: {
    flex: 1 / 3,
    aspectRatio: 0.75,
    margin: 4,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#ddd',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  closeButton: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    backgroundColor: '#333',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  closeButtonText: { color: '#fff', fontSize: 16 },

  // ─── Fullskärmsvy för vald bild ─────────────────────────────────
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: '100%',
    height: '100%',
  },
  fullCloseButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    backgroundColor: 'transparent',
  },
  deleteButton: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'transparent',
  },

  // ─── Videopreview + radera‐knapp ─────────────────────────────────
  videoPreviewContainer: {
    position: 'absolute',
    bottom: 20,
    right: 0,
    width: 150,
    height: 200,
    backgroundColor: 'transparent',
    borderRadius: 6,
    padding: 4,
  },
  videoPreviewLabel: {
    color: '#fff',
    marginBottom: 4,
    textAlign: 'center',
  },
  videoPreview: {
    width: '100%',
    height: '85%',
  },
  videoDeleteButton: {
    position: 'absolute',
    top: -5,
    left: -5,
    backgroundColor: 'transparent',
    borderRadius: 20,
    padding: 2,
  },
});
