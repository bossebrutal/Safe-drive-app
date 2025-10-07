import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Dimensions } from 'react-native';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import HomeScreen from '../screens/HomeScreen';
import ProfileScreen from '../screens/ProfileScreen';
import MyCarScreen from '../screens/MyCarScreen';
import NavScreen from '../screens/NavScreen';
import DriveRewardsScreen from '../screens/DriveRewardsScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';


const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const linking = {
  prefixes: ['safedriveapp://'],
  config: {
    screens: {
      Profile: 'profile',
      // ... andra screens
    },
  },
};

function MainTabs({ onLogout }: { onLogout: () => void }) {
  const [isLandscape, setIsLandscape] = useState(false);

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

   return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false, // Rätt property för att dölja labels
        tabBarActiveTintColor: '#111',
        tabBarInactiveTintColor: '#fff',
        tabBarStyle: [
          {
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
          },
          
          isLandscape
            ? {
                height: 45, // Lägre tabBar i landscape
                bottom: 4,  // Mindre marginal i landscape
                paddingBottom: 8,
                paddingTop: 8,
                flexDirection: 'row',
              }
            : {
                height: 64, // Standardhöjd i portrait
                bottom: 15,
                paddingBottom: 8,
                paddingTop: 8,
              },
        ],
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, string> = {
            Home: 'home',
            Profile: 'person',
            MyCar: 'car-sport',
            Nav: 'camera',
            Rewards: 'star',
          };
          const iconName = icons[route.name] || 'help-circle';
          return <Ionicons name={iconName} size={isLandscape ? 22 : 30}  color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: '' }} />
      <Tab.Screen name="Profile" options={{ title: '' }}>
        {(props) => <ProfileScreen {...props} onLogout={onLogout} />}
      </Tab.Screen>
      <Tab.Screen name="MyCar" component={MyCarScreen} options={{ title: '' }} />
      <Tab.Screen name="Nav" component={NavScreen} options={{ title: '' }} />
      <Tab.Screen name="Rewards" component={DriveRewardsScreen} options={{ title: '' }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const [user, setUser] = useState<any>(null);

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user === null ? (
          <>
            <Stack.Screen name="Login">
              {(props) => (
                <LoginScreen
                  {...props}
                  onLogin={(userData: any) => setUser(userData)}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          </>
        ) : (
          <Stack.Screen name="Main">
            {(props) => (
              <MainTabs
                {...props}
                onLogout={() => setUser(null)}
              />
            )}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}