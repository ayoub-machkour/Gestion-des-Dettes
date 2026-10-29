import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { InstrumentCard } from '../../src/components/InstrumentCard';
import { Btn, Chips, Empty, Screen, SectionTitle } from '../../src/components/ui';
import { listInstruments, setInstrumentStatus } from '../../src/db/repo';
import type { InstrumentWithContact } from '../../src/db/types';
import { useI18n } from '../../src/i18n';
import { useAppState } from '../../src/state';

/** Échéancier : chèques, traites et billets regroupés par mois d'échéance. */
export default function InstrumentsCalendar() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { t } = useI18n();
  const { version, done } = useAppState();
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  const [items, setItems] = useState<InstrumentWithContact[]>([]);

  useFocusEffect(
    useCallback(() => {
      listInstruments(db, { status: filter === 'PENDING' ? 'PENDING' : undefined, excludeCash: true }).then(setItems);
    }, [db, filter, version]),
  );

  const groups = new Map<string, InstrumentWithContact[]>();
  for (const i of items) {
    const key = i.maturity_due_date.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }

  return (
    <Screen>
      <Btn label={t.actionInstrument} variant="earth" onPress={() => router.push('/instruments/new')} />
      <Chips
        options={[
          { value: 'PENDING' as const, label: t.filterPending },
          { value: 'ALL' as const, label: t.filterAll },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {items.length === 0 ? <Empty text={t.noInstruments} /> : null}
      {[...groups.entries()].map(([month, list]) => {
        const [y, m] = month.split('-').map(Number);
        return [
          <SectionTitle key={month}>{`${t.months[m - 1]} ${y}`}</SectionTitle>,
          ...list.map((i) => (
            <InstrumentCard
              key={i.id}
              inst={i}
              onPress={() => router.push({ pathname: '/operation', params: { kind: 'I', id: i.id } })}
              onMarkPaid={(id) => setInstrumentStatus(db, id, 'DEBITED_PAID').then(() => done())}
              onCancel={(id) => setInstrumentStatus(db, id, 'CANCELLED').then(() => done())}
            />
          )),
        ];
      })}
    </Screen>
  );
}
