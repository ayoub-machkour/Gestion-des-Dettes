import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Button, CalendarButton, Empty, MenuButton, Pill, styles } from '../src/components/ui';
import { countDueInstruments, listContacts } from '../src/db/repo';
import type { ContactWithBalance } from '../src/db/types';
import { useI18n } from '../src/i18n';
import { contactTypeLabel } from '../src/labels';
import { useAppState } from '../src/state';
import { colors, font, radius, shadow } from '../src/theme';
import { formatMoney } from '../src/utils/money';

/** Accueil : la liste des personnes avec qui on travaille, et un seul bouton pour en ajouter. */
export default function Home() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { version } = useAppState();
  const [people, setPeople] = useState<ContactWithBalance[] | null>(null);
  const [search, setSearch] = useState('');
  const [dueCount, setDueCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      listContacts(db).then(setPeople);
      countDueInstruments(db).then(setDueCount);
    }, [db, version]),
  );

  const visible = (people ?? []).filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <FlatList
        data={visible}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 130, gap: 12 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 18, marginBottom: 6 }}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.sm, fontWeight: '700', color: colors.primary, letterSpacing: 0.5 }}>{t.appName}</Text>
                <Text style={styles.title}>{t.people}</Text>
                {people?.length ? <Text style={styles.muted}>{t.peopleCount(people.length)}</Text> : null}
              </View>
              <View style={[styles.row, { gap: 10 }]}>
                <CalendarButton badge={dueCount} onPress={() => router.push('/instruments')} />
                <MenuButton onPress={() => router.push('/menu')} />
              </View>
            </View>
            {(people?.length ?? 0) > 4 ? (
              <TextInput style={styles.input} value={search} onChangeText={setSearch} placeholder={t.search} placeholderTextColor={colors.muted} />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          people === null ? undefined : people.length ? (
            <Empty title={t.noResults} />
          ) : (
            <Empty title={t.emptyPeopleTitle} text={t.emptyPeopleText} />
          )
        }
        renderItem={({ item }) => <PersonCard person={item} onPress={() => router.push(`/contacts/${item.id}`)} />}
      />
      <View style={{ position: 'absolute', start: 20, end: 20, bottom: insets.bottom + 18 }}>
        <Button label={t.addPerson} onPress={() => router.push('/contacts/new')} style={shadow} />
      </View>
    </View>
  );
}

function PersonCard({ person, onPress }: { person: ContactWithBalance; onPress: () => void }) {
  const { t, lang } = useI18n();
  const late = Math.max(person.late_payable ?? 0, person.late_receivable ?? 0);
  const balances: { label: string; amount: number; color: string }[] = [];
  if (person.payable > 0) balances.push({ label: t.iOwe, amount: person.payable, color: colors.danger });
  if (person.receivable > 0) balances.push({ label: t.owesMe, amount: person.receivable, color: colors.success });

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, styles.row, { paddingVertical: 16, borderRadius: radius.lg }, pressed && styles.pressed]}>
      <Avatar name={person.name} size={52} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: font.md + 1, fontWeight: '700', color: colors.text }} numberOfLines={1}>
          {person.name}
        </Text>
        <View style={[styles.row, { gap: 6 }]}>
          <Text style={styles.muted}>{contactTypeLabel(t, person)}</Text>
          {late > 0 ? <Pill text={t.lateBy(late)} tone="danger" /> : null}
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        {balances.length ? (
          balances.map((b) => (
            <View key={b.label} style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: font.xs, fontWeight: '600', color: b.color }}>{b.label}</Text>
              <Text style={{ fontSize: font.md, fontWeight: '800', color: b.color }}>{formatMoney(b.amount, lang)}</Text>
            </View>
          ))
        ) : (
          <Text style={{ fontSize: font.sm, fontWeight: '600', color: colors.muted }}>{t.settled}</Text>
        )}
      </View>
    </Pressable>
  );
}
