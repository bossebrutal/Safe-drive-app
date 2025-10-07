import { InferenceSession } from 'onnxruntime-react-native';
import { Asset } from 'expo-asset'; // or `react-native-fs` if not using Expo

let session: InferenceSession | null = null;

/**
 * Asynchronously load the ONNX model from bundled assets.
 */
export async function createLaneSession(): Promise<InferenceSession> {
  if (session) return session;

  // Resolve the onnx asset
  const asset = Asset.fromModule(require('../../assets/models/lane_net.onnx'));
  await asset.downloadAsync();
  const modelPath = asset.localUri!; // local file URL on device

  // Create the ONNX InferenceSession
  session = await InferenceSession.create(modelPath, {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all'
  });
  return session;
}