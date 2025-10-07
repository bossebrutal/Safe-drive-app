import * as SecureStore from 'expo-secure-store';

export async function fetchWithAuth(url: string, options: any = {}) {
  const token = await SecureStore.getItemAsync('access_token');
  const headers = {
    ...(options.headers || {}),
    'Authorization': token ? `Bearer ${token}` : '',
    'Content-Type': options.headers?.['Content-Type'] || 'application/json',
  };
  console.log('[fetchWithAuth]', url, headers.Authorization ? 'Token sent' : 'No token');
  return fetch(url, { ...options, headers });
}