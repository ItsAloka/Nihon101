/* Contact-form messages: store first (source of truth), notify the admin by email,
 * and let the admin reply from the console. No mailbox needed — inbound is the web
 * form, outbound replies go through Resend. */
import { eq, desc, lt, and } from 'drizzle-orm';
import type { DB } from '../client';
import { contactMessages, users, type ContactMessage } from '../schema';
import { id as newId } from '../../lib/ids';

export interface NewContact {
  userId: string | null;
  name: string;
  email: string;
  message: string;
  locale: 'ja' | 'en';
}

export async function createContactMessage(db: DB, input: NewContact): Promise<ContactMessage> {
  const row = {
    id: newId('msg'),
    userId: input.userId,
    name: input.name.slice(0, 120),
    email: input.email.slice(0, 254),
    message: input.message.slice(0, 4000),
    locale: input.locale,
    status: 'new' as const,
    repliedAt: null,
    repliedBy: null,
    createdAt: Date.now(),
  };
  await db.insert(contactMessages).values(row);
  return row as ContactMessage;
}

export interface ContactRow extends ContactMessage {
  userHandle: string | null;
}

/** Inbox list, newest first. Optional status filter + keyset pagination by createdAt. */
export async function listContactMessages(
  db: DB,
  opts: { status?: 'new' | 'replied'; before?: number; limit?: number } = {},
): Promise<ContactRow[]> {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  const conds = [];
  if (opts.status) conds.push(eq(contactMessages.status, opts.status));
  if (opts.before) conds.push(lt(contactMessages.createdAt, opts.before));
  const where = conds.length ? and(...conds) : undefined;
  return (await db
    .select({
      id: contactMessages.id, userId: contactMessages.userId, name: contactMessages.name,
      email: contactMessages.email, message: contactMessages.message, locale: contactMessages.locale,
      status: contactMessages.status, repliedAt: contactMessages.repliedAt, repliedBy: contactMessages.repliedBy,
      createdAt: contactMessages.createdAt, userHandle: users.handle,
    })
    .from(contactMessages)
    .leftJoin(users, eq(contactMessages.userId, users.id))
    .where(where)
    .orderBy(desc(contactMessages.createdAt))
    .limit(limit)) as ContactRow[];
}

export async function getContactMessage(db: DB, id: string): Promise<ContactMessage | undefined> {
  const [row] = await db.select().from(contactMessages).where(eq(contactMessages.id, id));
  return row;
}

export async function markContactReplied(db: DB, id: string, adminId: string): Promise<void> {
  await db.update(contactMessages)
    .set({ status: 'replied', repliedAt: Date.now(), repliedBy: adminId })
    .where(eq(contactMessages.id, id));
}

export async function deleteContactMessage(db: DB, id: string): Promise<boolean> {
  const removed = await db.delete(contactMessages)
    .where(eq(contactMessages.id, id))
    .returning({ id: contactMessages.id });
  return removed.length > 0;
}
