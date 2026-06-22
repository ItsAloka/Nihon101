/* Newsletter list — capture only (the weekly digest sender ships later). Dedup by
 * unique email so a double-submit is a no-op. Open to logged-out visitors; userId
 * links the row to a signed-in subscriber when present. */
import type { DB } from '../client';
import { newsletterSubscribers } from '../schema';
import { id as newId } from '../../lib/ids';

export async function subscribe(
  db: DB,
  input: { email: string; locale: 'ja' | 'en'; userId: string | null },
): Promise<{ created: boolean }> {
  const res = await db.insert(newsletterSubscribers)
    .values({
      id: newId('nls'),
      email: input.email.toLowerCase().slice(0, 254),
      locale: input.locale,
      userId: input.userId,
      createdAt: Date.now(),
    })
    .onConflictDoNothing({ target: newsletterSubscribers.email })
    .returning({ id: newsletterSubscribers.id });
  return { created: res.length > 0 };
}
