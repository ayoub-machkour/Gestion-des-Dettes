import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Button, Chips, Field, Label, Screen, styles } from '../../src/components/ui';
import { deleteContact, getContact, saveContact } from '../../src/db/repo';
import type { ContactType } from '../../src/db/types';
import { useI18n } from '../../src/i18n';
import { useAppState } from '../../src/state';

const TYPES: ContactType[] = ['SUPPLIER', 'CUSTOMER', 'EMPLOYEE', 'FAMILY_LENDER', 'OTHER'];

/** Nouvelle personne (nom + type), ou modification / suppression si ?id= est fourni. */
export default function PersonForm() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { t } = useI18n();
  const { refresh } = useAppState();
  const [name, setName] = useState('');
  const [type, setType] = useState<ContactType>('SUPPLIER');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;
    getContact(db, params.id).then((c) => {
      if (!c) return;
      setName(c.name);
      setType(c.type);
    });
  }, [db, params.id]);

  const submit = async () => {
    if (!name.trim()) return setError(t.required);
    const id = await saveContact(db, { id: params.id, name, type });
    refresh();
    if (params.id) router.back();
    else router.replace(`/contacts/${id}`);
  };

  const askDelete = () =>
    Alert.alert(t.deletePerson, t.deletePersonConfirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete,
        style: 'destructive',
        onPress: async () => {
          await deleteContact(db, params.id!);
          refresh();
          router.dismissAll();
        },
      },
    ]);

  return (
    <Screen footer={<Button label={t.save} onPress={submit} />}>
      {params.id ? <Stack.Screen options={{ title: t.editPerson }} /> : null}
      <Field
        label={t.name}
        value={name}
        onChangeText={(v) => (setName(v), setError(null))}
        placeholder={t.namePlaceholder}
        error={error}
        autoFocus={!params.id}
        style={{ fontSize: 20, minHeight: 62 }}
      />
      <View style={styles.field}>
        <Label>{t.type}</Label>
        <Chips options={TYPES.map((v) => ({ value: v, label: t.contactTypes[v] }))} value={type} onChange={(v) => v && setType(v)} />
      </View>
      {params.id ? <Button label={t.deletePerson} variant="danger" size="md" onPress={askDelete} style={{ marginTop: 24 }} /> : null}
    </Screen>
  );
}
