import NativeFieldwork from '../specs/NativeFieldwork';

export const fieldworkAvailable = NativeFieldwork !== null;

export function fieldwork() {
  if (!NativeFieldwork) {
    throw new Error('El almacenamiento de mediciones requiere Android.');
  }
  return NativeFieldwork;
}
