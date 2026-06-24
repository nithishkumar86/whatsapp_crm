import { supabase } from '@/lib/supabase';

/**
 * Record a SUCCESSFUL WhatsApp template send for a lead.
 *
 * Upserts template_messages (phone PK) via the atomic record_template_sent()
 * Postgres function: flips template_sent=true, stores the LAST template name,
 * increments total_template_sent, bumps last_sent_at. Never throws — a tracking
 * failure must not break the welcome/re-engagement send path.
 */
export async function recordTemplateSent(phone: string, templateName: string): Promise<void> {
  if (!phone) return;
  try {
    const { error } = await supabase.rpc('record_template_sent', {
      p_phone: phone,
      p_template: templateName,
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[template-tracking] record_template_sent failed:', error.message);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[template-tracking] unexpected error:', err);
  }
}
