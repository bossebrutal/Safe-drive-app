import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, Platform, TouchableOpacity } from 'react-native';

const API_BASE = 'https://docs.mysafedriveapp.org/docs';
const GREEN = '#8DA46D';
const DARK = '#123524';
const GREY = '#777';
const DARK_BLUE = '#2f4f4f';
const WHITE_C = '#fff';
const BLACK_C = '#111';

type FormFields = {
  firstname: string;
  lastname: string;
  gender: string;
  age: string;
  email: string;
  password: string;
};

const showMessage = (title: string, msg: string) => {
  if (Platform.OS === 'web') {
    alert(`${title}: ${msg}`);
  } else {
    Alert.alert(title, msg);
  }
};

export default function RegisterScreen({ navigation }: any) {
  const [form, setForm] = useState<FormFields>({
    firstname: '',
    lastname: '',
    gender: '',
    age: '',
    email: '',
    password: '',
  });

  const handleChange = (name: keyof FormFields, value: string) => {
    console.log(`🖊️ Updated ${name}: ${value}`);
    setForm({ ...form, [name]: value });
  };
    
  

  const handleRegister = async () => {
    console.log("🔄 handleRegister triggered");

    const trimmed = {
        ...form,
        firstname: form.firstname.trim(),
        lastname: form.lastname.trim(),
        gender: form.gender.trim(),
        email: form.email.trim(),
        password: form.password.trim(),
    };

    console.log("📤 Trimmed form values:", trimmed);

    if (trimmed.firstname.length < 2) {
      showMessage("First name too short", "Must be at least 2 characters.");
      return;
    }
    if (trimmed.lastname.length < 2) {
      showMessage("Last name too short", "Must be at least 2 characters.");
      return;
    }
    if (!form.age || isNaN(parseInt(form.age))) {
      showMessage("Invalid age", "Please enter a valid number.");
      return;
    }
    if (!trimmed.email.includes("@")) {
      showMessage("Invalid email", "Must include @.");
      return;
    }
    if (trimmed.password.length < 6) {
      showMessage("Password too short", "Must be at least 6 characters.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...trimmed, age: parseInt(form.age) }),
      });

      console.log("📡 Sent request to backend...");

      if (response.ok) {
        const data = await response.json();
        showMessage('Registered!', `Welcome, ${data.firstname}!`);
        navigation.navigate('Login');
      } else {
        const error = await response.json();
        console.warn("❌ Registration failed:", error);
        showMessage('Error', error.detail || 'Something went wrong.');
      }
    } catch (err) {
      console.error("🌐 Network error:", err);
      const message = err instanceof Error ? err.message : 'An unknown error occurred.';
      showMessage('Network error', message);
    }
  };


  return (
    <View style={styles.background}>
      <View style={styles.container}>
        <Text style={styles.heading}>Register Account</Text>
        {(Object.keys(form) as (keyof FormFields)[]).map((field) => (
          <TextInput
            key={field}
            value={form[field]}
            style={styles.input}
            placeholder={field}
            secureTextEntry={field === 'password'}
            keyboardType={field === 'age' ? 'numeric' : 'default'}
            onChangeText={(value) => handleChange(field, value)}
          />
        ))}

        <TouchableOpacity style={styles.handleregisterButton} onPress={handleRegister}>
          <Text style={styles.handleregisterButtonText}>Register</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backtologinButton} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.backtologinButtonText}>Back to login</Text>
        </TouchableOpacity>

      </View>
      <View style={{
        position: 'absolute',
        bottom: 18,
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
  background: { 
    flex: 1, 
    backgroundColor: '#123524' 
  },
  container: {
    alignItems: 'center', 
    padding: 20, 
    marginTop: 50 
  },
  heading: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    marginBottom: 20,
    color: WHITE_C,
  },
  input: {
    width: '80%',
    padding: 10,
    borderWidth: 2,
    borderColor: '#123524',
    borderRadius: 5,
    marginBottom: 15,
    backgroundColor: WHITE_C,
  },
  handleregisterButton: {
    backgroundColor: DARK_BLUE,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginVertical: 15,
    zIndex: 10,
    borderWidth: 1,
    borderColor: BLACK_C,
  },
  handleregisterButtonText: {
    justifyContent: 'center',
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  backtologinButton: {
    backgroundColor: DARK_BLUE,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginVertical: 15,
    zIndex: 10,
    borderWidth: 1,
    borderColor: BLACK_C,
  },
  backtologinButtonText: {
    justifyContent: 'center',
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});
