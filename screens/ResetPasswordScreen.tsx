import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, Platform } from 'react-native';

const API_BASE = 'https://docs.mysafedriveapp.org/docs';
const GREEN = '#8DA46D';

export default function ResetPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [sending, setSending] = useState(false);

  const showMessage = (title, msg) => {
    if (Platform.OS === 'web') alert(`${title}: ${msg}`);
    else Alert.alert(title, msg);
  };

  const handleReset = async () => {
    if (!email.includes('@')) {
      showMessage('Fel e-post', 'Skriv in en giltig e-postadress.');
      return;
    }
    if (code.length < 4) {
      showMessage('Fel kod', 'Skriv in den kod du fått via e-post.');
      return;
    }
    if (newPassword.length < 6) {
      showMessage('Fel lösenord', 'Lösenordet måste vara minst 6 tecken.');
      return;
    }
    setSending(true);
    try {
      const params = new URLSearchParams({
        email: email.trim(),
        code: code.trim(),
        new_password: newPassword,
      });
      const response = await fetch(`${API_BASE}/reset_password?${params.toString()}`, {
        method: 'POST',
      });
      const data = await response.json();
      if (response.ok) {
        showMessage('Klart!', data.message || 'Lösenordet är nu återställt.');
        navigation.navigate('Login');
      } else {
        showMessage('Fel', data.detail || 'Kunde inte återställa lösenord.');
      }
    } catch {
      showMessage('Nätverksfel', 'Kunde inte kontakta servern.');
    }
    setSending(false);
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#123524' }}>
      <Text style={{ color: '#fff', fontSize: 22, marginBottom: 20 }}>Återställ lösenord</Text>
      <TextInput
        placeholder="Din e-postadress"
        value={email}
        onChangeText={setEmail}
        style={{ width: '100%', backgroundColor: '#fff', borderRadius: 5, padding: 10, marginBottom: 12 }}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        placeholder="Kod från e-post"
        value={code}
        onChangeText={setCode}
        style={{ width: '100%', backgroundColor: '#fff', borderRadius: 5, padding: 10, marginBottom: 12 }}
        autoCapitalize="none"
        keyboardType="number-pad"
      />
      <TextInput
        placeholder="Nytt lösenord"
        value={newPassword}
        onChangeText={setNewPassword}
        style={{ width: '100%', backgroundColor: '#fff', borderRadius: 5, padding: 10, marginBottom: 16 }}
        secureTextEntry
      />
      <TouchableOpacity
        style={{
          backgroundColor: GREEN,
          paddingVertical: 8,
          paddingHorizontal: 16,
          borderRadius: 6,
          marginBottom: 10,
          opacity: sending ? 0.6 : 1,
        }}
        onPress={handleReset}
        disabled={sending}
      >
        <Text style={{ color: '#fff', fontWeight: 'bold' }}>
          {sending ? 'Byter...' : 'Byt lösenord'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={{ color: '#fff', marginTop: 8 }}>Avbryt</Text>
      </TouchableOpacity>
    </View>
  );
}