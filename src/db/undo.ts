import type { SQLiteDatabase } from 'expo-sqlite';

const MAX_UNDO_GROUPS = 30;

export interface UndoGroup {
  grp: number;
  label: string;
  created_at: string;
}

/**
 * Exécute une action utilisateur dans une transaction SQL et en fait un groupe annulable.
 * Toutes les écritures faites dans `task` seront annulées ensemble par undoLast().
 */
export async function runAction<T>(db: SQLiteDatabase, label: string, task: () => Promise<T>): Promise<T> {
  let result!: T;
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE undo_state SET grp = grp + 1, active = 1 WHERE id = 1');
    const state = await db.getFirstAsync<{ grp: number }>('SELECT grp FROM undo_state WHERE id = 1');
    const grp = state!.grp;
    await db.runAsync('INSERT INTO undo_groups (grp, label, created_at) VALUES (?, ?, ?)', grp, label, new Date().toISOString());
    result = await task();
    await db.runAsync('DELETE FROM undo_log WHERE grp <= ?', grp - MAX_UNDO_GROUPS);
    await db.runAsync('DELETE FROM undo_groups WHERE grp <= ?', grp - MAX_UNDO_GROUPS);
  });
  return result;
}

export async function getLastUndo(db: SQLiteDatabase): Promise<UndoGroup | null> {
  return db.getFirstAsync<UndoGroup>('SELECT grp, label, created_at FROM undo_groups ORDER BY grp DESC LIMIT 1');
}

/** Annule la dernière action. Renvoie son libellé, ou null s'il n'y a rien à annuler. */
export async function undoLast(db: SQLiteDatabase): Promise<string | null> {
  const group = await getLastUndo(db);
  if (!group) return null;
  const steps = await db.getAllAsync<{ sql: string }>('SELECT sql FROM undo_log WHERE grp = ? ORDER BY seq DESC', group.grp);
  await db.withTransactionAsync(async () => {
    // Les lignes enfants peuvent être réinsérées avant leur parent : contrôle FK à la fin.
    await db.execAsync('PRAGMA defer_foreign_keys = ON');
    await db.runAsync('UPDATE undo_state SET active = 0 WHERE id = 1');
    for (const step of steps) await db.execAsync(step.sql);
    await db.runAsync('DELETE FROM undo_log WHERE grp = ?', group.grp);
    await db.runAsync('DELETE FROM undo_groups WHERE grp = ?', group.grp);
    await db.runAsync('UPDATE undo_state SET active = 1 WHERE id = 1');
  });
  return group.label;
}
