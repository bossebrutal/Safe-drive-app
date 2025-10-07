import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, Platform } from 'react-native';

const API_BASE = 'https://docs.mysafedriveapp.org/docs';
const GREEN = '#8DA46D';

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  const showMessage = (title, msg) => {
    if (Platform.OS === 'web') alert(`${title}: ${msg}`);
    else Alert.alert(title, msg);
  };

  const handleSendCode = async () => {
    if (!email.includes('@')) {
      showMessage('Fel e-post', 'Skriv in en giltig e-postadress.');
      return;
    }
    setSending(true);
    try {
      const response = await fetch(`${API_BASE}/forgot_password?email=${encodeURIComponent(email.trim())}`, {
        method: 'POST',
      });
      const data = await response.json();
      if (response.ok) {
        showMessage('Kod skickad', data.message || 'En kod har skickats till din e-post.');
        navigation.goBack();
      } else {
        showMessage('Fel', data.detail || 'Kunde inte skicka kod.');
      }
    } catch {
      showMessage('Nätverksfel', 'Kunde inte kontakta servern.');
    }
    setSending(false);
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#123524' }}>
      <Text style={{ color: '#fff', fontSize: 22, marginBottom: 20 }}>Glömt lösenord</Text>
      <TextInput
        placeholder="Din e-postadress"
        value={email}
        onChangeText={setEmail}
        style={{ width: '100%', backgroundColor: '#fff', borderRadius: 5, padding: 10, marginBottom: 16 }}
        autoCapitalize="none"
        keyboardType="email-address"
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
        onPress={handleSendCode}
        disabled={sending}
      >
        <Text style={{ color: '#fff', fontWeight: 'bold' }}>
          {sending ? 'Skickar...' : 'Skicka kod'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={{ color: '#fff', marginTop: 8 }}>Avbryt</Text>
      </TouchableOpacity>
    </View>
  );
}