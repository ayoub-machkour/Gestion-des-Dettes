import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { addAttachment, deleteAttachment, listAttachments } from '../db/repo';
import type { Attachment, EntityType } from '../db/types';
import { useI18n } from '../i18n';
import { pickProofPhoto } from '../photos';
import { useAppState } from '../state';
import { PhotoStrip } from './domain';
import { Button, Card, styles } from './ui';

/** Photos justificatives d'une opération existante : ajout (caméra / galerie), visionneuse, suppression. */
export function PhotoProofs({ entityType, entityId }: { entityType: EntityType; entityId: string }) {
  const db = useSQLiteContext();
  const { t } = useI18n();
  const { version, refresh } = useAppState();
  const [items, setItems] = useState<Attachment[]>([]);

  useEffect(() => {
    listAttachments(db, entityType, entityId).then(setItems);
  }, [db, entityType, entityId, version]);

  const add = async (source: 'camera' | 'gallery') => {
    const fileName = await pickProofPhoto(source);
    if (!fileName) return;
    await addAttachment(db, entityType, entityId, fileName);
    refresh();
  };

  const remove = (fileName: string) => {
    const attachment = items.find((a) => a.file_name === fileName);
    if (!attachment) return;
    Alert.alert(t.deletePhotoConfirm, '', [
      { text: t.cancel, style: 'cancel' },
      { text: t.delete, style: 'destructive', onPress: () => deleteAttachment(db, attachment).then(() => refresh()) },
    ]);
  };

  return (
    <Card>
      <Text style={[styles.body, { fontWeight: '700' }]}>{t.proofs}</Text>
      {items.length ? (
        <PhotoStrip fileNames={items.map((a) => a.file_name)} onRemove={remove} />
      ) : (
        <Text style={styles.muted}>{t.noPhotos}</Text>
      )}
      <View style={styles.row}>
        <Button label={t.takePhoto} variant="secondary" size="md" style={{ flex: 1 }} onPress={() => add('camera')} />
        <Button label={t.fromGallery} variant="secondary" size="md" style={{ flex: 1 }} onPress={() => add('gallery')} />
      </View>
    </Card>
  );
}
