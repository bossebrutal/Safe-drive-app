// MyCarScreen.tsx
import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Platform,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithAuth } from '../utils/api';


type Car = { id: number; name: string; brand?: string; model?: string; color?: string; year?: number; };

const API_BASE = 'https://docs.mysafedriveapp.org/docs';
const GREEN = '#8DA46D';
const DARK = '#123524';
const GREY = '#777';
const DARK_BLUE = '#2f4f4f';
const WHITE_C = '#fff';
const BLACK_C = '#111';


const showMessage = (title: string, msg: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${msg}`);
  } else {
    Alert.alert(title, msg);
  }
};

export default function MyCarScreen() {
  const [cars, setCars]             = useState<Car[]>([]);
  const [loading, setLoading]       = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCarId, setEditingCarId] = useState<number | null>(null);

  const initialForm = { name:'', brand:'', model:'', color:'', year:'' };
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    const loadCars = async () => {
      setLoading(true);
      try {
        const storedJson = await AsyncStorage.getItem('user');
        if (!storedJson) {
          setLoading(false);
          return;
        }
        const me = JSON.parse(storedJson) as { id: number };
        const res = await fetchWithAuth(`${API_BASE}/users/${me.id}/cars`);
        if (!res.ok) throw new Error(res.statusText);
        const data: Car[] = await res.json();
        setCars(data);
      } catch (err) {
        console.error('Error loading cars:', err);
        showMessage('Error', 'Could not load cars.');
      } finally {
        setLoading(false);
      }
    };

    loadCars();
  }, []);

  const openAddModal = () => {
    setEditingCarId(null);
    setForm(initialForm);
    setModalVisible(true);
  };
  const openEditModal = (car: Car) => {
    setEditingCarId(car.id);
    setForm({
      name:  car.name,
      brand: car.brand  || '',
      model: car.model  || '',
      color: car.color  || '',
      year:   car.year?.toString() || '',
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    // 1) Front-end validation for _every_ field
    const missing = (Object.entries(form) as [string,string][])
      .filter(([_, val]) => val.trim().length === 0)
      .map(([key]) => key);

    if (missing.length > 0) {
      return showMessage(
        'Validation Error',
        `Please fill in: ${missing.join(', ')}`
      );
    }

    // 2) Year must be an integer
    const yearInt = parseInt(form.year, 10);
    if (isNaN(yearInt)) {
      return showMessage('Validation Error', 'Year must be a whole number.');
    }

 // 3) Build payload and send
    try {
      const storedJson = await AsyncStorage.getItem('user');
      if (!storedJson) {
        showMessage('Error', 'No user logged in.');
        return;
      }
      const me = JSON.parse(storedJson) as { id: number };

      const payload: any = {
        user_id: me.id,
        name: form.name.trim(),
        brand: form.brand.trim(),
        model: form.model.trim(),
        color: form.color.trim(),
        year: yearInt,
      };

      let res;
      let resultCar: Car;
      if (editingCarId !== null) {
        // EDIT
        res = await fetchWithAuth(`${API_BASE}/cars/${editingCarId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(res.statusText);
        resultCar = (await res.json()) as Car;
        setCars((cs) => cs.map((c) => (c.id === editingCarId ? resultCar : c)));
        showMessage('Car updated', `${resultCar.name} updated!`);
      } else {
        // ADD
        res = await fetchWithAuth(`${API_BASE}/cars`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(res.statusText);
        resultCar = (await res.json()) as Car;
        setCars((cs) => [...cs, resultCar]);
        showMessage('Car added', `${resultCar.name} added to cars!`);
      }

      setModalVisible(false);
      setEditingCarId(null);
      setForm(initialForm);
    } catch (err) {
      console.error('Error saving car:', err);
      showMessage('Error', 'Could not save car.');
    }
  };

  const confirmDelete = (car: Car) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`You sure you want to delete "${car.name}"?`)) {
        handleDelete(car.id);
      }
    } else {
      Alert.alert(
        'Delete Car',
        `You sure you want to delete "${car.name}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Yes', onPress: () => handleDelete(car.id) },
        ]
      );
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/cars/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(res.statusText);
      setCars((cs) => cs.filter((c) => c.id !== id));
      showMessage('Car deleted', 'The car has been removed.');
    } catch (err) {
      console.error('Error deleting car:', err);
      showMessage('Error', 'Could not delete car.');
    }
  };

  return (
    <SafeAreaView style={styles.background}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>My Cars</Text>
        {loading ? (
          <Text style={styles.loadingText}>Loading…</Text>
        ) : cars.length === 0 ? (
          <Text style={styles.loadingText}>No cars yet.</Text>
        ) : (
          cars.map(car => (
            <View key={car.id} style={styles.infoCard}>
              {(['Name','Brand','Model','Color','Year'] as const).map(label => {
                const val = (car as any)[label.toLowerCase()] ?? '—';
                return (
                  <View key={label} style={styles.infoRow}>
                    <Text style={styles.infoLabel}>{label}:</Text>
                    <Text style={styles.infoValue}>{val}</Text>
                  </View>
                );
              })}
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => openEditModal(car)}
                >
                  <Text style={styles.buttonText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => confirmDelete(car)}
                >
                  <Text style={styles.buttonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
          <Text style={styles.addButtonText}>+ Add Car</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Add/Edit Modal (unchanged) */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingCarId !== null ? 'Edit Car' : 'Add New Car'}
            </Text>
            {(['name','brand','model','color','year'] as const).map(field => (
              <TextInput
                key={field}
                placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                value={form[field]}
                onChangeText={val => setForm(f => ({ ...f, [field]: val }))}
                style={styles.modalInput}
                keyboardType={field === 'year' ? 'numeric' : 'default'}
                placeholderTextColor="#666"
              />
            ))}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonSave}
                onPress={handleSubmit}
              >
                <Text style={styles.modalButtonText}>
                  {editingCarId !== null ? 'Update' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
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
  background: { flex: 1, backgroundColor: '#123524' },
  scrollContent: { padding: 20, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '600', color: '#fff', marginBottom: 20 },
  loadingText: { color: '#fff', marginBottom: 20 },

  infoCard: {
    width: '100%',
    maxWidth: 200,
    backgroundColor: DARK_BLUE,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BLACK_C,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  infoLabel: { fontSize: 16, fontWeight: '600', color: BLACK_C },
  infoValue: { fontSize: 16, color: WHITE_C },

  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  editButton: {
    flex: 1,
    marginRight: 8,
    backgroundColor: '#123524',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BLACK_C,
  },
  deleteButton: {
    flex: 1,
    marginLeft: 8,
    backgroundColor: '#FF3B30',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BLACK_C,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '500',
  },

  addButton: {
    backgroundColor: DARK_BLUE,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: BLACK_C,
  },
  addButtonText: {
    color: '#fff', 
    fontSize: 16, 
    fontWeight: '500' 
  },

  /* Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '100%',
    maxWidth: 300,
    backgroundColor: DARK_BLUE,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: BLACK_C,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
    color: '#fff',
  },
  modalInput: {
    width: '100%',
    borderWidth: 2,
    borderColor: BLACK_C,
    borderRadius: 6,
    padding: 8,
    marginBottom: 12,
    backgroundColor: WHITE_C,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  modalButtonCancel: {
    flex: 1,
    marginRight: 8,
    backgroundColor: '#777',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BLACK_C,
  },
  modalButtonSave: {
    flex: 1,
    marginLeft: 8,
    backgroundColor: '#123524',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BLACK_C,
  },
  modalButtonText: { color: WHITE_C, fontSize: 16, fontWeight: '500' },
});
