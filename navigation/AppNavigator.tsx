// AppNavigator.tsx
import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import {
  createBottomTabNavigator
} from '@react-navigation/bottom-tabs';
import {
  createNativeStackNavigator
} from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import LoginScreen          from '../screens/LoginScreen';
import RegisterScreen       from '../screens/RegisterScreen';
import HomeScreen           from '../screens/HomeScreen';
import ProfileScreen        from '../screens/ProfileScreen';
import MyCarScreen          from '../screens/MyCarScreen';
import NavScreen            from '../screens/NavScreen';
import DriveRewardsScreen   from '../screens/DriveRewardsScreen';

//
// 1) Create two navigators WITHOUT forcing <any> or wrong names:
//
//    - Stack has routes "Login", "Register", "Main"
//    - Tabs has routes "Home", "Profile", "MyCar", "Nav", "Rewards"
//

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

//
// 2) MainTabs: the bottom‐tab navigator that appears once the user is logged in.
//    We pass an onLogout callback if the HomeScreen (or any child) needs to log out.
//
function MainTabs({ onLogout }: { onLogout: () => void }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#111',
        tabBarInactiveTintColor: '#fff',
        tabBarStyle: {
          backgroundColor: '#2f4f4f',
          borderColor: '#111',
          borderWidth: 1,
        },
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, string> = {
            Home:    'home',
            Profile: 'person',
            MyCar:   'car-sport',
            Nav:     'navigate',
            Rewards: 'star',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home">
        {(props) => <HomeScreen {...props} onLogout={onLogout} />}
      </Tab.Screen>

      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />

      <Tab.Screen
        name="MyCar"
        component={MyCarScreen}
        options={{ title: 'My Car' }}
      />

      <Tab.Screen
        name="Nav"
        component={NavScreen}
        options={{ title: 'Navigate' }}
      />

      <Tab.Screen
        name="Rewards"
        component={DriveRewardsScreen}
        options={{ title: 'Rewards' }}
      />
    </Tab.Navigator>
  );
}

//
// 3) AppNavigator: the top‐level stack that shows either Login/Register or the MainTabs
//
export default function AppNavigator() {
  const [user, setUser] = useState<any>(null);

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user === null ? (
          // AUTH FLOW
          <>
            <Stack.Screen name="Login">
              {(props) => (
                <LoginScreen
                  {...props}
                  onLogin={(userData: any) => setUser(userData)}
                />
              )}
            </Stack.Screen>

            <Stack.Screen
              name="Register"
              component={RegisterScreen}
            />
          </>
        ) : (
          // MAIN APP FLOW
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
