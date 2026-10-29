import { useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import type { Direction } from '../db/types';
import { useI18n } from '../i18n';
import { photoUri, pickProofPhoto } from '../photos';
import { colors, font, radius } from '../theme';
import { daysUntil } from '../utils/dates';
import { Button, Label, Pill, Segmented, styles } from './ui';

export const DIRECTION_COLORS: Record<Direction, { fg: string; bg: string }> = {
  PAYABLE: { fg: colors.danger, bg: colors.dangerSoft },
  RECEIVABLE: { fg: colors.success, bg: colors.successSoft },
};

/** « Je lui dois » (rouge) / « Il me doit » (vert). */
export function DirectionSegment({ value, onChange, labels }: { value: Direction; onChange: (d: Direction) => void; labels?: Record<Direction, string> }) {
  const { t } = useI18n();
  const l = labels ?? { PAYABLE: t.iOweHim, RECEIVABLE: t.heOwesMe };
  return (
    <Segmented<Direction>
      options={[
        { value: 'PAYABLE', label: l.PAYABLE, color: colors.danger },
        { value: 'RECEIVABLE', label: l.RECEIVABLE, color: colors.success },
      ]}
      value={value}
      onChange={onChange}
    />
  );
}

/** Compteur de jours : en retard de N jours / à payer dans N jours. */
export function LateBadge({ due, rest }: { due: string | null; rest: number }) {
  const { t } = useI18n();
  if (rest <= 0 || !due) return null;
  const d = daysUntil(due);
  if (d < 0) return <Pill text={t.lateBy(-d)} tone="danger" />;
  if (d <= 7) return <Pill text={t.dueIn(d)} tone="warning" />;
  return null;
}

/** Vignettes de photos + visionneuse plein écran. */
export function PhotoStrip({ fileNames, onRemove }: { fileNames: string[]; onRemove?: (fileName: string) => void }) {
  const { t } = useI18n();
  const [viewing, setViewing] = useState<string | null>(null);
  if (!fileNames.length) return null;
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {fileNames.map((f) => (
          <Pressable key={f} onPress={() => setViewing(f)}>
            <Image source={{ uri: photoUri(f) }} style={{ width: 92, height: 92, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }} />
            {onRemove ? (
              <Pressable
                onPress={() => onRemove(f)}
                hitSlop={8}
                style={{ position: 'absolute', top: 4, end: 4, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: colors.white, fontWeight: '800' }}>✕</Text>
              </Pressable>
            ) : null}
          </Pressable>
        ))}
      </View>
      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 16, gap: 16 }}>
          {viewing ? <Image source={{ uri: photoUri(viewing) }} style={{ flex: 1 }} resizeMode="contain" /> : null}
          <Button label={t.close} variant="secondary" onPress={() => setViewing(null)} />
        </View>
      </Modal>
    </>
  );
}

/** Section photo dans un formulaire : les photos sont jointes à l'enregistrement. */
export function PhotoPicker({ value, onChange, label }: { value: string[]; onChange: (v: string[]) => void; label?: string }) {
  const { t } = useI18n();
  const add = async (source: 'camera' | 'gallery') => {
    const fileName = await pickProofPhoto(source);
    if (fileName) onChange([...value, fileName]);
  };
  return (
    <View style={styles.field}>
      <Label>{label ?? t.proofOptional}</Label>
      <PhotoStrip fileNames={value} onRemove={(f) => onChange(value.filter((x) => x !== f))} />
      <View style={styles.row}>
        <Button label={t.takePhoto} variant="secondary" size="md" style={{ flex: 1 }} onPress={() => add('camera')} />
        <Button label={t.fromGallery} variant="secondary" size="md" style={{ flex: 1 }} onPress={() => add('gallery')} />
      </View>
    </View>
  );
}

/** Ligne d'information « libellé : valeur » pour les fiches de détail. */
export function InfoRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={[styles.row, { justifyContent: 'space-between' }]}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={{ fontSize: font.md, fontWeight: '700', color: color ?? colors.text }}>{value}</Text>
    </View>
  );
}
