import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Image, Modal, Pressable, Text, View } from 'react-native';
import { addAttachment, deleteAttachment, listAttachments } from '../db/repo';
import type { Attachment, EntityType } from '../db/types';
import { useI18n } from '../i18n';
import { photoUri, pickProofPhoto } from '../photos';
import { useAppState } from '../state';
import { colors } from '../theme';
import { Btn, Card, styles } from './ui';

/** Photos justificatives d'une opération : prise de vue, galerie, plein écran, suppression (annulable). */
export function PhotoProofs({ entityType, entityId }: { entityType: EntityType; entityId: string }) {
  const db = useSQLiteContext();
  const { t } = useI18n();
  const { version, done } = useAppState();
  const [items, setItems] = useState<Attachment[]>([]);
  const [viewing, setViewing] = useState<Attachment | null>(null);

  useEffect(() => {
    listAttachments(db, entityType, entityId).then(setItems);
  }, [db, entityType, entityId, version]);

  const add = async (source: 'camera' | 'gallery') => {
    const fileName = await pickProofPhoto(source);
    if (!fileName) return;
    await addAttachment(db, entityType, entityId, fileName);
    done();
  };

  const remove = (a: Attachment) =>
    Alert.alert(t.deletePhotoConfirm, '', [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete,
        style: 'destructive',
        onPress: async () => {
          setViewing(null);
          await deleteAttachment(db, a);
          done(t.deleted);
        },
      },
    ]);

  return (
    <Card>
      <Text style={[styles.body, { fontWeight: '800' }]}>{t.photos}</Text>
      <Text style={styles.muted}>{t.photoHint}</Text>
      {items.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6 }}>
          {items.map((a) => (
            <Pressable key={a.id} onPress={() => setViewing(a)} onLongPress={() => remove(a)}>
              <Image source={{ uri: photoUri(a.file_name) }} style={{ width: 96, height: 96, borderRadius: 10, backgroundColor: colors.earthLight }} />
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={[styles.muted, { marginVertical: 6 }]}>{t.noPhotos}</Text>
      )}
      <View style={styles.row}>
        <Btn label={t.takePhoto} style={{ flex: 1 }} onPress={() => add('camera')} />
        <Btn label={t.fromGallery} variant="outline" style={{ flex: 1 }} onPress={() => add('gallery')} />
      </View>

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', padding: 12, gap: 12 }}>
          {viewing ? <Image source={{ uri: photoUri(viewing.file_name) }} style={{ flex: 1 }} resizeMode="contain" /> : null}
          <View style={styles.row}>
            <Btn label={t.close} style={{ flex: 2 }} onPress={() => setViewing(null)} />
            {viewing ? <Btn label={t.delete} variant="danger" style={{ flex: 1 }} onPress={() => remove(viewing)} /> : null}
          </View>
        </View>
      </Modal>
    </Card>
  );
}
