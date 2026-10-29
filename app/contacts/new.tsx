import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Button, Chips, Field, Label, Screen, styles } from '../../src/components/ui';
import { addContactType, deleteContact, getContact, listContactTypes, saveContact } from '../../src/db/repo';
import type { ContactType } from '../../src/db/types';
import { useI18n } from '../../src/i18n';
import { useAppState } from '../../src/state';

const TYPES: ContactType[] = ['SUPPLIER', 'CUSTOMER', 'EMPLOYEE', 'FAMILY_LENDER', 'OTHER'];
/** Valeur d'une puce : type de base, ou « custom:Nom » pour un type personnalisé. */
const CUSTOM = 'custom:';

/** Nouvelle personne (nom + type), ou modification / suppression si ?id= est fourni. */
export default function PersonForm() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { t } = useI18n();
  const { refresh } = useAppState();
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('SUPPLIER');
  const [customTypes, setCustomTypes] = useState<string[]>([]);
  const [addingType, setAddingType] = useState(false);
  const [newType, setNewType] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listContactTypes(db).then(setCustomTypes);
    if (!params.id) return;
    getContact(db, params.id).then((c) => {
      if (!c) return;
      setName(c.name);
      setType(c.type_label ? CUSTOM + c.type_label : c.type);
    });
  }, [db, params.id]);

  const addType = async () => {
    const label = newType.trim();
    if (!label) return;
    await addContactType(db, label);
    setCustomTypes(await listContactTypes(db));
    setType(CUSTOM + label);
    setNewType('');
    setAddingType(false);
  };

  const submit = async () => {
    if (!name.trim()) return setError(t.required);
    const custom = type.startsWith(CUSTOM) ? type.slice(CUSTOM.length) : null;
    const id = await saveContact(db, { id: params.id, name, type: custom ? 'OTHER' : (type as ContactType), typeLabel: custom });
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
        <Chips
          options={[
            ...TYPES.map((v) => ({ value: v as string, label: t.contactTypes[v] })),
            ...customTypes.map((c) => ({ value: CUSTOM + c, label: `🏷️ ${c}` })),
          ]}
          value={type}
          onChange={(v) => v && setType(v)}
        />
        {addingType ? (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field value={newType} onChangeText={setNewType} placeholder={t.newTypePlaceholder} autoFocus onSubmitEditing={addType} returnKeyType="done" />
            </View>
            <Button label={t.addType} variant="soft" onPress={addType} style={{ minHeight: 56 }} />
          </View>
        ) : (
          <Button label={t.otherType} variant="ghost" size="md" onPress={() => setAddingType(true)} style={{ alignSelf: 'flex-start' }} />
        )}
      </View>
      {params.id ? <Button label={t.deletePerson} variant="danger" size="md" onPress={askDelete} style={{ marginTop: 24 }} /> : null}
    </Screen>
  );
}
