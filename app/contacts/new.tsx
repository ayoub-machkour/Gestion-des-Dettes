import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Btn, Chips, Field, Label, Screen, styles } from '../../src/components/ui';
import { getContact, saveContact } from '../../src/db/repo';
import type { ContactType } from '../../src/db/types';
import { useI18n } from '../../src/i18n';
import { useAppState } from '../../src/state';

const TYPES: ContactType[] = ['SUPPLIER', 'CUSTOMER', 'FAMILY_LENDER', 'EMPLOYEE', 'OTHER'];

/** Création, ou modification si ?id= est fourni. */
export default function ContactForm() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; type?: ContactType }>();
  const { t } = useI18n();
  const { done } = useAppState();
  const [name, setName] = useState('');
  const [type, setType] = useState<ContactType>(params.type ?? 'SUPPLIER');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;
    getContact(db, params.id).then((c) => {
      if (!c) return;
      setName(c.name);
      setType(c.type);
      setPhone(c.phone ?? '');
      setNotes(c.notes ?? '');
    });
  }, [db, params.id]);

  const submit = async () => {
    if (!name.trim()) return setError(t.required);
    await saveContact(db, { id: params.id, name, type, phone, notes });
    done();
    router.back();
  };

  return (
    <Screen>
      {params.id ? <Stack.Screen options={{ title: t.editContact }} /> : null}
      <Field label={t.name} value={name} onChangeText={(v) => (setName(v), setError(null))} placeholder={t.namePlaceholder} error={error} autoFocus={!params.id} />
      <View style={styles.field}>
        <Label>{t.type}</Label>
        <Chips options={TYPES.map((v) => ({ value: v, label: t.contactTypes[v] }))} value={type} onChange={setType} />
      </View>
      <Field label={t.phone} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="06 00 00 00 00" />
      <Field label={t.notes} value={notes} onChangeText={setNotes} multiline />
      <Btn label={t.save} onPress={submit} />
    </Screen>
  );
}
