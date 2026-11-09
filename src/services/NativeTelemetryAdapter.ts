import { PermissionsAndroid, Platform } from 'react-native';
import NativeTelemetry from '../specs/NativeTelemetry';

function native() {
  if (!NativeTelemetry) {
    throw Object.assign(new Error('Módulo de sensores no disponible'), {
      code: 'SENSOR_UNAVAILABLE',
    });
  }
  return NativeTelemetry;
}

export async function requestLocation(precise: boolean): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
  const coarse = PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION;
  const required = precise ? fine : coarse;
  if (await PermissionsAndroid.check(required)) {
    return true;
  }
  const permissions = await PermissionsAndroid.requestMultiple(
    precise ? [fine, coarse] : [coarse],
  );
  return permissions[required] === PermissionsAndroid.RESULTS.GRANTED;
}

export const telemetry = {
  read: () => native().readSensors(),
  stop: () => NativeTelemetry?.stopReading(),
  freeze: () => native().freezeCapture(),
  locate: () => native().locate(),
  stopLocating: () => NativeTelemetry?.stopLocating(),
};
