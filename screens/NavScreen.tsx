// NavScreen.tsx

import React, { useState, useRef, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  View,
  Text,
  TouchableOpacity,
  ActionSheetIOS,
  Button,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Modal,
  Animated,
  Easing,
  FlatList,
  SafeAreaView,
  ScrollView,
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
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import { format } from 'date-fns';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Buffer } from 'buffer';
import { Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { fetchWithAuth } from '../utils/api';


const API_BASE = 'https://docs.mysafedriveapp.org/docs';
const GREEN = '#8DA46D';
const DARK = '#123524';
const GREY = '#777';
const DARK_BLUE = '#2f4f4f';
const WHITE_C = '#fff';
const BLACK_C = '#111';

// Justera detta värde för att flytta rutan nedåt (+) eller uppåt (-) i bilden
const DEPTH_BOX_OFFSET = 7; // pixlar i depth-arrayen (prova 20, 30, 40...)
const DEPTH_BOX_OFFSET_X = 7;
const DEPTH_BOX_SIZE = 8; 
const DEPTH_AVG_BUFFER_SIZE = 3; // t.ex. 5 senaste värden

interface DrivingSession {
  id: number;
  user_id: number;
  file_path: string;
  start_time: string;
  end_time: string | null;
  total_points: number;
  duration: number; // in seconds
  localUri?: string; // for cached playback
}

export default function NavScreen({props}) {
  // ─── Camera & photo state ───────────────────────────
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recordIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [zoom, setZoom] = useState(0);
  const navigation = useNavigation();

  const [isLandscape, setIsLandscape] = useState(false);
  // ─── User & URIs ────────────────────────────────────
  const [loggedInUserId, setLoggedInUserId] = useState<number | null>(null);
  const [lastLocalUri, setLastLocalUri] = useState<string | null>(null);
  const [lastServerUrl, setLastServerUrl] = useState<string | null>(null);

  // ─── Imported-videos library ───────────────────────
  const [videoLibraryVisible, setVideoLibraryVisible] = useState(false);
  const [userVideos, setUserVideos] = useState<DrivingSession[]>([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);

  // ─── “Import video?” confirmation modal ─────────────
  const [importConfirmVisible, setImportConfirmVisible] = useState(false);
  const [pickedVideoUri, setPickedVideoUri] = useState<string | null>(null);
  const [isPickingVideo, setIsPickingVideo] = useState(false);
  

  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [selectedSessionUri, setSelectedSessionUri] = useState<string | null>(null);

  const [converting, setConverting] = useState(false);
  const [convertedUri, setConvertedUri] = useState<string | null>(null);
  const [convertedPath, setConvertedPath] = useState<string | null>(null);
  const [conversionPhase, setConversionPhase] = useState<'idle'|'running'|'done'>('idle');
  const [showConvertedPlayer, setShowConvertedPlayer] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [pendingConversions, setPendingConversions] = useState<string[]>([])
  const [finishedConversionsModalVisible, setFinishedConversionsModalVisible] = useState(false);
  const [finishedConversions, setFinishedConversions] = useState<string[]>([]);
  const [readyVideoPath, setReadyVideoPath] = useState<string | null>(null);
  const [convertedVideos, setConvertedVideos] = useState<string[]>([]);

  // Add Points
  const [points, setPoints] = useState(0);
  const pointsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [redLineTimes, setRedLineTimes] = useState<number[]>([]);
  const [hasPlayedOnce, setHasPlayedOnce] = useState(false);
  const [scoredVideos, setScoredVideos] = useState<string[]>([]);

  // Add near your other state hooks
  const [showPointsModal, setShowPointsModal] = useState(false);
  const [lastScoredPoints, setLastScoredPoints] = useState(0);

  const [progress, setProgress] = useState(0);

  // ─── Lane overlay state ─────────────────────────────
  const [laneOverlayUri, setLaneOverlayUri] = useState<string | null>(null);
  const [laneOverlayLoading, setLaneOverlayLoading] = useState(false);
  const laneOverlayIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isLaneOverlayLive, setIsLaneOverlayLive] = useState(false);
  const redLinesVisibleStartRef = useRef<number | null>(null);
  const lastPointTimeRef = useRef<number | null>(null);

  const isTakingPicture = useRef(false);

  const [showVideoReadyToast, setShowVideoReadyToast] = useState(false);

  const [currentDepth, setCurrentDepth] = useState<number | null>(null);
  const depthBuffer = useRef<number[]>([]);
  const cameraRef = useRef<CameraView>(null);



  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: (isLaneOverlayLive || isRecording)
        ? { display: 'none' }
        : {
            backgroundColor: '#2f4f4f',
            borderColor: '#111',
            borderWidth: 2,
            borderRadius: 24,
            margin: 12,
            position: 'absolute',
            left: 12,
            right: 12,
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 8,
            height: isLandscape ? 45 : 64,         // <-- Dynamisk höjd!
            bottom: isLandscape ? 4 : 15,          // <-- Dynamisk position!
            paddingBottom: 8,
            paddingTop: 8,
            flexDirection: 'row',
          },
    });
  }, [isLaneOverlayLive, isRecording, isLandscape, navigation]);
  
  useEffect(() => {
    const onChange = ({ window: { width, height } }) => {
      setIsLandscape(width > height);
    };
    const sub = Dimensions.addEventListener('change', onChange);
    // Initial
    const { width, height } = Dimensions.get('window');
    setIsLandscape(width > height);
    return () => sub.remove();
  }, []);

  // ─── Timer for recording ─────────────────────────────
  useEffect(() => {
    if (isRecording) {
      setRecordSeconds(0);
      recordIntervalRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000);
    } else {
      if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
      setRecordSeconds(0);
    }
    return () => {
      if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
    };
  }, [isRecording]);

  function formatTimer(sec: number) {
    const m = Math.floor(sec/60).toString().padStart(2,'0');
    const s = (sec%60).toString().padStart(2,'0');
    return `${m}:${s}`;
  }

  // ─── Load logged-in user ─────────────────────────────
  useEffect(() => {
    (async () => {
      const json = await AsyncStorage.getItem('user');
      if (json) setLoggedInUserId(JSON.parse(json).id);
    })();
  }, []);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT);
    return () => {
      ScreenOrientation.unlockAsync();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pointsIntervalRef.current) {
        clearInterval(pointsIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (convertedPath) {
      setPoints(0);
      // Only allow points if this video hasn't been scored yet
      setHasPlayedOnce(scoredVideos.includes(convertedPath));
    }
  }, [convertedPath, scoredVideos]);

  useEffect(() => {
    if (convertedPath) {
      // If convertedPath is local, build the server URL
      let serverUrl = convertedPath;
      if (convertedPath.startsWith('file://')) {
        // Extract the filename
        const filename = convertedPath.split('/').pop();
        serverUrl = `${API_BASE}/uploads/${filename}`;
      }
      const jsonUrl = serverUrl.replace('.mp4', '_redlines.json');
      fetchWithAuth(jsonUrl)
        .then(res => res.json())
        .then(times => {
          setRedLineTimes(times);
        })
        .catch((e) => {
          console.log('[DEBUG] Failed to load redLineTimes:', e);
          setRedLineTimes([]);
        });
    }
  }, [convertedPath]);

  useEffect(() => {
    // När Live stängs av, visa poäng-modal om poäng > 0
    if (!isLaneOverlayLive && points > 0) {
      setLastScoredPoints(points);
      setShowPointsModal(true);
      setPoints(0); // Nollställ poäng efter visning
    }
  }, [isLaneOverlayLive]);

  // ─── Video capture & upload ──────────────────────────
  async function startRecording() {
    if (!cameraRef.current || isRecording) return;
    setIsRecording(true);
    try {
      const vid = await cameraRef.current.recordAsync({ maxDuration:6000 });
      setLastLocalUri(vid.uri);
    } catch(e) {
      console.error(e);
      setIsRecording(false);
    }
  }
  async function stopRecording() {
    if (cameraRef.current && isRecording) {
      cameraRef.current.stopRecording();
      setIsRecording(false);
      if (lastLocalUri && loggedInUserId) {
        try {
          await copyAndUploadVideo(lastLocalUri, loggedInUserId);
        } catch (e:any) {
          console.error(e);
          Alert.alert('Upload failed', e.message);
        }
      }
    }
  }

  function getDepthColor(depth: number | null) {
    if (depth == null) return '#888';
    if (depth < 3) return '#e74c3c';      // Röd: för nära (<3m)
    if (depth < 5) return '#f1c40f';      // Gul: 3–5m
    if (depth < 10) return '#27ae60';     // Grön: 5–10m
    if (depth < 20) return '#2980b9';     // Blå: 10–20m
    return '#8e44ad';                     // Lila: längre bort
  }
  // 1) add a handler to show the menu
  async function showPreviewOptions() {
    const options = ['Save to Sessions', 'Delete Video', 'Cancel'];
    const destructiveIndex = 1;
    const cancelIndex = 2;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex: destructiveIndex, cancelButtonIndex: cancelIndex },
        buttonIndex => {
          if (buttonIndex === 0) savePreview();
          else if (buttonIndex === 1) setLastLocalUri(null);
        }
      );
    } else {
      // simple Android fallback
      Alert.alert(
        'Options',
        undefined,
        [
          { text: 'Save to Sessions', onPress: savePreview },
          { text: 'Delete Video', style: 'destructive', onPress: () => setLastLocalUri(null) },
          { text: 'Cancel', style: 'cancel' },
        ],
        { cancelable: true }
      );
    }
  }
  // 2) savePreview should do exactly what your file‐picker import does:
  async function savePreview() {
    if (!lastLocalUri || !loggedInUserId) return;
    try {
      await copyAndUploadVideo(lastLocalUri, loggedInUserId);
      Alert.alert('Saved','Video imported into your sessions.');
      fetchUserVideos();
    } catch (e:any) {
      Alert.alert('Error','Could not save video');
    }
    setLastLocalUri(null);
  }
  // ─── Import from phone ──────────────────────────────
  async function pickVideo() {
    if (!loggedInUserId) {
      Alert.alert('Error','No user ID loaded yet.');
      return;
    }
    setIsPickingVideo(true);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      });
      if (res.canceled || !res.assets.length) return;
      setPickedVideoUri(res.assets[0].uri);
      setImportConfirmVisible(true);
    } finally {
      setIsPickingVideo(false);
    }
  }

  async function handleImportVideo() {
    if (!pickedVideoUri || !loggedInUserId) return setImportConfirmVisible(false);
    setImportConfirmVisible(false);
    setImportLoading(true);
    try {
      await copyAndUploadVideo(pickedVideoUri, loggedInUserId);
      Alert.alert('Imported!','Your video is now in your library.');
      fetchUserVideos();
    } catch (e:any) {
      console.error(e);
      Alert.alert('Import failed', e.message || String(e));
    } finally {
      setImportLoading(false);
      setPickedVideoUri(null);
    }
  }

  async function handleDeleteSession(sessionId: number) {
    Alert.alert(
      "Delete Session",
      "Are you sure you want to delete this driving session? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              let url = `${API_BASE}/driving_sessions/${sessionId}`;
              if (Platform.OS === 'android') url = url.replace('localhost', '10.0.2.2');
              const resp = await fetchWithAuth(url, { method: 'DELETE' });
              if (!resp.ok) throw new Error(await resp.text());
              fetchUserVideos(); // Refresh list
            } catch (e: any) {
              Alert.alert("Error", e.message || "Could not delete session.");
            }
          }
        }
      ]
    );
  }

  async function pollConversion(marked_video_path: string) {
    let tries = 0;
    const maxTries = 3600; // 1 hour max
    const pollInterval = 5000; 

    setConverting(true);
    setConversionPhase('running');
    setProgress(0);

    const poll = async () => {
      tries++;
      try {
        // Hämta progress
        let progressUrl = `${API_BASE}/conversion_progress/?marked_video_path=${encodeURIComponent(marked_video_path)}`;
        if (Platform.OS === 'android') progressUrl = progressUrl.replace('localhost', '10.0.2.2');
        const progressResp = await fetchWithAuth(progressUrl);
        const { progress } = await progressResp.json();
        setProgress(progress);

        // Hämta status
        let statusUrl = `${API_BASE}/conversion_status/?marked_video_path=${encodeURIComponent(marked_video_path)}`;
        if (Platform.OS === 'android') statusUrl = statusUrl.replace('localhost', '10.0.2.2');
        const statusResp = await fetchWithAuth(statusUrl);
        const status = await statusResp.json();

        if (status.status === 'done') {
          // Ladda ner videon
          const dir = FileSystem.documentDirectory + 'videos/';
          await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
          const local = dir + marked_video_path;
          if (!(await FileSystem.getInfoAsync(local)).exists) {
            await FileSystem.downloadAsync(`${API_BASE}/uploads/${marked_video_path}`, local);
          }
          setConvertedUri(local);
          setConvertedPath(local);
          setConversionPhase('done');
          setConverting(false);
          setReadyVideoPath(local);
          setShowVideoReadyToast(true);
          setTimeout(() => setShowVideoReadyToast(false), 3000); // Visa i 3 sekunder
          setConvertedVideos(prev => prev.includes(local) ? prev : [...prev, local]);
        } else if (status.status === 'error') {
          setConverting(false);
          setConversionPhase('idle');
          Alert.alert('Conversion error', status.error || 'Conversion failed');
        } else if (tries < maxTries) {
          setTimeout(poll, pollInterval);
        } else {
          setConverting(false);
          setConversionPhase('idle');
          Alert.alert('Conversion timed out');
        }
      } catch (e: any) {
        setConverting(false);
        setConversionPhase('idle');
        Alert.alert('Error', e.message || 'Error polling conversion');
      }
    };
    poll();
  }
  function getMimeType(ext) {
    if (ext === 'mp4') return 'video/mp4';
    if (ext === 'mov') return 'video/quicktime';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    // lägg till fler vid behov
    return 'application/octet-stream';
  }

  async function copyAndUploadVideo(uri:string, userId:number) {
    const filename = uri.split('/').pop()!;
    const localCopy = FileSystem.documentDirectory + filename;
    await FileSystem.copyAsync({ from:uri, to:localCopy });
    const ext = filename.split('.').pop()!;
    const type = getMimeType(ext);
    const fd = new FormData();
    fd.append('file', { uri:localCopy, name:`video.${ext}`, type } as any);
    let endpoint = `${API_BASE}/driving_sessions/?user_id=${userId}`;
    if (Platform.OS==='android') endpoint = endpoint.replace('localhost','10.0.2.2');
    const resp = await fetchWithAuth(endpoint, { method:'POST', body:fd });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Server ${resp.status}: ${txt}`);
    }
  }

  // ─── Ensure each session is downloaded once ───────────
  async function ensureLocalSessionVideo(session: DrivingSession): Promise<DrivingSession> {
    const dir = FileSystem.documentDirectory + 'videos/';
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const localUri = dir + session.file_path;
    const info = await FileSystem.getInfoAsync(localUri);
    if (!info.exists) {
      await FileSystem.downloadAsync(`${API_BASE}/uploads/${session.file_path}`, localUri);
    }
    return { ...session, localUri };
  }

  function getBaseName(filePath: string) {
    const name = filePath.split('/').pop() || '';
    return name.replace('marked_', '').replace('.mp4', '');
  }

  function getSessionInfoForConverted(path: string) {
    const convertedBase = getBaseName(path);
    const session = userVideos.find(s => {
      const sessionBase = getBaseName(s.file_path);
      return convertedBase.startsWith(sessionBase);
    });
    if (!session) return { sessionId: '??', duration: '--:--' };
    const mm = Math.floor(session.duration / 60).toString().padStart(2, '0');
    const ss = Math.floor(session.duration % 60).toString().padStart(2, '0');
    return { sessionId: session.id, duration: `${mm}:${ss}` };
  }
  // ─── Fetch & cache user videos ───────────────────────
  async function fetchUserVideos() {
    if (!loggedInUserId) return;
    setIsLoadingVideos(true);
    try {
      let url = `${API_BASE}/driving_sessions/?user_id=${loggedInUserId}`;
      if (Platform.OS==='android') url = url.replace('localhost','10.0.2.2');
      const resp = await fetchWithAuth(url);
      if (!resp.ok) throw new Error(await resp.text());
      const sessions: DrivingSession[] = await resp.json();
      const cached = await Promise.all(sessions.map(ensureLocalSessionVideo));
      setUserVideos(cached);
    } catch(e) {
      console.error(e);
    } finally {
      setIsLoadingVideos(false);
    }
  }

  async function sendLaneOverlayFrame() {
    if (!cameraRef.current) return;
    isTakingPicture.current = true;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.4, skipProcessing: true, base64: false });
      const formData = new FormData();
      formData.append('file', {
        uri: photo.uri,
        name: 'frame.jpg',
        type: 'image/jpeg',
      } as any);

      // 1. Skicka till lane_overlay
      let url = `${API_BASE}/lane_overlay/`;
      if (Platform.OS === 'android') url = url.replace('localhost', '10.0.2.2');
      const resp = await fetchWithAuth(url, {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data' },
        body: formData,
      });
      if (!resp.ok) throw new Error(await resp.text());
      const arrayBuffer = await resp.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);

      // Läs antalet röda linjer från header
      const redLines = Number(resp.headers.get('x-red-lines') || 0);

      // Spara till temporär fil
      const base64 = Buffer.from(buffer).toString('base64');
      setLaneOverlayUri(`data:image/jpeg;base64,${base64}`);
      // Ge poäng bara om det är exakt 2 röda linjer
      const now = Date.now();
      if (redLines === 2) {
        if (redLinesVisibleStartRef.current === null) {
          redLinesVisibleStartRef.current = now;
          lastPointTimeRef.current = null;
        } else {
          const visibleDuration = (now - redLinesVisibleStartRef.current) / 1000; // sekunder
          if (visibleDuration >= 2) {
            if (
              lastPointTimeRef.current === null ||
              (now - lastPointTimeRef.current) >= 2000 // 2 sekunder
            ) {
              setPoints(p => p + 3);
              lastPointTimeRef.current = now;
            }
          }
        }
      } else {
        redLinesVisibleStartRef.current = null;
        lastPointTimeRef.current = null;
      }

      // 2. Skicka till depth_map_raw
    let depthUrl = `${API_BASE}/depth_map_raw/`;
    if (Platform.OS === 'android') depthUrl = depthUrl.replace('localhost', '10.0.2.2');
    const depthResp = await fetchWithAuth(depthUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data' },
      body: formData,
    });

    if (depthResp.ok) {
      const { depth } = await depthResp.json();
      const h = depth.length;
      const w = depth[0].length;

      const halfBox = Math.floor(DEPTH_BOX_SIZE / 2);
      const centerX = Math.floor(w / 2 + DEPTH_BOX_OFFSET_X); // <-- ändrad rad
      const centerY = Math.floor(h / 2 + DEPTH_BOX_OFFSET);

      let values: number[] = [];

      for (let y = centerY - halfBox; y <= centerY + halfBox; y++) {
        for (let x = centerX - halfBox; x <= centerX + halfBox; x++) {
          if (y >= 0 && y < h && x >= 0 && x < w) {
            values.push(depth[y][x]);
          }
        }
      }

      if (values.length > 0) {
        values.sort((a, b) => a - b);
        const medianDepth = values.length % 2 === 0
          ? (values[values.length / 2 - 1] + values[values.length / 2]) / 2
          : values[Math.floor(values.length / 2)];
        depthBuffer.current.push(medianDepth);

        if (depthBuffer.current.length > DEPTH_AVG_BUFFER_SIZE) {
          depthBuffer.current.shift();
        }

        const smoothed = depthBuffer.current.reduce((a, b) => a + b, 0) / depthBuffer.current.length;
        setCurrentDepth(smoothed);
      } else {
        setCurrentDepth(null);
      }
    } else {
      setCurrentDepth(null);
    }
    } catch (e) {
      // Optionellt: visa fel
    } finally {
      isTakingPicture.current = false;
      if (isLaneOverlayLive) sendLaneOverlayFrame();
    }
  }

  function startLaneOverlayPreview() {
    if (laneOverlayIntervalRef.current) return;
    laneOverlayIntervalRef.current = setInterval(sendLaneOverlayFrame, 1000);
    setIsLaneOverlayLive(true);
    sendLaneOverlayFrame();
  }
  function stopLaneOverlayPreview() {
    if (laneOverlayIntervalRef.current) {
      clearInterval(laneOverlayIntervalRef.current);
      laneOverlayIntervalRef.current = null;
      setLaneOverlayUri(null);
      setIsLaneOverlayLive(false);
      if (points > 0) savePointsToUser(points);
    }
  }
  
  async function handleConvert() {
    if (!selectedSessionId) return;
    setConverting(true);
    setConversionPhase('running');
    setConvertedUri(null);
    setConvertedPath(null);

    try {
      const resp = await fetchWithAuth(
        `${API_BASE}/convert_video/?session_id=${selectedSessionId}`,
        { method: 'POST' }
      );
      if (!resp.ok) throw new Error(await resp.text());
      const { marked_video_path } = await resp.json();

      setPendingConversions(prev => [...prev, marked_video_path]);
      pollConversion(marked_video_path);
    } catch (e: any) {
      Alert.alert('Conversion error', e.message);
      setConversionPhase('idle');
      setConverting(false);
    }
  }

  function areRedLinesVisible(currentTime: number) {
    if (hasPlayedOnce) return false; // Don't match after first playthrough
    const visible = redLineTimes.some(t => Math.abs(t - currentTime) < 0.5);
    if (visible) {
      console.log(`[DEBUG] MATCH: currentTime=${currentTime}, redLineTimes=${JSON.stringify(redLineTimes.slice(0,10))}...`);
    }
    return visible;
  }

  
  function getPointsMessage(points: number): string {
    if (points === 0) {
      return "Ouch—no points this time! Try again, but stay in the correct lane this time!.";
    }
    if (points < 10) {
      return `Not bad, you scored ${points} point${points > 1 ? "s" : ""}! Keep practicing.`;
    }
    if (points < 20) {
      return `Good job! You racked up ${points} points for staying in the lane.`;
    }
    if (points < 50) {
      return `Great driving—${points} points! You’re really getting the hang of it.`;
    }
    return `Outstanding! You scored ${points} points—flawless run!`;
  }

  // Add this inside your NavScreen component
  async function savePointsToUser(points: number) {
    if (!loggedInUserId) return;
    try {
      let url = `${API_BASE}/add_points/?user_id=${loggedInUserId}&points=${points}`;
      if (Platform.OS === 'android') url = url.replace('localhost', '10.0.2.2');
      const resp = await fetchWithAuth(url, { method: 'POST' });
      if (!resp.ok) throw new Error(await resp.text());
      // Optionally handle response
      console.log('[DEBUG] Points saved to user:', points);
    } catch (e) {
      console.error('Failed to save points:', e);
    }
  }
  // ─── Open a session for playback ──────────────────
  function openSession(s: DrivingSession) {
    setSelectedSessionId(s.id);
    setSelectedSessionUri(s.localUri!);
    setConvertedPath(null);
    setConversionPhase('idle');
  }

  
  if (!permission) {
    return <View style={styles.center}><ActivityIndicator/></View>;
  }
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Vi behöver din tillåtelse för att använda kameran</Text>
        <Button onPress={requestPermission} title="Ge tillåtelse"/>
      </View>
    );
  }


  return (
    <View style={{ flex: 1, backgroundColor: '#000'}}>
      {/* Depth overlay */}
      {currentDepth && (
        <View style={{
          position: 'absolute',
          top: 24,
          left: 20,
          backgroundColor: getDepthColor(currentDepth),
          padding: 10,
          borderRadius: 10,
          zIndex: 100,
          opacity: 0.85,
        }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
            Avstånd: {currentDepth.toFixed(1)} meter
          </Text>
        </View>
      )}

      {/* Visa ENDAST en kameravy åt gången */}
      {!isLaneOverlayLive ? (
        // Vanligt läge: kameran är stor
        <View style={{flex: 1, backgroundColor: '#000', zIndex: 1 }}>
          <CameraView
            style={{ flex: 1 }}
            ref={cameraRef}
            facing={facing}
            mode="video"
            videoQuality="720p"
            zoom={0}
            
          />
        </View>
      ) : (
        // Live-läge: kameran är liten i hörnet
        <View
          style={{
            position: 'absolute',
            top: 30,
            right: 20,
            width: 160,
            height: 90, // 16:9
            borderRadius: 10,
            overflow: 'hidden',
            zIndex: 20,
            borderWidth: 2,
            borderColor: '#fff',
            backgroundColor: '#222',
          }}
        >
          <CameraView
            style={{ flex: 1 }}
            ref={cameraRef}
            facing={facing}
            mode="video"
            videoQuality="720p"
            zoom={0}
          />
          {/* LIVE-badge */}
          <Text style={{
            position: 'absolute',
            top: 4,
            right: 8,
            color: '#fff',
            backgroundColor: 'red',
            paddingHorizontal: 6,
            borderRadius: 6,
            fontWeight: 'bold',
            fontSize: 12,
            zIndex: 30
          }}>LIVE</Text>
        </View>
      )}
      {/* record timer */}
      {isRecording && (
        <View style={[styles.recordTimerContainer, { zIndex: 1000, position: 'absolute', top: 95, alignSelf: 'center' }]}>
          <Ionicons name="ellipse" size={14} color="red" style={{marginRight:4}}/>
          <Text style={styles.recordTimerText}>{formatTimer(recordSeconds)}</Text>
        </View>
      )}

      {/* Overlayn alltid överst */}
      {isLaneOverlayLive && laneOverlayUri && (
        
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            zIndex: 10,
            backgroundColor: '#000',
          }}
        >
          <Animated.Image
            source={{ uri: laneOverlayUri }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 1.0 * Dimensions.get('window').width,
              height: 1.0 * Dimensions.get('window').height,
              resizeMode: 'contain', // täck hela
            }}
          />
          <View style={[
            styles.pointsOverlay,
            {
              top: 50, // Justera så det hamnar bredvid lilla kameran
              right: 400, // Justera så det hamnar bredvid lilla kameran
              zIndex: 30,
              position: 'absolute',
            }
          ]}>
            <Text style={styles.pointsOverlayText}>{points}</Text>
          </View>
        </View>
      )}
      {/* Grön ruta i live-overlay för depth-mätning */}
      {isLaneOverlayLive && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            // Korrekt X-position i pixlar:
            left:
              Dimensions.get('window').width / 2 +
              (DEPTH_BOX_OFFSET_X * Dimensions.get('window').width) / 640 -
              DEPTH_BOX_SIZE / 2,
            // Korrekt Y-position i pixlar:
            top:
              Dimensions.get('window').height / 2 +
              (DEPTH_BOX_OFFSET * Dimensions.get('window').height) / 192 -
              DEPTH_BOX_SIZE / 2,
            width: DEPTH_BOX_SIZE,
            height: DEPTH_BOX_SIZE,
            borderWidth: 2,
            borderColor: 'lime',
            zIndex: 200,
          }}
        />
      )}
      {/* Video preview */}
      {lastLocalUri  && (
        <View style={{
          position: 'absolute',
          bottom: 200,
          right: 20,
          width: 300,
          height: 300 * (9 / 16), // 16:9 aspect ratio
          borderRadius: 12,
          zIndex: 2000,
        }}>
          <Video
            useNativeControls
            source={{ uri: lastLocalUri }}
            resizeMode={ResizeMode.CONTAIN}
            style={styles.fullVideo}
            isLooping
          />
          <TouchableOpacity
            style={styles.videoDeleteButton}
            onPress={showPreviewOptions}
          >
            <Ionicons name="ellipsis-vertical" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
      {/* shutter / record + pick */}
      <View style={[styles.bottomControls, { position: 'absolute', bottom: isLandscape ? 50 : 80, width: '100%', zIndex: 200 }]}>
        {/* LEFT: Converted */}
        <View style={[styles.sideContainerLeft, { minHeight: 10, top: 35, justifyContent: 'flex-start', flexDirection: 'row', alignItems: 'flex-start' }]}>
          {!(isRecording || isLaneOverlayLive) && (
            <TouchableOpacity
              style={styles.sideButton}
              onPress={async () => {
                // Check for finished conversions and open modal
                let finished: string[] = [];
                for (const marked_video_path of pendingConversions) {
                  let url = `${API_BASE}/conversion_status/?marked_video_path=${encodeURIComponent(marked_video_path)}`;
                  if (Platform.OS === 'android') url = url.replace('localhost', '10.0.2.2');
                  try {
                    const resp = await fetchWithAuth(url);
                    if (!resp.ok) continue;
                    const status = await resp.json();
                    if (status.status === 'done') {
                      finished.push(marked_video_path);
                    }
                  } catch {}
                }
                setFinishedConversions(finished);
                setFinishedConversionsModalVisible(true);
              }}
            >
              <Ionicons name="checkmark-done-circle-outline" size={44} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.sideButtonText}>Converted</Text>
            </TouchableOpacity>
          )}
          {converting && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 0, marginTop: 15 }}>
              <ActivityIndicator size="small" color="#8DA46D" />
              <Text style={{ color: '#fff', marginLeft: 6 }}>
                {Math.round(progress * 100)}%
              </Text>
            </View>
          )}
        </View>

        {/* CENTER: Record/Live (unchanged) */}
        <View style={styles.centerContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' }}>
            {/* Visa ENDAST inspelningsknappen om Live INTE är aktiv */}
            {!isLaneOverlayLive && (
              <View style={{ alignItems: 'center', marginRight: 18 }}>
                <TouchableOpacity
                  style={[
                    styles.mainActionButton,
                    isRecording && styles.mainActionButtonRecording,
                  ]}
                  onPress={() =>
                    isRecording
                      ? stopRecording()
                      : startRecording()
                  }
                >
                  {isRecording ? (
                    <Ionicons name="stop-circle" size={64} color="#fff" />
                  ) : (
                    <Ionicons name="ellipse" size={64} color="#e74c3c" />
                  )}
                </TouchableOpacity>
                <Text style={styles.mainActionLabel}>
                  {isRecording ? 'Stop Rec' : 'Start Rec'}
                </Text>
              </View>
            )}
            {/* Visa ENDAST Live-knappen om inspelning INTE är aktiv */}
            {!isRecording && (
              <View style={{ alignItems: 'center' }}>
                <TouchableOpacity
                  style={[
                    styles.mainActionButton,
                    isLaneOverlayLive && {
                      backgroundColor: 'transparent',
                      width: 55,
                      height: 55,
                      borderRadius: 28,
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginTop: 60,
                      marginBottom: 0,
                    }
                  ]}
                  onPress={() =>
                    isLaneOverlayLive
                      ? stopLaneOverlayPreview()
                      : startLaneOverlayPreview()
                  }
                >
                  <Ionicons
                    name={isLaneOverlayLive ? "stop-circle" : "analytics-outline"}
                    size={isLaneOverlayLive ? 34 : 50}
                    color="#8DA46D"
                  />
                </TouchableOpacity>
                <Text style={styles.mainActionLabel}>Live</Text>
              </View>
            )}
          </View>
        </View>

        {/* RIGHT: Library & Import */}
        <View style={styles.sideContainerRight}>
          {!(isRecording || isLaneOverlayLive) && (
            <>
              <TouchableOpacity
                style={styles.sideButton}
                onPress={() => {
                  setVideoLibraryVisible(true);
                  fetchUserVideos();
                }}
              >
                <Ionicons name="albums" size={44} color="#fff" />
                <Text style={styles.sideButtonText}>Library</Text>
              </TouchableOpacity>
              {/* Import button */}
              <TouchableOpacity style={styles.sideButton} onPress={pickVideo}>
                <Ionicons name="folder-open" size={44} color="#fff" />
                <Text style={styles.sideButtonText}>Import</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
      
      <Modal visible={importConfirmVisible || importLoading} transparent animationType="slide">
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.7)',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <View style={styles.modalContainer}>
            {importLoading ? (
              <ActivityIndicator size="large" color="#fff" />
            ) : (
              <>
                <Text style={{ fontSize: 18, marginBottom: 16 }}>Import this video?</Text>
                <Text style={{ fontSize: 16, marginBottom: 8, color: '#fff', textAlign: 'center' }}>
                  {pickedVideoUri ? pickedVideoUri.split('/').pop() : 'No file selected'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <Button title="Cancel" onPress={() => setImportConfirmVisible(false)} />
                  <Button title="Import" onPress={handleImportVideo} />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
      {isPickingVideo && (
        <View style={{
          position: 'absolute', left: 0, top: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={{ color: '#fff', marginTop: 16 }}>Loading video…</Text>
        </View>
      )}
      {/* ─── Last photo taken ────────────────────────────── */}
      {/* imported videos list */}
      {videoLibraryVisible && (
        <SafeAreaView style={[
          styles.sessionContainer,
          {
            position: 'absolute',
            zIndex: 999,
            backgroundColor: 'DARK_BLUE',
            alignSelf: 'center',
            justifyContent: 'center',
            alignItems: 'center'
          }
        ]}>

        {/* Header with a nice icon + title */}
        <View style={styles.modalHeader}>
          <Ionicons
            name="albums-outline"
            size={28}
            color={WHITE_C}
            style={{ marginRight: 8 }}
          />
          <Text style={styles.modalTitle}>Drive Sessions</Text>
        </View>

        {isLoadingVideos ? (
          <ActivityIndicator size="large" />
        ) : (
          <FlatList
            data={userVideos}
            keyExtractor={v => v.id.toString()}
            renderItem={({ item }) => {
              // compute mm:ss
              const mm = Math.floor(item.duration / 60)
                .toString()
                .padStart(2, '0');
              const ss = Math.floor(item.duration % 60)
                .toString()
                .padStart(2, '0');

              return (
                <View style={styles.sessionRowContent}>
                  <TouchableOpacity
                    style={styles.sessionRow}
                    onPress={() => {
                      openSession(item);
                      setVideoLibraryVisible(false);
                    }}
                  >
                    <Ionicons
                      name="videocam-outline"
                      size={20}
                      color={WHITE_C}
                      style={{ marginRight: 12 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sessionText}>
                        # {item.id}
                      </Text>
                      <Text style={styles.sessionDate}>
                        {format(new Date(item.start_time), 'MMM d, yyyy h:mm a')}
                      </Text>
                    </View>
                    <Text style={styles.durationText}>
                      {mm}:{ss}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteSession(item.id)}
                  >
                    <Ionicons name="trash-outline" size={20} color="#e74c3c" />
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )}

        <TouchableOpacity
          style={{
            marginTop: 8,
            marginBottom: 8,
            alignSelf: 'center',
            backgroundColor: '#333',
            borderColor: '#fff',
            borderWidth: 2,
            borderRadius: 22,
            paddingVertical: 10,
            paddingHorizontal: 32,
            flexDirection: 'row',
            alignItems: 'center',
            width: '80%',
            justifyContent: 'center',
          }}
          onPress={() => setVideoLibraryVisible(false)}
        >
          <Ionicons name="close" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Close</Text>
        </TouchableOpacity>
      </SafeAreaView>
      )}
      {/* ─── Finished Conversions Modal ────────────────── */}
      {showVideoReadyToast && (
        <View style={{
          position: 'absolute',
          top: 40,
          right: 24,
          backgroundColor: '#222',
          borderRadius: 16,
          paddingVertical: 14,
          paddingHorizontal: 28,
          flexDirection: 'row',
          alignItems: 'center',
          zIndex: 9999,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 8,
          elevation: 8,
        }}>
          <Ionicons name="checkmark-circle" size={28} color={GREEN} style={{ marginRight: 10 }} />
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: 'bold' }}>
            Video Ready!
          </Text>
        </View>
      )}
      {/* ─── Finished Conversions List Modal ────────────── */}
      {finishedConversionsModalVisible && (
        <View style={{
          position: 'absolute',
          top: 30, left: 0, right: 0, bottom: 50,
          backgroundColor: 'rgba(0,0,0,0.7)',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 999,
        }}>
          <SafeAreaView style={[styles.sessionContainer, { alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="film-outline" size={40} color={GREEN} style={{ marginBottom: 10 }} />
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 18 }}>
              Converted Videos
            </Text>
            {convertedVideos.length === 0 ? (
              <Text style={{ color: '#bbb', marginBottom: 20 }}>No converted videos yet.</Text>
            ) : (
              <ScrollView style={{height: '100%', width: '80%'}}>
                {convertedVideos.map((path, idx) => {
                const { sessionId, duration } = getSessionInfoForConverted(path);
                return (
                  <TouchableOpacity
                    key={path + idx}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: '#8DA46D',
                      borderRadius: 12,
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      marginBottom: 10,
                    }}
                    onPress={() => {
                      setConvertedPath(path);
                      setShowConvertedPlayer(true);
                      setFinishedConversionsModalVisible(false);
                    }}
                  >
                    <Ionicons name="play-circle-outline" size={22} color={GREEN} style={{ marginRight: 10 }} />
                    <Text style={{ color: '#fff', fontSize: 15, flex: 1 }}>
                      Converted: Session #{sessionId}, {duration}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              </ScrollView>
            )}
            <TouchableOpacity
              style={{
                marginTop: 10,
                marginBottom: 10,
                backgroundColor: '#333',
                borderRadius: 22,
                paddingVertical: 10,
                paddingHorizontal: 52,
                flexDirection: 'row',
                alignItems: 'center',
                width: '80%',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: '#fff',
              }}
              onPress={() => setFinishedConversionsModalVisible(false)}
            >
              <Ionicons name="close" size={20} color="#fff" style={{ marginRight: 6 }} />
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Close</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      )}
      {/* ─── Play / Convert Modal ─────────────────────── */}
      <Modal
        visible={selectedSessionUri !== null}
        animationType="slide"
        onRequestClose={() => setSelectedSessionUri(null)}
      >
        <SafeAreaView style={styles.playerContainer}>
          {/* 1. If conversion is done and we have a convertedPath, show "Done" and "Play Converted" */}
          {conversionPhase === 'done' && convertedPath ? (
            <View style={styles.center}>
              <Text style={styles.whiteText}>Done!</Text>
              <View style={styles.controls}>
                <TouchableOpacity
                  style={styles.pillButton}
                  onPress={() => {
                    setSelectedSessionUri(null);
                    setShowConvertedPlayer(true);
                  }}
                >
                  <Ionicons name="play-outline" size={20} color="#fff" />
                  <Text style={styles.pillText}>Play Converted</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pillButton, styles.backButton]}
                  onPress={() => {
                    setSelectedSessionId(null);
                    setConvertedPath(null);
                    setConversionPhase('idle');
                  }}
                >
                  <Ionicons name="close-outline" size={20} color="#fff" />
                  <Text style={styles.pillText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            // 2. Otherwise, show the original video and the Convert button
            <>
              <View style={styles.playerContainer}>
                <Video
                  source={{ uri: selectedSessionUri! }}
                  shouldPlay
                  isLooping
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                  style={styles.fullVideo}
                />
              </View>
              <View style={styles.controls}>
                <TouchableOpacity
                  style={[styles.pillButton, styles.backButton]}
                  onPress={() => {
                    setSelectedSessionId(null);
                    setSelectedSessionUri(null);
                    setVideoLibraryVisible(true);
                    fetchUserVideos();
                  }}
                >
                  <Ionicons name="arrow-undo-outline" size={20} color="#fff" />
                  <Text style={styles.pillText}>Back to Library</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pillButton}
                  onPress={() => {
                    handleConvert();
                    // Add to pending conversions so user can check later
                    if (selectedSessionUri) {
                      // Use the marked_video_path returned from handleConvert if possible
                      // Or add logic to update pendingConversions in handleConvert
                    }
                    // Optionally show a toast/snackbar: "Conversion started! You can check for finished conversions anytime."
                    setSelectedSessionUri(null); // Close modal so user can continue using the app
                  }}
                >
                  <Ionicons name="color-palette-outline" size={20} color="#fff" />
                  <Text style={styles.pillText}>Convert</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </SafeAreaView>
      </Modal>
      {/* ─── Points Modal ──────────────────────────────── */}
      {showPointsModal && (
        <View style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
        }}>
          <View style={{
            backgroundColor: '#222',
            borderRadius: 20,
            paddingVertical: 32,
            paddingHorizontal: 28,
            minWidth: 280,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.3,
            shadowRadius: 16,
            elevation: 8,
          }}>
            <Ionicons name="thumbs-up" size={54} color="#8DA46D" style={{ marginBottom: 12 }} />
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 10, letterSpacing: 0.5 }}>
              Good driving!
            </Text>
            <Text style={{ color: '#bbb', fontSize: 17, marginBottom: 24, textAlign: 'center' }}>
              {getPointsMessage(lastScoredPoints)}
            </Text>
            <TouchableOpacity
              style={{
                backgroundColor: DARK_BLUE,
                borderRadius: 22,
                paddingVertical: 10,
                paddingHorizontal: 32,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
              }}
              onPress={() => setShowPointsModal(false)}
            >
              <Ionicons name="close" size={20} color="#fff" style={{ marginRight: 6 }} />
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {/* ─── Full-screen Converted Player ─────────────── */}
      <Modal
        visible={showConvertedPlayer}
        animationType="slide"
        onRequestClose={() => setShowConvertedPlayer(false)}

      >
        <SafeAreaView style={styles.playerContainer}>
          {convertedPath ?  (
            <>
              <View style={styles.fullscreenVideoWrapper}>
                <Video
                  source={{ uri: convertedPath }}
                  shouldPlay
                  isLooping={false}
                  isMuted={true}
                  useNativeControls
                  style={{ width: '100%', height: '100%' }}
                  resizeMode={ResizeMode.CONTAIN}
                  onPlaybackStatusUpdate={status => {
                    const currentTime = status && 'positionMillis' in status ? status.positionMillis / 1000 : 0;

                    // Stop points after first playthrough
                    if ('didJustFinish' in status && status.didJustFinish && !hasPlayedOnce) {
                      setHasPlayedOnce(true);
                      if (pointsIntervalRef.current) {
                        clearInterval(pointsIntervalRef.current);
                        pointsIntervalRef.current = null;
                      }
                    }

                    // Only give points if not finished first playthrough
                    if (
                      'isPlaying' in status &&
                      status.isPlaying &&
                      !hasPlayedOnce &&
                      areRedLinesVisible(currentTime)
                    ) {
                      if (!pointsIntervalRef.current) {
                        pointsIntervalRef.current = setInterval(() => {
                          setPoints(p => p + 1);
                        }, 1000);
                      }
                    } else {
                      if (pointsIntervalRef.current) {
                        clearInterval(pointsIntervalRef.current);
                        pointsIntervalRef.current = null;
                      }
                    }
                  }}
                  onError={e => console.warn('Converted Video error', e)}
                />
                {/* Points overlay */}
                <View style={styles.pointsOverlay}>
                  <Text style={styles.pointsOverlayText}>{points}</Text>
                </View>
              </View>
            </>
          ) : (
            <Text style={styles.whiteText}>No video to play</Text>
          )}
          <Button
            title="Close"
            onPress={() => {
              setShowConvertedPlayer(false);
              if (hasPlayedOnce && convertedPath && !scoredVideos.includes(convertedPath)) {
                savePointsToUser(points);
                setLastScoredPoints(points);
                setShowPointsModal(true);
                setPoints(0);
                setScoredVideos(prev => [...prev, convertedPath]);
              }
            }}
          />
        </SafeAreaView>
      </Modal>
      <View style={{
        position: 'absolute',
        bottom: 14,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 9999,
        opacity: 0.1,
      }}>
        <Text style={{ color: '#fff', fontSize: 12 }}>
          © 2025 SafeDrivePW
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { 
    flex:1,
    justifyContent:'center',
    alignItems:'center' 
  },
  container:{ 
    flex:1,
    backgroundColor:'#000' 
  },
  message:{ 
    textAlign:'center',
    padding:10,
    color:'#333' 
  },
  camera:{ ...StyleSheet.absoluteFillObject },
  topButtons:{
    position:'absolute',top:50,alignSelf:'center',
    flexDirection:'row',backgroundColor:'rgba(0,0,0,0.3)',borderRadius:6,padding:8
  },
  buttonText:{ 
    color:'#fff',
    marginHorizontal:8,
    fontSize:16 
  },
  active:{ 
    fontWeight:'bold',
    textDecorationLine:'underline' 
  },
  recordTimerContainer:{
    position:'absolute',
    top:95,
    alignSelf:'center',
    flexDirection:'row',
    alignItems:'center',
    backgroundColor:'rgba(0,0,0,0.5)',
    padding:4,
    borderRadius:4
  },
  recordTimerText:{ 
    color:'#fff',
    fontSize:14,
    fontWeight:'600' 
  },
  bottomControls:{
    position:'absolute',
    width:'100%',
    flexDirection:'row',
    justifyContent:'center',
    alignItems:'center',
    paddingHorizontal: 20, 
  },
   sideContainerLeft: {
    flex: 1,
    alignItems: 'flex-start',  
  },
  sideContainerRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  mainActionButton:{ 
    backgroundColor:'transparent',
    padding:12,
    borderRadius:50 
  },
  mainActionButtonRecording: {
    backgroundColor: '#e74c3c',
  },
  mainActionWrapper: {
    alignItems: 'center',
  },
  mainActionLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  sideButton: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,

  },
  sideButtonText: {
    color: '#fff',
    fontSize: 12,
    marginTop: 4,
  },
  videoPreviewContainer:{
    position:'absolute',
    bottom:150,
    right:20,
    width: 288,
    height: 162,
    padding:4
  },
  videoPreviewLabel:{ 
    color:'#fff',
    marginBottom:4,
    textAlign:'center' 
  },
  videoPreview:{ 
    width:'100%',
    height:'100%',
    borderRadius:12,
    backgroundColor:'#000',
    overflow:'hidden'
  },
  videoDeleteButton:{ 
    position:'absolute',
    top: 2,
    left:-5,
    padding:2 
  },
  modalContainer:{ 
    flex:1,
    width: '100%',
    maxWidth: 300,
    height: '100%',
    maxHeight: 200,
    backgroundColor: DARK_BLUE,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: BLACK_C,
    alignContent: 'center',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sessionContainer:{ 
    flex:1,
    width: '70%',
    height: '60%',
    marginTop: 50,
    marginBottom: 50,
    backgroundColor: DARK_BLUE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BLACK_C,
    alignSelf: 'center',
    alignContent: 'center',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitle:{ 
    fontSize:24,
    fontWeight:'bold',
    textAlign:'center',
    marginBottom:12 
  },
  controls: {
    position: 'absolute',
    bottom: 65,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    // you can tweak the backgroundOpacity if you want an overlay
    backgroundColor: 'transparent',
    padding: 8,
    borderRadius: 12,
  },
  pillButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: DARK,  // primary blue
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  backButton: {
    backgroundColor: '#555',       // darker grey for secondary action
  },
  pillText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 6,
    fontWeight: '600',
  },
  playerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullVideo:{ 
    flex:1,
  },
  sessionRow:{ 
    width: '80%',
    height: 'auto',
    flexDirection: 'row',
    padding:12, 
    borderBottomWidth:1,
    backgroundColor: '#8DA46D',
    marginBottom: 0, 
  },
  whiteText: { 
    color: WHITE_C,
    marginTop:12,
    fontSize:16
  },
  deleteButton: {
    marginLeft: 8,
    alignSelf: 'center',
    padding: 6,
  },
  sessionRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sessionText: {
    flex: 1,               // take up remaining space
    fontSize: 26,
  },
  durationText: {
    color: WHITE_C,
    fontVariant: ['tabular-nums'],  // so “02:07” doesn’t shift width
  },

  sessionDate: {
    fontSize: 14,
    color: WHITE_C,
    marginTop: 4,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenVideoWrapper: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000',
  },

  // The little badge in the top-right (or wherever you like)
  pointsOverlay: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    zIndex: 10,
  },
  pointsOverlayText: {
    color: '#8DA46D',
    fontSize: 44,
    fontWeight: 'bold',
  },
});
