import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

const proofsDir = () => new Directory(Paths.document, 'proofs');

export function photoUri(fileName: string): string {
  return new File(proofsDir(), fileName).uri;
}

/** Prend une photo (caméra) ou en choisit une (galerie), et la copie dans le stockage privé de l'app. */
export async function pickProofPhoto(source: 'camera' | 'gallery'): Promise<string | null> {
  const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, exif: false };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;

  const dir = proofsDir();
  dir.create({ idempotent: true, intermediates: true });
  const fileName = `${randomUUID()}.jpg`;
  await new File(result.assets[0].uri).copy(new File(dir, fileName));
  return fileName;
}

/** Supprime les photos qui ne sont plus référencées (ni par une opération, ni par une annulation possible). */
export function cleanupOrphanPhotos(keep: Set<string>) {
  const dir = proofsDir();
  if (!dir.exists) return;
  for (const item of dir.list()) {
    if (item instanceof File && !keep.has(item.name)) {
      try {
        item.delete();
      } catch {
        // Fichier verrouillé : on réessaiera au prochain démarrage.
      }
    }
  }
}
