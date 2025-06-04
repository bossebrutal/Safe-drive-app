// navigation/types.ts

import { NavigatorScreenParams } from '@react-navigation/native';

//
// 1A) “Tab” Param List: these are the five bottom‐tabs:
//
export type MainTabParamList = {
  Home: undefined;
  Profile: undefined;
  MyCar: undefined;
  Nav: undefined;
  Rewards: undefined;
};

//
// 1B) “Stack” Param List: we have an auth flow (Login/Register),
//     and once “logged in,” we show a “Main” screen that itself is
//     a set of bottom‐tabs. Notice that “Main” receives the
//     Tab navigator as its params via NavigatorScreenParams<>.
//
export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
};
