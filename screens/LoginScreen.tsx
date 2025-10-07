import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Image, Alert, Platform, Switch, TouchableOpacity }  from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { fetchWithAuth } from '../utils/api';
import { Modal } from 'react-native';

const API_BASE = 'https://docs.mysafedriveapp.org/docs';
const GREEN = '#8DA46D';
const DARK = '#123524';
const GREY = '#777';
const DARK_BLUE = '#2f4f4f';
const WHITE_C = '#fff';
const BLACK_C = '#111';

type LoginScreenProps = {
  navigation: any;
  onLogin: (userData: any) => void;
};

const showMessage = (title: string, msg: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  };

export default function LoginScreen({ navigation, onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [emailFocused, setEmailFocused]       = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  
  useEffect(() => {
    async function loadRememberedCredentials() {
      try {
        const savedEmail = await AsyncStorage.getItem('rememberedEmail');
        const savedPassword = await AsyncStorage.getItem('rememberedPassword');
        if (savedEmail && savedPassword) {
          setEmail(savedEmail);
          setPassword(savedPassword);
          setRememberMe(true);
          console.log('🔁 Loaded remembered credentials from AsyncStorage');
        }
      } catch (e) {
        console.warn('Could not load remembered credentials:', e);
      }
    }
    loadRememberedCredentials();
  }, []);

  const handleLogin = async () => {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    console.log("🔐 Attempting login...");
    console.log("📧 Email entered:", trimmedEmail);
    console.log("🔑 Password length:", trimmedPassword.length);

    if (!trimmedEmail.includes('@')) {
      showMessage("Invalid email", "Must include '@'.");
      return;
    }

    if (trimmedPassword.length < 6) {
      showMessage("Invalid password", "Must be at least 6 characters.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, password: trimmedPassword }),
      });

      if (response.ok) {
        const data = await response.json();
        const me = {
          id:        data.user_id,
          firstname: data.firstname,
          lastname:  data.lastname,
          token:     data.access_token,
        };

        try {
          await AsyncStorage.setItem('user', JSON.stringify(me));
          await SecureStore.setItemAsync('access_token', data.access_token);
          console.log('✅ Stored user in AsyncStorage:', me);
        } catch (e) {
          console.warn('Could not store user in AsyncStorage:', e);
        }

      if (rememberMe) {
          try {
            await AsyncStorage.setItem('rememberedEmail', trimmedEmail);
            await AsyncStorage.setItem('rememberedPassword', trimmedPassword);
          } catch (e) {
            console.warn('Could not store remembered credentials:', e);
          }
        } else {
          try {
            await AsyncStorage.removeItem('rememberedEmail');
            await AsyncStorage.removeItem('rememberedPassword');
          } catch (e) {
            console.warn('Could not remove remembered credentials:', e);
          }
        }

        onLogin(me);
      } else {
        const error = await response.json();
        console.warn("Login failed:", error);
        showMessage("Error", error.detail || 'Invalid credentials');
      }
    } catch (err) {
      console.error("Network error:", err);
      const message = err instanceof Error ? err.message : 'An unknown error occurred.';
      showMessage('Network error', message);
    }
  };

  const handleForgotPassword = async () => {
    const trimmedEmail = forgotEmail.trim();
    if (!trimmedEmail.includes('@')) {
      showMessage("Fel e-post", "Skriv in en giltig e-postadress.");
      return;
    }
    setSendingCode(true);
    try {
      const response = await fetch(`${API_BASE}/forgot_password?email=${encodeURIComponent(trimmedEmail)}`, {
        method: 'POST',
      });
      const data = await response.json();
      if (response.ok) {
        showMessage("Kod skickad", data.message || "En kod har skickats till din e-post.");
        setForgotModalVisible(false);
        setForgotEmail('');
      } else {
        showMessage("Fel", data.detail || "Kunde inte skicka kod.");
      }
    } catch (err) {
      showMessage("Nätverksfel", "Kunde inte kontakta servern.");
    }
    setSendingCode(false);
  };

  return (
    <View style={styles.background}>
      <View style={styles.container}>
        <Image
          source={require('../assets/images/CarWardsLogo1.png')}
          style={{ width: 250, height: 250, marginBottom: 20 }}
        />

        <TextInput
          placeholder="Email"
          placeholderTextColor="#444"
          value={email}
          onChangeText={setEmail}
          style={[styles.input, emailFocused && styles.inputFocused]}
          onFocus={() => setEmailFocused(true)}
          onBlur={()  => setEmailFocused(false)}
        />

        <TextInput
          placeholder="Password"
          placeholderTextColor="#444"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={[styles.input, passwordFocused && styles.inputFocused]}
          onFocus={() => setPasswordFocused(true)}
          onBlur={()  => setPasswordFocused(false)}
        />

        <View style={styles.rememberMeRow}>
          <Text style={{ marginRight: 8 }}>Remember Me</Text>
          <Switch
            value={rememberMe}
            onValueChange={setRememberMe}
          />
        </View>
  
        <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
          <Text style={styles.loginButtonText}>Login</Text>
        </TouchableOpacity>

        <Text style={styles.signupText}> You dont have an account? {'\n'} Singup here!</Text>

        <TouchableOpacity style={styles.registerButton} onPress={() => navigation.navigate('Register')}>
          <Text style={styles.registerButtonText}>Register Account</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
          <Text style={{ color: '#fff', marginBottom: 10, textDecorationLine: 'underline' }}>
            Glömt lösenord?
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('ResetPassword')}>
          <Text style={{ color: '#fff', marginBottom: 10, textDecorationLine: 'underline' }}>
            Har du redan en kod? Byt lösenord här!
          </Text>
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
    backgroundColor: '#123524',
  },
  container: {
    padding: 25,
    marginTop: 70,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 30,
  },
  input: {
    width: '80%',
    padding: 10,
    borderWidth: 1,
    borderColor: BLACK_C,
    borderRadius: 5,
    marginBottom: 15,
    backgroundColor: WHITE_C,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}),
  },
  inputFocused: {
    borderColor: WHITE_C,
    ...(Platform.OS === 'web'
      ? {
          outlineColor: DARK_BLUE,
          outlineStyle: 'solid' as any,
          outlineWidth: 3,
        }
      : {}),
  },
  rememberMeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  loginButton: {
    backgroundColor: DARK_BLUE,
    width: '60%',
    alignContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginVertical: 8,
    zIndex: 10,
    borderWidth: 1,
    borderColor: BLACK_C,
  },
  loginButtonText: {
    color: WHITE_C,
    fontSize: 16,
    fontWeight: '500',
  },
  signupText: {
    color: WHITE_C,
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    lineHeight: 22,
  },
  registerButton: {
    backgroundColor: GREY,
    width: '60%',
    alignContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginVertical: 15,
    zIndex: 10,
    borderWidth: 1,
    borderColor: BLACK_C,
  },
  registerButtonText: {
    color: WHITE_C,
    fontSize: 16,
    fontWeight: '500',
  },
});
