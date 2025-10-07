// screens/DriveRewardsScreen.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithAuth } from '../utils/api';

const API_BASE = 'https://docs.mysafedriveapp.org/docs';
const GREEN = '#8DA46D';
const DARK = '#123524';
const GREY = '#777';
const DARK_BLUE = '#2f4f4f';
const WHITE_C = '#fff';
const BLACK_C = '#111';

type QuizOption = {
  id: number;
  text: string;
};

type QuizQuestion = {
  id: number;
  question: string;
  options: QuizOption[];
  correct: string;
};

type User = {
  id: number;
  points: number;
}

const showMessage = (title: string, msg: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${msg}`);
  } else {
    Alert.alert(title, msg);
  }
};

export default function DriveRewardsScreen({ navigation }: any) {
  const [quizModalVisible, setQuizModalVisible] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [user, setUser] = useState<User | null>(null);
  const [resultsModalVisible, setResultsModalVisible] = useState(false);
  const [quizResult, setQuizResult] = useState<{
  total_questions: number;
  correct_count:   number;
  points_awarded:  number;
} | null>(null);

  // 1) On component mount, load the “user” object from AsyncStorage (if any).
  //
  useEffect(() => {
    const loadUser = async () => {
      try {
        const stored = await AsyncStorage.getItem('user');
        if (stored) {
          const parsed: User = JSON.parse(stored);
          setUser(parsed);
        }
      } catch (e) {
        console.warn('Could not parse user from AsyncStorage:', e);
      }
    };

    loadUser();
  }, []);

  const takeQuiz = useCallback(async () => {
    setLoadingQuiz(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/quiz`);
      if (!res.ok) throw new Error(res.statusText);
      const all: QuizQuestion[] = await res.json();
      // shuffle and pick first 10
      const shuffled = all.sort(() => Math.random() - 0.5).slice(0, 10);
      setQuestions(shuffled);
      setAnswers({});
      setQuizModalVisible(true);
    } catch (err) {
      console.error(err);
      showMessage('Error', 'Could not load quiz.');
    } finally {
      setLoadingQuiz(false);
    }
  }, []);

  const selectOption = (qId: number, optId: number) => {
    setAnswers(a => ({ ...a, [qId]: optId }));
  };

  const submitQuiz = async () => {
  // 1) ensure all answered
  if (Object.keys(answers).length < questions.length) {
    showMessage('Fel', 'Vänligen svara på alla frågor');
    return;
  }
  if (!user) {
    showMessage('Fel', 'Ingen användare inloggad.');
    return;
  }

  try {
    const payload = {
      user_id: user.id,
      answers: Object.entries(answers).map(([qid, oid]) => ({
        question_id:        Number(qid),
        selected_option_id: oid,
      })),
    };

    const res = await fetchWithAuth(`${API_BASE}/quiz/submit`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (!res.ok) {
      // Grab any message from the server, or fallback
      const errJson = await res.json().catch(() => null);
      const msg = errJson?.detail ?? res.statusText;
      throw new Error(msg);
    }

    const result = await res.json();
      // Close quiz modal immediately to prevent re-submission:
      setQuizModalVisible(false);

      // Merge awarded points back into local user and save to AsyncStorage:
      setUser((prev) => {
        const updated = {
          ...prev!,
          points: prev!.points + result.points_awarded,
        };
        AsyncStorage.setItem('user', JSON.stringify(updated)).catch((e) => {
          console.warn('Could not store updated user in AsyncStorage:', e);
        });
        return updated;
      });

    // 2) stash & show results modal
    setQuizResult(result);
    setResultsModalVisible(true);

  } catch (err: any) {
    console.error(err);
    showMessage('Fel', err.message ?? 'Det gick inte att skicka in quizet.');
  }
};

// 5) “Logout” button – remove “user” from AsyncStorage, then navigate back.
  //
  const handleLogout = () => {
    const doLogout = async () => {
      try {
        await AsyncStorage.removeItem('user');
      } catch (e) {
        console.warn('Could not remove user from AsyncStorage:', e);
      }
      navigation.goBack(); // or call onLogout if you passed that prop
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
      <ScrollView contentContainerStyle={styles.container}>

        {/* Rewards cards row */}
        <View style={styles.cardRow}>
          {/* Quiz card */}
          <View style={styles.infoCard}>
            <Text style={styles.cardTitle}>Quiz & Earn Points</Text>
            <Text style={styles.cardText}>
              Take the quiz and earn points to spend in our shop! You can win up to 100 points per quiz.
            </Text>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={takeQuiz}
            >
              {loadingQuiz
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.actionButtonText}>Take Quiz!</Text>
              }
            </TouchableOpacity>
          </View>

          {/* Study card */}
          <View style={styles.infoCard}>
            <Text style={styles.cardTitle}>Study for Your License</Text>
            <Text style={styles.cardText}>
              Prepare for your driver’s license test—just choose your country and start studying!
            </Text>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => navigation.navigate('StudyScreen')}
            >
              <Text style={styles.actionButtonText}>Study Now!</Text>
            </TouchableOpacity>
          </View>
        </View>
        {/* ========== Logout Button (top-right) ========== */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Quiz Modal */}
      <Modal
        visible={quizModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setQuizModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentLarge}>
            <Text style={styles.modalTitle}>Your Quiz</Text>
            <ScrollView style={{ flex: 1 }}>
              {questions.map((q, idx) => (
                <View key={q.id} style={styles.questionBlock}>
                  <Text style={styles.questionText}>{idx + 1}. {q.question}</Text>
                  {q.options.map(opt => {
                    const selected = answers[q.id] === opt.id;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[
                          styles.optionButton,
                          selected && styles.optionButtonSelected
                        ]}
                        onPress={() => selectOption(q.id, opt.id)}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            selected && styles.optionTextSelected
                          ]}
                        >
                          {opt.text}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.actionButton, { marginTop: 12 , width: '95%' }]}
              onPress={submitQuiz}
            >
              <Text style={styles.actionButtonText}>Submit Answers</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: '#777', marginTop: 8, width: '95%'  }]}
              onPress={() => setQuizModalVisible(false)}
            >
              <Text style={styles.actionButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      {/* Results Modal */}
      <Modal
        visible={resultsModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setResultsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentSmall}>
            <Text style={styles.modalTitle}>Quiz Results</Text>
            {quizResult && (
              <>
                <Text style={styles.resultText}>
                  You answered {quizResult.correct_count} of {quizResult.total_questions} correctly.
                </Text>
                <Text style={styles.resultText}>
                  You earned {quizResult.points_awarded} points!
                </Text>
              </>
            )}
            <TouchableOpacity
              style={[styles.actionButton, { marginTop: 16, width: 100 }]}
              onPress={() => setResultsModalVisible(false)}
            >
              <Text style={styles.actionButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: DARK,
  },

  container: {
    padding: 10,
    width: 400,
    marginTop: 10,
    alignSelf: 'center',
  },

  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginTop: 80,
  },

  infoCard: {
    flexBasis: '45%',
    backgroundColor: DARK_BLUE,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: BLACK_C,
  },

  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },

  cardText: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },

  actionButton: {
    backgroundColor: DARK,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BLACK_C,
  },

  actionButtonText: {
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

  modalContentLarge: {
    width: '80%',
    height: '80%',
    backgroundColor: DARK_BLUE,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: BLACK_C,
  },

  modalTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },

  questionBlock: {
    marginBottom: 16,
  },

  questionText: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 8,
    width: '95%',
  },

  optionButton: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 6,
    marginBottom: 6,
    width: '95%',
  },

  optionButtonSelected: {
    backgroundColor: DARK,
  },

  optionText: {
    fontSize: 14,
    color: DARK,
  },

  optionTextSelected: {
    color: '#fff',
  },

  /* Results Modal */
  modalContentSmall: {
    width: '80%',
    backgroundColor: DARK_BLUE,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BLACK_C,
  },

  resultText: {
    fontSize: 16,
    color: '#fff',
    marginVertical: 4,
    textAlign: 'center',
  },

  /* Logout Button */
  logoutButton: {
    position: 'absolute',
    top: 40,
    right: 13,
    backgroundColor: DARK_BLUE,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    zIndex: 10,
    borderColor: BLACK_C,
    borderWidth: 1,
  },

  logoutButtonText: {
    color: WHITE_C,
    fontSize: 14,
    fontWeight: '600',
  },
});
